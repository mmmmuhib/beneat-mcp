import {
  Connection,
  PublicKey,
  type ParsedTransactionWithMeta,
  type ConfirmedSignatureInfo,
} from "@solana/web3.js";
import { identifyDexSource } from "./dex-programs";
import type { EnhancedTransaction, SwapEvent } from "./wallet-analytics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HeliusResult = {
  data: EnhancedTransaction[];
  error?: string;
};

// ---------------------------------------------------------------------------
// Circuit breaker (copied pattern from helius-client.ts)
// ---------------------------------------------------------------------------

let circuitOpen = false;
let circuitOpenedAt = 0;
const CIRCUIT_RESET_MS = 60_000;
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;

function checkCircuit(): boolean {
  if (!circuitOpen) return true;
  if (Date.now() - circuitOpenedAt > CIRCUIT_RESET_MS) {
    circuitOpen = false;
    consecutiveFailures = 0;
    console.log("[solana-rpc] Circuit breaker reset after cooldown");
    return true;
  }
  return false;
}

function recordSuccess() {
  consecutiveFailures = 0;
}

function recordFailure(reason: string) {
  consecutiveFailures++;
  console.warn(`[solana-rpc] Failure ${consecutiveFailures}/${FAILURE_THRESHOLD}: ${reason}`);
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
    console.error("[solana-rpc] Circuit breaker OPEN — blocking requests for 60s");
  }
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes("429") || msg.includes("Too many requests");
      const isServerError = msg.includes("502") || msg.includes("503");

      if (attempt < maxRetries && (isRateLimit || isServerError)) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[solana-rpc] Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${msg}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("withRetry: unreachable");
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

let _connection: Connection | null = null;

function getConnection(): Connection {
  if (!_connection) {
    const url = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
    _connection = new Connection(url, "confirmed");
  }
  return _connection;
}

// ---------------------------------------------------------------------------
// Fetch signatures (paginated)
// ---------------------------------------------------------------------------

async function fetchSignatures(
  connection: Connection,
  wallet: PublicKey,
  cutoffTimestamp: number,
  maxPages: number
): Promise<ConfirmedSignatureInfo[]> {
  const allSigs: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const sigs = await withRetry(() =>
      connection.getSignaturesForAddress(wallet, { limit: 100, before })
    );

    if (sigs.length === 0) break;

    for (const sig of sigs) {
      if (sig.blockTime && sig.blockTime < cutoffTimestamp) {
        return allSigs;
      }
      allSigs.push(sig);
    }

    before = sigs[sigs.length - 1].signature;

    // Rate-limit delay between pages
    if (page < maxPages - 1 && sigs.length === 100) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return allSigs;
}

// ---------------------------------------------------------------------------
// Fetch parsed transactions in batches
// ---------------------------------------------------------------------------

async function fetchParsedTransactions(
  connection: Connection,
  signatures: string[]
): Promise<(ParsedTransactionWithMeta | null)[]> {
  const results: (ParsedTransactionWithMeta | null)[] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
    const batch = signatures.slice(i, i + BATCH_SIZE);
    const txns = await withRetry(() =>
      connection.getParsedTransactions(batch, { maxSupportedTransactionVersion: 0 })
    );
    results.push(...txns);

    // Rate-limit delay between batches
    if (i + BATCH_SIZE < signatures.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Classify transaction type
// ---------------------------------------------------------------------------

function classifyType(
  source: string | null,
  tx: ParsedTransactionWithMeta
): string {
  if (source) return "SWAP";

  // Detect BURN_AND_CLOSE from closeAccount instructions
  const instructions = tx.transaction.message.instructions;
  for (const ix of instructions) {
    if ("parsed" in ix && ix.parsed?.type === "closeAccount") {
      return "BURN_AND_CLOSE";
    }
  }

  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Extract swap event from pre/post token balances
// ---------------------------------------------------------------------------

function extractSwapEvent(
  tx: ParsedTransactionWithMeta,
  walletAddress: string
): SwapEvent {
  const meta = tx.meta;
  if (!meta) return {};

  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const preBalances = meta.preBalances;
  const postBalances = meta.postBalances;
  const preTokenBalances = meta.preTokenBalances ?? [];
  const postTokenBalances = meta.postTokenBalances ?? [];

  const accountKeys = tx.transaction.message.accountKeys.map((k) =>
    typeof k === "string" ? k : k.pubkey.toBase58()
  );

  // Find wallet index in account keys for SOL balance delta
  const walletIndex = accountKeys.indexOf(walletAddress);

  // SOL delta (native)
  let nativeInput: SwapEvent["nativeInput"] = undefined;
  let nativeOutput: SwapEvent["nativeOutput"] = undefined;

  if (walletIndex !== -1 && preBalances && postBalances) {
    const solDelta = postBalances[walletIndex] - preBalances[walletIndex] + (meta.fee ?? 0);
    if (solDelta < 0) {
      nativeInput = { account: walletAddress, amount: Math.abs(solDelta) };
    } else if (solDelta > 0) {
      nativeOutput = { account: walletAddress, amount: solDelta };
    }
  }

  // Token deltas — build maps of mint → balance for pre and post
  const preMap = new Map<string, { amount: number; decimals: number; mint: string }>();
  const postMap = new Map<string, { amount: number; decimals: number; mint: string }>();

  const isWalletTokenBalance = (tb: { owner?: string; accountIndex: number }) =>
    tb.owner === walletAddress ||
    (!tb.owner && accountKeys[tb.accountIndex] === walletAddress);

  for (const tb of preTokenBalances) {
    if (!isWalletTokenBalance(tb)) continue;
    const mint = tb.mint;
    const amount = parseFloat(tb.uiTokenAmount.amount);
    const decimals = tb.uiTokenAmount.decimals;
    preMap.set(mint, { amount, decimals, mint });
  }

  for (const tb of postTokenBalances) {
    if (!isWalletTokenBalance(tb)) continue;
    const mint = tb.mint;
    const amount = parseFloat(tb.uiTokenAmount.amount);
    const decimals = tb.uiTokenAmount.decimals;
    postMap.set(mint, { amount, decimals, mint });
  }

  // Compute deltas per mint
  const allMints = new Set([...preMap.keys(), ...postMap.keys()]);
  const tokenInputs: SwapEvent["tokenInputs"] = [];
  const tokenOutputs: SwapEvent["tokenOutputs"] = [];

  for (const mint of allMints) {
    if (mint === SOL_MINT) continue; // Handled via native balances
    const pre = preMap.get(mint)?.amount ?? 0;
    const post = postMap.get(mint)?.amount ?? 0;
    const delta = post - pre;
    const decimals = postMap.get(mint)?.decimals ?? preMap.get(mint)?.decimals ?? 0;

    if (delta < 0) {
      tokenInputs.push({
        mint,
        rawTokenAmount: { tokenAmount: Math.abs(delta).toString(), decimals },
      });
    } else if (delta > 0) {
      tokenOutputs.push({
        mint,
        rawTokenAmount: { tokenAmount: delta.toString(), decimals },
      });
    }
  }

  return {
    nativeInput,
    nativeOutput,
    tokenInputs: tokenInputs.length > 0 ? tokenInputs : undefined,
    tokenOutputs: tokenOutputs.length > 0 ? tokenOutputs : undefined,
  };
}

// ---------------------------------------------------------------------------
// Transform to EnhancedTransaction
// ---------------------------------------------------------------------------

function transformToEnhancedTransaction(
  tx: ParsedTransactionWithMeta,
  signature: string,
  walletAddress: string
): EnhancedTransaction {
  const meta = tx.meta;
  const accountKeys = tx.transaction.message.accountKeys.map((k) =>
    typeof k === "string" ? k : k.pubkey.toBase58()
  );

  // Collect all program IDs from instructions
  const programIds: string[] = [];
  for (const ix of tx.transaction.message.instructions) {
    if ("programId" in ix) {
      programIds.push(ix.programId.toBase58());
    }
  }
  // Also check inner instructions
  if (meta?.innerInstructions) {
    for (const inner of meta.innerInstructions) {
      for (const ix of inner.instructions) {
        if ("programId" in ix) {
          programIds.push(ix.programId.toBase58());
        }
      }
    }
  }

  const source = identifyDexSource(programIds);
  const type = classifyType(source, tx);
  const swap = extractSwapEvent(tx, walletAddress);

  // Build nativeTransfers from pre/post balances
  const nativeTransfers: EnhancedTransaction["nativeTransfers"] = [];
  if (meta && meta.preBalances && meta.postBalances) {
    for (let i = 0; i < accountKeys.length; i++) {
      const delta = meta.postBalances[i] - meta.preBalances[i];
      if (delta > 0 && accountKeys[i] !== walletAddress) {
        // Wallet sent to this account
        nativeTransfers.push({
          fromUserAccount: walletAddress,
          toUserAccount: accountKeys[i],
          amount: delta,
        });
      } else if (delta < 0 && accountKeys[i] !== walletAddress) {
        nativeTransfers.push({
          fromUserAccount: accountKeys[i],
          toUserAccount: walletAddress,
          amount: Math.abs(delta),
        });
      }
    }
  }

  // Build accountData for the wallet
  const accountData: EnhancedTransaction["accountData"] = [];
  const walletIndex = accountKeys.indexOf(walletAddress);
  if (walletIndex !== -1 && meta) {
    const nativeBalanceChange =
      (meta.postBalances[walletIndex] ?? 0) - (meta.preBalances[walletIndex] ?? 0);

    const tokenBalanceChanges: Array<{
      userAccount: string;
      tokenAccount: string;
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
    }> = [];

    const preTokenBalances = meta.preTokenBalances ?? [];
    const postTokenBalances = meta.postTokenBalances ?? [];

    // Build mint→pre/post for owner
    const preTB = new Map<string, { amount: string; decimals: number; accountIndex: number }>();
    const postTB = new Map<string, { amount: string; decimals: number; accountIndex: number }>();

    const isWalletTB = (tb: { owner?: string; accountIndex: number }) =>
      tb.owner === walletAddress ||
      (!tb.owner && accountKeys[tb.accountIndex] === walletAddress);

    for (const tb of preTokenBalances) {
      if (isWalletTB(tb)) {
        preTB.set(tb.mint, {
          amount: tb.uiTokenAmount.amount,
          decimals: tb.uiTokenAmount.decimals,
          accountIndex: tb.accountIndex,
        });
      }
    }
    for (const tb of postTokenBalances) {
      if (isWalletTB(tb)) {
        postTB.set(tb.mint, {
          amount: tb.uiTokenAmount.amount,
          decimals: tb.uiTokenAmount.decimals,
          accountIndex: tb.accountIndex,
        });
      }
    }

    const allMints = new Set([...preTB.keys(), ...postTB.keys()]);
    for (const mint of allMints) {
      const pre = BigInt(preTB.get(mint)?.amount ?? "0");
      const post = BigInt(postTB.get(mint)?.amount ?? "0");
      const delta = post - pre;
      if (delta !== 0n) {
        const decimals = postTB.get(mint)?.decimals ?? preTB.get(mint)?.decimals ?? 0;
        const idx = postTB.get(mint)?.accountIndex ?? preTB.get(mint)?.accountIndex ?? 0;
        tokenBalanceChanges.push({
          userAccount: walletAddress,
          tokenAccount: accountKeys[idx] ?? walletAddress,
          mint,
          rawTokenAmount: { tokenAmount: delta.toString(), decimals },
        });
      }
    }

    accountData.push({
      account: walletAddress,
      nativeBalanceChange,
      tokenBalanceChanges,
    });
  }

  const hasSwapData =
    swap.nativeInput || swap.nativeOutput ||
    (swap.tokenInputs && swap.tokenInputs.length > 0) ||
    (swap.tokenOutputs && swap.tokenOutputs.length > 0);

  return {
    signature,
    timestamp: tx.blockTime ?? 0,
    type,
    source: source ?? "UNKNOWN",
    fee: meta?.fee ?? 0,
    feePayer: accountKeys[0] ?? "",
    nativeTransfers: nativeTransfers.length > 0 ? nativeTransfers : undefined,
    accountData: accountData.length > 0 ? accountData : undefined,
    events: hasSwapData ? { swap } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchAllTransactionHistory(
  walletAddress: string,
  lookbackDays: number = 30
): Promise<HeliusResult> {
  if (!checkCircuit()) {
    return { data: [], error: "Circuit breaker open — Solana RPC temporarily unavailable" };
  }

  const cutoffTimestamp = Math.floor(Date.now() / 1000) - lookbackDays * 86400;
  const connection = getConnection();

  // Public RPC: limit to 5 pages (500 sigs). Paid endpoints can do more.
  const isPublicRpc = !process.env.SOLANA_RPC_URL;
  const maxPages = isPublicRpc ? 5 : 10;

  try {
    const wallet = new PublicKey(walletAddress);
    // Step 1: Fetch signatures
    const signatures = await fetchSignatures(connection, wallet, cutoffTimestamp, maxPages);

    if (signatures.length === 0) {
      recordSuccess();
      return { data: [] };
    }

    console.log(`[solana-rpc] Fetched ${signatures.length} signatures for ${walletAddress}`);

    // Step 2: Fetch parsed transactions in batches
    const sigStrings = signatures.map((s) => s.signature);
    const parsedTxns = await fetchParsedTransactions(connection, sigStrings);

    // Step 3: Transform to EnhancedTransaction
    const enhanced: EnhancedTransaction[] = [];
    for (let i = 0; i < parsedTxns.length; i++) {
      const tx = parsedTxns[i];
      if (!tx || tx.meta?.err) continue; // Skip failed transactions
      enhanced.push(
        transformToEnhancedTransaction(tx, sigStrings[i], walletAddress)
      );
    }

    recordSuccess();
    console.log(`[solana-rpc] Transformed ${enhanced.length} transactions`);
    return { data: enhanced };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown RPC error";
    recordFailure(reason);
    return { data: [], error: `Solana RPC request failed: ${reason}` };
  }
}
