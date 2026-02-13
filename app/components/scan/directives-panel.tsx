"use client";

import type { AnalyticsDirective } from "../../lib/wallet-analytics";

interface DirectivesPanelProps {
  directives: AnalyticsDirective[];
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  critical: {
    bg: "bg-red-500/5",
    border: "border-red-500/30",
    text: "text-[var(--loss-red)]",
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  warning: {
    bg: "bg-amber-500/5",
    border: "border-amber-500/30",
    text: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  info: {
    bg: "bg-cyan-500/5",
    border: "border-cyan-500/30",
    text: "text-[var(--accent-cyan)]",
    badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
};

const TYPE_LABELS: Record<string, string> = {
  reduce_size: "SIZE",
  avoid_market: "AVOID",
  increase_cooldown: "COOLDOWN",
  restrict_trades: "RESTRICT",
  focus_market: "FOCUS",
  pause_trading: "PAUSE",
};

export function DirectivesPanel({ directives }: DirectivesPanelProps) {
  if (directives.length === 0) return null;

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--loss-red)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Risk Directives
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">
          {directives.length}
        </span>
      </div>

      <div className="space-y-2">
        {directives.map((d, i) => {
          const style = SEVERITY_STYLES[d.severity];
          return (
            <div
              key={i}
              className={`border p-3 ${style.bg} ${style.border}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${style.badge}`}
                >
                  {d.severity}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {TYPE_LABELS[d.type] ?? d.type}
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${style.text}`}>
                {d.reason}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
