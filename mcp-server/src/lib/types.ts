export type StrategyType = "scalping" | "day_trading" | "swing_trading" | "conservative";
export type RiskTolerance = "low" | "medium" | "high" | "degen";
export type CalibrationTier = 1 | 2 | 3;

export interface TradeRecord {
  signature: string;
  timestamp: number;
  pnlLamports: number;
  isWin: boolean;
  market?: string;
  direction?: "buy" | "sell" | "unknown";
  amountIn?: number;
  amountOut?: number;
  timeSincePrevTrade?: number;
}

export interface SwapEvent {
  nativeInput?: { account: string; amount: number };
  nativeOutput?: { account: string; amount: number };
  tokenInputs?: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>;
  tokenOutputs?: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>;
  tokenFees?: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>;
  nativeFees?: Array<{ account: string; amount: number }>;
  innerSwaps?: Array<Record<string, unknown>>;
}

export interface VaultParameters {
  dailyLossLimit: bigint;
  maxTradesPerDay: number;
  lockoutDuration: number;
  cooldownSeconds: number;
}

export interface VaultState {
  exists: boolean;
  owner: string;
  bump: number;
  isLocked: boolean;
  lockoutUntil: bigint;
  lockoutCount: number;
  lockoutDuration: number;
  dailyLossLimit: bigint;
  maxTradesPerDay: number;
  tradesToday: number;
  sessionStart: bigint;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  lastTradeWasLoss: boolean;
  lastTradeTime: bigint;
  cooldownSeconds: number;
  swapInProgress: boolean;
  pendingSwapSourceMint?: string;
  pendingSwapDestMint?: string;
  pendingSwapAmountIn?: bigint;
  pendingSwapMinOut?: bigint;
  balanceBeforeSwap?: bigint;
}

export interface TraderProfileState {
  exists: boolean;
  authority: string;
  bump: number;
  overallRating: number;
  discipline: number;
  patience: number;
  consistency: number;
  timing: number;
  riskControl: number;
  endurance: number;
  totalTrades: number;
  totalWins: number;
  totalPnl: bigint;
  avgTradeSize: bigint;
  tradingDays: number;
  lastUpdated: bigint;
}

export interface CalibrationAnalysis {
  tier: CalibrationTier;
  winRate?: number;
  avgLoss?: number;
  maxLossStreak?: number;
  revengeTradeCount?: number;
  revengeTradeRatio?: number;
  var95?: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  kellyFraction?: number;
  profitFactor?: number;
  tradeCount: number;
  lookbackDays: number;
}

export interface MarketAccuracy {
  trades: number;
  win_rate: number;
  avg_pnl_sol: number;
  hallucination_rate: number;
}

export interface AgentAnalytics {
  total_trades: number;
  hallucination_rate: number;
  signal_accuracy: number;
  accuracy_by_market: Record<string, MarketAccuracy>;
  overconfidence_index: number;
  tilt: {
    baseline_win_rate: number;
    post_streak_win_rate: number;
    detected: boolean;
    severity: "none" | "mild" | "moderate" | "severe";
  };
  revenge_hallucination: {
    revenge_trade_count: number;
    revenge_win_rate: number;
    baseline_win_rate: number;
    revenge_is_worse: boolean;
  };
  recovery: {
    lockout_count: number;
    post_lockout_trades: number;
  };
  trend: {
    recent_win_rate: number;
    historical_win_rate: number;
    direction: "improving" | "degrading" | "stable";
  };
  benchmark: {
    agent_cumulative_return: number;
    benchmark_buy_hold_return: number;
    alpha: number;
  };
  recommendations: string[];
}

export interface TrustScoreResult {
  trust_score: number;
  risk_grade: string;
  factors: string[];
}

export interface LeaderboardEntry {
  wallet: string;
  name: string | null;
  project_url: string | null;
  description: string | null;
  trust_grade: string;
  trust_score: number;
  overall_rating: number;
  discipline: number;
  win_rate: number;
  total_trades: number;
  total_pnl: string;
  lockout_count: number;
  daily_loss_limit: string;
  trading_days: number;
  status: "verified" | "tracked";
}

export interface UnsignedTransactionResult {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  description: string;
}

export interface DriftPosition {
  marketIndex: number;
  baseAssetAmount: bigint;
  quoteAssetAmount: bigint;
  quoteEntryAmount: bigint;
  quoteBreakEvenAmount: bigint;
  settledPnl: bigint;
  openOrders: number;
}

export interface AdvisoryLimits {
  dailyLossLimit: number;
  maxTrades: number;
  cooldownMs: number;
  minRiskRewardRatio?: number;
}

export interface SessionTradeLog {
  wallet: string;
  trades: SessionTrade[];
  dailyPnl: number;
  tradeCount: number;
  sessionStart: number;
  lastActivity: number;
  lockoutUntil?: number;
  lockoutReason?: string;
  advisoryLimits?: AdvisoryLimits;
}

export interface SessionTrade {
  timestamp: number;
  pnl: number;
  market?: string;
  cumPnl: number;
  confidence?: number;
}

export interface EnhancedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  description?: string;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      userAccount: string;
      tokenAccount: string;
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
    }>;
  }>;
  events?: { swap?: SwapEvent; [key: string]: unknown };
}

export type SessionState =
  | "normal"
  | "post_loss"
  | "tilt"
  | "hot_streak"
  | "post_lockout_recovery";

export interface CoachingContext {
  session_state: SessionState;
  confidence_adjustment: number;
  suggested_max_size_sol: number;
  suggested_max_size_pct: number;
  avoid_markets: string[];
  best_market?: string;
  reasoning: string;
}

export interface AnalyticsDirective {
  type:
    | "reduce_size"
    | "avoid_market"
    | "increase_cooldown"
    | "restrict_trades"
    | "focus_market"
    | "pause_trading";
  severity: "info" | "warning" | "critical";
  params: Record<string, unknown>;
  reason: string;
}

export interface PlaybookMarket {
  market: string;
  win_rate: number;
  trades: number;
  avg_pnl_sol: number;
  edge_rating: "strong" | "moderate" | "weak";
}

export interface BehavioralRule {
  trigger: string;
  action: string;
  source: string;
}

export interface MarketRegime {
  assessment: "normal" | "volatile" | "trending";
  recent_sharpe: number;
  baseline_sharpe: number;
  drift_detected: boolean;
}

export interface AgentPlaybook {
  identity: string;
  primary_markets: PlaybookMarket[];
  restricted_markets: string[];
  position_sizing: {
    kelly_fraction: number;
    half_kelly_sol: number;
    max_position_pct: number;
    state_reductions: Record<SessionState, number>;
  };
  behavioral_rules: BehavioralRule[];
  regime: MarketRegime;
  expectancy_sol: number;
  profit_factor: number;
}

export interface ConfidenceBin {
  range: string;
  actual_accuracy: number;
  trade_count: number;
}

export interface ConfidenceCalibration {
  input_confidence: number;
  calibrated_confidence: number;
  historical_accuracy: number;
  position_size_recommendation_sol: number;
  insight: string;
  calibration_curve: ConfidenceBin[];
}

export type SessionMode = "aggressive" | "normal" | "conservative_recovery";

export interface SessionStrategy {
  mode: SessionMode;
  reason: string;
  max_trades: number;
  max_exposure_sol: number;
  focus_markets: string[];
  position_size_sol: number;
  position_size_pct: number;
  stop_trading_conditions: string[];
}
