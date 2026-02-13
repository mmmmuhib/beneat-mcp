"use client";

import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  Target,
} from "lucide-react";
import type { MonteCarloFullResult } from "./simulation-logic";
import { InfoTip } from "../ui/info-tip";

interface MonteCarloStatsProps {
  result: MonteCarloFullResult;
  scenarioCount: number;
  compact?: boolean;
}

interface StatItemProps {
  label: string;
  value: string;
  subValue?: string;
  isPositive?: boolean;
  isNegative?: boolean;
  icon?: React.ReactNode;
  tip?: string;
  tipAlign?: "center" | "left" | "right";
}

function StatItem({
  label,
  value,
  subValue,
  isPositive,
  isNegative,
  icon,
  tip,
  tipAlign,
}: StatItemProps) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-[var(--text-muted)]" aria-hidden="true">{icon}</span>}
      <div>
        <dt className="text-terminal-label">
          {tip ? <InfoTip tip={tip} align={tipAlign}>{label}</InfoTip> : label}
        </dt>
        <dd
          className={`text-terminal-value text-base ${
            isPositive
              ? "text-status-safe"
              : isNegative
                ? "text-status-danger"
                : "text-foreground"
          }`}
        >
          {value}
        </dd>
        {subValue && (
          <div className="text-terminal-label">{subValue}</div>
        )}
      </div>
    </div>
  );
}

export function MonteCarloStats({
  result,
  scenarioCount,
  compact = false,
}: MonteCarloStatsProps) {
  const { stats } = result;
  const isProfitableMajority = stats.profitablePercent >= 50;
  const isMedianPositive = stats.medianReturn >= 0;

  if (compact) {
    return (
      <div className="grid grid-cols-3 border-b border-border/30 bg-[var(--bg-primary)]/30">
        <div className="flex flex-col items-center gap-0.5 border-r border-border/20 px-3 py-3">
          <span className="flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3 shrink-0 opacity-40" style={{ color: isProfitableMajority ? "var(--profit-green)" : "var(--loss-red)" }} aria-hidden="true" />
            <InfoTip tip="Percentage of simulated paths ending positive." align="left">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Profitable</span>
            </InfoTip>
          </span>
          <span
            className={`font-mono text-sm tabular-nums ${
              isProfitableMajority ? "text-status-safe" : "text-status-danger"
            }`}
          >
            {stats.profitablePercent.toFixed(0)}%
          </span>
        </div>

        <div className="flex flex-col items-center gap-0.5 border-r border-border/20 px-3 py-3">
          <span className="flex items-center gap-1.5">
            {isMedianPositive ? (
              <TrendingUp className="h-3 w-3 shrink-0 text-status-safe opacity-40" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0 text-status-danger opacity-40" aria-hidden="true" />
            )}
            <InfoTip tip="Middle outcome across all paths.">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Median</span>
            </InfoTip>
          </span>
          <span
            className={`font-mono text-sm tabular-nums ${
              isMedianPositive ? "text-status-safe" : "text-status-danger"
            }`}
          >
            {isMedianPositive ? "+" : ""}{stats.medianReturn.toFixed(1)}%
          </span>
        </div>

        <div className="flex flex-col items-center gap-0.5 px-3 py-3">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0 text-text-muted opacity-40" aria-hidden="true" />
            <InfoTip tip="Average largest decline from peak balance." align="right">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Avg DD</span>
            </InfoTip>
          </span>
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            -{stats.avgMaxDrawdown.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-6 border border-border/50 bg-background/20 p-5 sm:grid-cols-4">
      <StatItem
        label="Profitable Scenarios"
        tip="Percentage of simulated paths that ended with a positive return."
        tipAlign="left"
        value={`${stats.profitablePercent.toFixed(0)}%`}
        subValue={`${stats.profitableCount} of ${scenarioCount}`}
        isPositive={isProfitableMajority}
        isNegative={!isProfitableMajority}
        icon={<Target className="h-4 w-4" />}
      />

      <StatItem
        label="Median Final Return"
        tip="The middle outcome — half of scenarios did better, half worse."
        value={`${isMedianPositive ? "+" : ""}${stats.medianReturn.toFixed(1)}%`}
        isPositive={isMedianPositive}
        isNegative={!isMedianPositive}
        icon={
          isMedianPositive ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )
        }
      />

      <StatItem
        label="Best / Worst Case"
        tip="Most and least favorable outcomes from the simulation."
        value={`+${stats.bestCase.toFixed(1)}% / ${stats.worstCase.toFixed(1)}%`}
        icon={<BarChart3 className="h-4 w-4" />}
      />

      <StatItem
        label="Avg Max Drawdown"
        tip="Average largest peak-to-trough decline. Lower is better — means less capital at risk."
        tipAlign="right"
        value={`-${stats.avgMaxDrawdown.toFixed(1)}%`}
        isNegative={stats.avgMaxDrawdown > 25}
        icon={<AlertTriangle className="h-4 w-4" />}
      />
    </dl>
  );
}
