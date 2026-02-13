"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import {
  select,
  scaleLinear,
  min,
  max,
  axisBottom,
  axisRight,
  area,
  curveMonotoneX,
  line,
  pointer,
  easeQuadOut,
} from "d3";
import type { Selection, ScaleLinear } from "d3";
import type { MonteCarloFullResult } from "./simulation-logic";
import {
  CHART_MARGINS,
  PERCENTILE_COLORS,
  PERCENTILE_LABELS,
  PERCENTILE_ORDER,
  formatDollarAxis,
  clampTooltipPosition,
} from "./chart-utils";

interface MonteCarloChartProps {
  result: MonteCarloFullResult;
  startingBalance: number;
  height?: number;
}

type PercentileKey = keyof typeof PERCENTILE_COLORS;

interface HoverState {
  tradeIndex: number;
  mouseX: number;
  mouseY: number;
  values: Record<PercentileKey, number>;
}

export function MonteCarloChart({
  result,
  startingBalance,
  height = 320,
}: MonteCarloChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const gradientId = useRef(Math.random().toString(36).slice(2, 8));
  const hasAnimated = useRef(false);
  const prevResultRef = useRef<MonteCarloFullResult | null>(null);

  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [focusedTradeIndex, setFocusedTradeIndex] = useState<number | null>(
    null,
  );

  const scalesRef = useRef<{
    x: ScaleLinear<number, number>;
    y: ScaleLinear<number, number>;
    curveLength: number;
  } | null>(null);
  const d3ElementsRef = useRef<{
    crosshairLine: Selection<SVGLineElement, unknown, null, undefined>;
    hoverDots: Selection<SVGCircleElement, unknown, null, undefined>[];
    bgPaths: { curve: number[]; element: SVGPathElement }[];
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const isNewData = result !== prevResultRef.current;
  useEffect(() => {
    prevResultRef.current = result;
  }, [result]);

  const shouldAnimate = isNewData && !hasAnimated.current;

  useEffect(() => {
    if (isNewData) hasAnimated.current = false;
  }, [isNewData]);

  const medianFinal =
    result.percentiles.median[result.percentiles.median.length - 1];
  const bestFinal = result.percentiles.best[result.percentiles.best.length - 1];
  const worstFinal =
    result.percentiles.worst[result.percentiles.worst.length - 1];
  const chartAriaLabel = `Monte Carlo simulation chart. Median final equity: $${Math.round(medianFinal).toLocaleString()}, Best: $${Math.round(bestFinal).toLocaleString()}, Worst: $${Math.round(worstFinal).toLocaleString()}`;

  const updateHoverState = useCallback(
    (tradeIdx: number, mouseX: number, mouseY: number) => {
      const elements = d3ElementsRef.current;
      const scales = scalesRef.current;
      if (!elements || !scales) return;

      const { x, y, curveLength } = scales;
      const clamped = Math.max(0, Math.min(tradeIdx, curveLength - 1));
      const cx = x(clamped);

      elements.crosshairLine
        .attr("x1", cx)
        .attr("x2", cx)
        .style("display", null);

      const values = {} as Record<PercentileKey, number>;
      PERCENTILE_ORDER.forEach((key, i) => {
        const val = result.percentiles[key][clamped];
        values[key] = val;
        elements.hoverDots[i]
          .attr("cx", cx)
          .attr("cy", y(val))
          .style("display", null);
      });

      elements.bgPaths.forEach(({ curve, element }) => {
        const pathY = y(curve[clamped]);
        const dist = Math.abs(mouseY - pathY);
        let stroke = "rgba(255,255,255,0.06)";
        if (dist < 8) stroke = "rgba(255,255,255,0.30)";
        else if (dist < 25) stroke = "rgba(255,255,255,0.12)";
        select(element).attr("stroke", stroke);
      });

      setHover({ tradeIndex: clamped, mouseX, mouseY, values });
    },
    [result],
  );

  const clearHoverState = useCallback(() => {
    const elements = d3ElementsRef.current;
    if (!elements) return;
    elements.crosshairLine.style("display", "none");
    elements.hoverDots.forEach((dot) => dot.style("display", "none"));
    elements.bgPaths.forEach(({ element }) => {
      select(element).attr("stroke", "rgba(255,255,255,0.06)");
    });
    setHover(null);
  }, []);

  const drawChart = useCallback(() => {
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();
    setHover(null);

    if (width === 0 || result.curves.length === 0) return;

    const margin = CHART_MARGINS;
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const gid = gradientId.current;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const defs = svg.append("defs");

    const makeGradient = (
      id: string,
      color: string,
      topOpacity: number,
      bottomOpacity: number,
    ) => {
      const grad = defs
        .append("linearGradient")
        .attr("id", `${id}-${gid}`)
        .attr("x1", "0")
        .attr("y1", "0")
        .attr("x2", "0")
        .attr("y2", "1");
      grad
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", color)
        .attr("stop-opacity", topOpacity);
      grad
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", color)
        .attr("stop-opacity", bottomOpacity);
    };

    makeGradient("best-gradient", "#22c55e", 0.1, 0.0);
    makeGradient("worst-gradient", "#ef4444", 0.0, 0.1);
    makeGradient("band-gradient", "#3b82f6", 0.1, 0.04);

    const curveLength = result.curves[0]?.length || 0;
    const allValues = result.curves.flat();

    const x = scaleLinear()
      .domain([0, curveLength - 1])
      .range([0, w]);
    const y = scaleLinear()
      .domain([
        (min(allValues) ?? 0) * 0.95,
        (max(allValues) ?? startingBalance * 2) * 1.05,
      ])
      .range([h, 0]);

    scalesRef.current = { x, y, curveLength };

    const axisFont =
      "font-family: var(--font-sans); font-weight: 200; text-transform: uppercase; letter-spacing: 0.15em;";

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
          .attr("fill", "rgba(255,255,255,0.4)")
          .attr("font-size", 12)
          .attr("style", axisFont),
      );

    g.append("text")
      .attr("x", w / 2)
      .attr("y", h + 32)
      .attr("fill", "rgba(255,255,255,0.4)")
      .attr("font-size", 12)
      .attr("text-anchor", "middle")
      .attr("style", axisFont)
      .text("TRADE #");

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
          .attr("fill", "rgba(255,255,255,0.4)")
          .attr("font-size", 12)
          .attr("style", axisFont),
      );

    g.append("line")
      .attr("x1", 0)
      .attr("x2", w)
      .attr("y1", y(startingBalance))
      .attr("y2", y(startingBalance))
      .attr("stroke", "rgba(255,255,255,0.12)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,3");

    const p25Curve = result.percentiles.p25;
    const p75Curve = result.percentiles.p75;

    const bandArea = area<number>()
      .x((_, i) => x(i))
      .y0((_, i) => y(p25Curve[i]))
      .y1((d) => y(d))
      .curve(curveMonotoneX);

    g.append("path")
      .datum(p75Curve)
      .attr("fill", `url(#band-gradient-${gid})`)
      .attr("d", bandArea);

    const bestAreaGen = area<number>()
      .x((_, i) => x(i))
      .y0(h)
      .y1((d) => y(d))
      .curve(curveMonotoneX);

    g.append("path")
      .datum(result.percentiles.best)
      .attr("fill", `url(#best-gradient-${gid})`)
      .attr("d", bestAreaGen);

    const worstAreaGen = area<number>()
      .x((_, i) => x(i))
      .y0(0)
      .y1((d) => y(d))
      .curve(curveMonotoneX);

    g.append("path")
      .datum(result.percentiles.worst)
      .attr("fill", `url(#worst-gradient-${gid})`)
      .attr("d", worstAreaGen);

    const lineGen = line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX);

    const bgPaths: { curve: number[]; element: SVGPathElement }[] = [];

    result.curves.forEach((curve, idx) => {
      const isPercentile =
        idx === result.percentileIndices.best ||
        idx === result.percentileIndices.worst ||
        idx === result.percentileIndices.median ||
        idx === result.percentileIndices.p25 ||
        idx === result.percentileIndices.p75;

      if (!isPercentile) {
        const path = g
          .append("path")
          .datum(curve)
          .attr("fill", "none")
          .attr("stroke", "rgba(255,255,255,0.06)")
          .attr("stroke-width", 1)
          .attr("d", lineGen);
        bgPaths.push({ curve, element: path.node()! });
      }
    });

    const percentilePaths: {
      key: PercentileKey;
      node: SVGPathElement;
    }[] = [];

    PERCENTILE_ORDER.forEach((key) => {
      const curve = result.percentiles[key];
      const color = PERCENTILE_COLORS[key];
      const isDashed = key === "p25" || key === "p75";

      const path = g
        .append("path")
        .datum(curve)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", key === "median" ? 2.5 : isDashed ? 2 : 2.5)
        .attr("stroke-dasharray", isDashed ? "6,4" : null)
        .attr("d", lineGen);

      percentilePaths.push({ key, node: path.node()! });
    });

    if (shouldAnimate) {
      hasAnimated.current = true;
      percentilePaths.forEach(({ node }, i) => {
        const totalLength = node.getTotalLength();
        select(node)
          .attr("stroke-dasharray", `${totalLength},${totalLength}`)
          .attr("stroke-dashoffset", totalLength)
          .transition()
          .delay(i * 100)
          .duration(800)
          .ease(easeQuadOut)
          .attr("stroke-dashoffset", 0)
          .on("end", function () {
            const key = percentilePaths[i].key;
            const isDashed = key === "p25" || key === "p75";
            select(this).attr("stroke-dasharray", isDashed ? "6,4" : null);
          });
      });
    }

    const crosshairLine = g
      .append("line")
      .attr("y1", 0)
      .attr("y2", h)
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("pointer-events", "none")
      .style("display", "none");

    const hoverDots = PERCENTILE_ORDER.map((key) => {
      return g
        .append("circle")
        .attr("r", 4)
        .attr("fill", PERCENTILE_COLORS[key])
        .attr("stroke", "rgba(0,0,0,0.5)")
        .attr("stroke-width", 1.5)
        .attr("pointer-events", "none")
        .style("display", "none");
    });

    d3ElementsRef.current = { crosshairLine, hoverDots, bgPaths };

    const overlay = g
      .append("rect")
      .attr("width", w)
      .attr("height", h)
      .attr("fill", "none")
      .attr("pointer-events", "all");

    const handlePointerMove = (mx: number, my: number) => {
      const tradeIdx = Math.round(x.invert(mx));
      const clamped = Math.max(0, Math.min(tradeIdx, curveLength - 1));

      const cx = x(clamped);
      crosshairLine.attr("x1", cx).attr("x2", cx).style("display", null);

      const values = {} as Record<PercentileKey, number>;
      PERCENTILE_ORDER.forEach((key, i) => {
        const val = result.percentiles[key][clamped];
        values[key] = val;
        hoverDots[i].attr("cx", cx).attr("cy", y(val)).style("display", null);
      });

      bgPaths.forEach(({ curve, element }) => {
        const pathY = y(curve[clamped]);
        const dist = Math.abs(my - pathY);
        let stroke = "rgba(255,255,255,0.06)";
        if (dist < 8) stroke = "rgba(255,255,255,0.30)";
        else if (dist < 25) stroke = "rgba(255,255,255,0.12)";
        select(element).attr("stroke", stroke);
      });

      setHover({ tradeIndex: clamped, mouseX: mx, mouseY: my, values });
    };

    const handlePointerLeave = () => {
      crosshairLine.style("display", "none");
      hoverDots.forEach((dot) => dot.style("display", "none"));
      bgPaths.forEach(({ element }) => {
        select(element).attr("stroke", "rgba(255,255,255,0.06)");
      });
      setHover(null);
    };

    overlay
      .on("mousemove", function (event: MouseEvent) {
        const [mx, my] = pointer(event, this);
        handlePointerMove(mx, my);
      })
      .on("mouseleave", handlePointerLeave)
      .on("touchmove", function (event: TouchEvent) {
        event.preventDefault();
        const touch = event.touches[0];
        const [mx, my] = pointer(touch, this);
        handlePointerMove(mx, my);
      })
      .on("touchend", handlePointerLeave);
  }, [result, startingBalance, width, height, shouldAnimate]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const scales = scalesRef.current;
      if (!scales) return;
      const { curveLength } = scales;

      let idx = focusedTradeIndex ?? 0;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        idx = Math.min(idx + 1, curveLength - 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
      } else if (e.key === "Home") {
        e.preventDefault();
        idx = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        idx = curveLength - 1;
      } else {
        return;
      }

      setFocusedTradeIndex(idx);
      const midY = height / 2;
      updateHoverState(idx, 0, midY);
    },
    [focusedTradeIndex, height, updateHoverState],
  );

  const handleBlur = useCallback(() => {
    setFocusedTradeIndex(null);
    clearHoverState();
  }, [clearHoverState]);

  const tooltipContent = useMemo(() => {
    if (!hover) return null;

    const tooltipW = 160;
    const tooltipH = 130;
    const pos = clampTooltipPosition(
      hover.mouseX,
      hover.mouseY,
      tooltipW,
      tooltipH,
      width,
      height,
      CHART_MARGINS,
    );

    const SHORT_LABELS: Record<PercentileKey, string> = {
      best: "Best",
      p75: "P75",
      median: "Med",
      p25: "P25",
      worst: "Worst",
    };
    const displayOrder: PercentileKey[] = [
      "best",
      "p75",
      "median",
      "p25",
      "worst",
    ];

    return (
      <div
        ref={tooltipRef}
        className="absolute z-20 border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2.5 py-2 shadow-lg"
        style={{
          left: pos.x,
          top: pos.y,
          width: tooltipW,
          pointerEvents: "none" as const,
          fontSize: "0.6875rem",
        }}
      >
        <div className="text-terminal-label mb-1">
          Trade #{hover.tradeIndex}
        </div>
        {displayOrder.map((key) => {
          const val = hover.values[key];
          const pnl = ((val - startingBalance) / startingBalance) * 100;
          const isPos = pnl >= 0;
          return (
            <div
              key={key}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5 py-px"
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: PERCENTILE_COLORS[key] }}
                aria-hidden="true"
              />
              <span className="text-terminal-label tabular-nums">
                <span className="inline-block w-8">{SHORT_LABELS[key]}</span>$
                {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span
                className={`text-terminal-label tabular-nums ${isPos ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"}`}
              >
                {isPos ? "+" : ""}
                {pnl.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    );
  }, [hover, width, height, startingBalance]);

  const dataTableRows = useMemo(() => {
    const curveLength = result.curves[0]?.length || 0;
    const step = Math.max(1, Math.floor(curveLength / 10));
    const rows: { trade: number; values: Record<PercentileKey, number> }[] = [];
    for (let i = 0; i < curveLength; i += step) {
      const values = {} as Record<PercentileKey, number>;
      for (const key of PERCENTILE_ORDER) {
        values[key] = result.percentiles[key][i];
      }
      rows.push({ trade: i, values });
    }
    const lastIdx = curveLength - 1;
    if (rows.length === 0 || rows[rows.length - 1].trade !== lastIdx) {
      const values = {} as Record<PercentileKey, number>;
      for (const key of PERCENTILE_ORDER) {
        values[key] = result.percentiles[key][lastIdx];
      }
      rows.push({ trade: lastIdx, values });
    }
    return rows;
  }, [result]);

  return (
    <div className="relative">
      <div className="absolute left-3 top-2 z-10">
        <span className="inline-flex items-center gap-1.5 border border-[var(--border-color)]/50 bg-[var(--bg-secondary)]/80 px-2.5 py-1 text-[11px] tracking-wider uppercase backdrop-blur-sm">
          <span className="text-[var(--text-muted)]">Start:</span>
          <span className="font-mono text-[var(--text-primary)]">
            ${startingBalance.toLocaleString()}
          </span>
        </span>
      </div>

      <div ref={containerRef} style={{ height: `${height}px` }}>
        <svg
          ref={svgRef}
          className="focus-ring w-full h-full"
          role="img"
          aria-label={chartAriaLabel}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      </div>

      {tooltipContent}

      <details className="mt-1 mx-2">
        <summary className="text-terminal-label cursor-pointer px-2 py-1.5 hover:text-[var(--text-secondary)] transition-colors">
          View Chart Data
        </summary>
        <div className="overflow-x-auto mt-1">
          <table
            className="w-full text-terminal-value"
            style={{ fontSize: "0.75rem" }}
          >
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-terminal-label px-2 py-1 text-left">
                  Trade
                </th>
                {(
                  ["best", "p75", "median", "p25", "worst"] as PercentileKey[]
                ).map((key) => (
                  <th
                    key={key}
                    className="text-terminal-label px-2 py-1 text-right"
                  >
                    {PERCENTILE_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataTableRows.map((row) => (
                <tr
                  key={row.trade}
                  className="border-b border-[var(--border-color)]/30"
                >
                  <td className="px-2 py-1">{row.trade}</td>
                  {(
                    ["best", "p75", "median", "p25", "worst"] as PercentileKey[]
                  ).map((key) => (
                    <td key={key} className="px-2 py-1 text-right">
                      ${Math.round(row.values[key]).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

interface MonteCarloLegendProps {
  result: MonteCarloFullResult;
  startingBalance: number;
}

export function MonteCarloLegend({
  result,
  startingBalance,
}: MonteCarloLegendProps) {
  const percentileData = [
    { key: "best", label: "Best", color: PERCENTILE_COLORS.best },
    { key: "p75", label: "75th", color: PERCENTILE_COLORS.p75 },
    { key: "median", label: "Median", color: PERCENTILE_COLORS.median },
    { key: "p25", label: "25th", color: PERCENTILE_COLORS.p25 },
    { key: "worst", label: "Worst", color: PERCENTILE_COLORS.worst },
  ] as const;

  return (
    <div className="grid grid-cols-5 border-t border-border/30">
      {percentileData.map(({ key, label, color }) => {
        const curve = result.percentiles[key];
        const finalValue = curve[curve.length - 1];
        const pnl = ((finalValue - startingBalance) / startingBalance) * 100;
        const isPositive = pnl >= 0;
        const isDashed = key === "p25" || key === "p75";

        return (
          <div
            key={key}
            className="flex flex-col items-center gap-1 px-2 py-2.5"
          >
            <div className="flex items-center gap-1.5">
              <div
                className="w-3"
                style={{
                  height: isDashed ? 0 : 2,
                  backgroundColor: isDashed ? "transparent" : color,
                  borderBottom: isDashed ? `2px dashed ${color}` : undefined,
                }}
                aria-hidden="true"
              />
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                {label}
              </span>
            </div>
            <span
              className={`font-mono text-xs tabular-nums ${
                isPositive ? "text-status-safe" : "text-status-danger"
              }`}
            >
              {isPositive ? "+" : ""}
              {pnl.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
