"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import {
  select,
  scaleTime,
  scaleLinear,
  extent,
  min,
  max,
  axisBottom,
  axisLeft,
  line,
  curveMonotoneX,
  area,
} from "d3";

interface DataPoint {
  timestamp: number;
  value: number;
}

interface LockoutEvent {
  timestamp: number;
  duration: number;
}

interface EquityCurveProps {
  data: DataPoint[];
  lockouts?: LockoutEvent[];
  agentColor?: string;
  height?: number;
}

type TimeRange = "7D" | "30D" | "ALL";

export function EquityCurve({
  data,
  lockouts = [],
  agentColor = "var(--accent-cyan)",
  height = 240,
}: EquityCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<TimeRange>("7D");
  const [dimensions, setDimensions] = useState({ width: 0, height });

  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    const now = Date.now();
    const cutoffs: Record<TimeRange, number> = {
      "7D": now - 7 * 24 * 60 * 60 * 1000,
      "30D": now - 30 * 24 * 60 * 60 * 1000,
      ALL: 0,
    };
    return data.filter((d) => d.timestamp >= cutoffs[range]);
  }, [data, range]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [height]);

  useEffect(() => {
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    if (filteredData.length < 2 || dimensions.width === 0) return;

    const margin = { top: 8, right: 12, bottom: 24, left: 48 };
    const w = dimensions.width - margin.left - margin.right;
    const h = dimensions.height - margin.top - margin.bottom;

    const g = svg
      .attr("width", dimensions.width)
      .attr("height", dimensions.height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = scaleTime()
      .domain(extent(filteredData, (d) => d.timestamp) as [number, number])
      .range([0, w]);

    const y = scaleLinear()
      .domain([
        (min(filteredData, (d) => d.value) ?? 0) * 0.95,
        (max(filteredData, (d) => d.value) ?? 1) * 1.05,
      ])
      .range([h, 0]);

    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(
        axisBottom(x)
          .ticks(5)
          .tickFormat((d) => {
            const date = new Date(d as number);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          }),
      )
      .call((g) => g.select(".domain").attr("stroke", "#27272a"))
      .call((g) => g.selectAll(".tick line").attr("stroke", "#27272a"))
      .call((g) =>
        g.selectAll(".tick text").attr("fill", "#71717a").attr("font-size", 9),
      );

    g.append("g")
      .call(
        axisLeft(y)
          .ticks(4)
          .tickFormat((d) => `${(d as number).toFixed(1)}`),
      )
      .call((g) => g.select(".domain").attr("stroke", "#27272a"))
      .call((g) => g.selectAll(".tick line").attr("stroke", "#27272a"))
      .call((g) =>
        g.selectAll(".tick text").attr("fill", "#71717a").attr("font-size", 9),
      );

    const lineFn = line<DataPoint>()
      .x((d) => x(d.timestamp))
      .y((d) => y(d.value))
      .curve(curveMonotoneX);

    g.append("path")
      .datum(filteredData)
      .attr("fill", "none")
      .attr("stroke", agentColor)
      .attr("stroke-width", 2)
      .attr("d", lineFn);

    const areaFn = area<DataPoint>()
      .x((d) => x(d.timestamp))
      .y0(h)
      .y1((d) => y(d.value))
      .curve(curveMonotoneX);

    g.append("path")
      .datum(filteredData)
      .attr("fill", agentColor)
      .attr("opacity", 0.08)
      .attr("d", areaFn);

    lockouts.forEach((lockout) => {
      const lx = x(lockout.timestamp);
      if (lx >= 0 && lx <= w) {
        g.append("line")
          .attr("x1", lx)
          .attr("x2", lx)
          .attr("y1", 0)
          .attr("y2", h)
          .attr("stroke", "#ef4444")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "4,3")
          .attr("opacity", 0.6);
      }
    });
  }, [filteredData, lockouts, dimensions, agentColor]);

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: agentColor }}
          />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Equity Curve
          </span>
        </div>
        <div className="flex gap-1">
          {(["7D", "30D", "ALL"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                range === r
                  ? "border border-accent bg-accent/10 text-accent"
                  : "border border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="w-full">
        <svg ref={svgRef} className="w-full" />
      </div>
      {filteredData.length < 2 && (
        <div className="flex items-center justify-center py-8">
          <span className="text-[10px] text-[var(--text-muted)]">
            Insufficient data for chart
          </span>
        </div>
      )}
    </div>
  );
}
