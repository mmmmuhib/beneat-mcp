"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { TraderCard } from "../../components/trader-card";
import { EquityCurve } from "../../components/leaderboard/equity-curve";
import { PersonalityCard } from "../../components/leaderboard/personality-card";
import { StatsGrid } from "../../components/leaderboard/stats-grid";
import { ActivePositions, type Position } from "../../components/leaderboard/active-positions";
import { TradeHistory, type Trade } from "../../components/leaderboard/trade-history";
import { LockoutTimeline } from "../../components/leaderboard/lockout-timeline";
import { ComingSoonBanner } from "../../components/leaderboard/coming-soon-banner";
import { ArchetypeBadge } from "../../components/leaderboard/archetype-badge";
import { classifyArchetype, type Archetype } from "../../lib/archetypes";
import { BehavioralSignals } from "../../components/scan/behavioral-signals";
import { MarketBreakdown } from "../../components/scan/market-breakdown";
import { DirectivesPanel } from "../../components/scan/directives-panel";

interface AgentDetail {
  wallet: string;
  name: string | null;
  project_url: string | null;
  description: string | null;
  has_vault: boolean;
  has_profile: boolean;
  trust_score: number;
  trust_grade: string;
  trust_factors: string[];
  tier: string;
  archetype?: string;
  archetype_color?: string;
  archetype_narrative?: string;
  vault: {
    is_locked: boolean;
    lockout_until: string;
    lockout_count: number;
    lockout_duration: number;
    daily_loss_limit: string;
    daily_loss_limit_sol: number;
    max_trades_per_day: number;
    trades_today: number;
    total_deposited: string;
    total_deposited_sol: number;
    total_withdrawn: string;
    cooldown_seconds: number;
  } | null;
  profile: {
    overall_rating: number;
    discipline: number;
    patience: number;
    consistency: number;
    timing: number;
    risk_control: number;
    endurance: number;
    total_trades: number;
    total_wins: number;
    win_rate: number;
    total_pnl: string;
    total_pnl_sol: number;
    avg_trade_size: string;
    trading_days: number;
  } | null;
  status: string;
  is_arena?: boolean;
  is_beneat_enforced?: boolean;
  counterpart_wallet?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ScanData {
  analytics: any;
  directives: any[];
  trade_count: number;
  strategy_type: string;
  kelly_fraction: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

interface ArenaDetail {
  wallet: string;
  name: string;
  is_enforced: boolean;
  counterpart_wallet: string;
  profile: {
    total_trades: number;
    win_rate: number;
    avg_win_pct: number;
    avg_loss_pct: number;
    avg_risk_reward: number;
    max_drawdown_pct: number;
    total_return_pct: number;
    starting_equity: number;
  };
  enforcement: {
    actual: { totalReturn: number; maxDrawdown: number; sharpeRatio: number };
    baseline_stats: any;
    enforced_stats: any;
    intervention_count: number;
    interventions_by_type: Record<string, number>;
  };
  trades: {
    symbol: string;
    entry_price: number;
    exit_price: number;
    shares: number;
    pnl: number;
    pnl_pct: number;
    entry_date: string;
    exit_date: string;
  }[];
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-[var(--profit-green)] border-[var(--profit-green)]",
  B: "text-[var(--accent-cyan)] border-[var(--accent-cyan)]",
  C: "text-[var(--accent-amber)] border-[var(--accent-amber)]",
  D: "text-[var(--accent-orange)] border-[var(--accent-orange)]",
  F: "text-[var(--loss-red)] border-[var(--loss-red)]",
};

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = (value / 99) * 100;
  const color = value >= 70 ? "bg-[var(--profit-green)]" : value >= 40 ? "bg-[var(--accent-amber)]" : "bg-[var(--loss-red)]";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
        <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">{value}</span>
      </div>
      <div className="h-1 w-full bg-[var(--border-color)]">
        <div className={`h-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TrustFactorList({ factors }: { factors: string[] }) {
  const labels: Record<string, string> = {
    has_vault: "Vault created",
    lockout_configured: "Lockout configured",
    loss_limit_set: "Daily loss limit set",
    trade_limit_set: "Trade limit set",
    deposited_gt_1sol: "Deposited >1 SOL",
    has_lockout_history: "Has lockout history",
    has_profile: "Trader profile exists",
    "10plus_trades": "10+ trades completed",
    "100plus_trades": "100+ trades completed",
    "7plus_days": "7+ trading days",
    rating_above_60: "Rating above 60",
    high_discipline: "High discipline (70+)",
    arena_agent: "Alpha Arena agent",
    beneat_enforced: "Beneat enforcement active",
  };

  return (
    <div className="space-y-1.5">
      {factors.map((f) => (
        <div key={f} className="flex items-center gap-2 text-xs">
          <span className="text-[var(--profit-green)]">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span className="text-[var(--text-secondary)]">{labels[f] ?? f}</span>
        </div>
      ))}
    </div>
  );
}

function ArenaEnforcementPanel({ arena }: { arena: ArenaDetail }) {
  const { enforcement } = arena;
  const types = enforcement.interventions_by_type;

  return (
    <div className="border border-orange-500/20 bg-[var(--bg-secondary)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <svg className="h-4 w-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">
          Enforcement Comparison
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Actual Return</div>
          <div className={`mt-1 font-mono text-sm font-bold tabular-nums ${enforcement.actual.totalReturn >= 0 ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"}`}>
            {enforcement.actual.totalReturn >= 0 ? "+" : ""}{enforcement.actual.totalReturn.toFixed(1)}%
          </div>
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Baseline Median</div>
          <div className={`mt-1 font-mono text-sm font-bold tabular-nums ${enforcement.baseline_stats.medianReturn >= 0 ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"}`}>
            {enforcement.baseline_stats.medianReturn >= 0 ? "+" : ""}{enforcement.baseline_stats.medianReturn.toFixed(1)}%
          </div>
        </div>
        <div className="border border-orange-500/20 bg-orange-500/5 p-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-orange-400">Enforced Median</div>
          <div className={`mt-1 font-mono text-sm font-bold tabular-nums ${enforcement.enforced_stats.medianReturn >= 0 ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"}`}>
            {enforcement.enforced_stats.medianReturn >= 0 ? "+" : ""}{enforcement.enforced_stats.medianReturn.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Sharpe (Actual)</div>
          <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {enforcement.actual.sharpeRatio.toFixed(2)}
          </div>
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Max Drawdown</div>
          <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--loss-red)]">
            {enforcement.actual.maxDrawdown.toFixed(1)}%
          </div>
        </div>
      </div>

      {enforcement.intervention_count > 0 && (
        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Interventions ({enforcement.intervention_count})
          </div>
          <div className="flex flex-wrap gap-2">
            {types.stop_loss > 0 && (
              <span className="border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-400">
                Stop-Loss: {types.stop_loss}
              </span>
            )}
            {types.cooldown > 0 && (
              <span className="border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                Cooldown: {types.cooldown}
              </span>
            )}
            {types.lockout > 0 && (
              <span className="border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-bold text-orange-400">
                Lockout: {types.lockout}
              </span>
            )}
            {types.tilt_reduction > 0 && (
              <span className="border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold text-violet-400">
                Tilt: {types.tilt_reduction}
              </span>
            )}
            {types.post_loss_reduction > 0 && (
              <span className="border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold text-cyan-400">
                Post-Loss: {types.post_loss_reduction}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const MOCK_POSITIONS: Position[] = [];

export default function AgentDetailPage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = use(params);
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equityData, setEquityData] = useState<{ timestamp: number; value: number }[]>([]);
  const [agentColor, setAgentColor] = useState("var(--accent-cyan)");
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [arenaDetail, setArenaDetail] = useState<ArenaDetail | null>(null);

  const isArena = wallet.startsWith("ARENA_");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/leaderboard/${wallet}`);
        if (!res.ok) throw new Error("Failed to fetch agent");
        setAgent(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [wallet]);

  useEffect(() => {
    async function loadEquity() {
      try {
        const res = await fetch(`/api/leaderboard/equity?wallets=${wallet}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.agents?.[0]) {
          setEquityData(data.agents[0].data);
          setAgentColor(data.agents[0].color);
        }
      } catch {
        // Equity data is optional
      }
    }
    loadEquity();
  }, [wallet]);

  // Fetch behavioral scan data for non-arena wallets
  useEffect(() => {
    if (isArena) return;
    async function loadScan() {
      try {
        const res = await fetch(`/api/scan/${wallet}?lookback_days=30`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.analytics) {
          setScanData(data);
        }
      } catch {
        // Scan data is optional
      }
    }
    loadScan();
  }, [wallet, isArena]);

  // Fetch arena detail for arena agents
  useEffect(() => {
    if (!isArena) return;
    async function loadArena() {
      try {
        const res = await fetch(`/api/leaderboard/${wallet}/arena`);
        if (!res.ok) return;
        setArenaDetail(await res.json());
      } catch {
        // Arena detail is optional
      }
    }
    loadArena();
  }, [wallet, isArena]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex items-center justify-center py-24">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <span className="ml-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Loading agent data...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen pt-20">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="text-center py-24">
            <p className="text-sm text-[var(--loss-red)]">{error ?? "Agent not found"}</p>
            <Link href="/leaderboard" className="mt-4 inline-block text-xs text-accent underline">
              Back to leaderboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const p = agent.profile;
  const v = agent.vault;
  const pnlSol = p ? p.total_pnl_sol : 0;
  const pnlPositive = pnlSol >= 0;

  const archetypeResult = agent.archetype && agent.archetype_color && agent.archetype_narrative
    ? { archetype: agent.archetype as Archetype, color: agent.archetype_color, narrative: agent.archetype_narrative }
    : classifyArchetype({
        discipline: p?.discipline ?? 0,
        patience: p?.patience ?? 0,
        consistency: p?.consistency ?? 0,
        timing: p?.timing ?? 0,
        risk_control: p?.risk_control ?? 0,
        endurance: p?.endurance ?? 0,
        overall_rating: p?.overall_rating ?? 0,
        total_trades: p?.total_trades ?? 0,
        lockout_count: v?.lockout_count ?? 0,
        win_rate: p?.win_rate ?? 0,
        trading_days: p?.trading_days ?? 0,
      });

  const lockoutEvents = v && v.lockout_count > 0
    ? Array.from({ length: v.lockout_count }, (_, i) => ({
        start: Date.now() - (v.lockout_count - i) * 3 * 24 * 60 * 60 * 1000,
        duration: v.lockout_duration,
      }))
    : [];

  // Convert arena trades to Trade[] format
  const arenaTrades: Trade[] = arenaDetail
    ? arenaDetail.trades.map((t) => ({
        side: (t.pnl >= 0 ? "LONG" : "SHORT") as "LONG" | "SHORT",
        token: t.symbol,
        entry_price: t.entry_price,
        exit_price: t.exit_price,
        size: t.shares,
        hold_time: "—",
        fees: 0,
        net_pnl: t.pnl,
      }))
    : [];

  return (
    <div className="min-h-screen pt-20">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)] transition hover:text-accent"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Leaderboard
          </Link>
          <div className="flex items-center gap-2">
            {agent.counterpart_wallet && (
              <Link
                href={`/leaderboard/${agent.counterpart_wallet}`}
                className="border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-orange-400 transition hover:bg-orange-500/20"
              >
                {agent.is_beneat_enforced ? "View Baseline" : "View Enforced"}
              </Link>
            )}
            <button
              disabled
              className="border border-dashed border-[var(--border-color)] px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] opacity-50"
            >
              Follow
            </button>
          </div>
        </div>

        {/* Arena badge banner */}
        {isArena && (
          <div className={`mb-6 border p-3 flex items-center gap-3 ${agent.is_beneat_enforced ? "border-orange-500/30 bg-orange-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            {agent.is_beneat_enforced ? (
              <>
                <svg className="h-5 w-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
                </svg>
                <div>
                  <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">Beneat Enforced</span>
                  <p className="text-[10px] text-[var(--text-muted)]">Performance with stop-losses, daily caps, and tilt reduction active</p>
                </div>
              </>
            ) : (
              <>
                <span className="text-sm font-bold text-amber-400">A</span>
                <div>
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Alpha Arena</span>
                  <p className="text-[10px] text-[var(--text-muted)]">Raw baseline performance without enforcement</p>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mb-6 grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-full">
              <div className="mb-3 flex items-center gap-3">
                {agent.name ? (
                  <h1 className="text-lg font-bold text-[var(--text-primary)]">{agent.name}</h1>
                ) : (
                  <h1 className="font-mono text-lg font-bold text-[var(--text-primary)]">
                    {wallet.slice(0, 8)}...{wallet.slice(-8)}
                  </h1>
                )}
                <span className={`inline-flex h-8 w-8 items-center justify-center border text-sm font-bold ${GRADE_COLORS[agent.trust_grade]}`}>
                  {agent.trust_grade}
                </span>
                {agent.status === "verified" && (
                  <span className="rounded bg-[var(--profit-green)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--profit-green)]">
                    Verified
                  </span>
                )}
                {agent.status === "tracked" && (
                  <span className="rounded bg-[var(--text-muted)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Tracked
                  </span>
                )}
                {agent.status === "arena_baseline" && (
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Arena
                  </span>
                )}
                {agent.status === "arena_enforced" && (
                  <span className="flex items-center gap-1 rounded bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
                    </svg>
                    Beneat
                  </span>
                )}
              </div>

              <div className="mb-2 flex items-center gap-2">
                <ArchetypeBadge archetype={archetypeResult.archetype as Archetype} />
                <span className="text-xs text-[var(--text-muted)]">
                  {agent.tier} Tier
                </span>
              </div>

              {agent.name && !isArena && (
                <p className="font-mono text-xs text-[var(--text-muted)]">
                  {wallet.slice(0, 8)}...{wallet.slice(-8)}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Trust Score: {agent.trust_score}/100
              </p>
              {agent.description && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{agent.description}</p>
              )}
              {agent.project_url && (
                <a
                  href={agent.project_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[10px] text-accent hover:underline"
                >
                  {agent.project_url}
                </a>
              )}
            </div>

            {p && (
              <TraderCard
                walletAddress={wallet}
                stats={{
                  discipline: p.discipline,
                  patience: p.patience,
                  consistency: p.consistency,
                  timing: p.timing,
                  riskControl: p.risk_control,
                  endurance: p.endurance,
                }}
                overallRating={p.overall_rating}
                tier={agent.tier as any}
                estimatedPreventableLoss={0}
              />
            )}
          </div>

          <div className="space-y-4">
            <EquityCurve
              data={equityData}
              lockouts={lockoutEvents.map((e) => ({ timestamp: e.start, duration: e.duration }))}
              agentColor={agentColor}
            />
          </div>
        </div>

        <div className="mb-6">
          <PersonalityCard result={archetypeResult} />
        </div>

        <div className="mb-6">
          <StatsGrid
            stats={[
              {
                label: "Win Rate",
                value: p ? `${(p.win_rate * 100).toFixed(1)}%` : "—",
                color: p && p.win_rate >= 0.5 ? "var(--profit-green)" : undefined,
              },
              {
                label: "Total P&L",
                value: p
                  ? isArena
                    ? `${pnlPositive ? "+" : "-"}$${Math.abs(pnlSol).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : `${pnlPositive ? "+" : ""}${pnlSol.toFixed(4)} SOL`
                  : "—",
                color: pnlPositive ? "var(--profit-green)" : "var(--loss-red)",
              },
              {
                label: "Total Trades",
                value: p?.total_trades ?? "—",
              },
              {
                label: "Trading Days",
                value: p ? `${p.trading_days}d` : "—",
              },
            ]}
          />
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          {v && (
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
              <div className="mb-4 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                RISK CONFIGURATION
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Daily Loss Limit</div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{v.daily_loss_limit_sol.toFixed(4)} SOL</div>
                </div>
                <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Max Trades/Day</div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{v.max_trades_per_day}</div>
                </div>
                <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Cooldown</div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{v.cooldown_seconds}s</div>
                </div>
                <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Lockout Duration</div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{Math.floor(v.lockout_duration / 3600)}h</div>
                </div>
                <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Total Deposited</div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{v.total_deposited_sol.toFixed(2)} SOL</div>
                </div>
                <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Trades Today</div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{v.trades_today}/{v.max_trades_per_day}</div>
                </div>
              </div>
            </div>
          )}

          {p && (
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
              <div className="mb-4 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                PERFORMANCE STATS
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <StatBar label="Discipline" value={p.discipline} />
                <StatBar label="Timing" value={p.timing} />
                <StatBar label="Patience" value={p.patience} />
                <StatBar label="Risk Control" value={p.risk_control} />
                <StatBar label="Consistency" value={p.consistency} />
                <StatBar label="Endurance" value={p.endurance} />
              </div>
            </div>
          )}
        </div>

        {!v && !p && !isArena && (
          <div className="mb-6 border border-[var(--border-color)] bg-[var(--bg-secondary)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              This wallet has no vault or trader profile on-chain.
            </p>
          </div>
        )}

        {/* Arena enforcement comparison */}
        {arenaDetail && (
          <div className="mb-6">
            <ArenaEnforcementPanel arena={arenaDetail} />
          </div>
        )}

        {/* Arena trade profile stats */}
        {arenaDetail && (
          <div className="mb-6 border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
            <div className="mb-4 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              TRADE PROFILE
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Avg Win</div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--profit-green)]">+{arenaDetail.profile.avg_win_pct.toFixed(2)}%</div>
              </div>
              <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Avg Loss</div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--loss-red)]">-{arenaDetail.profile.avg_loss_pct.toFixed(2)}%</div>
              </div>
              <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Risk/Reward</div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{arenaDetail.profile.avg_risk_reward.toFixed(2)}</div>
              </div>
              <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Max Drawdown</div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--loss-red)]">{arenaDetail.profile.max_drawdown_pct.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}

        {/* Behavioral signals for on-chain wallets */}
        {scanData?.analytics && (
          <div className="mb-6">
            <BehavioralSignals analytics={scanData.analytics} />
          </div>
        )}

        {/* Market breakdown for on-chain wallets */}
        {scanData?.analytics?.market_accuracy && (
          <div className="mb-6">
            <MarketBreakdown markets={scanData.analytics.market_accuracy} />
          </div>
        )}

        {/* Risk directives for on-chain wallets */}
        {scanData?.directives && scanData.directives.length > 0 && (
          <div className="mb-6">
            <DirectivesPanel directives={scanData.directives} />
          </div>
        )}

        <div className="mb-6">
          <ActivePositions positions={MOCK_POSITIONS} />
        </div>

        <div className="mb-6">
          <TradeHistory trades={isArena ? arenaTrades : []} />
        </div>

        {v && (
          <div className="mb-6">
            <LockoutTimeline
              events={lockoutEvents}
              currentlyLocked={v.is_locked}
              lockoutCount={v.lockout_count}
            />
          </div>
        )}

        <div className="mb-6">
          <ComingSoonBanner
            title="Copy-Trade"
            description="Follow this agent's strategy with one click. Automated position mirroring coming soon."
          />
        </div>

        <div className="mb-6 border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          <div className="mb-3 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            TRUST FACTORS
          </div>
          <TrustFactorList factors={agent.trust_factors} />
        </div>
      </div>
    </div>
  );
}
