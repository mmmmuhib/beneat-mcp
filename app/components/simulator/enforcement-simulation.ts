import type { MonteCarloFullResult, MonteCarloStats } from "./simulation-logic";
import type { AgentTradeProfile, TradeResult } from "../../lib/trade-analyzer";

const STOP_LOSS_RR = 3;
const DAILY_LOSS_CAP_PCT = 3;
const MAX_TRADES_PER_DAY = 20;
const POST_LOSS_SIZE_MULT = 0.2;
const TILT_SIZE_MULT = 0.1;
const TILT_CONSECUTIVE_LOSSES = 2;

const SLIPPAGE_MEAN = 0.10;
const SLIPPAGE_STDDEV = 0.05;
const RISK_FREE_DAILY = 0.05 / 252;
const MIN_BLOCK_BOOTSTRAP_TRADES = 30;

const DEFAULT_STARTING_EQUITY = 100_000;

export interface MethodologyLabel {
  bootstrapMethod: "circular-block" | "iid";
  blockSize: number;
  iterations: number;
  slippageModel: boolean;
  riskFreeRate: number;
}

export interface ActualStats {
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export type InterventionType =
  | "stop_loss"
  | "cooldown"
  | "lockout"
  | "tilt_reduction"
  | "post_loss_reduction";

export interface Intervention {
  tradeIndex: number;
  type: InterventionType;
  preventedLossPct: number;
  originalPnlPct: number;
  adjustedPnlPct: number;
  equityBefore: number;
  reason: string;
}

export interface EnforcementComparisonResult {
  actual: ActualStats;
  baseline: MonteCarloFullResult;
  enforced: MonteCarloFullResult;
  methodology: MethodologyLabel;
  interventions: Intervention[];
}

interface SimRunWithReturns {
  curve: number[];
  finalPnl: number;
  maxDrawdown: number;
  perTradeReturns: number[];
  interventions: Intervention[];
}

function boxMullerNormal(): number {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function lognormalSlippage(mean: number, stddev: number): number {
  const z = boxMullerNormal();
  return Math.exp(mean + stddev * z) - 1;
}

function circularBlockBootstrap(trades: TradeResult[]): TradeResult[] {
  const n = trades.length;
  const blockSize = Math.max(2, Math.floor(Math.sqrt(n)));
  const result: TradeResult[] = [];

  while (result.length < n) {
    const start = Math.floor(Math.random() * n);
    for (let j = 0; j < blockSize && result.length < n; j++) {
      result.push(trades[(start + j) % n]);
    }
  }

  return result;
}

function iidBootstrap(trades: TradeResult[]): TradeResult[] {
  const n = trades.length;
  const result: TradeResult[] = [];
  for (let i = 0; i < n; i++) {
    result.push(trades[Math.floor(Math.random() * n)]);
  }
  return result;
}

function groupByCalendarDay(trades: TradeResult[]): TradeResult[][] {
  const dayMap = new Map<string, TradeResult[]>();
  for (const t of trades) {
    const day = t.exitDate.slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(t);
  }
  const days: TradeResult[][] = [];
  for (const [, group] of dayMap) {
    days.push(group);
  }
  return days;
}

function assignSyntheticDays(
  bootstrapped: TradeResult[],
  originalTrades: TradeResult[]
): TradeResult[][] {
  const originalDays = groupByCalendarDay(originalTrades);
  const numDays = originalDays.length;
  if (numDays === 0) return [bootstrapped];

  const tradesPerDay = originalDays.map((d) => d.length);
  const totalOriginal = tradesPerDay.reduce((s, v) => s + v, 0);

  const days: TradeResult[][] = [];
  let offset = 0;
  for (let d = 0; d < numDays; d++) {
    const proportion = tradesPerDay[d] / totalOriginal;
    const count = Math.max(
      1,
      d === numDays - 1
        ? bootstrapped.length - offset
        : Math.round(proportion * bootstrapped.length)
    );
    const actual = Math.min(count, bootstrapped.length - offset);
    if (actual <= 0) break;
    days.push(bootstrapped.slice(offset, offset + actual));
    offset += actual;
  }

  if (offset < bootstrapped.length) {
    if (days.length > 0) {
      days[days.length - 1].push(...bootstrapped.slice(offset));
    } else {
      days.push(bootstrapped.slice(offset));
    }
  }

  return days;
}

function computePerTradeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean =
    returns.reduce((s, v) => s + v, 0) / returns.length - RISK_FREE_DAILY;
  const variance =
    returns.reduce((s, v) => s + (v - (mean + RISK_FREE_DAILY)) ** 2, 0) /
    (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  return stdDev > 0 ? mean / stdDev : 0;
}

function computeActualStats(profile: AgentTradeProfile): ActualStats {
  const curve = profile.equityCurve;
  const start = curve[0];
  const end = curve[curve.length - 1];
  const totalReturn = ((end - start) / start) * 100;

  const perTradeReturns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    perTradeReturns.push((curve[i] - curve[i - 1]) / curve[i - 1]);
  }

  const sharpeRatio = computePerTradeSharpe(perTradeReturns);

  return {
    totalReturn,
    maxDrawdown: profile.maxDrawdownPct,
    sharpeRatio,
  };
}

function runSim(
  tradeDays: TradeResult[][],
  profile: AgentTradeProfile,
  startingEquity: number,
  applyEnforcement: boolean
): SimRunWithReturns {
  const maxLossPct = profile.avgWinPct / STOP_LOSS_RR;

  let equity = startingEquity;
  const curve = [equity];
  let peak = equity;
  let maxDrawdown = 0;
  const perTradeReturns: number[] = [];
  const interventions: Intervention[] = [];

  let consecutiveLosses = 0;
  let lastWasLoss = false;
  let globalTradeIdx = 0;

  for (const dayTrades of tradeDays) {
    let dayLossPct = 0;
    let dayTradeCount = 0;
    let isLockedOut = false;

    for (const trade of dayTrades) {
      if (equity <= 0) {
        curve.push(0);
        perTradeReturns.push(0);
        globalTradeIdx++;
        continue;
      }

      if (applyEnforcement) {
        if (isLockedOut || dayTradeCount >= MAX_TRADES_PER_DAY) {
          const preventedPnlPct = trade.pnlPct < 0 ? Math.abs(trade.pnlPct) : 0;
          interventions.push({
            tradeIndex: globalTradeIdx,
            type: "lockout",
            preventedLossPct: preventedPnlPct,
            originalPnlPct: trade.pnlPct,
            adjustedPnlPct: 0,
            equityBefore: equity,
            reason: isLockedOut
              ? `Daily loss cap (${DAILY_LOSS_CAP_PCT}%) breached — trade blocked`
              : `Max ${MAX_TRADES_PER_DAY} trades/day reached — trade blocked`,
          });
          curve.push(equity);
          perTradeReturns.push(0);
          globalTradeIdx++;
          continue;
        }

        if (lastWasLoss) {
          const preventedPnlPct = trade.pnlPct < 0 ? Math.abs(trade.pnlPct) : 0;
          interventions.push({
            tradeIndex: globalTradeIdx,
            type: "cooldown",
            preventedLossPct: preventedPnlPct,
            originalPnlPct: trade.pnlPct,
            adjustedPnlPct: 0,
            equityBefore: equity,
            reason: "Post-loss cooldown — skipped revenge trade",
          });
          curve.push(equity);
          perTradeReturns.push(0);
          lastWasLoss = false;
          globalTradeIdx++;
          continue;
        }
      }

      let sizeMult = 1.0;
      if (applyEnforcement) {
        if (consecutiveLosses >= TILT_CONSECUTIVE_LOSSES) {
          sizeMult = TILT_SIZE_MULT;
          interventions.push({
            tradeIndex: globalTradeIdx,
            type: "tilt_reduction",
            preventedLossPct: trade.pnlPct < 0 ? Math.abs(trade.pnlPct) * (1 - TILT_SIZE_MULT) : 0,
            originalPnlPct: trade.pnlPct,
            adjustedPnlPct: trade.pnlPct * TILT_SIZE_MULT,
            equityBefore: equity,
            reason: `Tilt detected (${consecutiveLosses} consecutive losses) — position reduced to ${(TILT_SIZE_MULT * 100).toFixed(0)}%`,
          });
        } else if (consecutiveLosses > 0) {
          sizeMult = POST_LOSS_SIZE_MULT;
          interventions.push({
            tradeIndex: globalTradeIdx,
            type: "post_loss_reduction",
            preventedLossPct: trade.pnlPct < 0 ? Math.abs(trade.pnlPct) * (1 - POST_LOSS_SIZE_MULT) : 0,
            originalPnlPct: trade.pnlPct,
            adjustedPnlPct: trade.pnlPct * POST_LOSS_SIZE_MULT,
            equityBefore: equity,
            reason: `Post-loss — position reduced to ${(POST_LOSS_SIZE_MULT * 100).toFixed(0)}%`,
          });
        }
      }

      const positionSize =
        equity * (profile.avgPositionSizePct / 100) * sizeMult;

      let tradePnlPct = trade.pnlPct;

      if (applyEnforcement && tradePnlPct < 0 && Math.abs(tradePnlPct) > maxLossPct) {
        const originalPnl = tradePnlPct;
        const slippageFraction = lognormalSlippage(SLIPPAGE_MEAN, SLIPPAGE_STDDEV);
        const cappedSlippage = Math.min(slippageFraction, 0.5);
        tradePnlPct = -(maxLossPct + maxLossPct * cappedSlippage);
        interventions.push({
          tradeIndex: globalTradeIdx,
          type: "stop_loss",
          preventedLossPct: Math.abs(originalPnl) - Math.abs(tradePnlPct),
          originalPnlPct: originalPnl,
          adjustedPnlPct: tradePnlPct,
          equityBefore: equity,
          reason: `Stop-loss triggered at ${maxLossPct.toFixed(1)}% — prevented ${(Math.abs(originalPnl) - Math.abs(tradePnlPct)).toFixed(1)}% additional loss`,
        });
      }

      const pnl = positionSize * (tradePnlPct / 100);
      const prevEquity = equity;

      equity += pnl;
      equity = Math.max(0, equity);
      curve.push(equity);

      const tradeReturn = prevEquity > 0 ? (equity - prevEquity) / prevEquity : 0;
      perTradeReturns.push(tradeReturn);

      dayTradeCount++;

      if (pnl < 0) {
        consecutiveLosses++;
        lastWasLoss = true;

        if (applyEnforcement) {
          dayLossPct += equity > 0 ? Math.abs(pnl / equity) * 100 : 0;
          if (dayLossPct >= DAILY_LOSS_CAP_PCT) {
            isLockedOut = true;
          }
        }
      } else {
        consecutiveLosses = 0;
        lastWasLoss = false;
      }

      if (equity > peak) peak = equity;
      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;

      globalTradeIdx++;
    }
  }

  const finalPnl = ((equity - startingEquity) / startingEquity) * 100;
  return { curve, finalPnl, maxDrawdown, perTradeReturns, interventions };
}

function smoothCurve(arr: number[], windowSize: number): number[] {
  if (arr.length <= 2 || windowSize <= 1) return arr;
  const half = Math.floor(windowSize / 2);
  const result = new Array<number>(arr.length);
  result[0] = arr[0];
  result[arr.length - 1] = arr[arr.length - 1];
  for (let i = 1; i < arr.length - 1; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(arr.length - 1, i + half);
    let sum = 0;
    for (let j = start; j <= end; j++) sum += arr[j];
    result[i] = sum / (end - start + 1);
  }
  return result;
}

function buildResult(
  sims: SimRunWithReturns[],
  iterations: number
): MonteCarloFullResult {
  const sorted = [...sims].sort((a, b) => a.finalPnl - b.finalPnl);

  const worstIdx = 0;
  const p25Idx = Math.floor(iterations * 0.25);
  const medianIdx = Math.floor(iterations * 0.5);
  const p75Idx = Math.floor(iterations * 0.75);
  const bestIdx = iterations - 1;

  const curves = sims.map((s) => s.curve);
  const profitableCount = sims.filter((s) => s.finalPnl > 0).length;
  const avgMaxDrawdown =
    sims.reduce((sum, s) => sum + s.maxDrawdown, 0) / iterations;

  const allReturns = sims.flatMap((s) => s.perTradeReturns.filter((r) => r !== 0));
  const sharpeRatio = computePerTradeSharpe(allReturns);

  const meanReturn =
    sims.reduce((sum, s) => sum + s.finalPnl, 0) / iterations;
  const variance =
    sims.reduce((sum, s) => sum + (s.finalPnl - meanReturn) ** 2, 0) /
    Math.max(1, iterations - 1);
  const returnStdDev = Math.sqrt(variance);

  const stats: MonteCarloStats = {
    profitableCount,
    profitablePercent: (profitableCount / iterations) * 100,
    medianReturn: sorted[medianIdx].finalPnl,
    worstCase: sorted[worstIdx].finalPnl,
    bestCase: sorted[bestIdx].finalPnl,
    avgMaxDrawdown,
    sharpeRatio,
    returnStdDev,
  };

  const curveLength = sims[0].curve.length;
  const pointwisePercentiles = {
    best: new Array<number>(curveLength),
    p75: new Array<number>(curveLength),
    median: new Array<number>(curveLength),
    p25: new Array<number>(curveLength),
    worst: new Array<number>(curveLength),
  };

  for (let i = 0; i < curveLength; i++) {
    const valuesAtIndex = sims.map((s) => s.curve[i]).sort((a, b) => a - b);
    pointwisePercentiles.best[i] = valuesAtIndex[bestIdx];
    pointwisePercentiles.p75[i] = valuesAtIndex[p75Idx];
    pointwisePercentiles.median[i] = valuesAtIndex[medianIdx];
    pointwisePercentiles.p25[i] = valuesAtIndex[p25Idx];
    pointwisePercentiles.worst[i] = valuesAtIndex[worstIdx];
  }

  const windowSize = Math.max(3, Math.min(20, Math.floor(curveLength * 0.03)));
  pointwisePercentiles.best = smoothCurve(pointwisePercentiles.best, windowSize);
  pointwisePercentiles.p75 = smoothCurve(pointwisePercentiles.p75, windowSize);
  pointwisePercentiles.median = smoothCurve(pointwisePercentiles.median, windowSize);
  pointwisePercentiles.p25 = smoothCurve(pointwisePercentiles.p25, windowSize);
  pointwisePercentiles.worst = smoothCurve(pointwisePercentiles.worst, windowSize);

  return {
    curves,
    percentiles: pointwisePercentiles,
    percentileIndices: {
      best: sims.indexOf(sorted[bestIdx]),
      worst: sims.indexOf(sorted[worstIdx]),
      median: sims.indexOf(sorted[medianIdx]),
      p25: sims.indexOf(sorted[p25Idx]),
      p75: sims.indexOf(sorted[p75Idx]),
    },
    stats,
  };
}

export function runEnforcementComparison(
  profile: AgentTradeProfile,
  iterations = 100,
  startingEquity = DEFAULT_STARTING_EQUITY
): EnforcementComparisonResult {
  const actual = computeActualStats(profile);
  const trades = profile.rawTrades;

  if (trades.length === 0) {
    const emptySim: SimRunWithReturns = {
      curve: [startingEquity],
      finalPnl: 0,
      maxDrawdown: 0,
      perTradeReturns: [],
      interventions: [],
    };
    const emptyResult = buildResult([emptySim], 1);
    return {
      actual,
      baseline: emptyResult,
      enforced: emptyResult,
      methodology: {
        bootstrapMethod: "iid",
        blockSize: 0,
        iterations,
        slippageModel: true,
        riskFreeRate: 0.05,
      },
      interventions: [],
    };
  }

  const useBlockBootstrap = trades.length >= MIN_BLOCK_BOOTSTRAP_TRADES;
  const blockSize = useBlockBootstrap
    ? Math.max(2, Math.floor(Math.sqrt(trades.length)))
    : 0;

  const baselineSims: SimRunWithReturns[] = [];
  const enforcedSims: SimRunWithReturns[] = [];

  for (let i = 0; i < iterations; i++) {
    const bootstrapped = useBlockBootstrap
      ? circularBlockBootstrap(trades)
      : iidBootstrap(trades);

    const days = assignSyntheticDays(bootstrapped, trades);

    baselineSims.push(runSim(days, profile, startingEquity, false));
    enforcedSims.push(runSim(days, profile, startingEquity, true));
  }

  const enforcedResult = buildResult(enforcedSims, iterations);
  const medianIdx = enforcedResult.percentileIndices.median;
  const interventions = enforcedSims[medianIdx]?.interventions ?? [];

  return {
    actual,
    baseline: buildResult(baselineSims, iterations),
    enforced: enforcedResult,
    methodology: {
      bootstrapMethod: useBlockBootstrap ? "circular-block" : "iid",
      blockSize,
      iterations,
      slippageModel: true,
      riskFreeRate: 0.05,
    },
    interventions,
  };
}
