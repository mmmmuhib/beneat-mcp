import { getHeliusApiKey } from "./constants.js";
import type { EnhancedTransaction } from "./types.js";

const HELIUS_BASE_URL = "https://api.helius.xyz/v0";

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
    return true;
  }
  return false;
}

function recordSuccess() {
  consecutiveFailures = 0;
}

function recordFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
    console.error("[helius] Circuit breaker opened after", FAILURE_THRESHOLD, "failures");
  }
}

export async function fetchTransactionHistory(
  walletAddress: string,
  options: { limit?: number; before?: string; type?: string } = {}
): Promise<EnhancedTransaction[]> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) {
    console.error("[helius] No HELIUS_API_KEY configured, returning empty history");
    return [];
  }

  if (!checkCircuit()) {
    console.error("[helius] Circuit breaker is open, skipping request");
    return [];
  }

  const limit = options.limit ?? 100;
  const params = new URLSearchParams({
    "api-key": apiKey,
    limit: limit.toString(),
  });
  if (options.before) params.set("before", options.before);
  if (options.type) params.set("type", options.type);

  const url = `${HELIUS_BASE_URL}/addresses/${walletAddress}/transactions?${params}`;

  try {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Helius API returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as EnhancedTransaction[];
    recordSuccess();
    return data;
  } catch (error) {
    recordFailure();
    console.error("[helius] Failed to fetch transactions:", (error as Error).message);
    return [];
  }
}

export async function fetchSolPriceAtTimestamp(
  timestampSec: number
): Promise<number | null> {
  const benchmarksUrl = process.env.PYTH_BENCHMARKS_URL;
  if (!benchmarksUrl) return null;

  try {
    const params = new URLSearchParams({
      symbol: "Crypto.SOL/USD",
      resolution: "D",
      from: String(timestampSec - 86400),
      to: String(timestampSec + 86400),
    });
    const response = await fetch(`${benchmarksUrl}?${params}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { c?: number[] };
    if (data.c && data.c.length > 0) return data.c[0];
    return null;
  } catch {
    return null;
  }
}

export async function fetchSolBenchmarkReturn(
  startTimestamp: number,
  endTimestamp: number
): Promise<number> {
  const [startPrice, endPrice] = await Promise.all([
    fetchSolPriceAtTimestamp(startTimestamp),
    fetchSolPriceAtTimestamp(endTimestamp),
  ]);
  if (startPrice && endPrice && startPrice > 0) {
    return (endPrice - startPrice) / startPrice;
  }
  return 0;
}

export async function fetchAllTransactionHistory(
  walletAddress: string,
  lookbackDays: number = 30
): Promise<EnhancedTransaction[]> {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - lookbackDays * 86400;
  const allTxns: EnhancedTransaction[] = [];
  let before: string | undefined;
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchTransactionHistory(walletAddress, {
      limit: 100,
      before,
    });

    if (batch.length === 0) break;

    for (const txn of batch) {
      if (txn.timestamp < cutoffTimestamp) {
        return allTxns;
      }
      allTxns.push(txn);
    }

    before = batch[batch.length - 1].signature;
  }

  return allTxns;
}
