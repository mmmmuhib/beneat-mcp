/**
 * Histogram-based propensity estimator.
 *
 * Avoids parametric overfitting on small N (50-300 trades per agent).
 * Uses factored estimation:
 *   P(action | features) = P(direction | features) * P(size_bucket | direction, features)
 *
 * Binning strategy: (session_state x drawdown_bucket x vol_bucket)
 * Laplace smoothing to avoid zero probabilities.
 */

import type { TradeFeatures, TradeDirection, PropensityModel, TradeAction } from "./types";
import { bucketDrawdown, bucketVolatility, computeSizeBucket, getMedianPositionSize } from "./feature-engineer";

/** All possible directions */
const ALL_DIRECTIONS: TradeDirection[] = [
  "entry_long", "entry_short", "exit_long", "exit_short",
];

/** All possible size buckets */
const ALL_SIZES = ["small", "large"] as const;

/**
 * Build the bin key from features for propensity estimation.
 * Key = sessionState|drawdownBucket|volBucket
 */
function buildBinKey(features: TradeFeatures): string {
  const dd = bucketDrawdown(features.equityDrawdownPct);
  const vol = bucketVolatility(features.realizedVol);
  return `${features.sessionState}|${dd}|${vol}`;
}

/**
 * Fit the propensity model from observed features and trades.
 *
 * Counts empirical frequencies within each bin for:
 * 1. P(direction | bin)
 * 2. P(size_bucket | direction, bin)
 */
export function fitPropensityModel(
  features: TradeFeatures[],
  medianPositionSize?: number,
): PropensityModel {
  const medianSize = medianPositionSize ?? getMedianPositionSize(features);
  const smoothingAlpha = 1; // Laplace smoothing

  const directionCounts = new Map<string, Map<string, number>>();
  const sizeCounts = new Map<string, Map<string, number>>();

  for (const f of features) {
    const binKey = buildBinKey(f);
    const sizeBucket = computeSizeBucket(f.positionSizePct, medianSize);

    // Direction counts: binKey -> direction -> count
    if (!directionCounts.has(binKey)) {
      directionCounts.set(binKey, new Map());
    }
    const dirMap = directionCounts.get(binKey)!;
    dirMap.set(f.direction, (dirMap.get(f.direction) ?? 0) + 1);

    // Size counts: binKey|direction -> sizeBucket -> count
    const sizeKey = `${binKey}|${f.direction}`;
    if (!sizeCounts.has(sizeKey)) {
      sizeCounts.set(sizeKey, new Map());
    }
    const sizeMap = sizeCounts.get(sizeKey)!;
    sizeMap.set(sizeBucket, (sizeMap.get(sizeBucket) ?? 0) + 1);
  }

  return {
    directionCounts,
    sizeCounts,
    smoothingAlpha,
    numDirections: ALL_DIRECTIONS.length,
    numSizes: ALL_SIZES.length,
  };
}

/**
 * Estimate propensity P(action | features) using the fitted model.
 *
 * P(action | features) = P(direction | bin) * P(size | direction, bin)
 *
 * Falls back to uniform when bins are empty (Laplace smoothing handles
 * sparse bins; truly empty bins get uniform prior).
 */
export function estimatePropensity(
  model: PropensityModel,
  features: TradeFeatures,
  action: TradeAction,
): number {
  const binKey = buildBinKey(features);
  const alpha = model.smoothingAlpha;

  // P(direction | bin)
  const dirMap = model.directionCounts.get(binKey);
  let pDirection: number;
  if (dirMap) {
    const total = Array.from(dirMap.values()).reduce((s, v) => s + v, 0);
    const count = dirMap.get(action.direction) ?? 0;
    pDirection = (count + alpha) / (total + alpha * model.numDirections);
  } else {
    // No data for this bin — uniform
    pDirection = 1 / model.numDirections;
  }

  // P(size | direction, bin)
  const sizeKey = `${binKey}|${action.direction}`;
  const sizeMap = model.sizeCounts.get(sizeKey);
  let pSize: number;
  if (sizeMap) {
    const total = Array.from(sizeMap.values()).reduce((s, v) => s + v, 0);
    const count = sizeMap.get(action.sizeBucket) ?? 0;
    pSize = (count + alpha) / (total + alpha * model.numSizes);
  } else {
    pSize = 1 / model.numSizes;
  }

  // Factored probability — clamp to [0.01, 0.99] for numerical stability
  return Math.max(0.01, Math.min(0.99, pDirection * pSize));
}
