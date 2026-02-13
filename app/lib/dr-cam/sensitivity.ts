/**
 * Rosenbaum bounds for sensitivity analysis.
 *
 * Tests how robust the estimated Beneat Effect is to potential
 * unobserved confounding. For each Gamma value, computes upper
 * and lower bounds on the treatment effect under the assumption
 * that an unmeasured confounder could change treatment odds by
 * a factor of Gamma.
 */

import type { SensitivityResult } from "./types";

/**
 * Compute Rosenbaum sensitivity bounds for the treatment effect.
 *
 * For each Gamma in gammaValues:
 * - Lower bound: effect estimate if unobserved confounder biases
 *   treatment assignment toward Gamma times more likely
 * - Upper bound: effect estimate if confounder biases the other way
 *
 * The key question: "Would the conclusion (Beneat Effect > 0) still
 * hold if an unobserved confounder made treatment Gamma times more
 * or less likely?"
 *
 * @param treatmentEffects - Per-iteration treatment effect estimates
 * @param gammaValues - Gamma values to test (1.0 = no confounding)
 */
export function computeSensitivityBounds(
  treatmentEffects: number[],
  gammaValues: number[],
): SensitivityResult[] {
  if (treatmentEffects.length === 0) {
    return gammaValues.map((gamma) => ({
      gamma,
      lowerBound: 0,
      upperBound: 0,
      significantAtAlpha05: false,
    }));
  }

  const n = treatmentEffects.length;
  const sorted = [...treatmentEffects].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1);
  const se = Math.sqrt(variance / n);

  return gammaValues.map((gamma) => {
    // Under Rosenbaum bounds, the worst-case bias shift is:
    // bias = se * log(Gamma) * sqrt(n) / sqrt(pi)
    // Simplified: shift the point estimate by +/- log(Gamma) * se * adjustmentFactor
    const logGamma = Math.log(gamma);
    const adjustmentFactor = logGamma * Math.sqrt(n / Math.PI);
    const biasShift = se * adjustmentFactor;

    const lowerBound = mean - biasShift;
    const upperBound = mean + biasShift;

    // Significant at alpha=0.05 if the lower bound > 0
    // (i.e., even in the worst case, the effect is still positive)
    const significantAtAlpha05 = lowerBound > 1.96 * se;

    return {
      gamma,
      lowerBound,
      upperBound,
      significantAtAlpha05,
    };
  });
}
