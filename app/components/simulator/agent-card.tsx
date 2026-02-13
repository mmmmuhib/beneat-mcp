"use client";

import { useMemo } from "react";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AgentTradeProfile } from "../../lib/trade-analyzer";
import { classifyPersonality } from "../../lib/agent-coaching";
import { InfoTip } from "../ui/info-tip";
import { AgentIcon } from "./agent-icon";

interface AgentCardProps {
  profile: AgentTradeProfile;
  isSelected: boolean;
  onClick: () => void;
  tabIndex?: number;
}

const SEVERITY_BORDER: Record<string, string> = {
  green: "var(--profit-green)",
  yellow: "var(--accent-amber)",
  red: "var(--loss-red)",
};

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  green: <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--profit-green)" }} aria-hidden="true" />,
  yellow: <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--accent-amber)" }} aria-hidden="true" />,
  red: <ShieldAlert className="h-3.5 w-3.5" style={{ color: "var(--loss-red)" }} aria-hidden="true" />,
};

export function AgentCard({ profile, isSelected, onClick, tabIndex = 0 }: AgentCardProps) {
  const isPositive = profile.totalReturnPct >= 0;
  const personality = useMemo(() => classifyPersonality(profile), [profile]);
  const borderColor = SEVERITY_BORDER[personality.severity];
  const severityLabel = personality.severity === "green" ? "low risk" : personality.severity === "yellow" ? "moderate risk" : "high risk";

  return (
    <button
      role="radio"
      aria-checked={isSelected}
      aria-label={`${profile.name}, ${profile.totalTrades} trades, ${personality.archetype}, ${severityLabel}`}
      tabIndex={tabIndex}
      onClick={onClick}
      className={`focus-ring group flex min-w-[200px] flex-col gap-3 border-l-2 border p-6 text-left transition-all ${
        isSelected
          ? "border-[var(--accent-orange)] bg-[var(--accent-orange)]/15 shadow-lg scale-[1.02]"
          : "border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--border-hover)]"
      }`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-center gap-2">
        {isSelected && (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" aria-hidden="true" />
        )}
        <AgentIcon name={profile.name} size={18} />
        <span className="text-terminal-body truncate text-[var(--text-primary)]">
          {profile.name}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {SEVERITY_ICON[personality.severity]}
        <InfoTip tip="Trading personality identified from patterns. Green = disciplined, yellow = moderate risk, red = high risk.">
          <span
            className="text-terminal-label px-1.5 py-0.5"
            style={{
              color: borderColor,
              backgroundColor: borderColor + "15",
              border: `1px solid ${borderColor}30`,
            }}
          >
            {personality.archetype}
          </span>
        </InfoTip>
      </div>

      <span
        className={`text-terminal-value text-2xl ${
          isPositive ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"
        }`}
      >
        {isPositive ? "+" : ""}
        {profile.totalReturnPct.toFixed(1)}%
      </span>

      <MiniCurve curve={profile.equityCurve} isPositive={isPositive} name={profile.name} />
    </button>
  );
}

function MiniCurve({
  curve,
  isPositive,
  name,
}: {
  curve: number[];
  isPositive: boolean;
  name: string;
}) {
  if (curve.length < 2) return null;

  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const range = max - min || 1;
  const h = 28;
  const w = 140;

  const startVal = curve[0];
  const endVal = curve[curve.length - 1];
  const trendLabel = endVal >= startVal ? "upward" : "downward";

  const points = curve
    .map((v, i) => {
      const x = ((i / (curve.length - 1)) * w).toFixed(1);
      const y = (h - ((v - min) / range) * h).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      className="mt-1"
      role="img"
      aria-label={`${name} equity curve trending ${trendLabel}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? "var(--profit-green)" : "var(--loss-red)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        opacity={0.7}
      />
    </svg>
  );
}
