"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import {
  select,
  scaleLinear,
  axisRight,
  axisBottom,
  min,
  max,
  area,
  curveMonotoneX,
  line,
  pointer,
  easeQuadOut,
} from "d3";
import {
  ShieldBan,
  Timer,
  Lock,
  TrendingDown,
  ArrowDownToLine,
} from "lucide-react";
import type { Intervention, InterventionType } from "./enforcement-simulation";
import { InfoTip } from "../ui/info-tip";
import {
  TIMELINE_MARGINS,
  formatDollarAxis,
  clampTooltipPosition,
} from "./chart-utils";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface BehavioralTimelineProps {
  interventions: Intervention[];
  totalTrades: number;
  equityCurve: number[];
  startingEquity: number;
}

/* ------------------------------------------------------------------ */
/*  Shared constants (retained from original)                          */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG: Record<
  InterventionType,
  { label: string; color: string; icon: React.ReactNode; textLabel: string }
> = {
  stop_loss: {
    label: "Stop-Loss",
    color: "var(--loss-red)",
    icon: <ShieldBan className="h-3 w-3" />,
    textLabel: "blocked",
  },
  cooldown: {
    label: "Cooldown",
    color: "var(--accent-amber)",
    icon: <Timer className="h-3 w-3" />,
    textLabel: "paused",
  },
  lockout: {
    label: "Lockout",
    color: "var(--loss-red)",
    icon: <Lock className="h-3 w-3" />,
    textLabel: "locked",
  },
  tilt_reduction: {
    label: "Tilt Reduction",
    color: "var(--accent-violet)",
    icon: <TrendingDown className="h-3 w-3" />,
    textLabel: "reduced",
  },
  post_loss_reduction: {
    label: "Size Reduction",
    color: "var(--accent-cyan)",
    icon: <ArrowDownToLine className="h-3 w-3" />,
    textLabel: "downsized",
  },
};

const PILL_TIPS: Record<InterventionType, string> = {
  stop_loss:
    "Trade loss was capped at the maximum threshold to prevent outsized losses.",
  cooldown:
    "Trade was skipped because it followed a losing trade — prevents revenge trading.",
  lockout: "All trading halted because the daily 3% loss cap was breached.",
  tilt_reduction:
    "Position reduced to 10% of normal due to 2+ consecutive losses.",
  post_loss_reduction: "Position reduced to 20% of normal after a single loss.",
};

const TYPE_COLORS: Record<InterventionType, string> = {
  stop_loss: "#ef4444",
  cooldown: "#f59e0b",
  lockout: "#ef4444",
  tilt_reduction: "#8b5cf6",
  post_loss_reduction: "#06b6d4",
};

/* ------------------------------------------------------------------ */
/*  Dual-panel chart layout constants                                   */
/* ------------------------------------------------------------------ */

const CURVE_HEIGHT = 180;
const GAP = 10;
const BAR_HEIGHT = 100;
const BIN_TARGET = 40;

// Total height derived from panels + margins so the X-axis is never clipped.
// margin.top(20) + curveInner(120) + GAP(8) + barH(80) + margin.bottom(36) = 264
const TOTAL_HEIGHT =
  TIMELINE_MARGINS.top +
  (CURVE_HEIGHT - TIMELINE_MARGINS.top) +
  GAP +
  BAR_HEIGHT +
  TIMELINE_MARGINS.bottom;

const STACK_ORDER: InterventionType[] = [
  "lockout",
  "stop_loss",
  "tilt_reduction",
  "cooldown",
  "post_loss_reduction",
];

/* ------------------------------------------------------------------ */
/*  Bin interface for histogram aggregation                             */
/* ------------------------------------------------------------------ */

interface Bin {
  startTrade: number;
  endTrade: number;
  counts: Record<InterventionType, number>;
  totalPrevented: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/*  Hover state for bin tooltip                                        */
/* ------------------------------------------------------------------ */

interface BinHover {
  bin: Bin;
  binIdx: number;
  mouseX: number;
  mouseY: number;
}

/* ------------------------------------------------------------------ */
/*  D3 dual-panel chart (internal sub-component)                       */
/* ------------------------------------------------------------------ */

function TimelineChart({
  interventions,
  totalTrades,
  equityCurve,
  startingEquity,
}: BehavioralTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const prevDataRef = useRef<Intervention[] | null>(null);
  const gradientId = useRef(Math.random().toString(36).slice(2, 8));

  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<BinHover | null>(null);

  /* Track data changes to decide whether to animate */
  const isNewData = interventions !== prevDataRef.current;
  useEffect(() => {
    prevDataRef.current = interventions;
  }, [interventions]);

  const shouldAnimate = isNewData && !hasAnimated.current;

  useEffect(() => {
    if (isNewData) hasAnimated.current = false;
  }, [isNewData]);

  /* Responsive width via ResizeObserver */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* ---- drawChart ---- */
  const drawChart = useCallback(() => {
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();
    setHover(null);

    if (width === 0 || equityCurve.length === 0) return;

    const margin = TIMELINE_MARGINS;
    const w = width - margin.left - margin.right;
    const curveH = CURVE_HEIGHT - margin.top;
    const barH = BAR_HEIGHT;
    const gid = gradientId.current;

    svg.attr("width", width).attr("height", TOTAL_HEIGHT);

    /* ---- defs: area-fill gradient ---- */
    const defs = svg.append("defs");
    const grad = defs
      .append("linearGradient")
      .attr("id", `eq-area-${gid}`)
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");
    grad
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "rgba(255,255,255,0.04)");
    grad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "rgba(255,255,255,0.0)");

    const axisFont =
      "font-family: var(--font-sans); font-weight: 200; text-transform: uppercase; letter-spacing: 0.15em;";

    /* ---- Shared X scale ---- */
    const x = scaleLinear()
      .domain([0, totalTrades - 1])
      .range([0, w]);

    /* ================================================================ */
    /*  TOP PANEL — Equity curve                                        */
    /* ================================================================ */

    const gTop = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const yEquity = scaleLinear()
      .domain([
        (min(equityCurve) ?? 0) * 0.95,
        (max(equityCurve) ?? startingEquity * 2) * 1.05,
      ])
      .range([curveH, 0]);

    /* Y axis (right) with grid lines */
    gTop
      .append("g")
      .attr("transform", `translate(${w},0)`)
      .call(
        axisRight(yEquity)
          .ticks(4)
          .tickFormat((d) => formatDollarAxis(d as number)),
      )
      .call((sel) => sel.select(".domain").remove())
      .call((sel) =>
        sel
          .selectAll(".tick line")
          .attr("stroke", "rgba(255,255,255,0.05)")
          .attr("x1", -w)
          .attr("x2", 0),
      )
      .call((sel) =>
        sel
          .selectAll(".tick text")
          .attr("fill", "rgba(255,255,255,0.4)")
          .attr("font-size", 12)
          .attr("style", axisFont),
      );

    /* Starting balance reference line */
    gTop
      .append("line")
      .attr("x1", 0)
      .attr("x2", w)
      .attr("y1", yEquity(startingEquity))
      .attr("y2", yEquity(startingEquity))
      .attr("stroke", "rgba(255,255,255,0.12)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,3");

    /* Equity curve area fill */
    const areaGen = area<number>()
      .x((_, i) => x(i))
      .y0(curveH)
      .y1((d) => yEquity(d))
      .curve(curveMonotoneX);

    gTop
      .append("path")
      .datum(equityCurve)
      .attr("fill", `url(#eq-area-${gid})`)
      .attr("d", areaGen);

    /* Equity curve line stroke */
    const lineGen = line<number>()
      .x((_, i) => x(i))
      .y((d) => yEquity(d))
      .curve(curveMonotoneX);

    const curvePath = gTop
      .append("path")
      .datum(equityCurve)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.15)")
      .attr("stroke-width", 1.5)
      .attr("d", lineGen);

    /* Animate equity curve line-draw */
    if (shouldAnimate) {
      const pathNode = curvePath.node();
      if (pathNode) {
        const totalLen = pathNode.getTotalLength();
        curvePath
          .attr("stroke-dasharray", totalLen)
          .attr("stroke-dashoffset", totalLen)
          .transition()
          .duration(800)
          .ease(easeQuadOut)
          .attr("stroke-dashoffset", 0);
      }
    }

    /* ================================================================ */
    /*  DATA BINNING                                                    */
    /* ================================================================ */

    const numBins = Math.max(1, Math.ceil(totalTrades / BIN_TARGET));
    const binSize = totalTrades / numBins;

    const bins: Bin[] = Array.from({ length: numBins }, (_, i) => ({
      startTrade: Math.round(i * binSize),
      endTrade: Math.round((i + 1) * binSize) - 1,
      counts: {
        stop_loss: 0,
        cooldown: 0,
        lockout: 0,
        tilt_reduction: 0,
        post_loss_reduction: 0,
      },
      totalPrevented: 0,
      total: 0,
    }));

    for (const iv of interventions) {
      const binIdx = Math.min(Math.floor(iv.tradeIndex / binSize), numBins - 1);
      bins[binIdx].counts[iv.type]++;
      bins[binIdx].totalPrevented += iv.preventedLossPct;
      bins[binIdx].total++;
    }

    /* ================================================================ */
    /*  BOTTOM PANEL — Stacked bar histogram                            */
    /* ================================================================ */

    const barTop = margin.top + curveH + GAP;
    const gBottom = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${barTop})`);

    const maxCount = max(bins, (b) => b.total) ?? 1;
    const yBar = scaleLinear().domain([0, maxCount]).range([barH, 0]);

    const barWidth = Math.max(2, w / numBins - 1);

    /* Y axis for bar panel (right) */
    gBottom
      .append("g")
      .attr("transform", `translate(${w},0)`)
      .call(
        axisRight(yBar)
          .ticks(3)
          .tickFormat((d) => `${d}`),
      )
      .call((sel) => sel.select(".domain").remove())
      .call((sel) =>
        sel
          .selectAll(".tick line")
          .attr("stroke", "rgba(255,255,255,0.05)")
          .attr("x1", -w)
          .attr("x2", 0),
      )
      .call((sel) =>
        sel
          .selectAll(".tick text")
          .attr("fill", "rgba(255,255,255,0.4)")
          .attr("font-size", 11)
          .attr("style", axisFont),
      );

    /* X axis (bottom of bar panel) */
    gBottom
      .append("g")
      .attr("transform", `translate(0,${barH})`)
      .call(
        axisBottom(x)
          .ticks(6)
          .tickFormat((d) => `${d}`),
      )
      .call((sel) => sel.select(".domain").remove())
      .call((sel) =>
        sel.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.05)"),
      )
      .call((sel) =>
        sel
          .selectAll(".tick text")
          .attr("fill", "rgba(255,255,255,0.4)")
          .attr("font-size", 12)
          .attr("style", axisFont),
      );

    gBottom
      .append("text")
      .attr("x", w / 2)
      .attr("y", barH + 30)
      .attr("fill", "rgba(255,255,255,0.4)")
      .attr("font-size", 12)
      .attr("text-anchor", "middle")
      .attr("style", axisFont)
      .text("TRADE #");

    /* Render stacked bars */
    const barGroups = gBottom
      .selectAll<SVGGElement, Bin>(".bin-group")
      .data(bins)
      .enter()
      .append("g")
      .attr("class", "bin-group");

    bins.forEach((bin, binIdx) => {
      const binCenter = x((bin.startTrade + bin.endTrade) / 2);
      let yOffset = barH; // start from bottom

      for (const type of STACK_ORDER) {
        const count = bin.counts[type];
        if (count === 0) continue;

        const segH = barH - yBar(count);
        yOffset -= segH;

        const rect = barGroups
          .filter((_, i) => i === binIdx)
          .append("rect")
          .attr("x", binCenter - barWidth / 2)
          .attr("width", barWidth)
          .attr("fill", TYPE_COLORS[type])
          .attr("fill-opacity", 0.8)
          .attr("pointer-events", "none");

        if (shouldAnimate) {
          rect
            .attr("y", barH)
            .attr("height", 0)
            .transition()
            .delay(binIdx * 10)
            .duration(600)
            .ease(easeQuadOut)
            .attr("y", yOffset)
            .attr("height", segH);
        } else {
          rect.attr("y", yOffset).attr("height", segH);
        }
      }
    });

    if (shouldAnimate) {
      hasAnimated.current = true;
    }

    /* ================================================================ */
    /*  CROSSHAIR — spans both panels                                   */
    /* ================================================================ */

    const crosshairTop = gTop
      .append("line")
      .attr("y1", 0)
      .attr("y2", curveH)
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("pointer-events", "none")
      .style("display", "none");

    const crosshairBottom = gBottom
      .append("line")
      .attr("y1", 0)
      .attr("y2", barH)
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("pointer-events", "none")
      .style("display", "none");

    /* ================================================================ */
    /*  HOVER OVERLAY — full-height rect for detecting mouse position    */
    /* ================================================================ */

    const totalInner = margin.top + curveH + GAP + barH;

    const handleHover = (mx: number, my: number) => {
      /* Find which bin the mouse X falls into */
      const tradeX = x.invert(mx);
      const binIdx = Math.min(
        Math.max(0, Math.floor(tradeX / binSize)),
        numBins - 1,
      );
      const bin = bins[binIdx];

      if (bin.total === 0) {
        crosshairTop.style("display", "none");
        crosshairBottom.style("display", "none");
        barGroups.selectAll("rect").attr("fill-opacity", 0.8);
        setHover(null);
        return;
      }

      const cx = x((bin.startTrade + bin.endTrade) / 2);

      crosshairTop.attr("x1", cx).attr("x2", cx).style("display", null);
      crosshairBottom.attr("x1", cx).attr("x2", cx).style("display", null);

      /* Highlight hovered bin, dim others */
      barGroups.each(function (_, i) {
        select(this)
          .selectAll("rect")
          .attr("fill-opacity", i === binIdx ? 1 : 0.3);
      });

      setHover({ bin, binIdx, mouseX: mx, mouseY: my });
    };

    const clearHover = () => {
      crosshairTop.style("display", "none");
      crosshairBottom.style("display", "none");
      barGroups.selectAll("rect").attr("fill-opacity", 0.8);
      setHover(null);
    };

    /* Overlay sits in a group at SVG root level covering both panels */
    const overlay = svg
      .append("rect")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", w)
      .attr("height", totalInner - margin.top)
      .attr("fill", "none")
      .attr("pointer-events", "all");

    overlay
      .on("mousemove", function (event: MouseEvent) {
        const [mx] = pointer(event, this);
        const adjustedMx = mx - margin.left;
        const [, rawY] = pointer(event, this);
        handleHover(adjustedMx, rawY);
      })
      .on("mouseleave", clearHover)
      .on("touchmove", function (event: TouchEvent) {
        event.preventDefault();
        const touch = event.touches[0];
        const [mx, my] = pointer(touch, this);
        handleHover(mx - margin.left, my);
      })
      .on("touchend", clearHover);
  }, [
    interventions,
    totalTrades,
    equityCurve,
    startingEquity,
    width,
    shouldAnimate,
  ]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  /* ---- Tooltip content ---- */
  const tooltipContent = useMemo(() => {
    if (!hover) return null;

    const { bin } = hover;
    const tooltipW = 220;
    const tooltipH = 140;
    const pos = clampTooltipPosition(
      hover.mouseX,
      hover.mouseY,
      tooltipW,
      tooltipH,
      width,
      TOTAL_HEIGHT,
      TIMELINE_MARGINS,
    );

    const activeTypes = STACK_ORDER.filter((t) => bin.counts[t] > 0);

    return (
      <div
        className="absolute z-20 border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2.5 py-2 shadow-lg"
        style={{
          left: pos.x,
          top: pos.y,
          width: tooltipW,
          pointerEvents: "none" as const,
          fontSize: "0.6875rem",
        }}
      >
        <div className="text-terminal-label mb-1.5 text-[11px]">
          Trades {bin.startTrade}–{bin.endTrade}
        </div>
        <div
          className="space-y-0.5 text-[var(--text-secondary)]"
          style={{ fontWeight: 300 }}
        >
          {activeTypes.map((type) => {
            const cfg = TYPE_CONFIG[type];
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: TYPE_COLORS[type] }}
                />
                <span style={{ color: cfg.color }}>{cfg.label}:</span>
                <span className="tabular-nums text-[var(--text-primary)]">
                  {bin.counts[type]}
                </span>
              </div>
            );
          })}
          <div className="border-t border-border/20 pt-1 mt-1 flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Total prevented</span>
            <span className="tabular-nums text-[var(--profit-green)]">
              {bin.totalPrevented.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  }, [hover, width]);

  return (
    <div className="relative bg-[var(--bg-primary)]/40">
      <div ref={containerRef} style={{ height: `${TOTAL_HEIGHT}px` }}>
        <svg
          ref={svgRef}
          className="w-full h-full"
          role="img"
          aria-label={`Dual-panel chart showing equity curve and ${interventions.length} enforcement interventions across ${totalTrades} trades`}
        />
      </div>
      {tooltipContent}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main exported component                                            */
/* ------------------------------------------------------------------ */

export function BehavioralTimeline({
  interventions,
  totalTrades,
  equityCurve,
  startingEquity,
}: BehavioralTimelineProps) {
  if (interventions.length === 0) return null;

  /* Compute type counts and total prevented */
  const typeCounts = new Map<InterventionType, number>();
  let totalPrevented = 0;
  for (const iv of interventions) {
    typeCounts.set(iv.type, (typeCounts.get(iv.type) ?? 0) + 1);
    totalPrevented += iv.preventedLossPct;
  }

  return (
    <section
      aria-labelledby="timeline-heading"
      className="border border-[var(--accent-violet)]/20 bg-[var(--bg-secondary)]"
    >
      {/* Header */}
      <div className="border-b border-[var(--accent-violet)]/15 bg-[var(--accent-violet)]/[0.03] px-5 py-3">
        <div className="flex items-center gap-2.5 mb-1">
          <span
            className="h-2 w-2 rounded-full bg-[var(--accent-violet)]"
            aria-hidden="true"
          />
          <h3
            id="timeline-heading"
            className="text-terminal-heading text-sm whitespace-nowrap"
          >
            Enforcement Timeline
          </h3>
        </div>
        <span className="text-terminal-label text-[10px] opacity-70">
          {interventions.length} interventions across {totalTrades} trades ·
          shown on median equity curve
        </span>
      </div>

      {/* Intervention counts */}
      <div className="grid grid-cols-3 sm:grid-cols-6 border-b border-border/30">
        {Array.from(typeCounts.entries()).map(([type, count]) => {
          const cfg = TYPE_CONFIG[type];
          return (
            <div
              key={type}
              className="flex flex-col items-center gap-0.5 border-r border-border/20 px-3 py-2.5"
            >
              <span className="flex items-center gap-1.5">
                <span style={{ color: cfg.color }} aria-hidden="true">
                  {cfg.icon}
                </span>
                <InfoTip tip={PILL_TIPS[type]}>
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                </InfoTip>
              </span>
              <span className="font-mono text-xs tabular-nums text-[var(--text-primary)]">
                x{count}
              </span>
            </div>
          );
        })}
        <div className="flex flex-col items-center gap-0.5 px-3 py-2.5">
          <InfoTip tip="Total percentage of losses prevented by all enforcement rules combined.">
            <span className="text-[10px] uppercase tracking-wider text-[var(--profit-green)]">
              Prevented
            </span>
          </InfoTip>
          <span className="font-mono text-xs tabular-nums text-[var(--profit-green)]">
            {totalPrevented.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* D3 dual-panel chart (equity curve + stacked histogram) */}
      <TimelineChart
        interventions={interventions}
        totalTrades={totalTrades}
        equityCurve={equityCurve}
        startingEquity={startingEquity}
      />

      {/* Legend row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 border-t border-border/20">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {TYPE_CONFIG[type as InterventionType].label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
