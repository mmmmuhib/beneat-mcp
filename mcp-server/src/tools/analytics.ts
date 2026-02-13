import { z } from "zod";
import { readVault } from "../lib/vault-reader.js";
import { fetchAllTransactionHistory, fetchSolBenchmarkReturn } from "../lib/helius-client.js";
import { parseTradeHistory, computeAgentAnalytics, generateDirectives, estimateCapitalFromHistory, computeKellyFraction } from "../lib/quant-engine.js";

export const analyticsSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  lookback_days: z
    .number()
    .optional()
    .describe("Number of days of history to analyze (default 30)"),
});

export async function getAnalytics(input: z.infer<typeof analyticsSchema>) {
  const wallet = input.wallet_address;
  const lookbackDays = input.lookback_days ?? 30;

  const vault = await readVault(wallet);

  const txns = await fetchAllTransactionHistory(wallet, lookbackDays);
  const trades = parseTradeHistory(txns, wallet);

  const startingCapital = vault.exists
    ? Number(vault.totalDeposited)
    : estimateCapitalFromHistory(trades);

  let benchmarkReturn = 0;
  if (trades.length >= 2) {
    benchmarkReturn = await fetchSolBenchmarkReturn(
      trades[0].timestamp,
      trades[trades.length - 1].timestamp
    );
  }

  const analytics = computeAgentAnalytics(
    trades,
    vault.exists ? vault.lockoutCount : 0,
    startingCapital,
    benchmarkReturn
  );

  const kellyFraction = computeKellyFraction(trades);
  const directives = generateDirectives(analytics, kellyFraction);
  const protocols = new Set(trades.map((t) => t.market ?? "unknown"));

  return {
    wallet,
    lookback_days: lookbackDays,
    has_vault: vault.exists,
    protocols_detected: Array.from(protocols),
    analytics,
    directives,
    kelly_fraction: kellyFraction,
  };
}
