import { z } from "zod";
import { readVault, readProfile } from "../lib/vault-reader.js";
import { getSession } from "../lib/session-store.js";
import { fetchAllTransactionHistory } from "../lib/helius-client.js";
import {
  parseTradeHistory,
  computeAgentAnalytics,
  generateSessionStrategy,
  estimateCapitalFromHistory,
} from "../lib/quant-engine.js";
import { buildSetRulesTx } from "../lib/transaction-builder.js";
import { LAMPORTS_PER_SOL } from "../lib/constants.js";
import type { UnsignedTransactionResult } from "../lib/types.js";

export const sessionStrategySchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  lookback_days: z
    .number()
    .optional()
    .describe("Number of days of history to analyze (default 30)"),
  enforce: z
    .boolean()
    .optional()
    .describe("If true, generate unsigned transactions to enforce strategy on-chain"),
});

export async function getSessionStrategy(
  input: z.infer<typeof sessionStrategySchema>
) {
  const wallet = input.wallet_address;
  const lookbackDays = input.lookback_days ?? 30;

  const [vault, profile] = await Promise.all([
    readVault(wallet),
    readProfile(wallet),
  ]);

  const session = getSession(wallet);

  const txns = await fetchAllTransactionHistory(wallet, lookbackDays);
  const trades = parseTradeHistory(txns, wallet);

  const startingCapital = vault.exists
    ? Number(vault.totalDeposited)
    : estimateCapitalFromHistory(trades);
  const capitalSol = startingCapital / LAMPORTS_PER_SOL;

  const analytics = computeAgentAnalytics(
    trades,
    vault.exists ? vault.lockoutCount : 0,
    startingCapital
  );

  const strategy = generateSessionStrategy(
    vault,
    session,
    trades,
    analytics,
    capitalSol
  );

  let unsignedTransactions: Array<{
    transaction: string;
    blockhash: string;
    last_valid_block_height: number;
    description: string;
  }> | undefined;

  if (input.enforce && vault.exists) {
    const transactions: UnsignedTransactionResult[] = [];

    const dailyLossLimit = BigInt(
      Math.max(1, Math.floor(strategy.max_exposure_sol * LAMPORTS_PER_SOL))
    );

    const cooldownSeconds =
      strategy.mode === "conservative_recovery"
        ? vault.cooldownSeconds * 2
        : vault.cooldownSeconds;

    const setRulesTx = await buildSetRulesTx(wallet, {
      dailyLossLimit,
      maxTradesPerDay: strategy.max_trades,
      lockoutDuration: vault.lockoutDuration,
      cooldownSeconds,
    });
    transactions.push(setRulesTx);

    unsignedTransactions = transactions.map((tx) => ({
      transaction: tx.transaction,
      blockhash: tx.blockhash,
      last_valid_block_height: tx.lastValidBlockHeight,
      description: tx.description,
    }));
  }

  return {
    wallet,
    lookback_days: lookbackDays,
    trades_analyzed: trades.length,
    has_vault: vault.exists,
    has_profile: profile.exists,
    strategy,
    unsigned_transactions: unsignedTransactions,
    instructions: unsignedTransactions
      ? "Sign and submit the unsigned transactions to enforce this session strategy on-chain."
      : undefined,
  };
}
