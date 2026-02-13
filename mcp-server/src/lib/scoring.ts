import { LAMPORTS_PER_SOL } from "./constants.js";
import type { VaultState, TraderProfileState, TrustScoreResult, TradeRecord } from "./types.js";

export interface HistoryScoreResult {
  score: number;
  factors: string[];
}

export function computeHistoryScore(trades: TradeRecord[]): HistoryScoreResult {
  let score = 0;
  const factors: string[] = [];

  if (trades.length === 0) return { score, factors };

  if (trades.length >= 5) {
    score += 8;
    factors.push("active_trader_5plus");
  }
  if (trades.length >= 20) {
    score += 7;
    factors.push("active_trader_20plus");
  }
  if (trades.length >= 100) {
    score += 5;
    factors.push("active_trader_100plus");
  }

  const uniqueDays = new Set(
    trades.map((t) => new Date(t.timestamp * 1000).toISOString().slice(0, 10))
  );
  if (uniqueDays.size >= 3) {
    score += 5;
    factors.push("multi_day_history");
  }
  if (uniqueDays.size >= 7) {
    score += 5;
    factors.push("week_plus_history");
  }

  const wins = trades.filter((t) => t.isWin).length;
  const winRate = wins / trades.length;
  if (winRate >= 0.45 && trades.length >= 10) {
    score += 5;
    factors.push("consistent_wins");
  }

  const protocols = new Set(trades.map((t) => t.market ?? "unknown"));
  if (protocols.size >= 2) {
    score += 3;
    factors.push("diverse_protocols");
  }
  if (protocols.size >= 4) {
    score += 2;
    factors.push("highly_diverse_protocols");
  }

  return { score: Math.min(40, score), factors };
}

export function computeTrustScore(
  vault: VaultState,
  profile: TraderProfileState
): TrustScoreResult {
  let trustScore = 0;
  const factors: string[] = [];

  if (vault.exists) {
    trustScore += 20;
    factors.push("has_vault");

    if (vault.lockoutDuration > 0) {
      trustScore += 10;
      factors.push("lockout_configured");
    }
    if (Number(vault.dailyLossLimit) > 0) {
      trustScore += 10;
      factors.push("loss_limit_set");
    }
    if (vault.maxTradesPerDay > 0 && vault.maxTradesPerDay <= 50) {
      trustScore += 10;
      factors.push("trade_limit_set");
    }
    if (Number(vault.totalDeposited) > LAMPORTS_PER_SOL) {
      trustScore += 5;
      factors.push("deposited_gt_1sol");
    }
    if (vault.lockoutCount === 0) {
      trustScore += 5;
      factors.push("no_lockouts");
    } else if (vault.lockoutCount >= 3) {
      trustScore -= 5;
      factors.push("frequent_lockouts");
    }
  }

  if (profile.exists) {
    trustScore += 15;
    factors.push("has_profile");

    if (profile.totalTrades >= 10) {
      trustScore += 5;
      factors.push("10plus_trades");
    }
    if (profile.totalTrades >= 100) {
      trustScore += 5;
      factors.push("100plus_trades");
    }
    if (profile.tradingDays >= 7) {
      trustScore += 5;
      factors.push("7plus_days");
    }
    if (profile.overallRating >= 60) {
      trustScore += 5;
      factors.push("rating_above_60");
    }
    if (profile.discipline >= 70) {
      trustScore += 5;
      factors.push("high_discipline");
    }
  }

  trustScore = Math.min(100, trustScore);

  let riskGrade: string;
  if (trustScore >= 80) riskGrade = "A";
  else if (trustScore >= 60) riskGrade = "B";
  else if (trustScore >= 40) riskGrade = "C";
  else if (trustScore >= 20) riskGrade = "D";
  else riskGrade = "F";

  return { trust_score: trustScore, risk_grade: riskGrade, factors };
}
