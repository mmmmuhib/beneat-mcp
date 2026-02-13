import { z } from "zod";
import { readVault } from "../lib/vault-reader.js";
import { getSession, isAdvisoryLocked, setAdvisoryLimits } from "../lib/session-store.js";
import {
  SECONDS_PER_DAY,
  LAMPORTS_PER_SOL,
  DEFAULT_ADVISORY_DAILY_LOSS_PCT,
  DEFAULT_ADVISORY_MAX_TRADES,
  DEFAULT_ADVISORY_COOLDOWN_MS,
  DEFAULT_MIN_RISK_REWARD_RATIO,
} from "../lib/constants.js";
import {
  loadConfig,
  restorePolicy,
  getSavedNormalPolicy,
} from "../lib/agentwallet-client.js";
import { fetchAllTransactionHistory } from "../lib/helius-client.js";
import { parseTradeHistory, computeCoaching } from "../lib/quant-engine.js";
import type { CoachingContext } from "../lib/types.js";

function computeRiskRewardRatio(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  direction?: "long" | "short"
): number | null {
  const inferredDirection =
    direction ?? (entryPrice > stopLoss ? "long" : "short");

  let risk: number;
  let reward: number;

  if (inferredDirection === "long") {
    risk = entryPrice - stopLoss;
    reward = takeProfit - entryPrice;
  } else {
    risk = stopLoss - entryPrice;
    reward = entryPrice - takeProfit;
  }

  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

export const checkTradeSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  market: z.string().optional().describe("Market identifier (e.g. SOL-PERP)"),
  size: z.number().optional().describe("Trade size in SOL"),
  direction: z
    .enum(["long", "short"])
    .optional()
    .describe("Trade direction"),
  leverage: z.number().optional().describe("Leverage multiplier"),
  include_coaching: z
    .boolean()
    .optional()
    .describe("Include coaching context in response (default true)"),
  initial_equity: z
    .number()
    .optional()
    .describe("Initial equity for advisory % calculations (default: SOL_PRICE_USD env or 10000)"),
  entry_price: z
    .number()
    .positive()
    .optional()
    .describe("Planned entry price for the trade"),
  stop_loss: z
    .number()
    .positive()
    .optional()
    .describe("Stop-loss price level"),
  take_profit: z
    .number()
    .positive()
    .optional()
    .describe("Take-profit price level"),
});

export async function checkTrade(input: z.infer<typeof checkTradeSchema>) {
  const vault = await readVault(input.wallet_address);
  const session = getSession(input.wallet_address);
  const now = Math.floor(Date.now() / 1000);

  const useOnChain = vault.exists;
  const reasons: string[] = [];
  let approved = true;

  if (useOnChain) {
    const isLocked = vault.isLocked && now < Number(vault.lockoutUntil);
    if (isLocked) {
      approved = false;
      const remaining = Number(vault.lockoutUntil) - now;
      reasons.push(`Vault is locked for ${remaining} more seconds`);
    }

    const lockoutJustExpired =
      vault.isLocked && now >= Number(vault.lockoutUntil);
    let restoration: Record<string, unknown> | undefined;

    if (lockoutJustExpired) {
      const config = await loadConfig();
      if (config && getSavedNormalPolicy(config.username)) {
        const dailyLimitSol =
          Number(vault.dailyLossLimit) / LAMPORTS_PER_SOL;
        const result = await restorePolicy(
          config.username,
          config.apiToken,
          dailyLimitSol
        );
        restoration = {
          agentwallet_restored: result.enforced,
          action: result.action,
          detail: result.enforced
            ? "Lockout expired. AgentWallet policy restored — agent can trade again."
            : `Restoration failed: ${result.error}`,
        };
      }
    }

    const isInCooldown =
      vault.lastTradeWasLoss &&
      now < Number(vault.lastTradeTime) + vault.cooldownSeconds;
    if (isInCooldown) {
      approved = false;
      const remaining =
        Number(vault.lastTradeTime) + vault.cooldownSeconds - now;
      reasons.push(`Cooldown active for ${remaining} more seconds`);
    }

    const sessionElapsed = now - Number(vault.sessionStart);
    const tradesToday =
      sessionElapsed >= SECONDS_PER_DAY ? 0 : vault.tradesToday;
    const tradesRemaining = vault.maxTradesPerDay - tradesToday;
    if (tradesRemaining <= 0 && vault.maxTradesPerDay > 0) {
      approved = false;
      reasons.push(
        `Daily trade limit reached (${vault.maxTradesPerDay}/${vault.maxTradesPerDay})`
      );
    }

    if (vault.swapInProgress) {
      approved = false;
      reasons.push("A swap is already in progress");
    }

    if (input.size && Number(vault.dailyLossLimit) > 0) {
      const sizeLamports = input.size * LAMPORTS_PER_SOL;
      const budgetUsed = Math.abs(session.dailyPnl * LAMPORTS_PER_SOL);
      const slippageBuffer = 0.8;
      const effectiveBudget =
        Number(vault.dailyLossLimit) * slippageBuffer - budgetUsed;
      if (sizeLamports > effectiveBudget) {
        approved = false;
        reasons.push(
          `Trade size (${input.size} SOL) exceeds remaining daily budget (${(effectiveBudget / LAMPORTS_PER_SOL).toFixed(4)} SOL with 20% slippage buffer)`
        );
      }
    }

    let riskRewardRatio: number | undefined;
    const minRR = session.advisoryLimits?.minRiskRewardRatio ?? DEFAULT_MIN_RISK_REWARD_RATIO;
    if (input.entry_price && input.stop_loss && input.take_profit) {
      const rr = computeRiskRewardRatio(
        input.entry_price,
        input.stop_loss,
        input.take_profit,
        input.direction
      );
      if (rr !== null) {
        riskRewardRatio = Math.round(rr * 100) / 100;
        if (rr < minRR) {
          approved = false;
          reasons.push(
            `Risk:Reward ratio ${riskRewardRatio.toFixed(2)} is below minimum ${minRR.toFixed(1)} (requires at least 1:${minRR})`
          );
        }
      } else {
        approved = false;
        reasons.push(
          "Invalid stop-loss/take-profit levels for the given direction"
        );
      }
    }

    let coaching: CoachingContext | undefined;
    if (input.include_coaching !== false) {
      try {
        const txns = await fetchAllTransactionHistory(input.wallet_address, 30);
        const trades = parseTradeHistory(txns, input.wallet_address);
        coaching = computeCoaching(session, vault, trades, input.market);
      } catch {
        // Coaching is best-effort; don't fail the check
      }
    }

    const sessionExpired =
      now - Number(vault.sessionStart) >= SECONDS_PER_DAY;
    return {
      approved,
      reasons: reasons.length > 0 ? reasons : undefined,
      mode: "on-chain",
      trades_remaining: sessionExpired
        ? vault.maxTradesPerDay
        : Math.max(0, vault.maxTradesPerDay - vault.tradesToday),
      daily_budget_remaining_sol:
        Number(vault.dailyLossLimit) > 0
          ? (
              (Number(vault.dailyLossLimit) -
                Math.abs(session.dailyPnl * LAMPORTS_PER_SOL)) /
              LAMPORTS_PER_SOL
            ).toFixed(4)
          : "unlimited",
      can_trade: approved,
      restoration,
      coaching,
      risk_reward_ratio: riskRewardRatio,
      min_risk_reward_ratio: minRR,
    };
  }

  const initialEquity = input.initial_equity
    ?? parseFloat(process.env.SOL_PRICE_USD ?? "10000");

  const dailyLossLimit = initialEquity * DEFAULT_ADVISORY_DAILY_LOSS_PCT;

  if (!session.advisoryLimits) {
    setAdvisoryLimits(input.wallet_address, {
      dailyLossLimit,
      maxTrades: DEFAULT_ADVISORY_MAX_TRADES,
      cooldownMs: DEFAULT_ADVISORY_COOLDOWN_MS,
    });
  }

  const limits = session.advisoryLimits ?? {
    dailyLossLimit,
    maxTrades: DEFAULT_ADVISORY_MAX_TRADES,
    cooldownMs: DEFAULT_ADVISORY_COOLDOWN_MS,
  };

  let advisoryApproved = true;
  const advisoryReasons: string[] = [];

  const lockState = isAdvisoryLocked(input.wallet_address);
  if (lockState.locked) {
    advisoryApproved = false;
    advisoryReasons.push(
      `Advisory lockout active: ${lockState.reason} (${lockState.remaining}s remaining)`
    );
  }

  if (session.dailyPnl < 0 && Math.abs(session.dailyPnl) >= limits.dailyLossLimit) {
    advisoryApproved = false;
    advisoryReasons.push(
      `Daily loss limit breached: ${Math.abs(session.dailyPnl).toFixed(2)} >= ${limits.dailyLossLimit.toFixed(2)} (${(DEFAULT_ADVISORY_DAILY_LOSS_PCT * 100).toFixed(0)}% of ${initialEquity.toFixed(0)})`
    );
  }

  if (session.tradeCount >= limits.maxTrades) {
    advisoryApproved = false;
    advisoryReasons.push(
      `Daily trade limit reached: ${session.tradeCount}/${limits.maxTrades}`
    );
  }

  if (session.trades.length > 0) {
    const lastTradeTime = session.trades[session.trades.length - 1].timestamp;
    const nowMs = Date.now();
    const elapsedMs = nowMs - lastTradeTime * 1000;
    if (elapsedMs < limits.cooldownMs) {
      advisoryApproved = false;
      const remainingSec = Math.ceil((limits.cooldownMs - elapsedMs) / 1000);
      advisoryReasons.push(`Cooldown active: ${remainingSec}s remaining`);
    }
  }

  let riskRewardRatio: number | undefined;
  const advisoryMinRR = limits.minRiskRewardRatio ?? DEFAULT_MIN_RISK_REWARD_RATIO;
  if (input.entry_price && input.stop_loss && input.take_profit) {
    const rr = computeRiskRewardRatio(
      input.entry_price,
      input.stop_loss,
      input.take_profit,
      input.direction
    );
    if (rr !== null) {
      riskRewardRatio = Math.round(rr * 100) / 100;
      if (rr < advisoryMinRR) {
        advisoryApproved = false;
        advisoryReasons.push(
          `Risk:Reward ratio ${riskRewardRatio.toFixed(2)} is below minimum ${advisoryMinRR.toFixed(1)} (requires at least 1:${advisoryMinRR})`
        );
      }
    } else {
      advisoryApproved = false;
      advisoryReasons.push(
        "Invalid stop-loss/take-profit levels for the given direction"
      );
    }
  }

  let coaching: CoachingContext | undefined;
  if (input.include_coaching !== false) {
    try {
      const txns = await fetchAllTransactionHistory(input.wallet_address, 30);
      const trades = parseTradeHistory(txns, input.wallet_address);
      coaching = computeCoaching(session, vault, trades, input.market);
    } catch {
      // Coaching is best-effort
    }
  }

  return {
    approved: advisoryApproved,
    reasons: advisoryReasons.length > 0 ? advisoryReasons : undefined,
    mode: "advisory",
    message: advisoryApproved
      ? "Advisory mode — session-based enforcement active."
      : "Advisory mode — trade denied based on session limits.",
    session_trades: session.tradeCount,
    session_pnl_sol: session.dailyPnl,
    can_trade: advisoryApproved,
    advisory_limits: {
      daily_loss_limit: limits.dailyLossLimit,
      max_trades: limits.maxTrades,
      cooldown_ms: limits.cooldownMs,
      min_risk_reward_ratio: advisoryMinRR,
    },
    coaching,
    risk_reward_ratio: riskRewardRatio,
    min_risk_reward_ratio: advisoryMinRR,
  };
}
