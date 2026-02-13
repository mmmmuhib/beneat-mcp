"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AgentTradeProfile } from "../lib/trade-analyzer";
import { AgentCard } from "../components/simulator/agent-card";
import { EnforcementComparison } from "../components/simulator/enforcement-comparison";
import { MechanismExplainer } from "../components/simulator/mechanism-explainer";
import { runEnforcementComparison } from "../components/simulator/enforcement-simulation";
import { InfoTip } from "../components/ui/info-tip";

interface ApiAgent extends Omit<AgentTradeProfile, "equityCurve"> {
  equityCurve: number[];
}

export default function LabPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen pt-20">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-orange)]" />
            <span className="text-terminal-label">Loading...</span>
          </div>
        </div>
      </div>
    }>
      <LabContent />
    </Suspense>
  );
}

function LabContent() {
  const [agents, setAgents] = useState<ApiAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const comparisonRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selectedIdx = Number(searchParams.get("agent") ?? 0);

  const setSelectedIdx = useCallback(
    (idx: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("agent", String(idx));
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  useEffect(() => {
    fetch("/api/lab")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data.agents ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAgentSelect = useCallback(
    (idx: number) => {
      setSelectedIdx(idx);
      setTimeout(() => {
        comparisonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    },
    [setSelectedIdx]
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (agents.length === 0) return;
      let next = selectedIdx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        next = (selectedIdx + 1) % agents.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        next = (selectedIdx - 1 + agents.length) % agents.length;
      }
      if (next !== selectedIdx) {
        handleAgentSelect(next);
        const cards = gridRef.current?.querySelectorAll<HTMLElement>("[role='radio']");
        cards?.[next]?.focus();
      }
    },
    [agents.length, selectedIdx, handleAgentSelect]
  );

  const selected = agents[selectedIdx] as AgentTradeProfile | undefined;

  const heroStats = useMemo(() => {
    if (agents.length === 0) return null;

    let totalDollarsSaved = 0;
    let totalLockouts = 0;
    let totalRevengePrevented = 0;
    let profitableWithBeneat = 0;
    let totalSharpeDelta = 0;

    for (const agent of agents) {
      const { baseline, enforced, interventions } = runEnforcementComparison(
        agent as AgentTradeProfile,
        50,
        agent.startingEquity
      );

      totalSharpeDelta +=
        (enforced.stats.sharpeRatio ?? 0) - (baseline.stats.sharpeRatio ?? 0);

      const equityDelta =
        ((enforced.stats.medianReturn - baseline.stats.medianReturn) / 100) *
        agent.startingEquity;
      totalDollarsSaved += Math.max(0, equityDelta);

      for (const iv of interventions) {
        if (iv.type === "lockout") totalLockouts++;
        if (iv.type === "cooldown") totalRevengePrevented++;
      }

      if (enforced.stats.profitablePercent > 50) profitableWithBeneat++;
    }

    return {
      totalDollarsSaved,
      totalLockouts,
      totalRevengePrevented,
      profitableWithBeneat,
      totalAgents: agents.length,
      avgSharpeImprovement: totalSharpeDelta / agents.length,
    };
  }, [agents]);

  return (
    <div className="relative min-h-screen pt-20 overflow-hidden">
      {/* Orange gradient background - spanning full width at top and bottom */}
      <div className="absolute top-0 left-0 right-0 h-[600px] bg-orange-500/12 rounded-full blur-[150px] pointer-events-none -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 right-0 h-[600px] bg-orange-500/12 rounded-full blur-[150px] pointer-events-none translate-y-1/2" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="mb-10">
          <h1 className="text-terminal-hero">
            What If Every Agent Followed The Rules?
          </h1>
          <p className="text-terminal-body mt-2">
            See how Beneat MCP enforces quantitative risk measures on AI agent trades
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Data from <a href="https://nof1.ai/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--accent-orange)] transition-colors">Alpha Arena (nof1.ai)</a> AI trading agents. Enforcement rules powered by the Beneat MCP Server — 19 tools for risk management, coaching, semantic routing, and behavioral analytics.
          </p>
        </header>

        {loading && (
          <div className="border border-[var(--accent-orange)]/20 bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-3 bg-[var(--accent-orange)]/[0.03] px-5 py-6">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-orange)]" />
              <span className="text-terminal-label">
                Loading agent trade data...
              </span>
            </div>
          </div>
        )}

        {!loading && agents.length === 0 && (
          <div className="border border-[var(--accent-orange)]/20 bg-[var(--bg-secondary)]">
            <div className="border-b border-[var(--accent-orange)]/15 bg-[var(--accent-orange)]/[0.03] px-5 py-3">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-orange)]" />
                <span className="text-terminal-heading text-sm">
                  No Data
                </span>
              </div>
            </div>
            <div className="px-5 py-5 bg-[var(--bg-primary)]/40">
              <p className="text-terminal-body">
                Drop CSV trade history files into{" "}
                <code className="text-terminal-value text-[var(--accent-orange)]">
                  app/data/agent-trades/
                </code>{" "}
                to get started.
              </p>
              <p className="mt-2 text-terminal-label">
                Expected format: filled_at, symbol, side, shares, price, amount,
                reason, agent_public_id, run_public_id, experiment_run_public_id
              </p>
            </div>
          </div>
        )}

        {!loading && agents.length > 0 && (
          <>
            <div className="mb-8 border border-[var(--accent-cyan)]/20 bg-[var(--bg-secondary)]">
              {/* Header */}
              <div className="border-b border-[var(--accent-cyan)]/15 bg-[var(--accent-cyan)]/[0.03] px-5 py-3">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-cyan)] animate-glow-pulse" aria-hidden="true" />
                  <span className="text-terminal-heading text-sm">
                    Select Agent
                  </span>
                </div>
                <span className="text-terminal-label text-[10px] opacity-70">
                  {agents.length} agents loaded · click to run enforcement
                </span>
              </div>

              <div
                ref={gridRef}
                role="radiogroup"
                aria-label="Select an agent to analyze"
                onKeyDown={handleGridKeyDown}
                className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3 bg-[var(--bg-primary)]/40"
              >
                {agents.map((agent, i) => (
                  <AgentCard
                    key={agent.name}
                    profile={agent as AgentTradeProfile}
                    isSelected={i === selectedIdx}
                    onClick={() => handleAgentSelect(i)}
                    tabIndex={i === selectedIdx ? 0 : -1}
                  />
                ))}
              </div>
            </div>

            {selected && (
              <div ref={comparisonRef} className="animate-reveal-up mt-8">
                <EnforcementComparison
                  profile={selected}
                  key={selected.name}
                />
              </div>
            )}

            {heroStats && (
              <section
                aria-labelledby="hero-stats-heading"
                className="mt-10 border border-[var(--accent-orange)]/20 bg-[var(--bg-secondary)]"
              >
                {/* Header */}
                <div className="border-b border-[var(--accent-orange)]/15 bg-[var(--accent-orange)]/[0.03] px-5 py-3">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="h-2 w-2 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" aria-hidden="true" />
                    <h2 id="hero-stats-heading" className="text-terminal-heading text-sm">
                      Aggregate Impact
                    </h2>
                  </div>
                  <span className="text-terminal-label text-[10px] opacity-70">
                    Combined enforcement results across all {heroStats.totalAgents} agents
                  </span>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4">
                  <HeroStat
                    label="Losses Prevented"
                    tip="Estimated losses prevented by enforcement rules across all agents."
                    tipAlign="left"
                    value={`$${heroStats.totalDollarsSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  />
                  <HeroStat
                    label="Bad Trades Blocked"
                    tip="Trades blocked by cooldown and daily lockout — impulsive trades taken to recover losses."
                    value={String(heroStats.totalRevengePrevented + heroStats.totalLockouts)}
                  />
                  <HeroStat
                    label="Agents → Profitable"
                    tip="Agents where enforcement pushes simulated win scenarios above 50%."
                    value={`${heroStats.profitableWithBeneat} / ${heroStats.totalAgents}`}
                  />
                  <HeroStat
                    label="Avg Sharpe Δ"
                    tip="Average increase in risk-adjusted return across all agents."
                    tipAlign="right"
                    value={`+${heroStats.avgSharpeImprovement.toFixed(2)}`}
                  />
                </dl>
              </section>
            )}

            <div className="mt-10">
              <MechanismExplainer />
            </div>
          </>
        )}

        <footer className="mt-12 border-t border-[var(--border-color)] pt-3 pb-2">
          <p className="text-[0.625rem] text-[var(--text-muted)] leading-tight">
            Trade histories and agent performance sourced from <a href="https://nof1.ai/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--accent-orange)] transition-colors">nof1.ai</a>. Results are illustrative only.
          </p>
        </footer>
      </div>
    </div>
  );
}

function HeroStat({ label, value, tip, tipAlign }: { label: string; value: string; tip?: string; tipAlign?: "center" | "left" | "right" }) {
  return (
    <div className="flex flex-col items-center gap-1 border-r border-border/20 last:border-r-0 px-4 py-4">
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {tip ? <InfoTip tip={tip} align={tipAlign}>{label}</InfoTip> : label}
      </dt>
      <dd className="font-mono text-xl tabular-nums text-[var(--accent-orange)]">
        {value}
      </dd>
    </div>
  );
}
