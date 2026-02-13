/**
 * Politis-Romano stationary bootstrap.
 *
 * Replaces circular block bootstrap with geometric block lengths
 * that naturally handle autocorrelation in trade returns. At each step,
 * continue the current block with probability p, or start a new
 * random block with probability 1-p.
 */

import type { TradeResult } from "../trade-analyzer";

/**
 * Estimate optimal block length from lag-1 autocorrelation of returns.
 *
 * Uses the Politis-Romano rule: optimal block length ~ n^(1/3) * f(rho_1)
 * where rho_1 is the lag-1 autocorrelation and f adjusts for dependence strength.
 */
export function estimateOptimalBlockLength(returns: number[]): number {
  const n = returns.length;
  if (n < 5) return 1;

  // Compute lag-1 autocorrelation
  const mean = returns.reduce((s, v) => s + v, 0) / n;
  let cov0 = 0;
  let cov1 = 0;

  for (let i = 0; i < n; i++) {
    cov0 += (returns[i] - mean) ** 2;
  }
  for (let i = 1; i < n; i++) {
    cov1 += (returns[i] - mean) * (returns[i - 1] - mean);
  }

  cov0 /= n;
  cov1 /= n;

  const rho1 = cov0 > 0 ? cov1 / cov0 : 0;
  const absRho = Math.abs(rho1);

  // Politis-Romano: b_opt ~ n^(1/3) * (2 * rho^2 / (1 - rho^2))^(1/3)
  // Clamped to [2, sqrt(n)]
  let bOpt: number;
  if (absRho < 0.01) {
    // Near-zero autocorrelation: small blocks (close to IID)
    bOpt = Math.max(2, Math.round(Math.pow(n, 1 / 3)));
  } else {
    const rhoFactor = (2 * absRho * absRho) / Math.max(1e-8, 1 - absRho * absRho);
    bOpt = Math.round(Math.pow(n, 1 / 3) * Math.pow(rhoFactor, 1 / 3));
  }

  return Math.max(2, Math.min(bOpt, Math.floor(Math.sqrt(n))));
}

/**
 * Stationary bootstrap: geometric block lengths.
 *
 * At each position, with probability p = 1 - 1/blockLength we continue
 * from the next element; with probability 1-p we jump to a random start.
 */
export function stationaryBootstrap(
  trades: TradeResult[],
  n?: number,
): TradeResult[] {
  const len = trades.length;
  if (len === 0) return [];

  const targetLength = n ?? len;

  // Estimate optimal block length from trade returns
  const returns = trades.map((t) => t.pnlPct / 100);
  const blockLength = estimateOptimalBlockLength(returns);

  // Continuation probability
  const p = 1 - 1 / blockLength;

  const result: TradeResult[] = [];
  let currentIdx = Math.floor(Math.random() * len);

  for (let i = 0; i < targetLength; i++) {
    result.push(trades[currentIdx]);

    if (Math.random() < p) {
      // Continue block: advance to next trade (circular)
      currentIdx = (currentIdx + 1) % len;
    } else {
      // Start new block: random position
      currentIdx = Math.floor(Math.random() * len);
    }
  }

  return result;
}
