"use client";

import { useMemo } from "react";
import { scaleLinear, min, max, line, curveMonotoneX } from "d3";

interface SparklineCellProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function SparklineCell({
  data,
  width = 60,
  height = 20,
  color = "var(--accent-cyan)",
}: SparklineCellProps) {
  const path = useMemo(() => {
    if (data.length < 2) return "";

    const x = scaleLinear()
      .domain([0, data.length - 1])
      .range([1, width - 1]);

    const y = scaleLinear()
      .domain([min(data) ?? 0, max(data) ?? 1])
      .range([height - 1, 1]);

    const lineFn = line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX);

    return lineFn(data) ?? "";
  }, [data, width, height]);

  if (data.length < 2) {
    return <span className="text-[9px] text-[var(--text-muted)]">—</span>;
  }

  const trend = data[data.length - 1] - data[0];
  const strokeColor = trend >= 0 ? "var(--profit-green)" : "var(--loss-red)";

  return (
    <svg width={width} height={height} className="inline-block">
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={1.5} />
    </svg>
  );
}
