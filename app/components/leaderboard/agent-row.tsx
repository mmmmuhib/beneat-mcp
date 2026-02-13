"use client";

import Link from "next/link";
import { ArchetypeBadge } from "./archetype-badge";
import { SparklineCell } from "./sparkline-cell";
import { AgentIcon } from "../simulator/agent-icon";
import { type Archetype } from "../../lib/archetypes";

interface AgentRowProps {
  rank: number;
  wallet: string;
  name: string | null;
  trust_grade: string;
  trust_score: number;
  overall_rating: number;
  discipline: number;
  win_rate: number;
  total_trades: number;
  total_pnl: string;
  lockout_count: number;
  trading_days: number;
  status: "verified" | "tracked" | "arena_baseline" | "arena_enforced";
  is_beneat_enforced?: boolean;
  archetype: string;
  archetype_color: string;
  sparkline_data?: number[];
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-[var(--profit-green)]",
  B: "text-[var(--accent-cyan)]",
  C: "text-[var(--accent-amber)]",
  D: "text-[var(--accent-orange)]",
  F: "text-[var(--loss-red)]",
};

const GRADE_BG: Record<string, string> = {
  A: "bg-[var(--profit-green)]/10",
  B: "bg-[var(--accent-cyan)]/10",
  C: "bg-[var(--accent-amber)]/10",
  D: "bg-[var(--accent-orange)]/10",
  F: "bg-[var(--loss-red)]/10",
};

function truncateWallet(addr: string | undefined): string {
  if (!addr) return "????...????";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function formatPnl(lamports: string, status: string): { text: string; isPositive: boolean } {
  const val = Number(lamports) / 1_000_000_000;
  const isPositive = val >= 0;
  const abs = Math.abs(val);
  const isArena = status === "arena_baseline" || status === "arena_enforced";
  if (isArena) {
    const usdText = abs >= 1000
      ? `${(abs / 1000).toFixed(1)}K`
      : abs >= 1
        ? abs.toFixed(0)
        : abs.toFixed(2);
    return { text: `${isPositive ? "+" : "-"}$${usdText}`, isPositive };
  }
  const text = abs >= 1000
    ? `${(abs / 1000).toFixed(1)}K`
    : abs >= 1
      ? abs.toFixed(2)
      : abs.toFixed(4);
  return { text: `${isPositive ? "+" : "-"}${text} SOL`, isPositive };
}

export function AgentRow(props: AgentRowProps) {
  const {
    rank, wallet, name, trust_grade, trust_score, overall_rating, discipline,
    win_rate, total_trades, total_pnl, lockout_count, trading_days, status,
    archetype, archetype_color, sparkline_data,
  } = props;

  const pnl = formatPnl(total_pnl, status);
  const winPct = (win_rate * 100).toFixed(1);
  const isEnforced = status === "arena_enforced";

  return (
    <Link
      href={`/leaderboard/${wallet}`}
      className={`group grid grid-cols-[3rem_1fr_5rem_4rem_3.5rem_4rem_4rem_4rem_5rem_3.5rem_3rem_3.5rem_4.5rem] items-center gap-2 border-b border-[var(--border-color)] px-3 py-2.5 text-xs transition-colors hover:bg-[var(--bg-elevated)] ${isEnforced ? "border-l-2 border-l-orange-500" : ""}`}
    >
      <span className="font-mono text-[var(--text-muted)] tabular-nums text-center">
        {rank}
      </span>

      <span className="flex items-center gap-2 overflow-hidden">
        <span className="shrink-0">
          <AgentIcon
            name={name ?? ""}
            size={20}
            color={archetype_color}
          />
        </span>
        <span className="flex flex-col leading-tight">
          {name && (
            <span className="text-[var(--text-primary)] group-hover:text-accent transition-colors truncate text-[11px]">
              {name}
            </span>
          )}
          <span className={`font-mono text-[var(--text-primary)] group-hover:text-accent transition-colors ${name ? "text-[9px] text-[var(--text-muted)]" : ""}`}>
            {truncateWallet(wallet)}
          </span>
        </span>
        {status === "verified" && (
          <span className="flex h-4 items-center rounded bg-[var(--profit-green)]/10 px-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--profit-green)]">
            V
          </span>
        )}
        {status === "tracked" && (
          <span className="flex h-4 items-center rounded bg-[var(--text-muted)]/10 px-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            T
          </span>
        )}
        {status === "arena_baseline" && (
          <span className="flex h-4 items-center rounded bg-amber-500/10 px-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
            A
          </span>
        )}
        {status === "arena_enforced" && (
          <span className="flex h-4 items-center gap-0.5 rounded bg-orange-500/10 px-1.5 text-[9px] font-bold uppercase tracking-wider text-orange-400">
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
            </svg>
            B
          </span>
        )}
      </span>

      <span className="flex items-center justify-center">
        <ArchetypeBadge archetype={archetype as Archetype} />
      </span>

      <span className="flex items-center justify-center">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${GRADE_COLORS[trust_grade]} ${GRADE_BG[trust_grade]}`}>
          {trust_grade}
        </span>
      </span>

      <span className="font-mono tabular-nums text-center text-[var(--text-primary)]">
        {overall_rating}
      </span>

      <span className="font-mono tabular-nums text-center text-[var(--text-primary)]">
        {winPct}%
      </span>

      <span className={`font-mono tabular-nums text-center ${pnl.isPositive ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"}`}>
        {pnl.text}
      </span>

      <span className="flex items-center justify-center">
        <SparklineCell data={sparkline_data ?? []} />
      </span>

      <span className="font-mono tabular-nums text-center text-[var(--text-primary)]">
        {discipline}
      </span>

      <span className="font-mono tabular-nums text-center text-[var(--text-muted)]">
        {lockout_count}
      </span>

      <span className="font-mono tabular-nums text-center text-[var(--text-primary)]">
        {total_trades}
      </span>

      <span className="font-mono tabular-nums text-center text-[var(--text-muted)]">
        {trading_days}d
      </span>

      <span className="font-mono tabular-nums text-center text-[var(--text-primary)]">
        {trust_score}
      </span>
    </Link>
  );
}
