import { z } from "zod";
import { readVault, readProfile } from "../lib/vault-reader.js";
import { fetchAllTransactionHistory } from "../lib/helius-client.js";
import {
  parseTradeHistory,
  calibrateTier1,
  calibrateTier2,
  calibrateTier3,
} from "../lib/quant-engine.js";
import {
  buildInitializeVaultTx,
  buildSetRulesTx,
  buildDepositTx,
  buildInitializeProfileTx,
  buildUpdateStatsTx,
} from "../lib/transaction-builder.js";
import { LAMPORTS_PER_SOL } from "../lib/constants.js";
import { loadConfig, setRiskPolicy } from "../lib/agentwallet-client.js";
import type {
  StrategyType,
  RiskTolerance,
  UnsignedTransactionResult,
  CalibrationAnalysis,
  VaultParameters,
} from "../lib/types.js";

export const calibrateSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  deposit_amount: z
    .number()
    .optional()
    .describe("Amount to deposit in SOL (for Tier 1 calibration)"),
  strategy_type: z
    .enum(["scalping", "day_trading", "swing_trading", "conservative"])
    .optional()
    .describe("Trading strategy type"),
  risk_tolerance: z
    .enum(["low", "medium", "high", "degen"])
    .optional()
    .describe("Risk tolerance level"),
  lookback_days: z
    .number()
    .optional()
    .describe("Number of days of history to analyze (default 30)"),
});

export const recalibrateSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
});

export async function calibrate(input: z.infer<typeof calibrateSchema>) {
  const wallet = input.wallet_address;
  const strategyType = (input.strategy_type ?? "day_trading") as StrategyType;
  const riskTolerance = (input.risk_tolerance ?? "medium") as RiskTolerance;
  const lookbackDays = input.lookback_days ?? 30;

  const [vault, profile] = await Promise.all([
    readVault(wallet),
    readProfile(wallet),
  ]);

  const depositAmount = input.deposit_amount ?? 0;
  const depositLamports = depositAmount > 0 ? depositAmount * LAMPORTS_PER_SOL : 0;

  const txns = await fetchAllTransactionHistory(wallet, lookbackDays);
  const trades = parseTradeHistory(txns, wallet);

  let params: VaultParameters;
  let analysis: CalibrationAnalysis;

  if (trades.length >= 20) {
    const capital = depositLamports > 0 ? depositLamports : Number(vault.totalDeposited) || LAMPORTS_PER_SOL;
    const tier1 = calibrateTier1(
      capital,
      strategyType,
      riskTolerance
    );
    const result = calibrateTier3(trades, tier1.params, capital);
    params = result.params;
    analysis = result.analysis;
  } else if (trades.length >= 5) {
    const tier1 = calibrateTier1(
      depositLamports > 0 ? depositLamports : Number(vault.totalDeposited) || LAMPORTS_PER_SOL,
      strategyType,
      riskTolerance
    );
    const result = calibrateTier2(trades, tier1.params);
    params = result.params;
    analysis = result.analysis;
  } else {
    const capital =
      depositLamports > 0
        ? depositLamports
        : Number(vault.totalDeposited) || LAMPORTS_PER_SOL;
    const result = calibrateTier1(capital, strategyType, riskTolerance);
    params = result.params;
    analysis = result.analysis;
  }

  const transactions: UnsignedTransactionResult[] = [];

  if (!vault.exists) {
    const initTx = await buildInitializeVaultTx(wallet, params.lockoutDuration);
    transactions.push(initTx);

    if (depositAmount > 0) {
      const depositTx = await buildDepositTx(wallet, depositAmount);
      transactions.push(depositTx);
    }
  }

  const setRulesTx = await buildSetRulesTx(wallet, params);
  transactions.push(setRulesTx);

  if (!profile.exists) {
    const profileTx = await buildInitializeProfileTx(wallet);
    transactions.push(profileTx);
  }

  if (trades.length > 0) {
    const wins = trades.filter((t) => t.isWin).length;
    const totalPnl = trades.reduce((sum, t) => sum + t.pnlLamports, 0);
    const avgTradeSize =
      trades.reduce((sum, t) => sum + Math.abs(t.pnlLamports), 0) / trades.length;

    const winRate = wins / trades.length;
    const clamp = (v: number) => Math.max(0, Math.min(99, Math.round(v)));
    const discipline = clamp(
      50 + (analysis.revengeTradeRatio !== undefined ? (1 - analysis.revengeTradeRatio) * 30 : 15)
    );
    const consistency = clamp(
      50 + (analysis.sharpeRatio !== undefined ? Math.min(analysis.sharpeRatio * 10, 30) : 0)
    );
    const riskControl = clamp(
      50 + (analysis.maxDrawdown !== undefined ? Math.max(0, 30 - analysis.maxDrawdown * 100) : 15)
    );
    const overallRating = clamp(
      (discipline + consistency + riskControl + 50 + 50 + 50) / 6
    );

    const uniqueDays = new Set(
      trades.map((t) => new Date(t.timestamp * 1000).toISOString().slice(0, 10))
    );

    const updateStatsTx = await buildUpdateStatsTx(wallet, {
      discipline,
      patience: 50,
      consistency,
      timing: 50,
      riskControl,
      endurance: 50,
      overallRating,
      totalTrades: trades.length,
      totalWins: wins,
      totalPnl: BigInt(totalPnl),
      avgTradeSize: BigInt(Math.floor(Math.abs(avgTradeSize))),
      tradingDays: uniqueDays.size,
    });
    transactions.push(updateStatsTx);
  }

  let policySync: Record<string, unknown> | undefined;
  const config = await loadConfig();
  if (config) {
    const dailyLimitSol = Number(params.dailyLossLimit) / LAMPORTS_PER_SOL;
    const result = await setRiskPolicy(
      config.username,
      config.apiToken,
      dailyLimitSol,
      params.maxTradesPerDay
    );
    policySync = {
      agentwallet_synced: result.enforced,
      max_per_tx_usd: result.policy.max_per_tx_usd,
      detail: result.enforced
        ? `AgentWallet policy synced: max $${result.policy.max_per_tx_usd}/tx based on ${dailyLimitSol.toFixed(4)} SOL daily limit.`
        : `Policy sync failed: ${result.error}`,
    };
  }

  return {
    calibration: {
      tier: analysis.tier,
      strategy_type: strategyType,
      risk_tolerance: riskTolerance,
      trades_analyzed: analysis.tradeCount,
      lookback_days: analysis.lookbackDays,
    },
    parameters: {
      daily_loss_limit_sol:
        Number(params.dailyLossLimit) / LAMPORTS_PER_SOL,
      daily_loss_limit_lamports: params.dailyLossLimit.toString(),
      max_trades_per_day: params.maxTradesPerDay,
      lockout_duration_seconds: params.lockoutDuration,
      cooldown_seconds: params.cooldownSeconds,
    },
    analysis: {
      win_rate: analysis.winRate,
      avg_loss_sol: analysis.avgLoss,
      max_loss_streak: analysis.maxLossStreak,
      revenge_trade_ratio: analysis.revengeTradeRatio,
      var_95: analysis.var95,
      sharpe_ratio: analysis.sharpeRatio,
      max_drawdown: analysis.maxDrawdown,
      kelly_fraction: analysis.kellyFraction,
      profit_factor: analysis.profitFactor,
    },
    unsigned_transactions: transactions.map((tx) => ({
      transaction: tx.transaction,
      blockhash: tx.blockhash,
      last_valid_block_height: tx.lastValidBlockHeight,
      description: tx.description,
    })),
    policy_sync: policySync,
    vault_existed: vault.exists,
    profile_existed: profile.exists,
    instructions:
      "Sign and submit the unsigned transactions in order. Each is a base64-encoded VersionedTransaction.",
  };
}

export async function recalibrate(input: z.infer<typeof recalibrateSchema>) {
  return calibrate({
    wallet_address: input.wallet_address,
  });
}
