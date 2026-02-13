import {
  STRATEGY_DEFAULTS,
  RISK_TOLERANCE_MULTIPLIERS,
  LAMPORTS_PER_SOL,
  CRYPTO_TRADING_DAYS_PER_YEAR,
  REVENGE_TRADE_WINDOWS,
  SECONDS_PER_DAY,
} from "./constants.js";
import type {
  EnhancedTransaction,
  TradeRecord,
  VaultParameters,
  CalibrationAnalysis,
  AgentAnalytics,
  MarketAccuracy,
  StrategyType,
  RiskTolerance,
  SessionTradeLog,
  VaultState,
  SessionState,
  CoachingContext,
  AnalyticsDirective,
  AgentPlaybook,
  PlaybookMarket,
  BehavioralRule,
  ConfidenceCalibration,
  ConfidenceBin,
  SessionStrategy,
  SessionMode,
  SwapEvent,
} from "./types.js";

export function estimateCapitalFromHistory(trades: TradeRecord[]): number {
  if (trades.length === 0) return LAMPORTS_PER_SOL;
  const avgTradeSize =
    trades.reduce((s, t) => s + Math.abs(t.pnlLamports), 0) / trades.length;
  return Math.max(LAMPORTS_PER_SOL, avgTradeSize * 10);
}

const DEFI_SOURCES = new Set([
  "JUPITER",
  "RAYDIUM",
  "ORCA",
  "DRIFT",
  "METEORA",
  "PHOENIX",
  "LIFINITY",
  "MARINADE",
  "FLASH_TRADE",
  "OPENBOOK",
  "TENSOR",
  "PUMP_FUN",
  "ALDRIN",
  "CREMA",
  "INVARIANT",
  "SABER",
  "SANCTUM",
  "KAMINO",
  "MARGINFI",
  "ZETA",
  "MANGO",
  "BONKSWAP",
  "STEP_FINANCE",
  "HAWKSIGHT",
  "WHIRLPOOL",
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

export function calibrateTier1(
  depositAmount: number,
  strategyType: StrategyType = "day_trading",
  riskTolerance: RiskTolerance = "medium"
): { params: VaultParameters; analysis: CalibrationAnalysis } {
  const strategy = STRATEGY_DEFAULTS[strategyType] ?? STRATEGY_DEFAULTS.day_trading;
  const tolerance = RISK_TOLERANCE_MULTIPLIERS[riskTolerance] ?? RISK_TOLERANCE_MULTIPLIERS.medium;

  const dailyLossLimit = BigInt(
    Math.floor(depositAmount * tolerance.dailyLossPct)
  );

  const params: VaultParameters = {
    dailyLossLimit: dailyLossLimit > 0n ? dailyLossLimit : 1n,
    maxTradesPerDay: strategy.maxTrades,
    lockoutDuration: tolerance.lockoutDuration,
    cooldownSeconds: strategy.cooldownSeconds,
  };

  const analysis: CalibrationAnalysis = {
    tier: 1,
    tradeCount: 0,
    lookbackDays: 0,
  };

  return { params, analysis };
}

export function calibrateTier2(
  trades: TradeRecord[],
  baseParams: VaultParameters
): { params: VaultParameters; analysis: CalibrationAnalysis } {
  if (trades.length < 5) {
    return {
      params: baseParams,
      analysis: { tier: 2, tradeCount: trades.length, lookbackDays: 0 },
    };
  }

  const wins = trades.filter((t) => t.isWin).length;
  const winRate = wins / trades.length;

  const losses = trades.filter((t) => !t.isWin);
  const avgLoss =
    losses.length > 0
      ? Math.abs(
          losses.reduce((sum, t) => sum + t.pnlLamports, 0) / losses.length
        )
      : 0;

  let maxLossStreak = 0;
  let currentStreak = 0;
  for (const trade of trades) {
    if (!trade.isWin) {
      currentStreak++;
      maxLossStreak = Math.max(maxLossStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const strategy = inferStrategyType(trades);
  const revengeWindow = getRevengeWindow(strategy);

  let revengeTradeCount = 0;
  for (let i = 1; i < trades.length; i++) {
    if (
      !trades[i - 1].isWin &&
      trades[i].timeSincePrevTrade !== undefined &&
      trades[i].timeSincePrevTrade! < revengeWindow
    ) {
      revengeTradeCount++;
    }
  }
  const revengeTradeRatio = trades.length > 1 ? revengeTradeCount / (trades.length - 1) : 0;

  let adjustedParams = { ...baseParams };

  if (winRate < 0.4) {
    adjustedParams.dailyLossLimit =
      (adjustedParams.dailyLossLimit * 7n) / 10n;
    adjustedParams.maxTradesPerDay = Math.max(
      1,
      Math.floor(adjustedParams.maxTradesPerDay * 0.7)
    );
  }

  if (revengeTradeRatio > 0.2) {
    adjustedParams.cooldownSeconds = Math.max(
      adjustedParams.cooldownSeconds,
      300
    );
  }

  if (maxLossStreak >= 5) {
    adjustedParams.lockoutDuration = Math.min(
      adjustedParams.lockoutDuration * 2,
      172800
    );
  }

  const lookbackDays =
    trades.length >= 2
      ? Math.ceil(
          (trades[trades.length - 1].timestamp - trades[0].timestamp) / 86400
        )
      : 0;

  return {
    params: adjustedParams,
    analysis: {
      tier: 2,
      winRate,
      avgLoss: avgLoss / LAMPORTS_PER_SOL,
      maxLossStreak,
      revengeTradeCount,
      revengeTradeRatio,
      tradeCount: trades.length,
      lookbackDays,
    },
  };
}

export function calibrateTier3(
  trades: TradeRecord[],
  baseParams: VaultParameters,
  capitalLamports?: number
): { params: VaultParameters; analysis: CalibrationAnalysis } {
  if (trades.length < 20) {
    return calibrateTier2(trades, baseParams);
  }

  const effectiveCapital = capitalLamports && capitalLamports > 0
    ? capitalLamports
    : estimateCapitalFromHistory(trades);

  const dailyReturns = computeDailyReturns(trades, effectiveCapital);

  const var95 = dailyReturns.length >= 10 ? computeVaR(dailyReturns, 0.05) : 0;
  const sharpeRatio = dailyReturns.length >= 5 ? computeSharpe(dailyReturns) : 0;
  const maxDrawdown = computeMaxDrawdown(trades, effectiveCapital);

  const wins = trades.filter((t) => t.isWin);
  const losses = trades.filter((t) => !t.isWin);
  const winRate = wins.length / trades.length;
  const avgWin =
    wins.length > 0
      ? wins.reduce((s, t) => s + t.pnlLamports, 0) / wins.length / LAMPORTS_PER_SOL
      : 0;
  const avgLoss =
    losses.length > 0
      ? Math.abs(
          losses.reduce((s, t) => s + t.pnlLamports, 0) / losses.length / LAMPORTS_PER_SOL
        )
      : 0;

  const kellyFraction =
    avgWin > 0
      ? (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin
      : 0;

  const grossProfit = wins.reduce((s, t) => s + t.pnlLamports, 0) / LAMPORTS_PER_SOL;
  const grossLoss = Math.abs(
    losses.reduce((s, t) => s + t.pnlLamports, 0) / LAMPORTS_PER_SOL
  );
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;

  const adjustedDailyLossLimit = var95 !== 0
    ? BigInt(Math.max(1, Math.floor(Math.abs(var95) * effectiveCapital * 1.2)))
    : baseParams.dailyLossLimit;

  const tier3Strategy = inferStrategyType(trades);
  const tier3RevengeWindow = getRevengeWindow(tier3Strategy);

  let revengeTradeCount = 0;
  for (let i = 1; i < trades.length; i++) {
    if (
      !trades[i - 1].isWin &&
      trades[i].timeSincePrevTrade !== undefined &&
      trades[i].timeSincePrevTrade! < tier3RevengeWindow
    ) {
      revengeTradeCount++;
    }
  }
  const revengeTradeRatio = trades.length > 1 ? revengeTradeCount / (trades.length - 1) : 0;

  let cooldownSeconds = baseParams.cooldownSeconds;
  if (revengeTradeRatio > 0.2) {
    cooldownSeconds = Math.max(cooldownSeconds, 300);
  }

  let maxLossStreak = 0;
  let currentStreak = 0;
  for (const trade of trades) {
    if (!trade.isWin) {
      currentStreak++;
      maxLossStreak = Math.max(maxLossStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  let lockoutDuration = baseParams.lockoutDuration;
  if (sharpeRatio < 0) {
    lockoutDuration = Math.min(lockoutDuration * 2, 172800);
  }

  const lookbackDays = Math.ceil(
    (trades[trades.length - 1].timestamp - trades[0].timestamp) / 86400
  );

  return {
    params: {
      dailyLossLimit: adjustedDailyLossLimit,
      maxTradesPerDay: baseParams.maxTradesPerDay,
      lockoutDuration,
      cooldownSeconds,
    },
    analysis: {
      tier: 3,
      winRate,
      avgLoss,
      maxLossStreak,
      revengeTradeCount,
      revengeTradeRatio,
      var95,
      sharpeRatio,
      maxDrawdown,
      kellyFraction,
      profitFactor,
      tradeCount: trades.length,
      lookbackDays,
    },
  };
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

export function computeAgentAnalytics(
  trades: TradeRecord[],
  lockoutCount: number = 0,
  startingCapitalLamports: number = 0,
  benchmarkReturnOverride?: number
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
      recovery: {
        lockout_count: lockoutCount,
        post_lockout_trades: 0,
      },
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

  const benchmarkReturn = benchmarkReturnOverride ?? 0;

  return {
    total_trades: trades.length,
    hallucination_rate: round4(hallucinationRate),
    signal_accuracy: round4(winRate),
    accuracy_by_market: accuracyByMarket,
    overconfidence_index: round4(overconfidenceIndex),
    tilt,
    revenge_hallucination: revengeHallucination,
    recovery: {
      lockout_count: lockoutCount,
      post_lockout_trades: trades.length,
    },
    trend: {
      recent_win_rate: round4(recentWinRate),
      historical_win_rate: round4(historicalWinRate),
      direction: trendDirection,
    },
    benchmark: {
      agent_cumulative_return: round4(agentReturn),
      benchmark_buy_hold_return: round4(benchmarkReturn),
      alpha: round4(agentReturn - benchmarkReturn),
    },
    recommendations,
  };
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
  const medianSize = sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)];

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
      `Hallucination rate is ${(ctx.hallucinationRate * 100).toFixed(0)}% — the agent's analysis is wrong more often than right. Review the reasoning chain that leads to trade decisions.`
    );
  } else if (ctx.hallucinationRate > 0.4) {
    recs.push(
      `Hallucination rate is ${(ctx.hallucinationRate * 100).toFixed(0)}% — nearly coin-flip accuracy. The agent's market analysis may not be adding signal.`
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
        `Signal accuracy varies by market: ${best[0]} at ${(best[1].win_rate * 100).toFixed(0)}% vs ${worst[0]} at ${(worst[1].win_rate * 100).toFixed(0)}%. Consider restricting to markets where the agent's analysis is reliable.`
      );
    }
  }

  if (ctx.overconfidenceIndex > 0.15) {
    recs.push(
      `Overconfidence detected: the agent sizes up on trades it loses. Large trades have a lower win rate than small trades. Add position sizing guards or reduce conviction-based sizing.`
    );
  }

  if (ctx.tilt.detected) {
    recs.push(
      `Tilt detected (${ctx.tilt.severity}): win rate drops from ${(ctx.tilt.baseline_win_rate * 100).toFixed(0)}% to ${(ctx.tilt.post_streak_win_rate * 100).toFixed(0)}% after consecutive losses. The agent's post-loss reasoning is degraded — consider adding explicit loss-recovery logic.`
    );
  }

  if (
    ctx.revengeHallucination.revenge_trade_count > 0 &&
    ctx.revengeHallucination.revenge_is_worse
  ) {
    recs.push(
      `Revenge trading detected: ${ctx.revengeHallucination.revenge_trade_count} trades within 2 minutes of a loss, with ${(ctx.revengeHallucination.revenge_win_rate * 100).toFixed(0)}% win rate vs ${(ctx.revengeHallucination.baseline_win_rate * 100).toFixed(0)}% baseline. Fast post-loss trades are hallucination-prone — increase cooldown or add a mandatory analysis step before re-entering.`
    );
  }

  if (ctx.trendDirection === "degrading") {
    recs.push(
      "Performance is trending down. Recent trades are significantly worse than historical. The market regime may have changed, or the agent's model may be stale."
    );
  } else if (ctx.trendDirection === "improving") {
    recs.push(
      "Performance is trending up. Recent trades are better than historical average."
    );
  }

  if (recs.length === 0) {
    recs.push(
      "Agent is performing within normal parameters. Continue monitoring."
    );
  }

  return recs;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
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

export function getRevengeWindow(strategy: StrategyType): number {
  return REVENGE_TRADE_WINDOWS[strategy] ?? REVENGE_TRADE_WINDOWS.day_trading;
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

const SESSION_STATE_MULTIPLIERS: Record<SessionState, number> = {
  normal: 1.0,
  post_loss: 0.2,
  tilt: 0.1,
  hot_streak: 0.8,
  post_lockout_recovery: 0.1,
};

export function classifySessionState(
  session: SessionTradeLog,
  vault: VaultState,
  recentTrades: TradeRecord[]
): SessionState {
  const now = Math.floor(Date.now() / 1000);

  if (vault.exists && vault.isLocked) return "post_lockout_recovery";
  if (
    vault.exists &&
    vault.lockoutCount > 0 &&
    now - Number(vault.lockoutUntil) < 3600
  ) {
    return "post_lockout_recovery";
  }

  const recent = session.trades.slice(-3);
  if (recent.length >= 3 && recent.every((t) => t.pnl < 0)) return "tilt";

  const lastTrade = session.trades[session.trades.length - 1];
  if (lastTrade && lastTrade.pnl < 0 && now - lastTrade.timestamp < 300) {
    return "post_loss";
  }

  if (recent.length >= 3 && recent.every((t) => t.pnl > 0)) return "hot_streak";

  return "normal";
}

export function computeConfidenceAdjustment(trades: TradeRecord[]): number {
  if (trades.length < 5) return 1.0;

  const overconfidence = computeOverconfidenceIndex(trades);
  const tilt = computeTiltDetection(trades);

  let factor = 1.0;

  if (overconfidence > 0.3) factor *= 0.5;
  else if (overconfidence > 0.15) factor *= 0.7;
  else if (overconfidence > 0.05) factor *= 0.85;

  if (tilt.severity === "severe") factor *= 0.4;
  else if (tilt.severity === "moderate") factor *= 0.6;
  else if (tilt.severity === "mild") factor *= 0.8;

  return Math.max(0.1, Math.min(1.0, round4(factor)));
}

export function computeSuggestedMaxSize(
  kellyFraction: number,
  capitalSol: number,
  sessionState: SessionState,
  confidenceAdjustment: number
): number {
  if (kellyFraction < 0) return 0;
  const cappedKelly = Math.min(kellyFraction, 0.25);
  const base = capitalSol * Math.max(cappedKelly, 0.01);
  const stateMultiplier = SESSION_STATE_MULTIPLIERS[sessionState];
  return round4(Math.max(0.001, base * stateMultiplier * confidenceAdjustment));
}

export function computeCoaching(
  session: SessionTradeLog,
  vault: VaultState,
  trades: TradeRecord[],
  market?: string
): CoachingContext {
  const sessionState = classifySessionState(session, vault, trades);
  const confidenceAdj = computeConfidenceAdjustment(trades);

  let kellyFraction = 0.1;
  if (trades.length >= 20) {
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
    if (avgWin > 0) {
      kellyFraction = Math.max(0, (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin);
    }
  }

  const capitalSol = vault.exists
    ? Number(vault.totalDeposited) / LAMPORTS_PER_SOL
    : estimateCapitalFromHistory(trades) / LAMPORTS_PER_SOL;

  const suggestedMaxSize = computeSuggestedMaxSize(
    kellyFraction,
    capitalSol,
    sessionState,
    confidenceAdj
  );

  const accuracyByMarket = computeAccuracyByMarket(trades);
  const avoidMarkets: string[] = [];
  let bestMarket: string | undefined;
  let bestWinRate = 0;

  for (const [mkt, data] of Object.entries(accuracyByMarket)) {
    if (data.win_rate < 0.35 && data.trades >= 3) {
      avoidMarkets.push(mkt);
    }
    if (data.win_rate > bestWinRate && data.trades >= 5) {
      bestWinRate = data.win_rate;
      bestMarket = mkt;
    }
  }

  const reasons: string[] = [];
  reasons.push(`Session state: ${sessionState}`);
  if (kellyFraction < 0) {
    reasons.push(`CRITICAL: Negative Kelly fraction (${round4(kellyFraction)}). Strategy has negative expected value — position size set to 0`);
  }
  if (confidenceAdj < 1) {
    reasons.push(`Confidence adjustment: ${confidenceAdj} (overconfidence/tilt detected)`);
  }
  if (avoidMarkets.length > 0) {
    reasons.push(`Avoid markets with <35% win rate: ${avoidMarkets.join(", ")}`);
  }
  if (bestMarket) {
    reasons.push(`Best performing market: ${bestMarket} (${(bestWinRate * 100).toFixed(0)}% win rate)`);
  }
  if (market && avoidMarkets.includes(market)) {
    reasons.push(`Warning: requested market ${market} is on the avoid list`);
  }

  return {
    session_state: sessionState,
    confidence_adjustment: confidenceAdj,
    suggested_max_size_sol: suggestedMaxSize,
    suggested_max_size_pct: capitalSol > 0
      ? round4((suggestedMaxSize / capitalSol) * 100)
      : 10,
    avoid_markets: avoidMarkets,
    best_market: bestMarket,
    reasoning: reasons.join(". ") + ".",
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
      reason: `Negative Kelly fraction (${round4(kellyFraction)}): expected value per trade is negative. Trading this strategy loses money in expectation.`,
    });
  }

  if (analytics.hallucination_rate > 0.6) {
    directives.push({
      type: "pause_trading",
      severity: "critical",
      params: { hallucination_rate: analytics.hallucination_rate },
      reason: `Hallucination rate is ${(analytics.hallucination_rate * 100).toFixed(0)}% — agent analysis is wrong more often than right.`,
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
      reason: "Agent sizes up on trades it loses. Large trades have lower win rate than small trades.",
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

export function generatePlaybook(
  trades: TradeRecord[],
  vault: VaultState,
  analytics: AgentAnalytics,
  capitalSol: number
): AgentPlaybook {
  const avgTimeBetween =
    trades.length >= 2
      ? (trades[trades.length - 1].timestamp - trades[0].timestamp) / (trades.length - 1)
      : 3600;
  const tradesPerDay = 86400 / Math.max(avgTimeBetween, 1);

  let identity: string;
  if (tradesPerDay > 30) identity = "High-frequency scalper";
  else if (tradesPerDay > 10) identity = "Active day trader";
  else if (tradesPerDay > 3) identity = "Moderate swing trader";
  else identity = "Conservative position trader";

  const accuracyByMarket = analytics.accuracy_by_market;
  const primaryMarkets: PlaybookMarket[] = [];
  const restrictedMarkets: string[] = [];

  for (const [market, data] of Object.entries(accuracyByMarket)) {
    if (data.win_rate > 0.5 && data.trades >= 5) {
      let edgeRating: "strong" | "moderate" | "weak";
      if (data.win_rate > 0.65) edgeRating = "strong";
      else if (data.win_rate > 0.55) edgeRating = "moderate";
      else edgeRating = "weak";

      primaryMarkets.push({
        market,
        win_rate: data.win_rate,
        trades: data.trades,
        avg_pnl_sol: data.avg_pnl_sol,
        edge_rating: edgeRating,
      });
    }
    if (data.win_rate < 0.4 && data.trades >= 3) {
      restrictedMarkets.push(market);
    }
  }

  primaryMarkets.sort((a, b) => b.win_rate - a.win_rate);

  const wins = trades.filter((t) => t.isWin);
  const losses = trades.filter((t) => !t.isWin);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const avgWin =
    wins.length > 0
      ? wins.reduce((s, t) => s + t.pnlLamports, 0) / wins.length / LAMPORTS_PER_SOL
      : 0;
  const avgLoss =
    losses.length > 0
      ? Math.abs(losses.reduce((s, t) => s + t.pnlLamports, 0) / losses.length / LAMPORTS_PER_SOL)
      : 0;

  let kellyFraction = 0;
  if (avgWin > 0) {
    kellyFraction = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
  }
  const safeKelly = Math.max(0, kellyFraction);
  const halfKelly = Math.min(safeKelly / 2, 0.125);
  const halfKellySol = round4(capitalSol * halfKelly);

  const grossProfit = wins.reduce((s, t) => s + t.pnlLamports, 0) / LAMPORTS_PER_SOL;
  const grossLoss = Math.abs(
    losses.reduce((s, t) => s + t.pnlLamports, 0) / LAMPORTS_PER_SOL
  );
  const profitFactor = grossLoss > 0 ? round4(grossProfit / grossLoss) : 0;
  const expectancySol = round4(winRate * avgWin - (1 - winRate) * avgLoss);

  const behavioralRules: BehavioralRule[] = [];
  if (kellyFraction < 0) {
    behavioralRules.push({
      trigger: "Any trade attempt (negative expected value)",
      action: "Block all trades. Strategy expectancy is negative — recalibrate before resuming.",
      source: "negative_kelly",
    });
  }
  if (analytics.tilt.detected) {
    behavioralRules.push({
      trigger: `${analytics.tilt.severity} tilt detected after consecutive losses`,
      action: "Reduce position size by 50% and increase cooldown by 2x",
      source: "tilt_detection",
    });
  }
  if (
    analytics.revenge_hallucination.revenge_trade_count > 0 &&
    analytics.revenge_hallucination.revenge_is_worse
  ) {
    behavioralRules.push({
      trigger: "Trade attempted within 2 minutes of a loss",
      action: "Block trade and enforce minimum 5-minute cooldown",
      source: "revenge_detection",
    });
  }
  if (analytics.overconfidence_index > 0.15) {
    behavioralRules.push({
      trigger: "Position size exceeds 2x median",
      action: "Cap position size at median and require explicit override",
      source: "overconfidence_detection",
    });
  }
  if (restrictedMarkets.length > 0) {
    behavioralRules.push({
      trigger: `Trade on restricted market (${restrictedMarkets.join(", ")})`,
      action: "Warn agent and reduce size by 75%",
      source: "market_restriction",
    });
  }

  const capitalLamports = capitalSol * LAMPORTS_PER_SOL;
  const historicalReturns = computeDailyReturns(trades, capitalLamports);
  const recentReturns = computeDailyReturns(trades.slice(-10), capitalLamports);

  let regimeAssessment: "normal" | "volatile" | "trending" = "normal";
  let baselineSharpe = 0;
  let recentSharpe = 0;
  let sharpeDelta = 0;

  if (historicalReturns.length >= 5 && recentReturns.length >= 5) {
    baselineSharpe = computeSharpe(historicalReturns);
    recentSharpe = computeSharpe(recentReturns);
    sharpeDelta = Math.abs(recentSharpe - baselineSharpe);
    if (sharpeDelta > 1.5) regimeAssessment = "volatile";
    else if (recentSharpe > baselineSharpe + 0.5) regimeAssessment = "trending";
  }

  return {
    identity,
    primary_markets: primaryMarkets,
    restricted_markets: restrictedMarkets,
    position_sizing: {
      kelly_fraction: round4(kellyFraction),
      half_kelly_sol: halfKellySol,
      max_position_pct: round4(Math.min(safeKelly, 0.25) * 100),
      state_reductions: { ...SESSION_STATE_MULTIPLIERS },
    },
    behavioral_rules: behavioralRules,
    regime: {
      assessment: regimeAssessment,
      recent_sharpe: round4(recentSharpe),
      baseline_sharpe: round4(baselineSharpe),
      drift_detected: sharpeDelta > 0.5,
    },
    expectancy_sol: expectancySol,
    profit_factor: profitFactor,
  };
}

export function calibrateConfidence(
  inputConfidence: number,
  session: SessionTradeLog,
  capitalSol: number
): ConfidenceCalibration {
  const bins: ConfidenceBin[] = [
    { range: "0.0-0.2", actual_accuracy: 0, trade_count: 0 },
    { range: "0.2-0.4", actual_accuracy: 0, trade_count: 0 },
    { range: "0.4-0.6", actual_accuracy: 0, trade_count: 0 },
    { range: "0.6-0.8", actual_accuracy: 0, trade_count: 0 },
    { range: "0.8-1.0", actual_accuracy: 0, trade_count: 0 },
  ];

  const binWins = [0, 0, 0, 0, 0];
  const binTotals = [0, 0, 0, 0, 0];

  for (const trade of session.trades) {
    if (trade.confidence === undefined) continue;
    const idx = Math.min(4, Math.floor(trade.confidence * 5));
    binTotals[idx]++;
    if (trade.pnl > 0) binWins[idx]++;
  }

  for (let i = 0; i < 5; i++) {
    bins[i].trade_count = binTotals[i];
    bins[i].actual_accuracy = binTotals[i] > 0 ? round4(binWins[i] / binTotals[i]) : 0;
  }

  const inputBinIdx = Math.min(4, Math.floor(inputConfidence * 5));
  const historicalAccuracy = bins[inputBinIdx].actual_accuracy;
  const hasSufficientData = binTotals[inputBinIdx] >= 3;

  const calibrated = hasSufficientData
    ? round4((inputConfidence + historicalAccuracy) / 2)
    : inputConfidence;

  const baseSize = capitalSol * 0.05;
  const positionSize = round4(Math.max(0.001, baseSize * calibrated));

  let insight: string;
  if (!hasSufficientData) {
    insight = `Insufficient history in the ${bins[inputBinIdx].range} confidence range (${binTotals[inputBinIdx]} trades). Using raw confidence. Record more trades with confidence to enable calibration.`;
  } else if (calibrated < inputConfidence - 0.1) {
    insight = `Your historical accuracy at this confidence level is ${(historicalAccuracy * 100).toFixed(0)}%, lower than your reported ${(inputConfidence * 100).toFixed(0)}%. Calibrated down to ${(calibrated * 100).toFixed(0)}%.`;
  } else if (calibrated > inputConfidence + 0.1) {
    insight = `Your historical accuracy at this confidence level is ${(historicalAccuracy * 100).toFixed(0)}%, higher than your reported ${(inputConfidence * 100).toFixed(0)}%. Calibrated up to ${(calibrated * 100).toFixed(0)}%.`;
  } else {
    insight = `Confidence appears well-calibrated. Historical accuracy of ${(historicalAccuracy * 100).toFixed(0)}% aligns with reported ${(inputConfidence * 100).toFixed(0)}%.`;
  }

  return {
    input_confidence: inputConfidence,
    calibrated_confidence: calibrated,
    historical_accuracy: historicalAccuracy,
    position_size_recommendation_sol: positionSize,
    insight,
    calibration_curve: bins,
  };
}

export function generateSessionStrategy(
  vault: VaultState,
  session: SessionTradeLog,
  trades: TradeRecord[],
  analytics: AgentAnalytics,
  capitalSol: number
): SessionStrategy {
  const sessionState = classifySessionState(session, vault, trades);

  let mode: SessionMode;
  let reason: string;

  if (
    sessionState === "post_lockout_recovery" ||
    sessionState === "tilt"
  ) {
    mode = "conservative_recovery";
    reason =
      sessionState === "post_lockout_recovery"
        ? "Recent lockout detected. Conservative mode to rebuild confidence."
        : "Tilt detected — consecutive losses degrading performance.";
  } else if (
    analytics.trend.direction === "improving" &&
    sessionState === "hot_streak"
  ) {
    mode = "aggressive";
    reason = "Performance trending up with active win streak.";
  } else {
    mode = "normal";
    reason = "Standard operating conditions.";
  }

  const baseMaxTrades = vault.exists ? vault.maxTradesPerDay : 20;
  const modeMultipliers: Record<SessionMode, number> = {
    conservative_recovery: 0.5,
    normal: 0.8,
    aggressive: 1.0,
  };
  const maxTrades = Math.max(1, Math.floor(baseMaxTrades * modeMultipliers[mode]));

  const dailyLimitSol = vault.exists
    ? Number(vault.dailyLossLimit) / LAMPORTS_PER_SOL
    : capitalSol * 0.03;
  const exposureMultipliers: Record<SessionMode, number> = {
    conservative_recovery: 0.5,
    normal: 1.0,
    aggressive: 1.0,
  };
  const maxExposure = round4(dailyLimitSol * exposureMultipliers[mode]);

  const accuracyByMarket = analytics.accuracy_by_market;
  const focusMarkets = Object.entries(accuracyByMarket)
    .filter(([, d]) => d.win_rate > 0.5 && d.trades >= 5)
    .sort((a, b) => b[1].win_rate - a[1].win_rate)
    .slice(0, 3)
    .map(([m]) => m);

  const confAdj = computeConfidenceAdjustment(trades);
  const positionSize = computeSuggestedMaxSize(
    0.1,
    capitalSol,
    sessionState,
    confAdj
  );

  const stopConditions: string[] = [];
  stopConditions.push(`Stop if 3 consecutive losses`);
  stopConditions.push(`Stop if daily PnL < -${maxExposure.toFixed(4)} SOL`);
  if (mode === "conservative_recovery") {
    stopConditions.push("Stop if any single trade loses > 50% of session budget");
  }
  if (analytics.tilt.detected) {
    stopConditions.push("Stop immediately if post-loss win rate drops below 25%");
  }

  return {
    mode,
    reason,
    max_trades: maxTrades,
    max_exposure_sol: maxExposure,
    focus_markets: focusMarkets,
    position_size_sol: positionSize,
    position_size_pct: capitalSol > 0
      ? round4((positionSize / capitalSol) * 100)
      : 10,
    stop_trading_conditions: stopConditions,
  };
}
