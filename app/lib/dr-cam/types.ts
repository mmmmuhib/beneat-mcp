/**
 * DR-CAM (Doubly Robust Counterfactual Action Mapping) type definitions.
 *
 * Provides consistent estimation of the Beneat Effect even when the
 * intervention model or propensity score model is misspecified.
 */

/** Session state labels adapted from quant-engine classifySessionState */
export type SessionStateLabel =
  | "normal"
  | "post_loss"
  | "tilt"
  | "hot_streak"
  | "post_lockout_recovery";

/** Trade direction action space */
export type TradeDirection =
  | "entry_long"
  | "entry_short"
  | "exit_long"
  | "exit_short";

/** Position size bucket (binary) */
export type SizeBucket = "small" | "large";

/** Composite action = direction + size bucket */
export interface TradeAction {
  direction: TradeDirection;
  sizeBucket: SizeBucket;
}

/** Observable features extracted per trade */
export interface TradeFeatures {
  /** Number of consecutive losses preceding this trade */
  consecutiveLosses: number;
  /** Current equity drawdown from peak as percentage (0-100) */
  equityDrawdownPct: number;
  /** Number of trades executed today (before this one) */
  tradesToday: number;
  /** Inferred session state */
  sessionState: SessionStateLabel;
  /** 20-trade rolling realized volatility of returns */
  realizedVol: number;
  /** Hour of day (0-23) from trade exit timestamp */
  hourOfDay: number;
  /** Day of week (0=Sun, 6=Sat) */
  dayOfWeek: number;
  /** Trading symbol */
  symbol: string;
  /** Inferred trade direction */
  direction: TradeDirection;
  /** Position size as percentage of equity */
  positionSizePct: number;
}

/** Drawdown bucket for propensity binning */
export type DrawdownBucket = "low" | "medium" | "high";

/** Volatility bucket for propensity binning */
export type VolBucket = "low" | "medium" | "high";

/** Propensity model — fitted histogram counts */
export interface PropensityModel {
  /** Joint frequency table: binKey -> direction -> count */
  directionCounts: Map<string, Map<string, number>>;
  /** Conditional size table: binKey+direction -> sizeBucket -> count */
  sizeCounts: Map<string, Map<string, number>>;
  /** Laplace smoothing constant */
  smoothingAlpha: number;
  /** Number of direction categories */
  numDirections: number;
  /** Number of size categories */
  numSizes: number;
}

/** Outcome model — stratified mean estimator */
export interface OutcomeModel {
  /** Primary bins: (sessionState, direction, symbol) -> {sum, count} */
  primaryBins: Map<string, { sum: number; count: number }>;
  /** Fallback bins: (sessionState, direction) -> {sum, count} */
  fallbackBins: Map<string, { sum: number; count: number }>;
  /** Global fallback: direction -> {sum, count} */
  globalBins: Map<string, { sum: number; count: number }>;
  /** Minimum count for primary bin to be used */
  minBinCount: number;
  /** Leave-one-out prediction error estimate */
  looPredictionError: number;
}

/** Propensity estimate for a single trade */
export interface PropensityEstimate {
  /** P(observed action | features) under behavioral policy pi_0 */
  pi0: number;
  /** P(mapped action | features) under target policy pi_1 */
  pi1: number;
  /** Importance sampling ratio pi_1/pi_0 (clipped) */
  rho: number;
}

/** Outcome estimate for a single trade */
export interface OutcomeEstimate {
  /** E[Y | features, observed action] */
  muObserved: number;
  /** E[Y | features, mapped action] */
  muMapped: number;
}

/** Per-trade DR-CAM correction detail */
export interface DRTradeDetail {
  tradeIndex: number;
  observedPnlPct: number;
  mappedPnlPct: number;
  drCorrectedPnlPct: number;
  propensity: PropensityEstimate;
  outcome: OutcomeEstimate;
  sessionState: SessionStateLabel;
  interventionType: string | null;
}

/** Intervention type breakdown */
export interface InterventionBreakdown {
  type: string;
  count: number;
  avgPreventedLossPct: number;
  totalPreventedLossPct: number;
}

/** CATE (Conditional Average Treatment Effect) by stratum */
export interface CATEResult {
  stratum: string;
  stratumLabel: string;
  ate: number;
  ci95Lower: number;
  ci95Upper: number;
  n: number;
}

/** Sensitivity analysis result for a single Gamma */
export interface SensitivityResult {
  gamma: number;
  lowerBound: number;
  upperBound: number;
  significantAtAlpha05: boolean;
}

/** Bootstrap configuration */
export interface BootstrapConfig {
  iterations: number;
  startingEquity?: number;
  /** IS weight clipping ceiling */
  maxISWeight: number;
  /** Fee delta beta range [min, max] in bps */
  feeDeltaBpsRange: [number, number];
  /** Gamma values for sensitivity analysis */
  gammaValues: number[];
}

/** Full DR-CAM analysis result */
export interface DRCAMResult {
  /** Agent name */
  agentName: string;
  /** Aggregate Beneat Effect: mean(DR-enforced) - mean(observed) */
  beneatEffect: number;
  /** 95% CI for Beneat Effect */
  beneatEffectCI: [number, number];
  /** Standard error of Beneat Effect */
  beneatEffectSE: number;
  /** Mean DR-corrected return (enforced) */
  meanDRCorrectedReturn: number;
  /** Mean observed return */
  meanObservedReturn: number;
  /** Per-session-state CATE */
  cateBySessionState: CATEResult[];
  /** Sensitivity bounds */
  sensitivityBounds: SensitivityResult[];
  /** Intervention breakdown */
  interventionBreakdown: InterventionBreakdown[];
  /** DR correction magnitude relative to CAM term */
  drCorrectionMagnitude: number;
  /** Optimal block length used in stationary bootstrap */
  optimalBlockLength: number;
  /** Number of bootstrap iterations */
  iterations: number;
  /** Number of trades in profile */
  totalTrades: number;
}

export const DEFAULT_BOOTSTRAP_CONFIG: BootstrapConfig = {
  iterations: 100,
  maxISWeight: 10,
  feeDeltaBpsRange: [2, 8],
  gammaValues: [1.0, 1.5, 2.0, 3.0],
};
