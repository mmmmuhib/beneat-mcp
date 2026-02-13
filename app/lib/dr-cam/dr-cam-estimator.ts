/**
 * Core DR-CAM estimator — main entry point.
 *
 * Pipeline per Monte Carlo iteration:
 * 1. Bootstrap trades (stationary bootstrap)
 * 2. Engineer features for each trade
 * 3. Apply CAM intervention operator
 * 4. Compute propensity weights with clipping (M = config.maxISWeight)
 * 5. Compute DR correction: μ̂(s,ã) + ρ_clipped * (r - μ̂(s,a))
 * 6. Aggregate across iterations for confidence intervals
 *
 * Beneat Effect = mean(DR-CAM enforced) - mean(observed)
 */

import type { AgentTradeProfile, TradeResult } from "../trade-analyzer";
import type {
  DRCAMResult,
  CATEResult,
  InterventionBreakdown,
  BootstrapConfig,
  SessionStateLabel,
  TradeAction,
  TradeFeatures,
} from "./types";
import { DEFAULT_BOOTSTRAP_CONFIG } from "./types";
import { engineerFeatures, getMedianPositionSize, computeSizeBucket } from "./feature-engineer";
import { fitPropensityModel, estimatePropensity } from "./propensity-model";
import { fitOutcomeModel, estimateOutcome } from "./outcome-model";
import {
  applyIntervention,
  computeTargetPolicyProbability,
  type DayState,
} from "./intervention-operator";
import { stationaryBootstrap, estimateOptimalBlockLength } from "./stationary-bootstrap";
import { computeSensitivityBounds } from "./sensitivity";

/** Session states for CATE decomposition */
const SESSION_STATES: SessionStateLabel[] = [
  "normal", "post_loss", "tilt", "hot_streak", "post_lockout_recovery",
];

/**
 * Run a single DR-CAM iteration on a bootstrapped trade sequence.
 *
 * Returns per-trade DR-corrected P&L values and metadata.
 */
function runDRIteration(
  trades: TradeResult[],
  features: TradeFeatures[],
  profile: AgentTradeProfile,
  config: BootstrapConfig,
  medianPositionSize: number,
): {
  observedPnls: number[];
  drCorrectedPnls: number[];
  sessionStates: SessionStateLabel[];
  interventionTypes: (string | null)[];
  drCorrectionTerms: number[];
} {
  // Fit models on the bootstrapped sample
  const propensityModel = fitPropensityModel(features, medianPositionSize);
  const outcomeModel = fitOutcomeModel(features, trades);

  const observedPnls: number[] = [];
  const drCorrectedPnls: number[] = [];
  const sessionStates: SessionStateLabel[] = [];
  const interventionTypes: (string | null)[] = [];
  const drCorrectionTerms: number[] = [];

  // Day state tracking
  let dayState: DayState = { dayLossPct: 0, dayTradeCount: 0, isLockedOut: false };
  let lastWasLoss = false;
  let currentDay = "";

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const feat = features[i];
    const tradeDay = trade.exitDate.slice(0, 10);

    // Reset day state on new day
    if (tradeDay !== currentDay) {
      currentDay = tradeDay;
      dayState = { dayLossPct: 0, dayTradeCount: 0, isLockedOut: false };
    }

    // Observed action
    const observedAction: TradeAction = {
      direction: feat.direction,
      sizeBucket: computeSizeBucket(feat.positionSizePct, medianPositionSize),
    };

    // Apply intervention (CAM mapping)
    const intervention = applyIntervention(
      trade, feat, profile.avgWinPct, dayState, lastWasLoss, config, medianPositionSize,
    );

    // Propensity scores
    const pi0 = estimatePropensity(propensityModel, feat, observedAction);
    const pi1 = computeTargetPolicyProbability(
      intervention.interventionType, feat, medianPositionSize,
    );

    // Importance sampling ratio (clipped)
    const rhoRaw = pi0 > 0 ? pi1 / pi0 : 1;
    const rho = Math.min(config.maxISWeight, Math.max(1 / config.maxISWeight, rhoRaw));

    // Outcome model estimates
    const muObserved = estimateOutcome(outcomeModel, feat, observedAction);
    const muMapped = estimateOutcome(outcomeModel, feat, intervention.mappedAction);

    // DR correction: μ̂(s,ã) + ρ * (r - μ̂(s,a))
    const residual = trade.pnlPct - muObserved;
    const drCorrectionTerm = rho * residual;
    const drCorrected = muMapped + drCorrectionTerm;

    observedPnls.push(trade.pnlPct);
    drCorrectedPnls.push(drCorrected);
    sessionStates.push(feat.sessionState);
    interventionTypes.push(intervention.interventionType);
    drCorrectionTerms.push(drCorrectionTerm);

    // Update day state
    dayState.dayTradeCount++;
    if (trade.pnl < 0) {
      lastWasLoss = true;
      dayState.dayLossPct += Math.abs(trade.pnlPct);
      if (dayState.dayLossPct >= 3) {
        dayState.isLockedOut = true;
      }
    } else {
      lastWasLoss = false;
    }
  }

  return { observedPnls, drCorrectedPnls, sessionStates, interventionTypes, drCorrectionTerms };
}

/**
 * Run the full DR-CAM analysis for an agent profile.
 *
 * This is the main entry point for the framework.
 */
export function runDRCAMAnalysis(
  profile: AgentTradeProfile,
  config?: Partial<BootstrapConfig>,
): DRCAMResult {
  const cfg: BootstrapConfig = { ...DEFAULT_BOOTSTRAP_CONFIG, ...config };
  const trades = profile.rawTrades;

  if (trades.length === 0) {
    return emptyResult(profile.name, cfg);
  }

  // Compute features on original data for median position size
  const originalFeatures = engineerFeatures(profile);
  const medianPositionSize = getMedianPositionSize(originalFeatures);

  // Optimal block length for diagnostics
  const returns = trades.map((t) => t.pnlPct / 100);
  const optimalBlockLength = estimateOptimalBlockLength(returns);

  // Monte Carlo iterations
  const iterationMeans: number[] = [];
  const iterationObservedMeans: number[] = [];
  const cateAccumulator = new Map<SessionStateLabel, number[]>();
  const interventionCounts = new Map<string, { count: number; preventedLoss: number }>();
  let totalDRCorrectionMagnitude = 0;
  let totalCAMMagnitude = 0;

  for (const state of SESSION_STATES) {
    cateAccumulator.set(state, []);
  }

  for (let iter = 0; iter < cfg.iterations; iter++) {
    // Stationary bootstrap
    const bootTrades = stationaryBootstrap(trades);

    // Build a temporary profile for feature engineering
    const bootProfile: AgentTradeProfile = {
      ...profile,
      rawTrades: bootTrades,
      totalTrades: bootTrades.length,
    };
    const bootFeatures = engineerFeatures(bootProfile);

    // Run DR iteration
    const result = runDRIteration(
      bootTrades, bootFeatures, profile, cfg, medianPositionSize,
    );

    // Aggregate means
    const meanDR = result.drCorrectedPnls.reduce((s, v) => s + v, 0) / result.drCorrectedPnls.length;
    const meanObs = result.observedPnls.reduce((s, v) => s + v, 0) / result.observedPnls.length;
    iterationMeans.push(meanDR);
    iterationObservedMeans.push(meanObs);

    // DR correction magnitude (absolute)
    const corrMag = result.drCorrectionTerms.reduce((s, v) => s + Math.abs(v), 0);
    const camMag = result.drCorrectedPnls.reduce((s, v, idx) => {
      return s + Math.abs(v - result.drCorrectionTerms[idx]);
    }, 0);
    totalDRCorrectionMagnitude += corrMag;
    totalCAMMagnitude += camMag;

    // CATE by session state
    for (let i = 0; i < result.sessionStates.length; i++) {
      const state = result.sessionStates[i];
      const effect = result.drCorrectedPnls[i] - result.observedPnls[i];
      cateAccumulator.get(state)?.push(effect);
    }

    // Intervention counts
    for (const iType of result.interventionTypes) {
      if (iType) {
        const existing = interventionCounts.get(iType) ?? { count: 0, preventedLoss: 0 };
        existing.count++;
        interventionCounts.set(iType, existing);
      }
    }
  }

  // Aggregate results
  const meanDRCorrected = iterationMeans.reduce((s, v) => s + v, 0) / cfg.iterations;
  const meanObserved = iterationObservedMeans.reduce((s, v) => s + v, 0) / cfg.iterations;
  const beneatEffect = meanDRCorrected - meanObserved;

  // Standard error and CI
  const variance = iterationMeans.reduce((s, v) => s + (v - meanDRCorrected) ** 2, 0) / Math.max(1, cfg.iterations - 1);
  const se = Math.sqrt(variance);
  const ci95Lower = beneatEffect - 1.96 * se;
  const ci95Upper = beneatEffect + 1.96 * se;

  // CATE by session state
  const cateBySessionState: CATEResult[] = [];
  for (const state of SESSION_STATES) {
    const effects = cateAccumulator.get(state) ?? [];
    if (effects.length === 0) continue;

    const ate = effects.reduce((s, v) => s + v, 0) / effects.length;
    const cateVar = effects.reduce((s, v) => s + (v - ate) ** 2, 0) / Math.max(1, effects.length - 1);
    const cateSE = Math.sqrt(cateVar / effects.length);

    cateBySessionState.push({
      stratum: state,
      stratumLabel: formatSessionStateLabel(state),
      ate,
      ci95Lower: ate - 1.96 * cateSE,
      ci95Upper: ate + 1.96 * cateSE,
      n: effects.length,
    });
  }

  // Sort CATE by effect size (largest first)
  cateBySessionState.sort((a, b) => Math.abs(b.ate) - Math.abs(a.ate));

  // Intervention breakdown
  const interventionBreakdown: InterventionBreakdown[] = [];
  for (const [type, data] of interventionCounts) {
    interventionBreakdown.push({
      type,
      count: data.count,
      avgPreventedLossPct: data.count > 0 ? data.preventedLoss / data.count : 0,
      totalPreventedLossPct: data.preventedLoss,
    });
  }
  interventionBreakdown.sort((a, b) => b.count - a.count);

  // DR correction magnitude relative to CAM term
  const drCorrectionMagnitude = totalCAMMagnitude > 0
    ? totalDRCorrectionMagnitude / totalCAMMagnitude
    : 0;

  // Sensitivity analysis
  const treatmentEffects = iterationMeans.map((dr, i) => dr - iterationObservedMeans[i]);
  const sensitivityBounds = computeSensitivityBounds(treatmentEffects, cfg.gammaValues);

  return {
    agentName: profile.name,
    beneatEffect,
    beneatEffectCI: [ci95Lower, ci95Upper],
    beneatEffectSE: se,
    meanDRCorrectedReturn: meanDRCorrected,
    meanObservedReturn: meanObserved,
    cateBySessionState,
    sensitivityBounds,
    interventionBreakdown,
    drCorrectionMagnitude,
    optimalBlockLength,
    iterations: cfg.iterations,
    totalTrades: trades.length,
  };
}

function formatSessionStateLabel(state: SessionStateLabel): string {
  const labels: Record<SessionStateLabel, string> = {
    normal: "Normal",
    post_loss: "Post-Loss",
    tilt: "Tilt",
    hot_streak: "Hot Streak",
    post_lockout_recovery: "Post-Lockout Recovery",
  };
  return labels[state];
}

function emptyResult(agentName: string, config: BootstrapConfig): DRCAMResult {
  return {
    agentName,
    beneatEffect: 0,
    beneatEffectCI: [0, 0],
    beneatEffectSE: 0,
    meanDRCorrectedReturn: 0,
    meanObservedReturn: 0,
    cateBySessionState: [],
    sensitivityBounds: config.gammaValues.map((gamma) => ({
      gamma,
      lowerBound: 0,
      upperBound: 0,
      significantAtAlpha05: false,
    })),
    interventionBreakdown: [],
    drCorrectionMagnitude: 0,
    optimalBlockLength: 0,
    iterations: config.iterations,
    totalTrades: 0,
  };
}
