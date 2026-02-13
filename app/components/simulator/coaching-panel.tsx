"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { line, curveLinearClosed } from "d3";
import type { AgentTradeProfile } from "../../lib/trade-analyzer";
import {
  computeCoaching,
  calibrateConfidence,
  type CoachingResult,
} from "../../lib/agent-coaching";
import Link from "next/link";
import { InfoTip } from "../ui/info-tip";

interface CoachingPanelProps {
  profile: AgentTradeProfile;
}

const STATE_COLORS: Record<string, string> = {
  normal: "var(--profit-green)",
  post_loss: "var(--accent-amber)",
  tilt: "var(--loss-red)",
  hot_streak: "var(--accent-cyan)",
  recovery: "var(--accent-violet)",
};

/* ------------------------------------------------------------------ */
/*  Radar / Spider chart helpers                                       */
/* ------------------------------------------------------------------ */

interface RadarDimension {
  axis: string;
  value: number;
  color: string;
  rawLabel: string;
}

function buildRadarData(coaching: CoachingResult): RadarDimension[] {
  const tiltNumeric: Record<string, number> = {
    none: 0,
    mild: 0.33,
    moderate: 0.66,
    severe: 1.0,
  };

  return [
    {
      axis: "TILT",
      value: tiltNumeric[coaching.tiltSeverity] ?? 0,
      color:
        coaching.tiltSeverity === "none"
          ? "#22c55e"
          : coaching.tiltSeverity === "mild"
            ? "#f59e0b"
            : "#ef4444",
      rawLabel: coaching.tiltSeverity,
    },
    {
      axis: "OVERCONF",
      value: Math.min(1, coaching.overconfidenceIndex / 0.4),
      color:
        coaching.overconfidenceIndex < 0.1
          ? "#22c55e"
          : coaching.overconfidenceIndex < 0.2
            ? "#f59e0b"
            : "#ef4444",
      rawLabel: `${(coaching.overconfidenceIndex * 100).toFixed(0)}%`,
    },
    {
      axis: "REVENGE",
      value: Math.min(1, coaching.revengeTradeRatio / 0.3),
      color:
        coaching.revengeTradeRatio < 0.1
          ? "#22c55e"
          : coaching.revengeTradeRatio < 0.2
            ? "#f59e0b"
            : "#ef4444",
      rawLabel: `${(coaching.revengeTradeRatio * 100).toFixed(0)}%`,
    },
    {
      axis: "KELLY",
      value:
        coaching.kellyFraction < 0
          ? 1.0
          : 1 - Math.min(1, coaching.kellyFraction / 0.25),
      color:
        coaching.kellyFraction < 0
          ? "#ef4444"
          : coaching.kellyFraction < 0.05
            ? "#f59e0b"
            : "#22c55e",
      rawLabel: `${(coaching.kellyFraction * 100).toFixed(1)}%`,
    },
    {
      axis: "CONF",
      value: 1 - coaching.confidenceAdjustment,
      color:
        coaching.confidenceAdjustment > 0.8
          ? "#22c55e"
          : coaching.confidenceAdjustment > 0.5
            ? "#f59e0b"
            : "#ef4444",
      rawLabel: `${(coaching.confidenceAdjustment * 100).toFixed(0)}%`,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  RadarChart sub-component (declarative D3 + framer-motion)          */
/* ------------------------------------------------------------------ */

const SIZE = 280;
const MARGIN = 52;
const RADIUS = (SIZE - MARGIN * 2) / 2;
const CENTER = SIZE / 2;
const RINGS = [0.25, 0.5, 0.75, 1.0];

function RadarChart({ coaching }: { coaching: CoachingResult }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const radarData = useMemo(() => buildRadarData(coaching), [coaching]);
  const numAxes = radarData.length;
  const angleSlice = (Math.PI * 2) / numAxes;

  // Compute all geometry as pure data
  const geometry = useMemo(() => {
    const dataPoints = radarData.map((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      return {
        x: CENTER + RADIUS * d.value * Math.cos(angle),
        y: CENTER + RADIUS * d.value * Math.sin(angle),
      };
    });

    // Closed path string via line + curveLinearClosed
    const lineGen = line<{ x: number; y: number }>()
      .x((p) => p.x)
      .y((p) => p.y)
      .curve(curveLinearClosed);
    const pathD = lineGen(dataPoints) ?? "";

    // Spoke endpoints (full radius)
    const spokes = radarData.map((_, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      return {
        x2: CENTER + RADIUS * Math.cos(angle),
        y2: CENTER + RADIUS * Math.sin(angle),
      };
    });

    // Axis label positions (outside the chart)
    const labels = radarData.map((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const labelRadius = RADIUS + 22;
      const lx = CENTER + labelRadius * Math.cos(angle);
      const ly = CENTER + labelRadius * Math.sin(angle);
      let anchor: "middle" | "start" | "end" = "middle";
      if (Math.cos(angle) > 0.3) anchor = "start";
      if (Math.cos(angle) < -0.3) anchor = "end";
      return { x: lx, y: ly, anchor, axis: d.axis, color: d.color };
    });

    // Value label positions (near data dots, pushed outward)
    const valueLabels = radarData.map((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const labelDist = RADIUS * d.value + 14;
      return {
        x: CENTER + labelDist * Math.cos(angle),
        y: CENTER + labelDist * Math.sin(angle),
        rawLabel: d.rawLabel,
        color: d.color,
      };
    });

    return { dataPoints, pathD, spokes, labels, valueLabels };
  }, [radarData, numAxes, angleSlice]);

  // Hash for re-animation on data change
  const dataHash = useMemo(
    () => radarData.map((d) => d.value.toFixed(3)).join(","),
    [radarData],
  );

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-[280px] h-auto"
      role="img"
      aria-label="Radar chart showing trading behavior metrics"
    >
      <defs>
        {/* Per-axis radial gradients for dot glow */}
        {radarData.map((d, i) => (
          <radialGradient key={`glow-${i}`} id={`dotGlow-${i}`}>
            <stop offset="0%" stopColor={d.color} stopOpacity="0.6" />
            <stop offset="50%" stopColor={d.color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={d.color} stopOpacity="0" />
          </radialGradient>
        ))}
        {/* Polygon glow filter */}
        <filter id="polygonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <motion.g key={dataHash}>
        {/* Layer 1: Concentric reference rings */}
        {RINGS.map((pct) => (
          <circle
            key={`ring-${pct}`}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS * pct}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        ))}

        {/* Layer 2: Percentage labels at 12 o'clock */}
        {RINGS.map((pct) => (
          <text
            key={`pct-${pct}`}
            x={CENTER}
            y={CENTER - RADIUS * pct - 3}
            textAnchor="middle"
            fill="rgba(255,255,255,0.15)"
            fontSize={8}
          >
            {pct * 100}%
          </text>
        ))}

        {/* Layer 3: Axis spoke lines */}
        {geometry.spokes.map((s, i) => (
          <line
            key={`spoke-${i}`}
            x1={CENTER}
            y1={CENTER}
            x2={s.x2}
            y2={s.y2}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Layer 4: Data polygon path — animated pathLength */}
        <motion.path
          d={geometry.pathD}
          fill="rgba(249, 115, 22, 0.12)"
          stroke="rgba(249, 115, 22, 0.6)"
          strokeWidth={2}
          filter="url(#polygonGlow)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />

        {/* Layer 5a: Glow halos behind data dots */}
        {geometry.dataPoints.map((pt, i) => (
          <motion.circle
            key={`glow-${i}`}
            cx={pt.x}
            cy={pt.y}
            fill={`url(#dotGlow-${i})`}
            initial={{ r: 0, opacity: 0 }}
            animate={{
              r: hoveredIndex === i ? 18 : 12,
              opacity: hoveredIndex === i ? 1 : 0.8,
            }}
            transition={
              hoveredIndex === i
                ? { type: "spring", stiffness: 300, damping: 15 }
                : {
                    delay: 0.8 + i * 0.08,
                    type: "spring",
                    stiffness: 200,
                    damping: 12,
                  }
            }
          />
        ))}

        {/* Layer 5b: Data dots — spring from center */}
        {geometry.dataPoints.map((pt, i) => (
          <motion.circle
            key={`dot-${i}`}
            fill={radarData[i].color}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={1.5}
            style={{ cursor: "pointer" }}
            initial={{ cx: CENTER, cy: CENTER, r: 0 }}
            animate={{
              cx: pt.x,
              cy: pt.y,
              r: hoveredIndex === i ? 7 : 5,
            }}
            transition={{
              cx: {
                delay: 0.8 + i * 0.08,
                type: "spring",
                stiffness: 200,
                damping: 12,
              },
              cy: {
                delay: 0.8 + i * 0.08,
                type: "spring",
                stiffness: 200,
                damping: 12,
              },
              r:
                hoveredIndex === i
                  ? { type: "spring", stiffness: 400, damping: 15 }
                  : {
                      delay: 0.8 + i * 0.08,
                      type: "spring",
                      stiffness: 200,
                      damping: 12,
                    },
            }}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}

        {/* Layer 6: Axis labels — fade in, highlight on hover */}
        {geometry.labels.map((lbl, i) => (
          <motion.text
            key={`label-${i}`}
            x={lbl.x}
            y={lbl.y}
            textAnchor={lbl.anchor}
            dominantBaseline="middle"
            fontSize={9}
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.15em",
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: hoveredIndex === i ? 1 : 0.45,
              fill: hoveredIndex === i ? lbl.color : "rgba(255,255,255,0.45)",
              fontWeight: hoveredIndex === i ? 400 : 200,
            }}
            transition={{
              opacity: { delay: 0.3 + i * 0.1 },
              fill: { duration: 0.15 },
              fontWeight: { duration: 0.15 },
            }}
          >
            {lbl.axis}
          </motion.text>
        ))}

        {/* Layer 7: Value labels near dots — fade in, brighten on hover */}
        {geometry.valueLabels.map((vl, i) => (
          <motion.text
            key={`val-${i}`}
            x={vl.x}
            y={vl.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={vl.color}
            fontFamily="var(--font-mono)"
            initial={{ opacity: 0 }}
            animate={{
              opacity: hoveredIndex === i ? 1 : 0.7,
              fontSize: hoveredIndex === i ? 10 : 8,
            }}
            transition={{
              opacity: { delay: 1.0 + i * 0.08 },
              fontSize: { duration: 0.15 },
            }}
          >
            {vl.rawLabel}
          </motion.text>
        ))}

        {/* Layer 8: Hover tooltip */}
        <AnimatePresence>
          {hoveredIndex !== null && (
            <motion.foreignObject
              x={geometry.dataPoints[hoveredIndex].x - 50}
              y={geometry.dataPoints[hoveredIndex].y - 40}
              width={100}
              height={30}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              style={{ pointerEvents: "none", overflow: "visible" }}
            >
              <div
                className="flex items-center justify-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap"
                style={{
                  background: "rgba(0,0,0,0.85)",
                  border: `1px solid ${radarData[hoveredIndex].color}40`,
                  color: radarData[hoveredIndex].color,
                  backdropFilter: "blur(4px)",
                }}
              >
                <span style={{ opacity: 0.6 }}>
                  {radarData[hoveredIndex].axis}
                </span>
                <span>{radarData[hoveredIndex].rawLabel}</span>
              </div>
            </motion.foreignObject>
          )}
        </AnimatePresence>
      </motion.g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main CoachingPanel                                                 */
/* ------------------------------------------------------------------ */

export function CoachingPanel({ profile }: CoachingPanelProps) {
  const coaching = useMemo(() => computeCoaching(profile), [profile]);
  const confidence = useMemo(
    () => calibrateConfidence(0.7, profile.rawTrades),
    [profile],
  );

  const stateColor = STATE_COLORS[coaching.sessionState] ?? "var(--text-muted)";
  const confColor =
    confidence.calibratedConfidence < confidence.inputConfidence - 0.05
      ? "var(--loss-red)"
      : "var(--profit-green)";

  return (
    <section
      aria-labelledby="coaching-heading"
      className="border border-[var(--accent-cyan)]/20 bg-[var(--bg-secondary)] font-mono text-[0.8125rem]"
    >
      {/* Header */}
      <div className="border-b border-[var(--accent-cyan)]/15 bg-[var(--accent-cyan)]/[0.03] px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span
                className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]"
                aria-hidden="true"
              />
              <h3
                id="coaching-heading"
                className="text-terminal-heading text-sm"
              >
                <InfoTip tip="Simulated output from Beneat MCP tools that agents call before each trade.">
                  beneat_check_trade
                </InfoTip>
              </h3>
            </div>
            <span className="text-terminal-label text-[10px] opacity-70">
              MCP tool response · real-time coaching output
            </span>
          </div>
          <Link
            href="/docs/mcp/reference"
            className="text-terminal-label text-xs underline underline-offset-2 hover:text-[var(--accent-cyan)] transition-colors"
          >
            All 16 MCP tools &rarr;
          </Link>
        </div>
      </div>

      {/* Two-column layout: radar chart + terminal text rows */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
        {/* Left: Radar chart */}
        <div className="flex items-center justify-center border-b md:border-b-0 md:border-r border-[var(--border-color)]/50 py-3 bg-[var(--bg-primary)]/40">
          <RadarChart coaching={coaching} />
        </div>

        {/* Right: ALL existing terminal text rows */}
        <div className="space-y-0 divide-y divide-[var(--border-color)]/50">
          {/* Row: State + Sizing */}
          <div className="grid grid-cols-2 divide-x divide-[var(--border-color)]/50">
            <Row label="STATE">
              <span className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: stateColor }}
                  aria-hidden="true"
                />
                <span style={{ color: stateColor }}>
                  {coaching.sessionLabel}
                </span>
              </span>
            </Row>
            <Row label="SIZING">
              <span className="text-[var(--accent-orange)]">
                {coaching.suggestedSizePct.toFixed(1)}%
              </span>
              <span className="text-[var(--text-muted)]"> of equity</span>
            </Row>
          </div>

          {/* Row: Metrics */}
          <div className="grid grid-cols-4 divide-x divide-[var(--border-color)]/50">
            <Metric
              label="TILT"
              value={coaching.tiltSeverity}
              warn={coaching.tiltSeverity !== "none"}
              tip="Behavioral severity from consecutive losses. Higher = riskier pattern."
            />
            <Metric
              label="KELLY"
              value={`${(coaching.kellyFraction * 100).toFixed(1)}%`}
              warn={coaching.kellyFraction < 0}
              tip="Optimal bet fraction. Negative = strategy has negative expected value."
            />
            <Metric
              label="OVERCONF"
              value={`${(coaching.overconfidenceIndex * 100).toFixed(0)}%`}
              warn={coaching.overconfidenceIndex > 0.15}
              tip="Ratio of outsized positions to median. Above 15% is a warning."
            />
            <Metric
              label="REVENGE"
              value={`${(coaching.revengeTradeRatio * 100).toFixed(0)}%`}
              warn={coaching.revengeTradeRatio > 0.15}
              tip="Impulsive post-loss trade ratio. Above 15% triggers cooldown."
            />
          </div>

          {/* Row: Confidence calibration */}
          <div className="flex items-center gap-4 px-4 py-2.5">
            <span className="text-[var(--text-muted)] shrink-0 w-16">CONF</span>
            <span className="text-[var(--text-secondary)]">
              agent reports{" "}
              <span className="text-[var(--text-primary)]">
                {(confidence.inputConfidence * 100).toFixed(0)}%
              </span>
            </span>
            <span className="text-[var(--text-muted)]">&rarr;</span>
            <span className="text-[var(--text-secondary)]">
              calibrated{" "}
              <span style={{ color: confColor }}>
                {(confidence.calibratedConfidence * 100).toFixed(0)}%
              </span>
            </span>
            <span className="text-[var(--text-muted)] text-xs ml-auto truncate max-w-[40%]">
              {confidence.insight}
            </span>
          </div>

          {/* Row: Markets */}
          <div className="flex items-center gap-4 px-4 py-2.5">
            {coaching.bestMarket && (
              <>
                <span className="text-[var(--text-muted)] shrink-0 w-16">
                  FOCUS
                </span>
                <span className="text-[var(--profit-green)]">
                  {coaching.bestMarket}
                </span>
              </>
            )}
            {coaching.avoidMarkets.length > 0 && (
              <>
                <span
                  className={`text-[var(--text-muted)] shrink-0 ${coaching.bestMarket ? "" : "w-16"}`}
                >
                  {coaching.bestMarket ? "·" : "AVOID"}
                </span>
                {!coaching.bestMarket && (
                  <span className="text-[var(--loss-red)]">
                    {coaching.avoidMarkets.join(", ")}
                  </span>
                )}
                {coaching.bestMarket && (
                  <span className="text-[var(--text-muted)] shrink-0">
                    AVOID
                  </span>
                )}
                {coaching.bestMarket && (
                  <span className="text-[var(--loss-red)]">
                    {coaching.avoidMarkets.join(", ")}
                  </span>
                )}
              </>
            )}
            {!coaching.bestMarket && coaching.avoidMarkets.length === 0 && (
              <>
                <span className="text-[var(--text-muted)] shrink-0 w-16">
                  MKTS
                </span>
                <span className="text-[var(--text-muted)]">
                  insufficient data
                </span>
              </>
            )}
          </div>

          {/* Reasoning chain */}
          <div className="px-4 py-2.5">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              Reasoning
            </span>
            <ol className="mt-1.5 space-y-0.5 list-none">
              {coaching.reasoning.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[var(--text-secondary)]"
                >
                  <span
                    className="shrink-0 w-4 text-right"
                    style={{ color: "var(--accent-cyan)", opacity: 0.5 }}
                  >
                    {i + 1}.
                  </span>
                  {r}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-[var(--text-muted)] shrink-0 w-16">{label}</span>
      <span className="text-[var(--text-primary)]">{children}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  warn,
  tip,
}: {
  label: string;
  value: string;
  warn: boolean;
  tip: string;
}) {
  const barColor = warn ? "var(--accent-amber)" : "var(--profit-green)";

  return (
    <div className="relative px-4 py-2.5 pb-3">
      <div className="text-[var(--text-muted)] text-[0.6875rem] mb-0.5">
        <InfoTip tip={tip}>{label}</InfoTip>
      </div>
      <div
        className="text-terminal-value"
        style={{
          color: warn ? "var(--accent-amber)" : "var(--text-secondary)",
        }}
      >
        {value}
      </div>
      {/* Severity indicator bar */}
      <div
        className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
        style={{ backgroundColor: barColor, opacity: 0.4 }}
      />
    </div>
  );
}
