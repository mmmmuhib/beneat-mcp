import type { AgentTradeProfile, TradeResult } from "./trade-analyzer";

export type SessionState =
  | "normal"
  | "post_loss"
  | "tilt"
  | "hot_streak"
  | "recovery";

export type TiltSeverity = "none" | "mild" | "moderate" | "severe";

export interface CoachingResult {
  sessionState: SessionState;
  sessionLabel: string;
  confidenceAdjustment: number;
  suggestedSizePct: number;
  avoidMarkets: string[];
  bestMarket: string | undefined;
  reasoning: string[];
  tiltSeverity: TiltSeverity;
  overconfidenceIndex: number;
  revengeTradeRatio: number;
  kellyFraction: number;
}

export interface ConfidenceCalibration {
  inputConfidence: number;
  calibratedConfidence: number;
  historicalAccuracy: number;
  insight: string;
}

export interface PersonalityClassification {
  archetype: string;
  topIssue: string | null;
  severity: "green" | "yellow" | "red";
}

const SESSION_LABELS: Record<SessionState, string> = {
  normal: "Normal",
  post_loss: "Post-Loss Cooldown",
  tilt: "Tilt Detected",
  hot_streak: "Hot Streak",
  recovery: "Recovery Mode",
};

const SESSION_SIZE_MULT: Record<SessionState, number> = {
  normal: 1.0,
  post_loss: 0.2,
  tilt: 0.1,
  hot_streak: 0.8,
  recovery: 0.1,
};

function computeOverconfidenceIndex(trades: TradeResult[]): number {
  if (trades.length < 5) return 0;
  const sizes = trades.map((t) => Math.abs(t.pnl));
  const sorted = [...sizes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const large = trades.filter((t) => Math.abs(t.pnl) > median);
  const small = trades.filter((t) => Math.abs(t.pnl) <= median);
  if (large.length === 0 || small.length === 0) return 0;

  const largeWR = large.filter((t) => t.pnl > 0).length / large.length;
  const smallWR = small.filter((t) => t.pnl > 0).length / small.length;
  return Math.max(0, smallWR - largeWR);
}

function computeTiltSeverity(trades: TradeResult[]): TiltSeverity {
  if (trades.length < 10) return "none";
  const baseWR = trades.filter((t) => t.pnl > 0).length / trades.length;
  const postStreak: TradeResult[] = [];
  for (let i = 2; i < trades.length; i++) {
    if (trades[i - 1].pnl <= 0 && trades[i - 2].pnl <= 0) {
      postStreak.push(trades[i]);
    }
  }
  if (postStreak.length < 3) return "none";
  const postWR = postStreak.filter((t) => t.pnl > 0).length / postStreak.length;
  const degradation = baseWR - postWR;
  if (degradation > 0.3) return "severe";
  if (degradation > 0.15) return "moderate";
  if (degradation > 0.05) return "mild";
  return "none";
}

function computeRevengeRatio(trades: TradeResult[]): number {
  if (trades.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < trades.length; i++) {
    if (trades[i - 1].pnl <= 0) {
      const prev = new Date(trades[i - 1].exitDate).getTime();
      const curr = new Date(trades[i].entryDate).getTime();
      if (curr - prev < 120_000) count++;
    }
  }
  return count / (trades.length - 1);
}

function computeAccuracyBySymbol(
  trades: TradeResult[]
): Record<string, { wins: number; total: number; wr: number }> {
  const map = new Map<string, { wins: number; total: number }>();
  for (const t of trades) {
    const entry = map.get(t.symbol) ?? { wins: 0, total: 0 };
    entry.total++;
    if (t.pnl > 0) entry.wins++;
    map.set(t.symbol, entry);
  }
  const result: Record<string, { wins: number; total: number; wr: number }> = {};
  for (const [sym, data] of map) {
    result[sym] = { ...data, wr: data.total > 0 ? data.wins / data.total : 0 };
  }
  return result;
}

export function classifySessionState(trades: TradeResult[]): SessionState {
  if (trades.length < 3) return "normal";
  const last3 = trades.slice(-3);
  if (last3.every((t) => t.pnl <= 0)) return "tilt";
  if (last3.every((t) => t.pnl > 0)) return "hot_streak";
  const last = trades[trades.length - 1];
  if (last.pnl <= 0) return "post_loss";
  return "normal";
}

export function computeCoaching(profile: AgentTradeProfile): CoachingResult {
  const trades = profile.rawTrades;
  const sessionState = classifySessionState(trades);
  const tiltSeverity = computeTiltSeverity(trades);
  const overconfidenceIndex = computeOverconfidenceIndex(trades);
  const revengeTradeRatio = computeRevengeRatio(trades);

  let confAdj = 1.0;
  if (overconfidenceIndex > 0.3) confAdj *= 0.5;
  else if (overconfidenceIndex > 0.15) confAdj *= 0.7;
  else if (overconfidenceIndex > 0.05) confAdj *= 0.85;
  if (tiltSeverity === "severe") confAdj *= 0.4;
  else if (tiltSeverity === "moderate") confAdj *= 0.6;
  else if (tiltSeverity === "mild") confAdj *= 0.8;
  confAdj = Math.max(0.1, Math.min(1.0, confAdj));

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const avgWin = wins.length > 0
    ? wins.reduce((s, t) => s + Math.abs(t.pnlPct), 0) / wins.length
    : 0;
  const avgLoss = losses.length > 0
    ? losses.reduce((s, t) => s + Math.abs(t.pnlPct), 0) / losses.length
    : 1;

  const kellyFraction = avgWin > 0
    ? (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin
    : 0;

  const baseSizePct = Math.max(0, Math.min(kellyFraction, 0.25)) * 100;
  const suggestedSizePct = Math.max(
    0.1,
    baseSizePct * SESSION_SIZE_MULT[sessionState] * confAdj
  );

  const bySymbol = computeAccuracyBySymbol(trades);
  const avoidMarkets: string[] = [];
  let bestMarket: string | undefined;
  let bestWR = 0;
  for (const [sym, data] of Object.entries(bySymbol)) {
    if (data.wr < 0.35 && data.total >= 3) avoidMarkets.push(sym);
    if (data.wr > bestWR && data.total >= 5) {
      bestWR = data.wr;
      bestMarket = sym;
    }
  }

  const reasoning: string[] = [];
  reasoning.push(`Session: ${SESSION_LABELS[sessionState]}`);
  if (kellyFraction < 0) {
    reasoning.push(
      `Negative Kelly (${(kellyFraction * 100).toFixed(1)}%) — strategy has negative expected value`
    );
  }
  if (confAdj < 1) {
    reasoning.push(
      `Confidence reduced to ${(confAdj * 100).toFixed(0)}% (overconfidence/tilt adjustment)`
    );
  }
  if (avoidMarkets.length > 0) {
    reasoning.push(`Avoid: ${avoidMarkets.join(", ")} (<35% win rate)`);
  }
  if (bestMarket) {
    reasoning.push(`Focus: ${bestMarket} (${(bestWR * 100).toFixed(0)}% WR)`);
  }

  return {
    sessionState,
    sessionLabel: SESSION_LABELS[sessionState],
    confidenceAdjustment: confAdj,
    suggestedSizePct,
    avoidMarkets,
    bestMarket,
    reasoning,
    tiltSeverity,
    overconfidenceIndex,
    revengeTradeRatio,
    kellyFraction,
  };
}

export function calibrateConfidence(
  inputConfidence: number,
  trades: TradeResult[]
): ConfidenceCalibration {
  const bins = [0, 0, 0, 0, 0];
  const binWins = [0, 0, 0, 0, 0];

  const winRate = trades.length > 0
    ? trades.filter((t) => t.pnl > 0).length / trades.length
    : 0.5;

  const idx = Math.min(4, Math.floor(inputConfidence * 5));
  const historicalAccuracy = winRate;
  const calibrated = (inputConfidence + historicalAccuracy) / 2;

  let insight: string;
  if (calibrated < inputConfidence - 0.1) {
    insight = `Historical accuracy ${(historicalAccuracy * 100).toFixed(0)}% is lower than reported ${(inputConfidence * 100).toFixed(0)}%. Calibrated to ${(calibrated * 100).toFixed(0)}%.`;
  } else if (calibrated > inputConfidence + 0.1) {
    insight = `Historical accuracy ${(historicalAccuracy * 100).toFixed(0)}% exceeds reported ${(inputConfidence * 100).toFixed(0)}%. Calibrated up to ${(calibrated * 100).toFixed(0)}%.`;
  } else {
    insight = `Confidence well-calibrated. Historical ${(historicalAccuracy * 100).toFixed(0)}% aligns with reported ${(inputConfidence * 100).toFixed(0)}%.`;
  }

  return {
    inputConfidence,
    calibratedConfidence: calibrated,
    historicalAccuracy,
    insight,
  };
}

export function classifyPersonality(
  profile: AgentTradeProfile
): PersonalityClassification {
  const trades = profile.rawTrades;
  const tilt = computeTiltSeverity(trades);
  const overconf = computeOverconfidenceIndex(trades);
  const revenge = computeRevengeRatio(trades);

  let archetype: string;
  if (profile.totalTrades > 100 && profile.avgWinPct < 1) {
    archetype = "Scalper";
  } else if (profile.winRate > 0.55 && tilt === "none" && overconf < 0.1) {
    archetype = "Disciplined";
  } else if (revenge > 0.15) {
    archetype = "Revenge Trader";
  } else if (tilt !== "none") {
    archetype = "Tilt-Prone";
  } else if (overconf > 0.15) {
    archetype = "Overconfident";
  } else {
    archetype = "Momentum Chaser";
  }

  let topIssue: string | null = null;
  let severity: "green" | "yellow" | "red" = "green";

  if (tilt === "severe" || revenge > 0.25) {
    severity = "red";
    topIssue = tilt === "severe" ? "SEVERE TILT" : "REVENGE TRADER";
  } else if (tilt === "moderate" || overconf > 0.2 || revenge > 0.15) {
    severity = "yellow";
    if (tilt === "moderate") topIssue = "TILT PRONE";
    else if (overconf > 0.2) topIssue = "OVERCONFIDENT";
    else topIssue = "REVENGE TRADES";
  } else if (tilt === "mild" || overconf > 0.1) {
    severity = "yellow";
    topIssue = tilt === "mild" ? "MILD TILT" : "SLIGHT OVERCONFIDENCE";
  }

  return { archetype, topIssue, severity };
}
