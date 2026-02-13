import { z } from "zod";
import { readVault, readProfile } from "../lib/vault-reader.js";
import { fetchAllTransactionHistory } from "../lib/helius-client.js";
import {
  parseTradeHistory,
  computeAgentAnalytics,
  calibrateTier1,
  calibrateTier3,
  generatePlaybook,
  estimateCapitalFromHistory,
} from "../lib/quant-engine.js";
import { buildSetRulesTx } from "../lib/transaction-builder.js";
import { LAMPORTS_PER_SOL } from "../lib/constants.js";
import { loadConfig, setRiskPolicy } from "../lib/agentwallet-client.js";
import type { UnsignedTransactionResult } from "../lib/types.js";

export const playbookSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  lookback_days: z
    .number()
    .optional()
    .describe("Number of days of history to analyze (default 30)"),
  enforce: z
    .boolean()
    .optional()
    .describe("If true, generate unsigned transactions to enforce playbook position sizing rules on-chain"),
});

export async function getPlaybook(input: z.infer<typeof playbookSchema>) {
  const wallet = input.wallet_address;
  const lookbackDays = input.lookback_days ?? 30;

  const [vault, profile] = await Promise.all([
    readVault(wallet),
    readProfile(wallet),
  ]);

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

  const playbook = generatePlaybook(trades, vault, analytics, capitalSol);

  let unsignedTransactions: Array<{
    transaction: string;
    blockhash: string;
    last_valid_block_height: number;
    description: string;
  }> | undefined;
  let policySync: Record<string, unknown> | undefined;

  if (input.enforce && vault.exists) {
    const transactions: UnsignedTransactionResult[] = [];

    const maxPositionPct = playbook.position_sizing.max_position_pct / 100;
    const dailyLossLimitSol = capitalSol * Math.min(maxPositionPct * 3, 0.1);
    const dailyLossLimit = BigInt(Math.max(1, Math.floor(dailyLossLimitSol * LAMPORTS_PER_SOL)));

    const tier1 = calibrateTier1(startingCapital || LAMPORTS_PER_SOL);
    const params = trades.length >= 20
      ? calibrateTier3(trades, tier1.params, startingCapital || LAMPORTS_PER_SOL).params
      : tier1.params;

    const enforceParams = {
      ...params,
      dailyLossLimit,
    };

    const setRulesTx = await buildSetRulesTx(wallet, enforceParams);
    transactions.push(setRulesTx);

    unsignedTransactions = transactions.map((tx) => ({
      transaction: tx.transaction,
      blockhash: tx.blockhash,
      last_valid_block_height: tx.lastValidBlockHeight,
      description: tx.description,
    }));

    const config = await loadConfig();
    if (config) {
      const result = await setRiskPolicy(
        config.username,
        config.apiToken,
        dailyLossLimitSol,
        vault.maxTradesPerDay
      );
      policySync = {
        agentwallet_synced: result.enforced,
        detail: result.enforced
          ? `AgentWallet policy synced from playbook position sizing.`
          : `Policy sync failed: ${result.error}`,
      };
    }
  }

  return {
    wallet,
    lookback_days: lookbackDays,
    trades_analyzed: trades.length,
    has_vault: vault.exists,
    has_profile: profile.exists,
    playbook,
    unsigned_transactions: unsignedTransactions,
    policy_sync: policySync,
  };
}
