/**
 * Feature engineering for DR-CAM.
 *
 * Extracts observable features from TradeResult[] + AgentTradeProfile.
 * Session state inference adapts the MCP server's classifySessionState
 * logic for CSV-only data (no vault/session objects).
 */

import type { TradeResult, AgentTradeProfile } from "../trade-analyzer";
import type { TradeFeatures, SessionStateLabel, TradeDirection } from "./types";

/**
 * Infer session state from trade history context (CSV-adapted).
 *
 * Uses consecutive losses and P&L patterns:
 * - tilt: 3+ consecutive losses
 * - post_loss: 1-2 consecutive losses within recent trades
 * - hot_streak: 3+ consecutive wins
 * - post_lockout_recovery: cumulative day loss >= 3%
 * - normal: default
 */
function inferSessionState(
  consecutiveLosses: number,
  consecutiveWins: number,
  dayLossPct: number,
): SessionStateLabel {
  if (dayLossPct >= 3) return "post_lockout_recovery";
  if (consecutiveLosses >= 3) return "tilt";
  if (consecutiveLosses >= 1) return "post_loss";
  if (consecutiveWins >= 3) return "hot_streak";
  return "normal";
}

/**
 * Infer trade direction from trade data.
 *
 * Uses P&L sign + price direction to determine if entry or exit,
 * and whether long or short.
 */
function inferDirection(trade: TradeResult): TradeDirection {
  const isLong = trade.exitPrice >= trade.entryPrice;
  // For Hyperliquid data where entryDate === exitDate (single fill),
  // we infer based on the P&L sign and price movement
  if (trade.pnl >= 0) {
    return isLong ? "exit_long" : "exit_short";
  }
  return isLong ? "entry_short" : "entry_long";
}

/**
 * Compute 20-trade rolling realized volatility of returns.
 * Returns 0 for the first trade.
 */
function computeRollingVol(returns: number[], index: number, window: number = 20): number {
  const start = Math.max(0, index - window);
  const slice = returns.slice(start, index);
  if (slice.length < 2) return 0;

  const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / (slice.length - 1);
  return Math.sqrt(variance);
}

/**
 * Extract features for all trades in a profile.
 * Returns TradeFeatures[] aligned 1:1 with profile.rawTrades.
 */
export function engineerFeatures(profile: AgentTradeProfile): TradeFeatures[] {
  const trades = profile.rawTrades;
  if (trades.length === 0) return [];

  const features: TradeFeatures[] = [];
  const returns: number[] = [];

  let consecutiveLosses = 0;
  let consecutiveWins = 0;
  let equity = profile.startingEquity;
  let peak = equity;
  let currentDay = "";
  let tradesToday = 0;
  let dayLossPct = 0;

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const tradeDay = trade.exitDate.slice(0, 10);

    // Reset daily counters on new day
    if (tradeDay !== currentDay) {
      currentDay = tradeDay;
      tradesToday = 0;
      dayLossPct = 0;
    }

    // Drawdown
    if (equity > peak) peak = equity;
    const equityDrawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

    // Rolling vol
    const vol = computeRollingVol(returns, i);

    // Timestamp features
    const exitDate = new Date(trade.exitDate);
    const hourOfDay = exitDate.getHours();
    const dayOfWeek = exitDate.getDay();

    // Direction
    const direction = inferDirection(trade);

    // Position size as pct of equity
    const positionValue = trade.shares * trade.entryPrice;
    const positionSizePct = equity > 0 ? (positionValue / equity) * 100 : 0;

    // Session state (uses pre-trade state)
    const sessionState = inferSessionState(
      consecutiveLosses,
      consecutiveWins,
      dayLossPct,
    );

    features.push({
      consecutiveLosses,
      equityDrawdownPct,
      tradesToday,
      sessionState,
      realizedVol: vol,
      hourOfDay,
      dayOfWeek,
      symbol: trade.symbol,
      direction,
      positionSizePct,
    });

    // Update running state for the NEXT trade
    const tradeReturn = trade.pnlPct / 100;
    returns.push(tradeReturn);

    if (trade.pnl < 0) {
      consecutiveLosses++;
      consecutiveWins = 0;
      dayLossPct += equity > 0 ? (Math.abs(trade.pnl) / equity) * 100 : 0;
    } else {
      consecutiveLosses = 0;
      consecutiveWins++;
    }

    equity += trade.pnl;
    tradesToday++;
  }

  return features;
}

/**
 * Bucket drawdown percentage into low/medium/high.
 */
export function bucketDrawdown(drawdownPct: number): "low" | "medium" | "high" {
  if (drawdownPct < 2) return "low";
  if (drawdownPct < 5) return "medium";
  return "high";
}

/**
 * Bucket realized volatility into low/medium/high.
 */
export function bucketVolatility(vol: number): "low" | "medium" | "high" {
  if (vol < 0.02) return "low";
  if (vol < 0.05) return "medium";
  return "high";
}

/**
 * Compute size bucket based on position size relative to median.
 */
export function computeSizeBucket(
  positionSizePct: number,
  medianPositionSizePct: number,
): "small" | "large" {
  return positionSizePct < medianPositionSizePct ? "small" : "large";
}

/**
 * Get the median position size from features array.
 */
export function getMedianPositionSize(features: TradeFeatures[]): number {
  if (features.length === 0) return 0;
  const sorted = features.map((f) => f.positionSizePct).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
