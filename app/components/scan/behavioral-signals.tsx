"use client";

import type { AgentAnalytics } from "../../lib/wallet-analytics";

interface BehavioralSignalsProps {
  analytics: AgentAnalytics;
}

function SeverityBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full bg-[var(--bg-primary)]">
      <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  none: "var(--profit-green)",
  mild: "var(--accent-orange)",
  moderate: "#f59e0b",
  severe: "var(--loss-red)",
};

const TREND_ICONS: Record<string, string> = {
  improving: "\u2191",
  degrading: "\u2193",
  stable: "\u2192",
};

const TREND_COLORS: Record<string, string> = {
  improving: "var(--profit-green)",
  degrading: "var(--loss-red)",
  stable: "var(--text-muted)",
};

export function BehavioralSignals({ analytics }: BehavioralSignalsProps) {
  const tiltColor = SEVERITY_COLORS[analytics.tilt.severity];
  const revengeRatio =
    analytics.revenge_hallucination.revenge_trade_count > 0
      ? analytics.revenge_hallucination.revenge_trade_count / Math.max(1, analytics.total_trades)
      : 0;

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Behavioral Signals
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Tilt
            </span>
            <span
              className="text-[10px] font-bold uppercase"
              style={{ color: tiltColor }}
            >
              {analytics.tilt.severity}
            </span>
          </div>
          <SeverityBar
            value={
              analytics.tilt.severity === "severe" ? 1
              : analytics.tilt.severity === "moderate" ? 0.66
              : analytics.tilt.severity === "mild" ? 0.33
              : 0.05
            }
            color={tiltColor}
          />
          {analytics.tilt.detected && (
            <div className="mt-1 text-[9px] text-[var(--text-muted)]">
              Win rate drops {((analytics.tilt.baseline_win_rate - analytics.tilt.post_streak_win_rate) * 100).toFixed(0)}% after losses
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Revenge
            </span>
            <span className="font-mono text-xs text-[var(--text-primary)]">
              {analytics.revenge_hallucination.revenge_trade_count}
            </span>
          </div>
          <SeverityBar
            value={revengeRatio}
            max={0.3}
            color={analytics.revenge_hallucination.revenge_is_worse ? "var(--loss-red)" : "var(--profit-green)"}
          />
          {analytics.revenge_hallucination.revenge_trade_count > 0 && (
            <div className="mt-1 text-[9px] text-[var(--text-muted)]">
              {(analytics.revenge_hallucination.revenge_win_rate * 100).toFixed(0)}% win rate vs {(analytics.revenge_hallucination.baseline_win_rate * 100).toFixed(0)}% baseline
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Overconfidence
            </span>
            <span className="font-mono text-xs text-[var(--text-primary)]">
              {(analytics.overconfidence_index * 100).toFixed(0)}%
            </span>
          </div>
          <SeverityBar
            value={analytics.overconfidence_index}
            max={0.4}
            color={analytics.overconfidence_index > 0.15 ? "#f59e0b" : "var(--profit-green)"}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Trend
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: TREND_COLORS[analytics.trend.direction] }}
            >
              {TREND_ICONS[analytics.trend.direction]}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
            <span>Recent: {(analytics.trend.recent_win_rate * 100).toFixed(0)}%</span>
            <span>Historic: {(analytics.trend.historical_win_rate * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
