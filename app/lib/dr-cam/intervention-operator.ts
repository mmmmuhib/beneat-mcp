/**
 * Extended CAM (Counterfactual Action Mapping) intervention operator.
 *
 * Wraps existing enforcement logic from enforcement-simulation.ts and adds:
 * - Fee delta: reduced fees from MCP-routed venue optimization
 * - Venue routing: probability-weighted slippage reduction
 *
 * Returns the mapped trade, intervention type, and fee delta.
 */

import type { TradeResult } from "../trade-analyzer";
import type { TradeFeatures, TradeAction, BootstrapConfig } from "./types";
import { computeSizeBucket, getMedianPositionSize } from "./feature-engineer";

// Reuse constants from enforcement-simulation.ts
const STOP_LOSS_RR = 3;
const DAILY_LOSS_CAP_PCT = 3;
const MAX_TRADES_PER_DAY = 20;
const POST_LOSS_SIZE_MULT = 0.2;
const TILT_SIZE_MULT = 0.1;
const TILT_CONSECUTIVE_LOSSES = 2;

/** Day-level state tracked across trades within a synthetic day */
export interface DayState {
  dayLossPct: number;
  dayTradeCount: number;
  isLockedOut: boolean;
}

/** Result of applying an intervention to a single trade */
export interface InterventionResult {
  /** The trade with adjusted P&L after intervention */
  mappedTrade: TradeResult;
  /** Which intervention was applied (null if none) */
  interventionType: string | null;
  /** Fee savings in P&L percentage terms */
  feeDelta: number;
  /** Size multiplier applied */
  sizeMult: number;
  /** The mapped action (direction + size bucket) */
  mappedAction: TradeAction;
}

/**
 * Apply the intervention operator to a single trade.
 *
 * Follows the same priority as enforcement-simulation.ts:
 * 1. Lockout (daily loss cap or max trades) -> block trade
 * 2. Cooldown (post-loss) -> skip trade
 * 3. Tilt reduction -> 10% position
 * 4. Post-loss reduction -> 20% position
 * 5. Stop-loss -> cap loss at avgWin/3
 *
 * Additionally computes fee delta from venue routing.
 */
export function applyIntervention(
  trade: TradeResult,
  features: TradeFeatures,
  avgWinPct: number,
  dayState: DayState,
  lastWasLoss: boolean,
  config: BootstrapConfig,
  medianPositionSize: number,
): InterventionResult {
  const maxLossPct = avgWinPct / STOP_LOSS_RR;

  // Compute fee delta: beta_route ~ Uniform(feeDeltaBpsRange) in bps
  const [minBps, maxBps] = config.feeDeltaBpsRange;
  const betaRoute = minBps + Math.random() * (maxBps - minBps);
  const notionalPct = features.positionSizePct;
  const feeDelta = (betaRoute / 10000) * notionalPct;

  // 1. Lockout check
  if (dayState.isLockedOut || dayState.dayTradeCount >= MAX_TRADES_PER_DAY) {
    const mappedTrade = { ...trade, pnl: 0, pnlPct: 0 };
    const mappedAction: TradeAction = {
      direction: features.direction,
      sizeBucket: "small",
    };
    return {
      mappedTrade,
      interventionType: "lockout",
      feeDelta: 0,
      sizeMult: 0,
      mappedAction,
    };
  }

  // 2. Cooldown check
  if (lastWasLoss) {
    const mappedTrade = { ...trade, pnl: 0, pnlPct: 0 };
    const mappedAction: TradeAction = {
      direction: features.direction,
      sizeBucket: "small",
    };
    return {
      mappedTrade,
      interventionType: "cooldown",
      feeDelta: 0,
      sizeMult: 0,
      mappedAction,
    };
  }

  // 3-4. Position sizing intervention
  let sizeMult = 1.0;
  let interventionType: string | null = null;

  if (features.consecutiveLosses >= TILT_CONSECUTIVE_LOSSES) {
    sizeMult = TILT_SIZE_MULT;
    interventionType = "tilt_reduction";
  } else if (features.consecutiveLosses > 0) {
    sizeMult = POST_LOSS_SIZE_MULT;
    interventionType = "post_loss_reduction";
  }

  // 5. Stop-loss
  let adjustedPnlPct = trade.pnlPct * sizeMult;
  if (adjustedPnlPct < 0 && Math.abs(trade.pnlPct) > maxLossPct) {
    adjustedPnlPct = -(maxLossPct * sizeMult);
    if (!interventionType) {
      interventionType = "stop_loss";
    }
  }

  // Apply fee savings (reduces cost, always positive effect)
  adjustedPnlPct += feeDelta;

  const mappedTrade: TradeResult = {
    ...trade,
    pnlPct: adjustedPnlPct,
    pnl: trade.pnl * (adjustedPnlPct / (trade.pnlPct || 1)),
  };

  const mappedSizePct = features.positionSizePct * sizeMult;
  const mappedAction: TradeAction = {
    direction: features.direction,
    sizeBucket: computeSizeBucket(mappedSizePct, medianPositionSize),
  };

  return {
    mappedTrade,
    interventionType,
    feeDelta,
    sizeMult,
    mappedAction,
  };
}

/**
 * Compute target policy probability for the mapped action.
 *
 * Under the target (enforced) policy, the probability depends on
 * whether an intervention was applied. When enforced:
 * - Lockout/cooldown: P(skip) ~ 1.0
 * - Tilt/post-loss: P(reduced size) ~ 0.9 (high compliance)
 * - No intervention: P(same action) ~ P(observed action)
 */
export function computeTargetPolicyProbability(
  interventionType: string | null,
  features: TradeFeatures,
  medianPositionSize: number,
): number {
  if (interventionType === "lockout" || interventionType === "cooldown") {
    return 0.95; // Near-certain under enforcement
  }

  if (interventionType === "tilt_reduction") {
    return 0.90; // High but not certain (agent might comply partially)
  }

  if (interventionType === "post_loss_reduction") {
    return 0.85;
  }

  if (interventionType === "stop_loss") {
    return 0.92;
  }

  // No intervention — action is the same under both policies
  // Use a moderate probability reflecting that the observed action
  // is consistent with the target policy
  const sizeBucket = computeSizeBucket(features.positionSizePct, medianPositionSize);
  return sizeBucket === "small" ? 0.55 : 0.45;
}
