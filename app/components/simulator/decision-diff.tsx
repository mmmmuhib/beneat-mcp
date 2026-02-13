"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import {
  select,
  scaleLinear,
  scaleBand,
  max,
  axisBottom,
  pointer,
  easeElasticOut,
  easeQuadOut,
} from "d3";
import type { Intervention } from "./enforcement-simulation";
import {
  DIFF_MARGINS,
  INTERVENTION_COLORS,
  clampTooltipPosition,
} from "./chart-utils";

interface DecisionDiffProps {
  interventions: Intervention[];
  startingEquity: number;
}

interface DiffHoverState {
  index: number;
  mouseX: number;
  mouseY: number;
  intervention: Intervention;
  savedDollars: number;
}

function DiffChart({ topInterventions }: { topInterventions: Intervention[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const prevDataRef = useRef<Intervention[] | null>(null);

  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<DiffHoverState | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const isNewData = topInterventions !== prevDataRef.current;
  useEffect(() => {
    prevDataRef.current = topInterventions;
  }, [topInterventions]);

  const shouldAnimate = isNewData && !hasAnimated.current;

  useEffect(() => {
    if (isNewData) hasAnimated.current = false;
  }, [isNewData]);

  const drawChart = useCallback(() => {
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();
    setHover(null);

    if (width === 0 || topInterventions.length === 0) return;

    const margin = DIFF_MARGINS;
    const ROW_HEIGHT = 48;
    const chartHeight =
      topInterventions.length * ROW_HEIGHT + margin.top + margin.bottom;
    const w = width - margin.left - margin.right;
    const h = chartHeight - margin.top - margin.bottom;

    const maxAbsPnl =
      max(topInterventions, (iv) =>
        Math.max(Math.abs(iv.originalPnlPct), Math.abs(iv.adjustedPnlPct)),
      ) ?? 10;

    const x = scaleLinear()
      .domain([-maxAbsPnl * 1.3, maxAbsPnl * 0.5])
      .range([0, w]);

    const y = scaleBand<number>()
      .domain(topInterventions.map((_, i) => i))
      .range([0, h])
      .padding(0.35);

    const g = svg
      .attr("width", width)
      .attr("height", chartHeight)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const axisFont =
      "font-family: var(--font-sans); font-weight: 200; text-transform: uppercase; letter-spacing: 0.15em;";

    // 0% reference line: vertical dashed line at x(0)
    g.append("line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", -8)
      .attr("y2", h)
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,3");

    // "0%" label at top of reference line
    g.append("text")
      .attr("x", x(0))
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .attr("fill", "rgba(255,255,255,0.35)")
      .attr("font-size", 10)
      .attr("style", axisFont)
      .text("0%");

    // X axis at bottom
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(
        axisBottom(x)
          .ticks(5)
          .tickFormat((d) => `${d}%`),
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

    // Collect references for animation
    const redDots: SVGCircleElement[] = [];
    const greenDots: SVGCircleElement[] = [];
    const connectors: SVGLineElement[] = [];
    const preventedRects: SVGRectElement[] = [];
    const savedLabels: SVGTextElement[] = [];
    const rowLabels: SVGGElement[] = [];

    // Draw each intervention row as a dumbbell
    topInterventions.forEach((iv, i) => {
      const savedDollars = (iv.preventedLossPct / 100) * iv.equityBefore;
      const interventionColor =
        INTERVENTION_COLORS[iv.type as keyof typeof INTERVENTION_COLORS] ??
        "#888";

      const cy = y(i)! + y.bandwidth() / 2;
      const xOrig = x(iv.originalPnlPct);
      const xAdj = x(iv.adjustedPnlPct);

      // Row group for hover interaction
      const rowGroup = g
        .append("g")
        .attr("class", "diff-row")
        .attr("data-index", i)
        .style("cursor", "pointer");

      // Invisible hit area for the row
      rowGroup
        .append("rect")
        .attr("x", -margin.left)
        .attr("y", y(i)!)
        .attr("width", w + margin.left + margin.right)
        .attr("height", y.bandwidth())
        .attr("fill", "transparent")
        .attr("pointer-events", "all");

      // Labels group (rank + type)
      const labelGroup = rowGroup
        .append("g")
        .attr("opacity", shouldAnimate ? 0 : 1);

      // Line 1: rank + trade number
      labelGroup
        .append("text")
        .attr("x", -8)
        .attr("y", cy - 6)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "auto")
        .attr("fill", "rgba(255,255,255,0.5)")
        .attr("font-size", 11)
        .text(`#${i + 1} Trade #${iv.tradeIndex + 1}`);

      // Line 2: intervention type
      labelGroup
        .append("text")
        .attr("x", -8)
        .attr("y", cy + 8)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "auto")
        .attr("fill", interventionColor)
        .attr("font-size", 9)
        .attr("style", "text-transform: uppercase; letter-spacing: 0.15em;")
        .text(iv.type.replace(/_/g, " "));

      rowLabels.push(labelGroup.node()!);

      // Prevented region: subtle green-shaded rect between dots
      const preventedRect = rowGroup
        .append("rect")
        .attr("x", Math.min(xOrig, xAdj))
        .attr("y", y(i)!)
        .attr("width", Math.abs(xAdj - xOrig))
        .attr("height", y.bandwidth())
        .attr("fill", "rgba(34,197,94,0.08)")
        .attr("rx", 2)
        .attr("opacity", shouldAnimate ? 0 : 1);

      preventedRects.push(preventedRect.node()!);

      // Connector line between red and green dots
      const connector = rowGroup
        .append("line")
        .attr("class", "dumbbell-connector")
        .attr("x1", xOrig)
        .attr("y1", cy)
        .attr("x2", shouldAnimate ? xOrig : xAdj)
        .attr("y2", cy)
        .attr("stroke", "rgba(255,255,255,0.15)")
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round");

      connectors.push(connector.node()!);

      // Red dot at originalPnlPct
      const redDot = rowGroup
        .append("circle")
        .attr("class", "dumbbell-dot-red")
        .attr("cx", xOrig)
        .attr("cy", cy)
        .attr("r", shouldAnimate ? 0 : 6)
        .attr("fill", "#ef4444")
        .attr("stroke", "rgba(255,255,255,0.2)")
        .attr("stroke-width", 1.5);

      redDots.push(redDot.node()!);

      // Green dot at adjustedPnlPct
      const greenDot = rowGroup
        .append("circle")
        .attr("class", "dumbbell-dot-green")
        .attr("cx", xAdj)
        .attr("cy", cy)
        .attr("r", shouldAnimate ? 0 : 6)
        .attr("fill", "#22c55e")
        .attr("stroke", "rgba(255,255,255,0.2)")
        .attr("stroke-width", 1.5);

      greenDots.push(greenDot.node()!);

      // Dollar label at right margin
      const savedLabel = rowGroup
        .append("text")
        .attr("x", w + 8)
        .attr("y", cy)
        .attr("dominant-baseline", "middle")
        .attr("fill", "#22c55e")
        .attr("font-size", 12)
        .attr("font-family", "var(--font-mono)")
        .attr("opacity", shouldAnimate ? 0 : 1)
        .text(
          `+$${savedDollars.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`,
        );

      savedLabels.push(savedLabel.node()!);

      // Hover events
      rowGroup
        .on("mousemove", function (event: MouseEvent) {
          const [mx, my] = pointer(event, svgRef.current);

          // Dim all rows, highlight this one
          g.selectAll(".diff-row").attr("opacity", 0.3);
          select(this).attr("opacity", 1);

          // Scale dots up and brighten connector on hovered row
          select(this)
            .selectAll(".dumbbell-dot-red, .dumbbell-dot-green")
            .transition()
            .duration(150)
            .attr("r", 8);
          select(this)
            .select(".dumbbell-connector")
            .transition()
            .duration(150)
            .attr("stroke-width", 3)
            .attr("stroke", "rgba(255,255,255,0.3)");

          setHover({
            index: i,
            mouseX: mx,
            mouseY: my,
            intervention: iv,
            savedDollars,
          });
        })
        .on("mouseleave", function () {
          g.selectAll(".diff-row").attr("opacity", 1);

          // Reset dots and connector
          g.selectAll(".dumbbell-dot-red, .dumbbell-dot-green")
            .transition()
            .duration(150)
            .attr("r", 6);
          g.selectAll(".dumbbell-connector")
            .transition()
            .duration(150)
            .attr("stroke-width", 2)
            .attr("stroke", "rgba(255,255,255,0.15)");

          setHover(null);
        });
    });

    // Animate if this is new data
    if (shouldAnimate) {
      hasAnimated.current = true;

      topInterventions.forEach((iv, i) => {
        const stagger = i * 150;

        // T+0ms: Labels fade in alongside red dot
        select(rowLabels[i])
          .transition()
          .delay(stagger)
          .duration(300)
          .attr("opacity", 1);

        // T+0ms: Red dot appears with elastic bounce
        select(redDots[i])
          .transition()
          .delay(stagger)
          .duration(500)
          .ease(easeElasticOut.amplitude(1).period(0.4))
          .attr("r", 6);

        // T+200ms: Connector line grows from red dot rightward
        select(connectors[i])
          .transition()
          .delay(stagger + 200)
          .duration(600)
          .ease(easeQuadOut)
          .attr("x2", x(iv.adjustedPnlPct));

        // T+200ms: Prevented region fades in
        select(preventedRects[i])
          .transition()
          .delay(stagger + 200)
          .duration(600)
          .ease(easeQuadOut)
          .attr("opacity", 1);

        // T+600ms: Green dot appears with elastic bounce
        select(greenDots[i])
          .transition()
          .delay(stagger + 600)
          .duration(500)
          .ease(easeElasticOut.amplitude(1).period(0.4))
          .attr("r", 6);

        // T+800ms: Dollar label fades in
        select(savedLabels[i])
          .transition()
          .delay(stagger + 800)
          .duration(400)
          .attr("opacity", 1);
      });
    }
  }, [topInterventions, width, shouldAnimate]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  const margin = DIFF_MARGINS;
  const ROW_HEIGHT = 48;
  const chartHeight =
    topInterventions.length * ROW_HEIGHT + margin.top + margin.bottom;

  const tooltipContent = useMemo(() => {
    if (!hover) return null;

    const iv = hover.intervention;
    const tooltipW = 220;
    const tooltipH = 120;
    const pos = clampTooltipPosition(
      hover.mouseX,
      hover.mouseY,
      tooltipW,
      tooltipH,
      width,
      chartHeight,
      { top: 0, right: 0, bottom: 0, left: 0 },
    );

    return (
      <div
        className="absolute z-20 border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2.5 shadow-lg"
        style={{
          left: pos.x,
          top: pos.y,
          width: tooltipW,
          pointerEvents: "none" as const,
          fontSize: "0.6875rem",
        }}
      >
        <div className="text-terminal-label mb-1.5 flex items-center gap-2">
          <span>Trade #{iv.tradeIndex + 1}</span>
          <span
            className="text-[9px] uppercase tracking-wider"
            style={{
              color:
                INTERVENTION_COLORS[
                  iv.type as keyof typeof INTERVENTION_COLORS
                ] ?? "#888",
            }}
          >
            {iv.type.replace(/_/g, " ")}
          </span>
        </div>
        <div className="grid gap-0.5 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Agent wanted:</span>
            <span className="text-[var(--loss-red)]">
              {iv.originalPnlPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Beneat allowed:</span>
            <span className="text-[var(--profit-green)]">
              {iv.adjustedPnlPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Loss prevented:</span>
            <span className="text-[var(--profit-green)]">
              {iv.preventedLossPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between border-t border-[var(--border-color)]/30 pt-0.5 mt-0.5">
            <span className="text-[var(--text-muted)]">Saved:</span>
            <span className="text-[var(--profit-green)] font-semibold">
              $
              {hover.savedDollars.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </span>
          </div>
        </div>
        {iv.reason && (
          <div className="mt-1.5 text-[10px] text-[var(--text-muted)] leading-tight border-t border-[var(--border-color)]/20 pt-1">
            {iv.reason}
          </div>
        )}
      </div>
    );
  }, [hover, width, chartHeight]);

  return (
    <div className="relative bg-[var(--bg-primary)]/40 px-5 py-3">
      <div ref={containerRef} style={{ height: `${chartHeight}px` }}>
        <svg ref={svgRef} className="w-full h-full" />
      </div>
      {tooltipContent}
    </div>
  );
}

export function DecisionDiff({
  interventions,
  startingEquity,
}: DecisionDiffProps) {
  const topInterventions = [...interventions]
    .filter((iv) => iv.preventedLossPct > 0)
    .sort((a, b) => b.preventedLossPct - a.preventedLossPct)
    .slice(0, 5);

  if (topInterventions.length === 0) return null;

  const totalSaved = topInterventions.reduce(
    (s, iv) => s + (iv.preventedLossPct / 100) * iv.equityBefore,
    0,
  );

  return (
    <section
      aria-labelledby="diff-heading"
      className="border border-[var(--profit-green)]/20 bg-[var(--bg-secondary)]"
    >
      {/* Header */}
      <div className="border-b border-[var(--profit-green)]/15 bg-[var(--profit-green)]/[0.03] px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span
                className="h-2 w-2 rounded-full bg-[var(--profit-green)]"
                aria-hidden="true"
              />
              <h3
                id="diff-heading"
                className="text-terminal-heading text-sm whitespace-nowrap"
              >
                Highest-Impact Interventions
              </h3>
            </div>
            <span className="text-terminal-label text-[10px] opacity-70">
              Top {topInterventions.length} trades where enforcement saved the
              most
            </span>
          </div>
          <span className="font-mono text-sm tabular-nums text-[var(--profit-green)]">
            $
            {totalSaved.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}{" "}
            saved
          </span>
        </div>
      </div>

      {/* D3 Chart */}
      <DiffChart topInterventions={topInterventions} />
    </section>
  );
}
