export type StrategyType = "scalping" | "day_trading" | "swing_trading" | "conservative";

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

const LAMPORTS_PER_SOL = 1_000_000_000;
const SECONDS_PER_DAY = 86400;
const CRYPTO_TRADING_DAYS_PER_YEAR = 365;

const REVENGE_TRADE_WINDOWS: Record<string, number> = {
  scalping: 30,
  day_trading: 120,
  swing_trading: 600,
  conservative: 1800,
};

const DEFI_SOURCES = new Set([
  "JUPITER", "RAYDIUM", "ORCA", "DRIFT", "METEORA", "PHOENIX",
  "LIFINITY", "MARINADE", "FLASH_TRADE", "OPENBOOK", "TENSOR",
  "PUMP_FUN", "ALDRIN", "CREMA", "INVARIANT", "SABER", "SANCTUM",
  "KAMINO", "MARGINFI", "ZETA", "MANGO", "BONKSWAP", "STEP_FINANCE",
  "HAWKSIGHT", "WHIRLPOOL",
]);

const TRADE_TYPES = new Set(["SWAP", "BURN_AND_CLOSE"]);

const KNOWN_MINTS = new Map<string, string>([
  ["So11111111111111111111111111111111111111112", "SOL"],
  ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC"],
  ["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "USDT"],
  ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "BONK"],
  ["JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "JUP"],
  ["EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "WIF"],
  ["jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", "JTO"],
  ["HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", "PYTH"],
  ["4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", "RAY"],
  ["orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", "ORCA"],
  ["mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", "mSOL"],
  ["7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", "WETH"],
  ["3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", "WBTC"],
]);

function resolveMintName(mint: string): string {
  return KNOWN_MINTS.get(mint) ?? mint.slice(0, 8);
}

function extractFromSwapEvent(
  swap: SwapEvent
): { pnlLamports: number; direction: "buy" | "sell" | "unknown"; market: string; amountIn: number; amountOut: number } {
  const nativeIn = swap.nativeInput?.amount ?? 0;
  const nativeOut = swap.nativeOutput?.amount ?? 0;
  const pnlLamports = nativeOut - nativeIn;

  let direction: "buy" | "sell" | "unknown" = "unknown";
  if (nativeIn > 0 && nativeOut === 0) direction = "buy";
  else if (nativeOut > 0 && nativeIn === 0) direction = "sell";

  const allMints: string[] = [];
  for (const t of swap.tokenInputs ?? []) allMints.push(t.mint);
  for (const t of swap.tokenOutputs ?? []) allMints.push(t.mint);

  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const nonSolMint = allMints.find((m) => m !== SOL_MINT);
  const market = nonSolMint ? resolveMintName(nonSolMint) : "unknown";

  return { pnlLamports, direction, market, amountIn: nativeIn, amountOut: nativeOut };
}

export function parseTradeHistory(
  transactions: EnhancedTransaction[],
  walletAddress: string
): TradeRecord[] {
  const trades: TradeRecord[] = [];

  const tradeTxns = transactions.filter(
    (tx) => TRADE_TYPES.has(tx.type) || DEFI_SOURCES.has(tx.source)
  );

  for (const tx of tradeTxns) {
    const swap = tx.events?.swap as SwapEvent | undefined;

    if (swap && (swap.nativeInput || swap.nativeOutput || swap.tokenInputs?.length || swap.tokenOutputs?.length)) {
      const extracted = extractFromSwapEvent(swap);
      trades.push({
        signature: tx.signature,
        timestamp: tx.timestamp,
        pnlLamports: extracted.pnlLamports,
        isWin: extracted.pnlLamports > 0,
        market: extracted.market,
        direction: extracted.direction,
        amountIn: extracted.amountIn,
        amountOut: extracted.amountOut,
      });
    } else {
      let pnlLamports = 0;

      if (tx.accountData) {
        const walletAccount = tx.accountData.find(
          (a) => a.account === walletAddress
        );
        if (walletAccount) {
          pnlLamports = walletAccount.nativeBalanceChange;
        }
      }

      if (pnlLamports === 0 && tx.nativeTransfers) {
        const inflow = tx.nativeTransfers
          .filter((t) => t.toUserAccount === walletAddress)
          .reduce((sum, t) => sum + t.amount, 0);
        const outflow = tx.nativeTransfers
          .filter((t) => t.fromUserAccount === walletAddress)
          .reduce((sum, t) => sum + t.amount, 0);
        pnlLamports = inflow - outflow - tx.fee;
      }

      trades.push({
        signature: tx.signature,
        timestamp: tx.timestamp,
        pnlLamports,
        isWin: pnlLamports > 0,
        market: tx.source,
      });
    }
  }

  trades.sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 1; i < trades.length; i++) {
    trades[i].timeSincePrevTrade = trades[i].timestamp - trades[i - 1].timestamp;
  }

  return trades;
}

export function estimateCapitalFromHistory(trades: TradeRecord[]): number {
  if (trades.length === 0) return LAMPORTS_PER_SOL;
  const avgTradeSize =
    trades.reduce((s, t) => s + Math.abs(t.pnlLamports), 0) / trades.length;
  return Math.max(LAMPORTS_PER_SOL, avgTradeSize * 10);
}

export function inferStrategyType(trades: TradeRecord[]): StrategyType {
  if (trades.length < 2) return "day_trading";
  const spanSeconds = trades[trades.length - 1].timestamp - trades[0].timestamp;
  const spanDays = Math.max(1, spanSeconds / SECONDS_PER_DAY);
  const tradesPerDay = trades.length / spanDays;
  if (tradesPerDay > 30) return "scalping";
  if (tradesPerDay > 8) return "day_trading";
  if (tradesPerDay > 2) return "swing_trading";
  return "conservative";
}

function getRevengeWindow(strategy: StrategyType): number {
  return REVENGE_TRADE_WINDOWS[strategy] ?? REVENGE_TRADE_WINDOWS.day_trading;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function groupByDay(
  trades: TradeRecord[]
): Array<{ date: string; pnl: number }> {
  const byDay = new Map<string, number>();
  for (const trade of trades) {
    const date = new Date(trade.timestamp * 1000).toISOString().slice(0, 10);
    byDay.set(date, (byDay.get(date) ?? 0) + trade.pnlLamports);
  }
  return Array.from(byDay.entries())
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function computeDailyReturns(trades: TradeRecord[], capitalLamports: number): number[] {
  const dailyPnls = groupByDay(trades);
  if (dailyPnls.length === 0 || capitalLamports <= 0) return [];
  const returns: number[] = [];
  let portfolioValue = capitalLamports;
  for (const day of dailyPnls) {
    if (portfolioValue <= 0) break;
    returns.push(day.pnl / portfolioValue);
    portfolioValue += day.pnl;
  }
  return returns;
}

export function computeVaR(returns: number[], percentile: number): number {
  if (returns.length < 2) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * percentile);
  return sorted[Math.max(0, idx)];
}

export function computeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(CRYPTO_TRADING_DAYS_PER_YEAR);
}

export function computeMaxDrawdown(trades: TradeRecord[], capitalLamports?: number): number {
  if (trades.length === 0) return 0;

  const startEquity = capitalLamports
    ? capitalLamports / LAMPORTS_PER_SOL
    : estimateCapitalFromHistory(trades) / LAMPORTS_PER_SOL;

  let equity = startEquity;
  let peak = equity;
  let maxDdPct = 0;

  for (const trade of trades) {
    equity += trade.pnlLamports / LAMPORTS_PER_SOL;
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const ddPct = (peak - equity) / peak;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
    }
  }

  return maxDdPct;
}

export function computeKellyFraction(trades: TradeRecord[]): number {
  if (trades.length < 5) return 0;
  const wins = trades.filter((t) => t.isWin);
  const losses = trades.filter((t) => !t.isWin);
  const winRate = wins.length / trades.length;
  const avgWin =
    wins.length > 0
      ? wins.reduce((s, t) => s + t.pnlLamports, 0) / wins.length / LAMPORTS_PER_SOL
      : 0;
  const avgLoss =
    losses.length > 0
      ? Math.abs(losses.reduce((s, t) => s + t.pnlLamports, 0) / losses.length / LAMPORTS_PER_SOL)
      : 0;
  if (avgWin <= 0) return 0;
  return (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
}

export function computeAccuracyByMarket(
  trades: TradeRecord[]
): Record<string, MarketAccuracy> {
  const byMarket = new Map<
    string,
    { wins: number; total: number; totalPnl: number }
  >();

  for (const trade of trades) {
    const market = trade.market ?? "unknown";
    const entry = byMarket.get(market) ?? { wins: 0, total: 0, totalPnl: 0 };
    entry.total++;
    if (trade.isWin) entry.wins++;
    entry.totalPnl += trade.pnlLamports / LAMPORTS_PER_SOL;
    byMarket.set(market, entry);
  }

  const result: Record<string, MarketAccuracy> = {};
  for (const [market, data] of byMarket) {
    const marketWinRate = data.wins / data.total;
    result[market] = {
      trades: data.total,
      win_rate: round4(marketWinRate),
      avg_pnl_sol: round4(data.totalPnl / data.total),
      hallucination_rate: round4(1 - marketWinRate),
    };
  }

  return result;
}

export function computeOverconfidenceIndex(trades: TradeRecord[]): number {
  if (trades.length < 5) return 0;

  const sizes = trades.map((t) => Math.abs(t.pnlLamports));
  const medianSize = [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)];

  const largeTrades = trades.filter(
    (t) => Math.abs(t.pnlLamports) > medianSize
  );
  const smallTrades = trades.filter(
    (t) => Math.abs(t.pnlLamports) <= medianSize
  );

  if (largeTrades.length === 0 || smallTrades.length === 0) return 0;

  const largeWinRate =
    largeTrades.filter((t) => t.isWin).length / largeTrades.length;
  const smallWinRate =
    smallTrades.filter((t) => t.isWin).length / smallTrades.length;

  const index = smallWinRate - largeWinRate;
  return Math.max(0, index);
}

export function computeTiltDetection(trades: TradeRecord[]): AgentAnalytics["tilt"] {
  if (trades.length < 10) {
    return {
      baseline_win_rate: 0,
      post_streak_win_rate: 0,
      detected: false,
      severity: "none",
    };
  }

  const baselineWinRate =
    trades.filter((t) => t.isWin).length / trades.length;

  const postStreakTrades: TradeRecord[] = [];
  for (let i = 2; i < trades.length; i++) {
    if (!trades[i - 1].isWin && !trades[i - 2].isWin) {
      postStreakTrades.push(trades[i]);
    }
  }

  if (postStreakTrades.length < 3) {
    return {
      baseline_win_rate: round4(baselineWinRate),
      post_streak_win_rate: round4(baselineWinRate),
      detected: false,
      severity: "none",
    };
  }

  const postStreakWinRate =
    postStreakTrades.filter((t) => t.isWin).length / postStreakTrades.length;

  const degradation = baselineWinRate - postStreakWinRate;
  let severity: "none" | "mild" | "moderate" | "severe" = "none";
  if (degradation > 0.3) severity = "severe";
  else if (degradation > 0.15) severity = "moderate";
  else if (degradation > 0.05) severity = "mild";

  return {
    baseline_win_rate: round4(baselineWinRate),
    post_streak_win_rate: round4(postStreakWinRate),
    detected: severity !== "none",
    severity,
  };
}

export function computeRevengeHallucination(
  trades: TradeRecord[],
  baselineWinRate: number
): AgentAnalytics["revenge_hallucination"] {
  const strategy = inferStrategyType(trades);
  const revengeWindow = getRevengeWindow(strategy);

  const revengeTrades: TradeRecord[] = [];

  for (let i = 1; i < trades.length; i++) {
    if (
      !trades[i - 1].isWin &&
      trades[i].timeSincePrevTrade !== undefined &&
      trades[i].timeSincePrevTrade! < revengeWindow
    ) {
      revengeTrades.push(trades[i]);
    }
  }

  if (revengeTrades.length === 0) {
    return {
      revenge_trade_count: 0,
      revenge_win_rate: 0,
      baseline_win_rate: round4(baselineWinRate),
      revenge_is_worse: false,
    };
  }

  const revengeWinRate =
    revengeTrades.filter((t) => t.isWin).length / revengeTrades.length;

  return {
    revenge_trade_count: revengeTrades.length,
    revenge_win_rate: round4(revengeWinRate),
    baseline_win_rate: round4(baselineWinRate),
    revenge_is_worse: revengeWinRate < baselineWinRate,
  };
}

function generateRecommendations(ctx: {
  hallucinationRate: number;
  winRate: number;
  accuracyByMarket: Record<string, MarketAccuracy>;
  overconfidenceIndex: number;
  tilt: AgentAnalytics["tilt"];
  revengeHallucination: AgentAnalytics["revenge_hallucination"];
  trendDirection: string;
  tradeCount: number;
}): string[] {
  const recs: string[] = [];

  if (ctx.tradeCount < 5) {
    recs.push(
      "Fewer than 5 trades recorded. Analytics will improve with more data."
    );
    return recs;
  }

  if (ctx.hallucinationRate > 0.6) {
    recs.push(
      `Hallucination rate is ${(ctx.hallucinationRate * 100).toFixed(0)}% — analysis is wrong more often than right. Review the reasoning chain.`
    );
  } else if (ctx.hallucinationRate > 0.4) {
    recs.push(
      `Hallucination rate is ${(ctx.hallucinationRate * 100).toFixed(0)}% — nearly coin-flip accuracy. Market analysis may not be adding signal.`
    );
  }

  const markets = Object.entries(ctx.accuracyByMarket);
  if (markets.length > 1) {
    const sorted = markets.sort(
      (a, b) => b[1].win_rate - a[1].win_rate
    );
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    if (best[1].win_rate - worst[1].win_rate > 0.15 && worst[1].trades >= 3) {
      recs.push(
        `Signal accuracy varies by market: ${best[0]} at ${(best[1].win_rate * 100).toFixed(0)}% vs ${worst[0]} at ${(worst[1].win_rate * 100).toFixed(0)}%. Consider restricting to markets where analysis is reliable.`
      );
    }
  }

  if (ctx.overconfidenceIndex > 0.15) {
    recs.push(
      `Overconfidence detected: sizing up on trades that lose. Large trades have a lower win rate than small trades.`
    );
  }

  if (ctx.tilt.detected) {
    recs.push(
      `Tilt detected (${ctx.tilt.severity}): win rate drops from ${(ctx.tilt.baseline_win_rate * 100).toFixed(0)}% to ${(ctx.tilt.post_streak_win_rate * 100).toFixed(0)}% after consecutive losses.`
    );
  }

  if (
    ctx.revengeHallucination.revenge_trade_count > 0 &&
    ctx.revengeHallucination.revenge_is_worse
  ) {
    recs.push(
      `Revenge trading detected: ${ctx.revengeHallucination.revenge_trade_count} trades within 2 minutes of a loss, with ${(ctx.revengeHallucination.revenge_win_rate * 100).toFixed(0)}% win rate vs ${(ctx.revengeHallucination.baseline_win_rate * 100).toFixed(0)}% baseline.`
    );
  }

  if (ctx.trendDirection === "degrading") {
    recs.push(
      "Performance is trending down. Recent trades are significantly worse than historical."
    );
  } else if (ctx.trendDirection === "improving") {
    recs.push(
      "Performance is trending up. Recent trades are better than historical average."
    );
  }

  if (recs.length === 0) {
    recs.push(
      "Performing within normal parameters. Continue monitoring."
    );
  }

  return recs;
}

export function computeAgentAnalytics(
  trades: TradeRecord[],
  lockoutCount: number = 0,
  startingCapitalLamports: number = 0
): AgentAnalytics {
  if (trades.length === 0) {
    return {
      total_trades: 0,
      hallucination_rate: 0,
      signal_accuracy: 0,
      accuracy_by_market: {},
      overconfidence_index: 0,
      tilt: {
        baseline_win_rate: 0,
        post_streak_win_rate: 0,
        detected: false,
        severity: "none",
      },
      revenge_hallucination: {
        revenge_trade_count: 0,
        revenge_win_rate: 0,
        baseline_win_rate: 0,
        revenge_is_worse: false,
      },
      recovery: { lockout_count: lockoutCount, post_lockout_trades: 0 },
      trend: {
        recent_win_rate: 0,
        historical_win_rate: 0,
        direction: "stable",
      },
      benchmark: {
        agent_cumulative_return: 0,
        benchmark_buy_hold_return: 0,
        alpha: 0,
      },
      recommendations: ["Not enough trades to analyze. Execute at least 5 trades to unlock analytics."],
    };
  }

  const wins = trades.filter((t) => t.isWin);
  const losses = trades.filter((t) => !t.isWin);
  const winRate = wins.length / trades.length;

  const sizeWeightedLosses = losses.reduce(
    (sum, t) => sum + Math.abs(t.pnlLamports),
    0
  );
  const totalVolume = trades.reduce(
    (sum, t) => sum + Math.abs(t.pnlLamports),
    0
  );
  const hallucinationRate =
    totalVolume > 0 ? sizeWeightedLosses / totalVolume : 1 - winRate;

  const accuracyByMarket = computeAccuracyByMarket(trades);
  const overconfidenceIndex = computeOverconfidenceIndex(trades);
  const tilt = computeTiltDetection(trades);
  const revengeHallucination = computeRevengeHallucination(trades, winRate);

  const recentWindow = Math.min(10, Math.floor(trades.length / 2));
  const recentTrades = trades.slice(-recentWindow);
  const historicalTrades = trades.slice(0, -recentWindow);
  const recentWinRate =
    recentTrades.length > 0
      ? recentTrades.filter((t) => t.isWin).length / recentTrades.length
      : 0;
  const historicalWinRate =
    historicalTrades.length > 0
      ? historicalTrades.filter((t) => t.isWin).length /
        historicalTrades.length
      : winRate;

  let trendDirection: "improving" | "degrading" | "stable" = "stable";
  const trendDelta = recentWinRate - historicalWinRate;
  if (trendDelta > 0.1) trendDirection = "improving";
  else if (trendDelta < -0.1) trendDirection = "degrading";

  const recommendations = generateRecommendations({
    hallucinationRate,
    winRate,
    accuracyByMarket,
    overconfidenceIndex,
    tilt,
    revengeHallucination,
    trendDirection,
    tradeCount: trades.length,
  });

  const cumulativePnlSol = trades.reduce((sum, t) => sum + t.pnlLamports, 0) / LAMPORTS_PER_SOL;
  const capital = startingCapitalLamports > 0 ? startingCapitalLamports / LAMPORTS_PER_SOL : 0;
  const agentReturn = capital > 0 ? cumulativePnlSol / capital : 0;

  return {
    total_trades: trades.length,
    hallucination_rate: round4(hallucinationRate),
    signal_accuracy: round4(winRate),
    accuracy_by_market: accuracyByMarket,
    overconfidence_index: round4(overconfidenceIndex),
    tilt,
    revenge_hallucination: revengeHallucination,
    recovery: { lockout_count: lockoutCount, post_lockout_trades: trades.length },
    trend: {
      recent_win_rate: round4(recentWinRate),
      historical_win_rate: round4(historicalWinRate),
      direction: trendDirection,
    },
    benchmark: {
      agent_cumulative_return: round4(agentReturn),
      benchmark_buy_hold_return: 0,
      alpha: round4(agentReturn),
    },
    recommendations,
  };
}

export function generateDirectives(
  analytics: AgentAnalytics,
  kellyFraction?: number
): AnalyticsDirective[] {
  const directives: AnalyticsDirective[] = [];

  if (analytics.total_trades < 5) return directives;

  if (kellyFraction !== undefined && kellyFraction < 0) {
    directives.push({
      type: "pause_trading",
      severity: "critical",
      params: { kelly_fraction: round4(kellyFraction) },
      reason: `Negative Kelly fraction (${round4(kellyFraction)}): expected value per trade is negative.`,
    });
  }

  if (analytics.hallucination_rate > 0.6) {
    directives.push({
      type: "pause_trading",
      severity: "critical",
      params: { hallucination_rate: analytics.hallucination_rate },
      reason: `Hallucination rate is ${(analytics.hallucination_rate * 100).toFixed(0)}% — analysis is wrong more often than right.`,
    });
  }

  const markets = Object.entries(analytics.accuracy_by_market);
  if (markets.length > 1) {
    const sorted = markets.sort((a, b) => b[1].win_rate - a[1].win_rate);
    for (const [mkt, data] of sorted) {
      if (data.win_rate < 0.35 && data.trades >= 3) {
        directives.push({
          type: "avoid_market",
          severity: "warning",
          params: { market: mkt, win_rate: data.win_rate, trades: data.trades },
          reason: `${mkt} has ${(data.win_rate * 100).toFixed(0)}% win rate across ${data.trades} trades.`,
        });
      }
      if (data.win_rate > 0.6 && data.trades >= 5) {
        directives.push({
          type: "focus_market",
          severity: "info",
          params: { market: mkt, win_rate: data.win_rate, trades: data.trades },
          reason: `${mkt} has ${(data.win_rate * 100).toFixed(0)}% win rate across ${data.trades} trades — strong signal.`,
        });
      }
    }
  }

  if (analytics.overconfidence_index > 0.15) {
    directives.push({
      type: "reduce_size",
      severity: "warning",
      params: { overconfidence_index: analytics.overconfidence_index },
      reason: "Sizing up on trades that lose. Large trades have lower win rate than small trades.",
    });
  }

  if (analytics.tilt.detected) {
    directives.push({
      type: "increase_cooldown",
      severity: analytics.tilt.severity === "severe" ? "critical" : "warning",
      params: {
        baseline_win_rate: analytics.tilt.baseline_win_rate,
        post_streak_win_rate: analytics.tilt.post_streak_win_rate,
        severity: analytics.tilt.severity,
      },
      reason: `Tilt detected (${analytics.tilt.severity}): win rate drops from ${(analytics.tilt.baseline_win_rate * 100).toFixed(0)}% to ${(analytics.tilt.post_streak_win_rate * 100).toFixed(0)}% after losses.`,
    });
  }

  if (
    analytics.revenge_hallucination.revenge_trade_count > 0 &&
    analytics.revenge_hallucination.revenge_is_worse
  ) {
    directives.push({
      type: "increase_cooldown",
      severity: "warning",
      params: {
        revenge_count: analytics.revenge_hallucination.revenge_trade_count,
        revenge_win_rate: analytics.revenge_hallucination.revenge_win_rate,
      },
      reason: `${analytics.revenge_hallucination.revenge_trade_count} revenge trades with ${(analytics.revenge_hallucination.revenge_win_rate * 100).toFixed(0)}% win rate vs ${(analytics.revenge_hallucination.baseline_win_rate * 100).toFixed(0)}% baseline.`,
    });
  }

  if (analytics.trend.direction === "degrading") {
    directives.push({
      type: "restrict_trades",
      severity: "warning",
      params: {
        recent_win_rate: analytics.trend.recent_win_rate,
        historical_win_rate: analytics.trend.historical_win_rate,
      },
      reason: "Performance trending down. Recent trades significantly worse than historical.",
    });
  }

  return directives;
}
