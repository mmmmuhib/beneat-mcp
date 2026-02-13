import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { getArenaAgentEquityCurve, getArenaAgentDetail } from "../../../lib/arena-agents";

interface BenchmarkAgent {
  wallet: string;
  name: string;
  trust_grade: string;
  color: string;
  data: { timestamp: number; value: number; progress: number }[];
  stats: {
    win_rate: number;
    discipline: number;
    trust_score: number;
    total_pnl_sol: number;
    total_trades: number;
    lockout_count: number;
  };
}

function loadBenchmarkAgents(): Map<string, BenchmarkAgent> {
  const map = new Map<string, BenchmarkAgent>();
  try {
    const raw = readFileSync(
      join(process.cwd(), "data", "benchmark-results.json"),
      "utf-8"
    );
    const parsed = JSON.parse(raw);
    for (const agent of parsed.agents ?? []) {
      map.set(agent.wallet, agent);
    }
  } catch {}
  return map;
}

const GRADE_COLORS: Record<string, string> = {
  A: "#22c55e",
  B: "#06b6d4",
  C: "#f59e0b",
  D: "#f97316",
  F: "#ef4444",
};

const AGENT_PALETTE = [
  "#22c55e", "#06b6d4", "#f59e0b", "#a855f7", "#ec4899",
  "#f97316", "#3b82f6", "#ef4444", "#14b8a6", "#8b5cf6",
];

// Paired colors: each agent gets a baseline (muted) + enforced (bright) color
const ARENA_PAIR_COLORS: { baseline: string; enforced: string }[] = [
  { baseline: "#71717a", enforced: "#3b82f6" },  // gray → blue
  { baseline: "#78716c", enforced: "#a855f7" },  // stone → purple
  { baseline: "#737373", enforced: "#f59e0b" },  // neutral → amber
  { baseline: "#6b7280", enforced: "#ec4899" },  // gray → pink
  { baseline: "#64748b", enforced: "#06b6d4" },  // slate → cyan
];

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

function generateEquityCurve(
  wallet: string,
  days: number = 30
): { timestamp: number; value: number }[] {
  const rng = seededRandom(wallet);
  const points: { timestamp: number; value: number; progress: number }[] = [];
  const now = Date.now();
  let value = 10 + rng() * 20;

  for (let i = days; i >= 0; i--) {
    const timestamp = now - i * 24 * 60 * 60 * 1000 + rng() * 3600000;
    const drift = (rng() - 0.45) * 0.8;
    value = Math.max(0.5, value + drift);
    points.push({ timestamp, value: Math.round(value * 100) / 100, progress: 0 });
  }

  // Add normalized progress (0→1)
  const len = points.length;
  for (let i = 0; i < len; i++) {
    points[i].progress = len > 1 ? i / (len - 1) : 0;
  }

  return points;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const walletsParam = searchParams.get("wallets");

    if (!walletsParam) {
      return NextResponse.json({ error: "wallets query parameter required" }, { status: 400 });
    }

    const wallets = walletsParam.split(",").slice(0, 50);
    const benchmarkAgents = loadBenchmarkAgents();

    // Build a map of arena hash → pair index for consistent color assignment
    const arenaHashIndex = new Map<string, number>();
    let pairCounter = 0;
    for (const w of wallets) {
      if (w.startsWith("ARENA_")) {
        const hash = w.replace(/^ARENA_(BASE|ENF)_/, "");
        if (!arenaHashIndex.has(hash)) {
          arenaHashIndex.set(hash, pairCounter++);
        }
      }
    }

    const agents = wallets.map((wallet, i) => {
      if (wallet.startsWith("BENCH_")) {
        const benchAgent = benchmarkAgents.get(wallet);
        if (benchAgent) return benchAgent;
      }

      // Return actual equity data for arena agents
      if (wallet.startsWith("ARENA_")) {
        const curveData = getArenaAgentEquityCurve(wallet);
        const detail = getArenaAgentDetail(wallet);
        if (curveData && detail) {
          const isEnforced = wallet.startsWith("ARENA_ENF_");
          const discipline = Math.max(0, Math.round(100 - detail.profile.maxDrawdownPct * 2));
          const enfDiscipline = Math.min(99, discipline + 15);
          const wr = isEnforced ? detail.enforcement.enforced.stats.profitablePercent / 100 : detail.profile.winRate;
          const d = isEnforced ? enfDiscipline : discipline;
          const trustScore = Math.min(100, Math.round((wr * 50 + d / 2) * 0.6 + d * 0.4) + (isEnforced ? 10 : 0));
          const grade = trustScore >= 80 ? "A" : trustScore >= 60 ? "B" : trustScore >= 40 ? "C" : trustScore >= 20 ? "D" : "F";

          // Assign paired colors: baseline gets muted, enforced gets bright
          const hash = wallet.replace(/^ARENA_(BASE|ENF)_/, "");
          const pairIdx = arenaHashIndex.get(hash) ?? 0;
          const pair = ARENA_PAIR_COLORS[pairIdx % ARENA_PAIR_COLORS.length];
          const color = isEnforced ? pair.enforced : pair.baseline;

          // Add normalized progress to arena curve data
          const curveLen = curveData.length;
          const curveWithProgress = curveData.map((d: { timestamp: number; value: number }, idx: number) => ({
            ...d,
            progress: curveLen > 1 ? idx / (curveLen - 1) : 0,
          }));

          return {
            wallet,
            name: isEnforced ? `${detail.profile.name} [Beneat]` : detail.profile.name,
            trust_grade: grade,
            color,
            data: curveWithProgress,
            stats: {
              win_rate: wr,
              discipline: d,
              trust_score: trustScore,
              total_pnl_sol: (isEnforced ? detail.enforcement.enforced.stats.medianReturn : detail.profile.totalReturnPct) / 100 * detail.profile.startingEquity,
              total_trades: detail.profile.totalTrades,
              lockout_count: isEnforced ? detail.enforcement.interventions.filter((x) => x.type === "lockout").length : 0,
            },
          };
        }
      }

      const rng = seededRandom(wallet);
      const grade = ["A", "B", "C", "D", "F"][Math.floor(rng() * 5)];

      return {
        wallet,
        name: null,
        trust_grade: grade,
        color: GRADE_COLORS[grade] ?? AGENT_PALETTE[i % AGENT_PALETTE.length],
        data: generateEquityCurve(wallet),
        stats: {
          win_rate: 0.3 + rng() * 0.5,
          discipline: Math.floor(20 + rng() * 80),
          trust_score: Math.floor(10 + rng() * 90),
          total_pnl_sol: (rng() - 0.4) * 50,
          total_trades: Math.floor(5 + rng() * 300),
          lockout_count: Math.floor(rng() * 8),
        },
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate equity data" },
      { status: 500 }
    );
  }
}
