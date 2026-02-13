import type { EnhancedTransaction } from "./wallet-analytics";

const HELIUS_BASE_URL = "https://api.helius.xyz/v0";

let circuitOpen = false;
let circuitOpenedAt = 0;
const CIRCUIT_RESET_MS = 60_000;
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;

export type HeliusResult = {
  data: EnhancedTransaction[];
  error?: string;
};

function checkCircuit(): boolean {
  if (!circuitOpen) return true;
  if (Date.now() - circuitOpenedAt > CIRCUIT_RESET_MS) {
    circuitOpen = false;
    consecutiveFailures = 0;
    console.log("[helius] Circuit breaker reset after cooldown");
    return true;
  }
  return false;
}

function recordSuccess() {
  consecutiveFailures = 0;
}

function recordFailure(reason: string) {
  consecutiveFailures++;
  console.warn(`[helius] Failure ${consecutiveFailures}/${FAILURE_THRESHOLD}: ${reason}`);
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
    console.error("[helius] Circuit breaker OPEN — blocking requests for 60s");
  }
}

async function fetchWithRetry(
  url: string,
  retries: number = 1
): Promise<Response> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (retries > 0 && (response.status === 429 || response.status >= 500)) {
    console.warn(`[helius] Retrying after ${response.status} response`);
    await new Promise((r) => setTimeout(r, 1000));
    return fetchWithRetry(url, retries - 1);
  }

  return response;
}

export async function fetchTransactionHistory(
  walletAddress: string,
  options: { limit?: number; before?: string; type?: string } = {}
): Promise<HeliusResult> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return { data: [], error: "Helius API key not configured" };

  if (!checkCircuit()) {
    return { data: [], error: "Circuit breaker open — Helius API temporarily unavailable" };
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
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      const reason = `Helius API returned ${response.status}: ${response.statusText}`;
      recordFailure(reason);
      return { data: [], error: reason };
    }

    const data = (await response.json()) as EnhancedTransaction[];
    recordSuccess();
    return { data };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown fetch error";
    recordFailure(reason);
    return { data: [], error: `Helius request failed: ${reason}` };
  }
}

export async function fetchAllTransactionHistory(
  walletAddress: string,
  lookbackDays: number = 30
): Promise<HeliusResult> {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - lookbackDays * 86400;
  const allTxns: EnhancedTransaction[] = [];
  let before: string | undefined;
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    const result = await fetchTransactionHistory(walletAddress, {
      limit: 100,
      before,
    });

    if (result.error) {
      // Return what we have so far plus the error
      return { data: allTxns, error: result.error };
    }

    if (result.data.length === 0) break;

    for (const txn of result.data) {
      if (txn.timestamp < cutoffTimestamp) {
        return { data: allTxns };
      }
      allTxns.push(txn);
    }

    before = result.data[result.data.length - 1].signature;
  }

  return { data: allTxns };
}
