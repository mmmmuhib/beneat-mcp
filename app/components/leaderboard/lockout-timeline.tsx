"use client";

import { useRef, useEffect, useState } from "react";
import { select, scaleTime, min, max } from "d3";

interface LockoutEvent {
  start: number;
  duration: number;
  reason?: string;
}

interface LockoutTimelineProps {
  events: LockoutEvent[];
  currentlyLocked: boolean;
  lockoutCount: number;
}

export function LockoutTimeline({
  events,
  currentlyLocked,
  lockoutCount,
}: LockoutTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const HEIGHT = 40;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    if (events.length === 0 || width === 0) return;

    svg.attr("width", width).attr("height", HEIGHT);

    const allTimes = events.flatMap((e) => [
      e.start,
      e.start + e.duration * 1000,
    ]);
    const x = scaleTime()
      .domain([min(allTimes) ?? 0, max(allTimes) ?? Date.now()])
      .range([0, width]);

    svg
      .append("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", HEIGHT / 2)
      .attr("y2", HEIGHT / 2)
      .attr("stroke", "#27272a")
      .attr("stroke-width", 1);

    events.forEach((event) => {
      const startX = x(event.start);
      const endX = x(event.start + event.duration * 1000);
      svg
        .append("rect")
        .attr("x", startX)
        .attr("y", HEIGHT / 2 - 6)
        .attr("width", Math.max(endX - startX, 3))
        .attr("height", 12)
        .attr("fill", "#ef4444")
        .attr("opacity", 0.6)
        .attr("rx", 1);
    });
  }, [events, width]);

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              currentlyLocked
                ? "bg-[var(--loss-red)] animate-glow-pulse"
                : "bg-[var(--text-muted)]"
            }`}
          />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Lockout History
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[var(--text-muted)]">
            Total:{" "}
            <span className="font-mono font-bold text-[var(--text-primary)]">
              {lockoutCount}
            </span>
          </span>
          <span
            className={`font-bold uppercase ${
              currentlyLocked
                ? "text-[var(--loss-red)]"
                : "text-[var(--profit-green)]"
            }`}
          >
            {currentlyLocked ? "LOCKED" : "ACTIVE"}
          </span>
        </div>
      </div>
      <div ref={containerRef} className="w-full">
        {events.length > 0 ? (
          <svg ref={svgRef} className="w-full" />
        ) : (
          <p className="py-2 text-center text-[10px] text-[var(--text-muted)]">
            No lockout events recorded
          </p>
        )}
      </div>
    </div>
  );
}
