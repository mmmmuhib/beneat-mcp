"use client";

import { useMemo, useState, useCallback } from "react";
import type { AgentTradeProfile } from "../../lib/trade-analyzer";
import {
  runEnforcementComparison,
  type MethodologyLabel,
} from "./enforcement-simulation";
import type { MonteCarloFullResult, MonteCarloStats } from "./simulation-logic";
import { MonteCarloChart, MonteCarloLegend } from "./monte-carlo-chart";
import { MonteCarloStats as MonteCarloStatsComponent } from "./monte-carlo-stats";
import { BehavioralTimeline } from "./behavioral-timeline";
import { CoachingPanel } from "./coaching-panel";
import { DecisionDiff } from "./decision-diff";
import { RotateCcw, Loader2 } from "lucide-react";
import { InfoTip } from "../ui/info-tip";
import { AgentIcon } from "./agent-icon";

interface EnforcementComparisonProps {
  profile: AgentTradeProfile;
}

const ITERATIONS = 100;

export function EnforcementComparison({
  profile,
}: EnforcementComparisonProps) {
  const [seed, setSeed] = useState(0);
  const [isRerunning, setIsRerunning] = useState(false);

  const rerun = useCallback(() => {
    setIsRerunning(true);
    setSeed((s) => s + 1);
    setTimeout(() => setIsRerunning(false), 50);
  }, []);

  const { baseline, enforced, methodology, interventions } = useMemo(() => {
    void seed;
    return runEnforcementComparison(profile, ITERATIONS, profile.startingEquity);
  }, [profile, seed]);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" aria-hidden="true" />
          <AgentIcon name={profile.name} size={22} />
          <span className="text-terminal-heading text-base">
            {profile.name}
          </span>
        </div>
        <button
          onClick={rerun}
          disabled={isRerunning}
          aria-label="Re-run simulation with new random seed"
          className="focus-ring flex items-center gap-2 border border-[var(--border-color)] px-3 py-1.5 text-terminal-label transition hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)] disabled:opacity-50"
        >
          {isRerunning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          Re-run
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <BaselinePanel
          result={baseline}
          startingEquity={profile.startingEquity}
          chartHeight={380}
          profile={profile}
        />
        <EnforcedPanel
          result={enforced}
          startingEquity={profile.startingEquity}
          chartHeight={380}
          profile={profile}
        />
      </div>

      <ImpactBar
        baseline={baseline.stats}
        enforced={enforced.stats}
        methodology={methodology}
      />

      <BehavioralTimeline
        interventions={interventions}
        totalTrades={profile.totalTrades}
        equityCurve={enforced.percentiles.median}
        startingEquity={profile.startingEquity}
      />

      <DecisionDiff
        interventions={interventions}
        startingEquity={profile.startingEquity}
      />

      <CoachingPanel profile={profile} />
    </div>
  );
}

function BaselinePanel({
  result,
  startingEquity,
  chartHeight = 380,
  profile,
}: {
  result: MonteCarloFullResult;
  startingEquity: number;
  chartHeight?: number;
  profile: AgentTradeProfile;
}) {
  return (
    <section
      aria-labelledby="baseline-heading"
      className="overflow-hidden border border-[var(--loss-red)]/20 bg-[var(--bg-secondary)]"
    >
      {/* Header — min-h keeps both panels aligned */}
      <div className="flex min-h-[5.5rem] flex-col justify-center border-b border-[var(--loss-red)]/15 bg-[var(--loss-red)]/[0.03] px-5 py-3">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--loss-red)]" aria-hidden="true" />
          <h3 id="baseline-heading" className="text-terminal-heading text-sm whitespace-nowrap">
            Without Beneat
          </h3>
        </div>
        <span className="text-terminal-label text-[10px] opacity-70">
          {profile.totalTrades} trades · WR {(profile.winRate * 100).toFixed(0)}% · Bootstrapped baseline ({ITERATIONS} paths)
        </span>
      </div>

      {/* Key metrics */}
      <MonteCarloStatsComponent result={result} scenarioCount={ITERATIONS} compact />

      {/* Chart */}
      <div className="p-4 bg-[var(--bg-primary)]/40">
        <MonteCarloChart
          result={result}
          startingBalance={startingEquity}
          height={chartHeight}
        />
      </div>

      <MonteCarloLegend result={result} startingBalance={startingEquity} />
    </section>
  );
}

function EnforcedPanel({
  result,
  startingEquity,
  chartHeight = 380,
  profile,
}: {
  result: MonteCarloFullResult;
  startingEquity: number;
  chartHeight?: number;
  profile: AgentTradeProfile;
}) {
  return (
    <section
      aria-labelledby="enforced-heading"
      className="overflow-hidden border border-[var(--profit-green)]/20 bg-[var(--bg-secondary)]"
    >
      {/* Header — min-h keeps both panels aligned */}
      <div className="flex min-h-[5.5rem] flex-col justify-center border-b border-[var(--profit-green)]/15 bg-[var(--profit-green)]/[0.03] px-5 py-3">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--profit-green)]" aria-hidden="true" />
          <h3 id="enforced-heading" className="text-terminal-heading text-sm whitespace-nowrap">
            With Beneat
          </h3>
        </div>
        <span className="text-terminal-label text-[10px] opacity-70">
          {profile.totalTrades} trades · WR {(profile.winRate * 100).toFixed(0)}% · Enforced ({ITERATIONS} paths)
        </span>
      </div>

      {/* Key metrics */}
      <MonteCarloStatsComponent result={result} scenarioCount={ITERATIONS} compact />

      {/* Chart */}
      <div className="p-4 bg-[var(--bg-primary)]/40">
        <MonteCarloChart
          result={result}
          startingBalance={startingEquity}
          height={chartHeight}
        />
      </div>

      <MonteCarloLegend result={result} startingBalance={startingEquity} />
    </section>
  );
}

function MethodologyBadge({ methodology }: { methodology: MethodologyLabel }) {
  const method =
    methodology.bootstrapMethod === "circular-block"
      ? `Block bootstrap (b=${methodology.blockSize})`
      : `IID bootstrap (< ${MIN_BLOCK_BOOTSTRAP_TRADES} trades)`;

  return (
    <span className="text-terminal-body">
      {method} · {methodology.iterations} iter · Rf={methodology.riskFreeRate * 100}% · slippage
    </span>
  );
}

const MIN_BLOCK_BOOTSTRAP_TRADES = 30;

function ImpactBar({
  baseline,
  enforced,
  methodology,
}: {
  baseline: MonteCarloStats;
  enforced: MonteCarloStats;
  methodology: MethodologyLabel;
}) {
  const sharpeDelta = (enforced.sharpeRatio ?? 0) - (baseline.sharpeRatio ?? 0);
  const medianDelta = enforced.medianReturn - baseline.medianReturn;
  const ddDelta = baseline.avgMaxDrawdown - enforced.avgMaxDrawdown;
  const profDelta = enforced.profitablePercent - baseline.profitablePercent;

  const deltas = [
    {
      label: "Sharpe",
      value: sharpeDelta >= 0 ? `+${sharpeDelta.toFixed(2)}` : sharpeDelta.toFixed(2),
      positive: sharpeDelta > 0,
      tip: "Change in risk-adjusted return. Higher = better returns per unit of volatility.",
    },
    {
      label: "Median",
      value: medianDelta >= 0 ? `+${medianDelta.toFixed(1)}%` : `${medianDelta.toFixed(1)}%`,
      positive: medianDelta > 0,
      tip: "Change in median simulation outcome.",
    },
    {
      label: "Drawdown",
      value: ddDelta >= 0 ? `−${ddDelta.toFixed(1)}%` : `+${Math.abs(ddDelta).toFixed(1)}%`,
      positive: ddDelta > 0,
      tip: "Reduction in max peak-to-trough decline. Lower = better.",
    },
    {
      label: "Profitable",
      value: profDelta >= 0 ? `+${profDelta.toFixed(0)}%` : `${profDelta.toFixed(0)}%`,
      positive: profDelta > 0,
      tip: "Change in percentage of scenarios ending above starting equity.",
    },
  ];

  return (
    <div
      className="border border-[var(--accent-orange)]/25 bg-gradient-to-r from-[var(--accent-orange)]/[0.04] to-transparent px-5 py-4"
      role="region"
      aria-label="Beneat enforcement impact"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <span className="flex shrink-0 items-center gap-2.5 text-[var(--accent-orange)]">
          <span className="h-2 w-2 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" aria-hidden="true" />
          <span className="text-sm font-light uppercase tracking-[0.25em]">Beneat&nbsp;Δ</span>
        </span>
        {deltas.map((d) => (
          <div key={d.label} className="flex shrink-0 flex-col">
            <InfoTip tip={d.tip}>
              <span className="text-terminal-label text-[10px]">{d.label}</span>
            </InfoTip>
            <span
              className={`font-mono text-sm tabular-nums tracking-wide ${
                d.positive ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"
              }`}
            >
              {d.value}
            </span>
          </div>
        ))}
        <span className="ml-auto hidden sm:block">
          <MethodologyBadge methodology={methodology} />
        </span>
      </div>
    </div>
  );
}
