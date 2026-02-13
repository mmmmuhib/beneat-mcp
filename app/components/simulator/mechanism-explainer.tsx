"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

const ROWS = [
  {
    problem: "Agents hallucinate trades from flawed analysis",
    solution: "MCP tools gate every order — stop-loss, cooldown & daily lockout enforced before execution",
  },
  {
    problem: "Loss-anchored escalation — agent over-weights recent losses and over-trades to recover",
    solution: "Tilt detection auto-scales position size down in real time",
  },
  {
    problem: "No sizing discipline — one bad trade wipes the account",
    solution: "Kelly-optimal sizing with confidence calibration caps exposure per trade",
  },
];

const sectionId = "mechanism-explainer-content";

export function MechanismExplainer() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-6 border border-[var(--accent-orange)]/20 bg-[var(--bg-secondary)]">
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={sectionId}
        aria-label={expanded ? "Collapse how it works section" : "Expand how it works section"}
        className="focus-ring flex w-full items-center justify-between bg-[var(--accent-orange)]/[0.03] px-5 py-3 text-left"
      >
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" aria-hidden="true" />
            <span className="text-terminal-heading text-sm">
              How It Works
            </span>
          </div>
          <span className="text-terminal-label text-[10px] opacity-70">
            Problem → Enforcement mechanism
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div id={sectionId} className="border-t border-[var(--accent-orange)]/15">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 border-b border-border/30 bg-[var(--bg-primary)]/40 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--loss-red)]" aria-hidden="true" />
              <span className="text-terminal-heading text-xs">
                Without Beneat
              </span>
            </div>
            <span aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--profit-green)]" aria-hidden="true" />
              <span className="text-terminal-heading text-xs">
                With Beneat MCP
              </span>
            </div>
          </div>

          {/* Rows */}
          {ROWS.map((row, i) => (
            <div
              key={row.problem}
              className={`grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 px-5 py-3 ${
                i < ROWS.length - 1 ? "border-b border-border/20" : ""
              }`}
            >
              <p className="text-[0.8125rem] text-[var(--text-secondary)] leading-relaxed">
                {row.problem}
              </p>
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]/50"
                aria-hidden="true"
              />
              <p className="text-[0.8125rem] text-[var(--text-primary)] leading-relaxed">
                {row.solution}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
