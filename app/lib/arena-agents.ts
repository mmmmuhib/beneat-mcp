import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { analyzeAgent, type AgentTradeProfile, type TradeResult } from "./trade-analyzer";
import {
  runEnforcementComparison,
  type EnforcementComparisonResult,
} from "../components/simulator/enforcement-simulation";
import { runDRCAMAnalysis, type DRCAMResult } from "./dr-cam";

const AGENT_TRADES_DIR = join(process.cwd(), "data", "agent-trades");

interface ArenaLeaderboardEntry {
  rank: number;
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
  status: "arena_baseline" | "arena_enforced";
  is_beneat_enforced: boolean;
  archetype: string;
  archetype_color: string;
}

export interface ArenaAgentDetail {
  profile: AgentTradeProfile;
  enforcement: EnforcementComparisonResult;
  drCam: DRCAMResult;
  counterpartWallet: string;
}

interface ArenaCache {
  entries: ArenaLeaderboardEntry[];
  details: Map<string, ArenaAgentDetail>;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let arenaCache: ArenaCache | null = null;

function hashFilename(filename: string): string {
  return createHash("sha256").update(filename).digest("hex").slice(0, 16);
}

function loadFundingUsdc(csvFilename: string): number | undefined {
  const fundingFile = csvFilename.replace(/-trade-history.*\.csv$/i, "-funding.json");
  const fundingPath = join(AGENT_TRADES_DIR, fundingFile);
  if (!existsSync(fundingPath)) return undefined;
  try {
    const data = JSON.parse(readFileSync(fundingPath, "utf-8"));
    return typeof data.totalFundingUsdc === "number" ? data.totalFundingUsdc : undefined;
  } catch {
    return undefined;
  }
}

function computeDiscipline(maxDrawdownPct: number): number {
  return Math.max(0, Math.round(100 - maxDrawdownPct * 2));
}

function computeOverallRating(winRate: number, discipline: number): number {
  return Math.round(winRate * 50 + (discipline / 100) * 50);
}

function computeTrustGrade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

const ARCHETYPE_COLORS: Record<string, string> = {
  Specter: "#f0f0f0", Apex: "#ffd700", Phantom: "#a855f7", Sentinel: "#3b82f6",
  Ironclad: "#9ca3af", Swarm: "#06b6d4", Rogue: "#ef4444", Glitch: "#ec4899", Unclassed: "#52525b",
};

function classifyArenaArchetype(
  overallRating: number,
  discipline: number,
  totalTrades: number,
  lockoutCount: number,
): { archetype: string; color: string } {
  let archetype = "Unclassed";
  if (overallRating >= 90) archetype = "Apex";
  else if (discipline >= 80 && totalTrades < 50) archetype = "Phantom";
  else if (discipline >= 80 && lockoutCount <= 1) archetype = "Sentinel";
  else if (totalTrades >= 200) archetype = "Swarm";
  else if (discipline < 40 && totalTrades >= 50) archetype = "Rogue";
  else if (lockoutCount >= 5 || discipline < 30) archetype = "Glitch";
  return { archetype, color: ARCHETYPE_COLORS[archetype] };
}

function pnlToLamports(pnlPct: number, startingEquity: number): string {
  const pnlValue = (pnlPct / 100) * startingEquity;
  const lamports = Math.round(pnlValue * 1_000_000_000);
  return lamports.toString();
}

function countTradingDays(trades: TradeResult[]): number {
  const days = new Set<string>();
  for (const t of trades) {
    days.add(t.exitDate.slice(0, 10));
  }
  return days.size;
}

function buildArenaEntries(): ArenaCache {
  let files: string[];
  try {
    files = readdirSync(AGENT_TRADES_DIR).filter((f) =>
      f.toLowerCase().endsWith(".csv") && f.toLowerCase().startsWith("hyperliquid-")
    );
  } catch {
    return { entries: [], details: new Map(), timestamp: Date.now() };
  }

  const entries: ArenaLeaderboardEntry[] = [];
  const details = new Map<string, ArenaAgentDetail>();

  for (const file of files) {
    try {
      const csv = readFileSync(join(AGENT_TRADES_DIR, file), "utf-8");
      const fundingUsdc = loadFundingUsdc(file);
      const profile = analyzeAgent(csv, file, undefined, fundingUsdc);
      if (profile.totalTrades === 0) continue;

      const hash = hashFilename(file);
      const baseWallet = `ARENA_BASE_${hash}`;
      const enfWallet = `ARENA_ENF_${hash}`;

      const enforcement = runEnforcementComparison(profile, 100, profile.startingEquity);
      const drCam = runDRCAMAnalysis(profile);

      const tradingDays = countTradingDays(profile.rawTrades);

      // --- Baseline entry ---
      const baseDiscipline = computeDiscipline(profile.maxDrawdownPct);
      const baseRating = computeOverallRating(profile.winRate, baseDiscipline);
      const baseTrustScore = Math.round(baseRating * 0.6 + baseDiscipline * 0.4);
      const baseArchetype = classifyArenaArchetype(baseRating, baseDiscipline, profile.totalTrades, 0);

      entries.push({
        rank: 0,
        wallet: baseWallet,
        name: profile.name,
        project_url: null,
        description: "Alpha Arena agent — baseline performance",
        trust_grade: computeTrustGrade(baseTrustScore),
        trust_score: baseTrustScore,
        overall_rating: baseRating,
        discipline: baseDiscipline,
        win_rate: Math.round(profile.winRate * 10000) / 10000,
        total_trades: profile.totalTrades,
        total_pnl: pnlToLamports(profile.totalReturnPct, profile.startingEquity),
        lockout_count: 0,
        daily_loss_limit: "0",
        trading_days: tradingDays,
        status: "arena_baseline",
        is_beneat_enforced: false,
        archetype: baseArchetype.archetype,
        archetype_color: baseArchetype.color,
      });

      // --- Enforced entry ---
      const enfStats = enforcement.enforced.stats;
      const enfWinRate = enfStats.profitablePercent / 100;
      const enfDiscipline = Math.min(99, baseDiscipline + 15);
      const enfRating = computeOverallRating(enfWinRate, enfDiscipline);
      const enfLockoutCount = enforcement.interventions.filter((i) => i.type === "lockout").length;
      const enfTrustScore = Math.min(100, Math.round(enfRating * 0.6 + enfDiscipline * 0.4) + 10);
      const enfArchetype = classifyArenaArchetype(enfRating, enfDiscipline, profile.totalTrades, enfLockoutCount);

      entries.push({
        rank: 0,
        wallet: enfWallet,
        name: `${profile.name} [Beneat]`,
        project_url: null,
        description: "Alpha Arena agent — Beneat enforcement applied",
        trust_grade: computeTrustGrade(enfTrustScore),
        trust_score: enfTrustScore,
        overall_rating: enfRating,
        discipline: enfDiscipline,
        win_rate: Math.round(enfWinRate * 10000) / 10000,
        total_trades: profile.totalTrades,
        total_pnl: pnlToLamports(enfStats.medianReturn, profile.startingEquity),
        lockout_count: enfLockoutCount,
        daily_loss_limit: "300000000",
        trading_days: tradingDays,
        status: "arena_enforced",
        is_beneat_enforced: true,
        archetype: enfArchetype.archetype,
        archetype_color: enfArchetype.color,
      });

      // Store details for both wallets
      details.set(baseWallet, { profile, enforcement, drCam, counterpartWallet: enfWallet });
      details.set(enfWallet, { profile, enforcement, drCam, counterpartWallet: baseWallet });
    } catch {
      continue;
    }
  }

  return { entries, details, timestamp: Date.now() };
}

function getCache(): ArenaCache {
  if (arenaCache && Date.now() - arenaCache.timestamp < CACHE_TTL_MS) {
    return arenaCache;
  }
  arenaCache = buildArenaEntries();
  return arenaCache;
}

export function loadArenaAgents(): ArenaLeaderboardEntry[] {
  return getCache().entries;
}

export function getArenaAgentDetail(wallet: string): ArenaAgentDetail | null {
  return getCache().details.get(wallet) ?? null;
}

export function getArenaAgentEquityCurve(
  wallet: string
): { timestamp: number; value: number }[] | null {
  const detail = getArenaAgentDetail(wallet);
  if (!detail) return null;

  const isEnforced = wallet.startsWith("ARENA_ENF_");
  const curve = isEnforced
    ? detail.enforcement.enforced.percentiles.median
    : detail.profile.equityCurve;

  if (curve.length === 0) return [];

  // Build timestamps from actual trade dates
  const rawTrades = detail.profile.rawTrades;
  const timestamps: number[] = [];

  if (rawTrades.length > 0) {
    // First point: entry date of first trade (starting equity)
    timestamps.push(new Date(rawTrades[0].entryDate).getTime());
    // Each subsequent point: exit date of each trade
    for (const trade of rawTrades) {
      timestamps.push(new Date(trade.exitDate).getTime());
    }
  }

  // If curve length matches timestamps, use actual dates
  if (timestamps.length === curve.length) {
    return curve.map((value, i) => ({
      timestamp: timestamps[i],
      value: Math.round(value * 100) / 100,
    }));
  }

  // Fallback: distribute evenly across the actual trading period
  const start = timestamps.length > 0 ? timestamps[0] : Date.now() - curve.length * 86400000;
  const end = timestamps.length > 1 ? timestamps[timestamps.length - 1] : Date.now();
  const step = curve.length > 1 ? (end - start) / (curve.length - 1) : 0;

  return curve.map((value, i) => ({
    timestamp: start + i * step,
    value: Math.round(value * 100) / 100,
  }));
}
