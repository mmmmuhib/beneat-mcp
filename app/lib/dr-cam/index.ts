/**
 * DR-CAM (Doubly Robust Counterfactual Action Mapping) — Public API.
 *
 * Provides consistent estimation of the Beneat Effect even when the
 * intervention model or propensity score model is misspecified.
 */

export { runDRCAMAnalysis } from "./dr-cam-estimator";
export { computeSensitivityBounds } from "./sensitivity";
export { estimateOptimalBlockLength } from "./stationary-bootstrap";

export type {
  DRCAMResult,
  CATEResult,
  SensitivityResult,
  InterventionBreakdown,
  BootstrapConfig,
  SessionStateLabel,
  TradeFeatures,
  TradeDirection,
  TradeAction,
  PropensityEstimate,
  OutcomeEstimate,
} from "./types";

export { DEFAULT_BOOTSTRAP_CONFIG } from "./types";
