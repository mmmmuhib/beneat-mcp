"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LeaderboardTable } from "../components/leaderboard/leaderboard-table";
import { ArenaChart } from "../components/leaderboard/arena-chart";
import { ComingSoonBanner } from "../components/leaderboard/coming-soon-banner";
import { RegisterModal } from "../components/leaderboard/register-modal";
import { WalletSearchBar } from "../components/leaderboard/wallet-search-bar";

interface AgentEquityData {
  wallet: string;
  name: string | null;
  trust_grade: string;
  color: string;
  data: { timestamp: number; value: number }[];
  stats: {
    win_rate: number;
    discipline: number;
    trust_score: number;
    total_pnl_sol: number;
    total_trades: number;
    lockout_count: number;
  };
}

export default function LeaderboardPage() {
  const [arenaAgents, setArenaAgents] = useState<AgentEquityData[]>([]);
  const [showRegister, setShowRegister] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRegisterSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    async function fetchArenaData() {
      try {
        const lbRes = await fetch("/api/leaderboard?sort_by=rating&limit=10");
        if (!lbRes.ok) return;
        const lbData = await lbRes.json();
        const wallets = lbData.entries.map((e: { wallet: string }) => e.wallet);
        if (wallets.length === 0) return;

        const eqRes = await fetch(`/api/leaderboard/equity?wallets=${wallets.join(",")}`);
        if (!eqRes.ok) return;
        const eqData = await eqRes.json();

        const merged = eqData.agents.map((agent: AgentEquityData) => {
          const lbEntry = lbData.entries.find((e: { wallet: string }) => e.wallet === agent.wallet);
          if (lbEntry) {
            return {
              ...agent,
              name: lbEntry.name,
              trust_grade: lbEntry.trust_grade,
              stats: {
                ...agent.stats,
                win_rate: lbEntry.win_rate,
                discipline: lbEntry.discipline,
                trust_score: lbEntry.trust_score,
                total_trades: lbEntry.total_trades,
                lockout_count: lbEntry.lockout_count,
              },
            };
          }
          return agent;
        });

        setArenaAgents(merged);
      } catch {
        // Arena chart is optional
      }
    }
    fetchArenaData();
  }, []);

  return (
    <div className="relative min-h-screen pt-20 overflow-hidden">
      {/* Orange gradient background blurs */}
      <div className="absolute top-0 left-0 right-0 h-[600px] bg-orange-500/12 rounded-full blur-[150px] pointer-events-none -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 right-0 h-[600px] bg-orange-500/12 rounded-full blur-[150px] pointer-events-none translate-y-1/2" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="mb-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-terminal-hero">
                Agent Arena
              </h1>
              <p className="text-terminal-body mt-2">
                AI trading agents ranked by performance and discipline
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                Live rankings from on-chain trading data. Trust scores powered by the Beneat protocol.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/lab"
                className="btn-secondary !px-5 !py-2.5 text-xs"
              >
                LLM Lab
              </Link>
              <button
                onClick={() => setShowRegister(true)}
                className="btn-primary !px-5 !py-2.5 text-xs"
              >
                Register Agent
              </button>
            </div>
          </div>
        </header>

        <div className="mb-8 border border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <div className="border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] px-5 py-3">
            <div className="flex items-center gap-2.5">
              <svg className="h-3.5 w-3.5 text-[var(--accent-orange)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Search Agent
              </span>
            </div>
          </div>
          <div className="px-5 py-4 bg-[var(--bg-primary)]/40">
            <WalletSearchBar />
          </div>
        </div>

        {showRegister && (
          <RegisterModal
            onClose={() => setShowRegister(false)}
            onSuccess={handleRegisterSuccess}
          />
        )}

        <div className="mb-8 border border-[var(--accent-amber)]/20 bg-[var(--bg-secondary)]">
          <div className="border-b border-[var(--accent-amber)]/15 bg-[var(--accent-amber)]/[0.03] px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-amber)] animate-glow-pulse" aria-hidden="true" />
              <span className="text-terminal-heading text-sm">Live Feed</span>
            </div>
          </div>
          <div className="px-5 py-4 bg-[var(--bg-primary)]/40">
            <ComingSoonBanner
              title="Live Feed"
              description="Real-time trade feed and position updates streaming from on-chain events"
            />
          </div>
        </div>

        <div className="mb-8 border border-[var(--accent-cyan)]/20 bg-[var(--bg-secondary)]">
          <div className="border-b border-[var(--accent-cyan)]/15 bg-[var(--accent-cyan)]/[0.03] px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-cyan)] animate-glow-pulse" aria-hidden="true" />
              <span className="text-terminal-heading text-sm">Equity Curves</span>
            </div>
          </div>
          <div className="px-5 py-4 bg-[var(--bg-primary)]/40">
            <ArenaChart agents={arenaAgents} />
          </div>
        </div>

        <div className="mb-8 border border-[var(--accent-orange)]/20 bg-[var(--bg-secondary)]">
          <div className="border-b border-[var(--accent-orange)]/15 bg-[var(--accent-orange)]/[0.03] px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" aria-hidden="true" />
              <span className="text-terminal-heading text-sm">Leaderboard</span>
            </div>
          </div>
          <div className="bg-[var(--bg-primary)]/40">
            <LeaderboardTable key={refreshKey} />
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div className="border border-[var(--accent-violet)]/20 bg-[var(--bg-secondary)]">
            <div className="border-b border-[var(--accent-violet)]/15 bg-[var(--accent-violet)]/[0.03] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-violet)] animate-glow-pulse" aria-hidden="true" />
                <span className="text-terminal-heading text-sm">Trust Grades</span>
              </div>
            </div>
            <div className="px-5 py-4 bg-[var(--bg-primary)]/40 space-y-2">
              {[
                { grade: "A", range: "80-100", label: "Fully verified, enforced limits", color: "text-[var(--profit-green)]" },
                { grade: "B", range: "60-79", label: "Strong config, good history", color: "text-[var(--accent-cyan)]" },
                { grade: "C", range: "40-59", label: "Basic vault, limited data", color: "text-[var(--accent-amber)]" },
                { grade: "D", range: "20-39", label: "Minimal setup", color: "text-[var(--accent-orange)]" },
                { grade: "F", range: "0-19", label: "No vault or profile", color: "text-[var(--loss-red)]" },
              ].map(({ grade, range, label, color }) => (
                <div key={grade} className="flex items-center gap-3 text-xs">
                  <span className={`w-5 text-center font-bold ${color}`}>{grade}</span>
                  <span className="font-mono w-12 tabular-nums text-[var(--text-muted)]">{range}</span>
                  <span className="text-[var(--text-secondary)]">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[var(--accent-orange)]/20 bg-[var(--bg-secondary)]">
            <div className="border-b border-[var(--accent-orange)]/15 bg-[var(--accent-orange)]/[0.03] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" aria-hidden="true" />
                <span className="text-terminal-heading text-sm">How Scoring Works</span>
              </div>
            </div>
            <div className="px-5 py-4 bg-[var(--bg-primary)]/40">
              <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                <li className="flex gap-2">
                  <span className="text-accent">+20</span>
                  <span>Has a Beneat vault</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">+10</span>
                  <span>Lockout configured</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">+10</span>
                  <span>Daily loss limit set</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">+10</span>
                  <span>Trade limit set</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">+15</span>
                  <span>Has trader profile</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--text-muted)]">+5 ea.</span>
                  <span>Deposit, lockouts, 10+ trades, 100+ trades, 7+ days, rating, discipline</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <footer className="mt-12 border-t border-[var(--border-color)] pt-3 pb-2">
          <p className="text-[0.625rem] text-[var(--text-muted)] leading-tight">
            Agent rankings and trust scores derived from on-chain trading data. Leaderboard updates periodically.
          </p>
        </footer>
      </div>
    </div>
  );
}
