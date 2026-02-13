export interface SimulatorParams {
  winRate: number;
  riskReward: number;
  positionSize: number;
  startingBalance: number;
  numTrades: number;
}

export interface SimulationResult {
  equityCurve: number[];
  finalBalance: number;
  finalPnlPercent: number;
  finalPnlDollar: number;
  maxDrawdownPercent: number;
  winCount: number;
  lossCount: number;
  expectancyPerTrade: number;
  isBlown: boolean;
}

export interface MonteCarloStats {
  profitableCount: number;
  profitablePercent: number;
  medianReturn: number;
  worstCase: number;
  bestCase: number;
  avgMaxDrawdown: number;
  sharpeRatio?: number;
  returnStdDev?: number;
}

export interface MonteCarloFullResult {
  curves: number[][];
  percentiles: {
    best: number[];
    worst: number[];
    median: number[];
    p25: number[];
    p75: number[];
  };
  percentileIndices: {
    best: number;
    worst: number;
    median: number;
    p25: number;
    p75: number;
  };
  stats: MonteCarloStats;
}

export const DEFAULT_PARAMS: SimulatorParams = {
  winRate: 30,
  riskReward: 3,
  positionSize: 2,
  startingBalance: 10000,
  numTrades: 100,
};

export function generateTradeOutcomes(
  numTrades: number,
  winRate: number
): boolean[] {
  const outcomes: boolean[] = [];
  for (let i = 0; i < numTrades; i++) {
    outcomes.push(Math.random() * 100 < winRate);
  }
  return outcomes;
}

export function simulateTrades(
  params: SimulatorParams,
  tradeOutcomes: boolean[]
): SimulationResult {
  let balance = params.startingBalance;
  const equityCurve: number[] = [balance];
  let peakBalance = balance;
  let maxDrawdown = 0;
  let winCount = 0;
  let lossCount = 0;

  for (const isWin of tradeOutcomes) {
    if (balance <= 0) {
      equityCurve.push(0);
      continue;
    }

    const riskAmount = balance * (params.positionSize / 100);

    if (isWin) {
      balance += riskAmount * params.riskReward;
      winCount++;
    } else {
      balance -= riskAmount;
      lossCount++;
    }

    balance = Math.max(0, balance);
    equityCurve.push(balance);

    if (balance > peakBalance) {
      peakBalance = balance;
    }
    const currentDrawdown = ((peakBalance - balance) / peakBalance) * 100;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
  }

  const finalBalance = balance;
  const finalPnlDollar = finalBalance - params.startingBalance;
  const finalPnlPercent = (finalPnlDollar / params.startingBalance) * 100;

  const avgWin = params.riskReward;
  const avgLoss = 1;
  const expectancyPerTrade =
    (params.winRate / 100) * avgWin - ((100 - params.winRate) / 100) * avgLoss;

  return {
    equityCurve,
    finalBalance,
    finalPnlPercent,
    finalPnlDollar,
    maxDrawdownPercent: maxDrawdown,
    winCount,
    lossCount,
    expectancyPerTrade,
    isBlown: finalBalance <= 0,
  };
}

export function runMonteCarloWithCurves(
  params: SimulatorParams,
  iterations: number = 50
): MonteCarloFullResult {
  const simulations: {
    curve: number[];
    finalPnl: number;
    maxDrawdown: number;
  }[] = [];

  for (let i = 0; i < iterations; i++) {
    const outcomes = generateTradeOutcomes(params.numTrades, params.winRate);
    const result = simulateTrades(params, outcomes);
    simulations.push({
      curve: result.equityCurve,
      finalPnl: result.finalPnlPercent,
      maxDrawdown: result.maxDrawdownPercent,
    });
  }

  const sorted = [...simulations].sort((a, b) => a.finalPnl - b.finalPnl);

  const worstIdx = 0;
  const p25Idx = Math.floor(iterations * 0.25);
  const medianIdx = Math.floor(iterations * 0.5);
  const p75Idx = Math.floor(iterations * 0.75);
  const bestIdx = iterations - 1;

  const curves = simulations.map((s) => s.curve);

  const profitableCount = simulations.filter((s) => s.finalPnl > 0).length;
  const avgMaxDrawdown =
    simulations.reduce((sum, s) => sum + s.maxDrawdown, 0) / iterations;

  return {
    curves,
    percentiles: {
      best: sorted[bestIdx].curve,
      worst: sorted[worstIdx].curve,
      median: sorted[medianIdx].curve,
      p25: sorted[p25Idx].curve,
      p75: sorted[p75Idx].curve,
    },
    percentileIndices: {
      best: simulations.indexOf(sorted[bestIdx]),
      worst: simulations.indexOf(sorted[worstIdx]),
      median: simulations.indexOf(sorted[medianIdx]),
      p25: simulations.indexOf(sorted[p25Idx]),
      p75: simulations.indexOf(sorted[p75Idx]),
    },
    stats: {
      profitableCount,
      profitablePercent: (profitableCount / iterations) * 100,
      medianReturn: sorted[medianIdx].finalPnl,
      worstCase: sorted[worstIdx].finalPnl,
      bestCase: sorted[bestIdx].finalPnl,
      avgMaxDrawdown,
    },
  };
}
