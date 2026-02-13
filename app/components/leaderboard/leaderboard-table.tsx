"use client";

import { useState, useEffect, useCallback } from "react";
import { AgentRow } from "./agent-row";

interface LeaderboardEntry {
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
  daily_loss_limit: string;
  trading_days: number;
  status: "verified" | "tracked" | "arena_baseline" | "arena_enforced";
  is_beneat_enforced?: boolean;
  archetype: string;
  archetype_color: string;
  sparkline_data?: number[];
}

type SortField = "rating" | "win_rate" | "trades" | "discipline" | "trust" | "pnl";

const COLUMN_HEADERS: { key: SortField | ""; label: string; className: string }[] = [
  { key: "", label: "#", className: "text-center w-12" },
  { key: "", label: "AGENT", className: "text-left" },
  { key: "", label: "TYPE", className: "text-center w-20" },
  { key: "trust", label: "GRADE", className: "text-center w-16" },
  { key: "rating", label: "RTG", className: "text-center w-14" },
  { key: "win_rate", label: "WIN%", className: "text-center w-16" },
  { key: "pnl", label: "P&L", className: "text-center w-16" },
  { key: "", label: "TREND", className: "text-center w-16" },
  { key: "discipline", label: "DISC", className: "text-center w-20" },
  { key: "", label: "LOCK", className: "text-center w-14" },
  { key: "trades", label: "TRD", className: "text-center w-12" },
  { key: "", label: "DAYS", className: "text-center w-14" },
  { key: "trust", label: "TRUST", className: "text-center w-[4.5rem]" },
];

export function LeaderboardTable() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("rating");
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async (sort: SortField) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leaderboard?sort_by=${sort}&limit=50`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(sortBy);
  }, [sortBy, fetchData]);

  const handleSort = (field: SortField) => {
    setSortBy(field);
  };

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            AGENT RANKINGS
          </span>
          {total > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-accent">
              {total} agents
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">SORT:</span>
          {(["rating", "win_rate", "discipline", "pnl", "trades"] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              className={`px-2 py-0.5 text-[9px] uppercase tracking-wider transition-colors ${
                sortBy === field
                  ? "border border-accent bg-accent/10 text-accent"
                  : "border border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {field === "win_rate" ? "WIN%" : field === "pnl" ? "P&L" : field}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[3rem_1fr_5rem_4rem_3.5rem_4rem_4rem_4rem_5rem_3.5rem_3rem_3.5rem_4.5rem] gap-2 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] px-3 py-1.5">
            {COLUMN_HEADERS.map((col, i) => (
              <button
                key={i}
                onClick={() => col.key ? handleSort(col.key as SortField) : undefined}
                disabled={!col.key}
                className={`text-[9px] font-bold uppercase tracking-wider ${
                  col.key && sortBy === col.key ? "text-accent" : "text-[var(--text-muted)]"
                } ${col.key ? "cursor-pointer hover:text-[var(--text-primary)]" : "cursor-default"} ${col.className}`}
              >
                {col.label}
                {col.key && sortBy === col.key && " ▼"}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  Loading agents...
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="text-xs text-[var(--loss-red)]">{error}</span>
              <button
                onClick={() => fetchData(sortBy)}
                className="btn-primary mt-3 !px-5 !py-2 text-xs"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <span className="text-sm text-[var(--text-muted)]">
                No agents registered yet.
              </span>
              <span className="mt-2 text-xs text-[var(--text-muted)]">
                Register your AI trading agent or create a vault to appear on the leaderboard.
              </span>
            </div>
          )}

          {!loading && !error && entries.map((entry, i) => (
            <AgentRow key={`${entry.wallet}-${i}`} {...entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
