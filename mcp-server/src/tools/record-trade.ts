import { z } from "zod";
import { readVault } from "../lib/vault-reader.js";
import {
  recordTrade as storeRecordTrade,
  getSession,
  setAdvisoryLockout,
} from "../lib/session-store.js";
import {
  LAMPORTS_PER_SOL,
  DEFAULT_ADVISORY_DAILY_LOSS_PCT,
  DEFAULT_ADVISORY_LOCKOUT_SECONDS,
} from "../lib/constants.js";
import { loadConfig, freezePolicy } from "../lib/agentwallet-client.js";

export const recordTradeSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  pnl: z
    .number()
    .describe("Trade P&L in SOL (positive = profit, negative = loss)"),
  market: z.string().optional().describe("Market identifier (e.g. SOL-PERP)"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Agent's confidence in this trade (0-1). Used for confidence calibration."),
});

export async function recordTrade(input: z.infer<typeof recordTradeSchema>) {
  const session = storeRecordTrade(
    input.wallet_address,
    input.pnl,
    input.market,
    input.confidence
  );

  const vault = await readVault(input.wallet_address);

  let lockoutTriggered = false;
  let lockoutReason: string | undefined;

  if (vault.exists && Number(vault.dailyLossLimit) > 0) {
    const cumLossLamports = Math.abs(session.dailyPnl) * LAMPORTS_PER_SOL;
    if (
      session.dailyPnl < 0 &&
      cumLossLamports >= Number(vault.dailyLossLimit)
    ) {
      lockoutTriggered = true;
      lockoutReason = `Daily loss limit breached: ${Math.abs(session.dailyPnl).toFixed(4)} SOL lost >= ${(Number(vault.dailyLossLimit) / LAMPORTS_PER_SOL).toFixed(4)} SOL limit`;
    }
  }

  let enforcement: Record<string, unknown> | undefined;

  if (lockoutTriggered) {
    const config = await loadConfig();
    if (config) {
      const result = await freezePolicy(config.username, config.apiToken);
      enforcement = {
        agentwallet_frozen: result.enforced,
        action: result.action,
        detail: result.enforced
          ? "AgentWallet policy set to max_per_tx_usd=0. Agent cannot transact until lockout expires."
          : `Enforcement failed: ${result.error}`,
      };
    } else {
      enforcement = {
        agentwallet_frozen: false,
        action: "skipped",
        detail:
          "No AgentWallet config found at ~/.agentwallet/config.json. Lockout is advisory only.",
      };
    }
  }

  if (!vault.exists && !lockoutTriggered) {
    const limits = session.advisoryLimits;
    if (limits) {
      if (session.dailyPnl < 0 && Math.abs(session.dailyPnl) >= limits.dailyLossLimit) {
        lockoutTriggered = true;
        lockoutReason = `Advisory daily loss limit breached: ${Math.abs(session.dailyPnl).toFixed(4)} >= ${limits.dailyLossLimit.toFixed(4)}`;
        setAdvisoryLockout(input.wallet_address, DEFAULT_ADVISORY_LOCKOUT_SECONDS, lockoutReason);
      }
    } else {
      const initialEquity = parseFloat(process.env.SOL_PRICE_USD ?? "10000");
      const advisoryLimit = initialEquity * DEFAULT_ADVISORY_DAILY_LOSS_PCT;
      if (session.dailyPnl < 0 && Math.abs(session.dailyPnl) >= advisoryLimit) {
        lockoutTriggered = true;
        lockoutReason = `Advisory daily loss limit breached: ${Math.abs(session.dailyPnl).toFixed(4)} >= ${advisoryLimit.toFixed(4)} (${(DEFAULT_ADVISORY_DAILY_LOSS_PCT * 100).toFixed(0)}% of equity)`;
        setAdvisoryLockout(input.wallet_address, DEFAULT_ADVISORY_LOCKOUT_SECONDS, lockoutReason);
      }
    }
  }

  const warnings: string[] = [];
  if (vault.exists) {
    const pctUsed =
      Number(vault.dailyLossLimit) > 0
        ? (Math.abs(session.dailyPnl) * LAMPORTS_PER_SOL) /
          Number(vault.dailyLossLimit)
        : 0;

    if (pctUsed >= 0.8 && !lockoutTriggered) {
      warnings.push(
        `Warning: ${Math.round(pctUsed * 100)}% of daily loss budget consumed`
      );
    }

    if (input.pnl < 0) {
      const recentLosses = session.trades
        .slice(-3)
        .filter((t) => t.pnl < 0).length;
      if (recentLosses >= 3) {
        warnings.push(
          "Warning: 3 consecutive losses detected. Consider pausing trading."
        );
      }
    }
  }

  if (!vault.exists && session.advisoryLimits) {
    const pctUsed = session.dailyPnl < 0
      ? Math.abs(session.dailyPnl) / session.advisoryLimits.dailyLossLimit
      : 0;

    if (pctUsed >= 0.8 && !lockoutTriggered) {
      warnings.push(
        `Warning: ${Math.round(pctUsed * 100)}% of advisory daily loss budget consumed`
      );
    }

    if (input.pnl < 0) {
      const recentLosses = session.trades
        .slice(-3)
        .filter((t) => t.pnl < 0).length;
      if (recentLosses >= 3) {
        warnings.push(
          "Warning: 3 consecutive losses detected. Consider pausing trading."
        );
      }
    }
  }

  return {
    recorded: true,
    session_summary: {
      trade_count: session.tradeCount,
      daily_pnl_sol: Math.round(session.dailyPnl * 10000) / 10000,
      last_trade_pnl_sol: input.pnl,
      session_start: session.sessionStart,
    },
    lockout_triggered: lockoutTriggered,
    lockout_reason: lockoutReason,
    enforcement,
    warnings: warnings.length > 0 ? warnings : undefined,
    has_vault: vault.exists,
  };
}
