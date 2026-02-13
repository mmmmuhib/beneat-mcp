"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import {
  select,
  scaleLinear,
  min,
  max,
  axisBottom,
  axisRight,
  area as d3area,
  curveMonotoneX,
  line as d3line,
  pointer,
} from "d3";
import {
  CHART_MARGINS,
  formatDollarAxis,
  clampTooltipPosition,
} from "./chart-utils";

interface ActualEquityChartProps {
  curve: number[];
  startingBalance: number;
  height?: number;
}

interface HoverState {
  tradeIndex: number;
  mouseX: number;
  mouseY: number;
  value: number;
}

export function ActualEquityChart({
  curve,
  startingBalance,
  height = 280,
}: ActualEquityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gradientId = useRef(Math.random().toString(36).slice(2, 8));
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const drawChart = useCallback(() => {
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();
    setHover(null);

    if (width === 0 || curve.length < 2) return;

    const margin = CHART_MARGINS;
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const gid = gradientId.current;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const finalValue = curve[curve.length - 1];
    const isPositive = finalValue >= startingBalance;
    const lineColor = isPositive ? "#22c55e" : "#ef4444";

    const defs = svg.append("defs");
    const grad = defs
      .append("linearGradient")
      .attr("id", `area-gradient-${gid}`)
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");
    grad
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", lineColor)
      .attr("stop-opacity", 0.15);
    grad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", lineColor)
      .attr("stop-opacity", 0.0);

    const x = scaleLinear()
      .domain([0, curve.length - 1])
      .range([0, w]);
    const y = scaleLinear()
      .domain([
        (min(curve) ?? 0) * 0.95,
        (max(curve) ?? startingBalance * 2) * 1.05,
      ])
      .range([h, 0]);

    // --- Axes ---
    g.append("g")
      .attr("transform", `translate(0,${h})`)
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
          .attr("fill", "rgba(255,255,255,0.3)")
          .attr("font-size", 9),
      );

    g.append("text")
      .attr("x", w / 2)
      .attr("y", h + 28)
      .attr("fill", "rgba(255,255,255,0.3)")
      .attr("font-size", 9)
      .attr("text-anchor", "middle")
      .text("Trade #");

    g.append("g")
      .attr("transform", `translate(${w},0)`)
      .call(
        axisRight(y)
          .ticks(5)
          .tickFormat((d) => formatDollarAxis(d as number)),
      )
      .call((sel) => sel.select(".domain").remove())
      .call((sel) =>
        sel
          .selectAll(".tick line")
          .attr("stroke", "rgba(255,255,255,0.06)")
          .attr("x1", -w)
          .attr("x2", 0),
      )
      .call((sel) =>
        sel
          .selectAll(".tick text")
          .attr("fill", "rgba(255,255,255,0.3)")
          .attr("font-size", 9),
      );

    // --- Starting balance reference line ---
    g.append("line")
      .attr("x1", 0)
      .attr("x2", w)
      .attr("y1", y(startingBalance))
      .attr("y2", y(startingBalance))
      .attr("stroke", "rgba(255,255,255,0.12)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,3");

    // --- Area fill with gradient ---
    const areaGen = d3area<number>()
      .x((_, i) => x(i))
      .y0(h)
      .y1((d) => y(d))
      .curve(curveMonotoneX);

    g.append("path")
      .datum(curve)
      .attr("fill", `url(#area-gradient-${gid})`)
      .attr("d", areaGen);

    // --- Main line ---
    const lineGen = d3line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX);

    g.append("path")
      .datum(curve)
      .attr("fill", "none")
      .attr("stroke", lineColor)
      .attr("stroke-width", 2.5)
      .attr("d", lineGen);

    // --- End dot ---
    g.append("circle")
      .attr("cx", x(curve.length - 1))
      .attr("cy", y(finalValue))
      .attr("r", 4)
      .attr("fill", lineColor)
      .attr("stroke", "rgba(0,0,0,0.5)")
      .attr("stroke-width", 1.5);

    // --- Crosshair ---
    const crosshairLine = g
      .append("line")
      .attr("y1", 0)
      .attr("y2", h)
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("pointer-events", "none")
      .style("display", "none");

    const hoverDot = g
      .append("circle")
      .attr("r", 4)
      .attr("fill", lineColor)
      .attr("stroke", "rgba(0,0,0,0.5)")
      .attr("stroke-width", 1.5)
      .attr("pointer-events", "none")
      .style("display", "none");

    // --- Overlay ---
    g.append("rect")
      .attr("width", w)
      .attr("height", h)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("mousemove", function (event: MouseEvent) {
        const [mx, my] = pointer(event, this);
        const tradeIdx = Math.round(x.invert(mx));
        const clamped = Math.max(0, Math.min(tradeIdx, curve.length - 1));

        const cx = x(clamped);
        const val = curve[clamped];

        crosshairLine.attr("x1", cx).attr("x2", cx).style("display", null);

        hoverDot.attr("cx", cx).attr("cy", y(val)).style("display", null);

        setHover({ tradeIndex: clamped, mouseX: mx, mouseY: my, value: val });
      })
      .on("mouseleave", function () {
        crosshairLine.style("display", "none");
        hoverDot.style("display", "none");
        setHover(null);
      });
  }, [curve, startingBalance, width, height]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  const tooltipContent = useMemo(() => {
    if (!hover) return null;

    const tooltipW = 150;
    const tooltipH = 56;
    const pos = clampTooltipPosition(
      hover.mouseX,
      hover.mouseY,
      tooltipW,
      tooltipH,
      width,
      height,
      CHART_MARGINS,
    );

    const pnl = ((hover.value - startingBalance) / startingBalance) * 100;
    const isPos = pnl >= 0;

    return (
      <div
        className="absolute z-20 border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 shadow-lg"
        style={{
          left: pos.x,
          top: pos.y,
          width: tooltipW,
          pointerEvents: "none" as const,
        }}
      >
        <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Trade #{hover.tradeIndex}
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-[var(--text-primary)]">
            $
            {hover.value.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </span>
          <span
            className={`font-mono text-[10px] ${isPos ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"}`}
          >
            {isPos ? "+" : ""}
            {pnl.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  }, [hover, width, height, startingBalance]);

  const finalValue = curve[curve.length - 1] ?? startingBalance;
  const pnl = ((finalValue - startingBalance) / startingBalance) * 100;
  const isPositive = pnl >= 0;

  return (
    <div className="relative">
      <div className="absolute left-3 top-2 z-10">
        <span className="rounded bg-background/50 px-2 py-1 font-mono text-[9px] tracking-wider text-text-muted">
          Start: ${startingBalance.toLocaleString()}
        </span>
      </div>

      <div ref={containerRef} style={{ height: `${height}px` }}>
        <svg ref={svgRef} className="h-full w-full" />
      </div>

      {tooltipContent}

      <div className="flex items-center justify-center gap-4 border-t border-border/50 bg-background/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="h-0.5 w-4"
            style={{ backgroundColor: isPositive ? "#22c55e" : "#ef4444" }}
          />
          <span className="font-mono text-[10px] text-text-secondary">
            Actual:
          </span>
          <span
            className={`font-mono text-[10px] font-medium ${
              isPositive ? "text-status-safe" : "text-status-danger"
            }`}
          >
            {isPositive ? "+" : ""}
            {pnl.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-secondary">
            Trades:
          </span>
          <span className="font-mono text-[10px] text-text-secondary">
            {curve.length - 1}
          </span>
        </div>
      </div>
    </div>
  );
}
