/**
 * Stratified mean outcome estimator (non-parametric Q-function).
 *
 * Bins trades by (session_state x direction x symbol), computes mean P&L
 * per bin. Falls back to coarser bins when sample size is insufficient.
 *
 * No ML library dependencies — transparent and interpretable.
 */

import type { TradeResult } from "../trade-analyzer";
import type { TradeFeatures, TradeAction, OutcomeModel } from "./types";

const MIN_BIN_COUNT = 3;

/** Build primary bin key: sessionState|direction|symbol */
function primaryKey(features: TradeFeatures): string {
  return `${features.sessionState}|${features.direction}|${features.symbol}`;
}

/** Build fallback bin key: sessionState|direction */
function fallbackKey(features: TradeFeatures): string {
  return `${features.sessionState}|${features.direction}`;
}

/** Build global bin key: direction only */
function globalKey(direction: string): string {
  return direction;
}

/** Build key from action (for counterfactual estimation) */
function primaryKeyFromAction(features: TradeFeatures, action: TradeAction): string {
  return `${features.sessionState}|${action.direction}|${features.symbol}`;
}

function fallbackKeyFromAction(features: TradeFeatures, action: TradeAction): string {
  return `${features.sessionState}|${action.direction}`;
}

/**
 * Accumulate sum and count into a bin map.
 */
function accumulate(
  map: Map<string, { sum: number; count: number }>,
  key: string,
  value: number,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.sum += value;
    existing.count += 1;
  } else {
    map.set(key, { sum: value, count: 1 });
  }
}

/**
 * Fit the outcome model from observed features and trade P&L.
 *
 * Builds three levels of stratification:
 * 1. Primary: (sessionState, direction, symbol)
 * 2. Fallback: (sessionState, direction)
 * 3. Global: (direction)
 *
 * Also computes leave-one-out cross-validation error estimate.
 */
export function fitOutcomeModel(
  features: TradeFeatures[],
  trades: TradeResult[],
): OutcomeModel {
  const primaryBins = new Map<string, { sum: number; count: number }>();
  const fallbackBins = new Map<string, { sum: number; count: number }>();
  const globalBins = new Map<string, { sum: number; count: number }>();

  for (let i = 0; i < features.length; i++) {
    const pnlPct = trades[i].pnlPct;
    const f = features[i];

    accumulate(primaryBins, primaryKey(f), pnlPct);
    accumulate(fallbackBins, fallbackKey(f), pnlPct);
    accumulate(globalBins, globalKey(f.direction), pnlPct);
  }

  // Leave-one-out prediction error
  let looSumSqErr = 0;
  for (let i = 0; i < features.length; i++) {
    const pnlPct = trades[i].pnlPct;
    const f = features[i];

    // Find the bin this trade belongs to and compute LOO prediction
    const pk = primaryKey(f);
    const primary = primaryBins.get(pk);

    let prediction: number;
    if (primary && primary.count >= MIN_BIN_COUNT + 1) {
      // LOO: remove this trade from the bin
      prediction = (primary.sum - pnlPct) / (primary.count - 1);
    } else {
      const fk = fallbackKey(f);
      const fallback = fallbackBins.get(fk);
      if (fallback && fallback.count >= MIN_BIN_COUNT + 1) {
        prediction = (fallback.sum - pnlPct) / (fallback.count - 1);
      } else {
        const gk = globalKey(f.direction);
        const global = globalBins.get(gk);
        if (global && global.count > 1) {
          prediction = (global.sum - pnlPct) / (global.count - 1);
        } else {
          prediction = 0;
        }
      }
    }

    looSumSqErr += (pnlPct - prediction) ** 2;
  }

  const looPredictionError = features.length > 0
    ? Math.sqrt(looSumSqErr / features.length)
    : 0;

  return {
    primaryBins,
    fallbackBins,
    globalBins,
    minBinCount: MIN_BIN_COUNT,
    looPredictionError,
  };
}

/**
 * Estimate E[Y | features, action] using the stratified model.
 *
 * Cascades through bin levels:
 * 1. Primary (sessionState, direction, symbol) if count >= minBinCount
 * 2. Fallback (sessionState, direction) if count >= minBinCount
 * 3. Global (direction) as last resort
 */
export function estimateOutcome(
  model: OutcomeModel,
  features: TradeFeatures,
  action: TradeAction,
): number {
  // Primary bin
  const pk = primaryKeyFromAction(features, action);
  const primary = model.primaryBins.get(pk);
  if (primary && primary.count >= model.minBinCount) {
    return primary.sum / primary.count;
  }

  // Fallback bin
  const fk = fallbackKeyFromAction(features, action);
  const fallback = model.fallbackBins.get(fk);
  if (fallback && fallback.count >= model.minBinCount) {
    return fallback.sum / fallback.count;
  }

  // Global bin
  const gk = globalKey(action.direction);
  const global = model.globalBins.get(gk);
  if (global && global.count > 0) {
    return global.sum / global.count;
  }

  return 0;
}
