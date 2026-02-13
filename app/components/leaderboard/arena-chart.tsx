"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import {
  select,
  scaleLinear,
  min,
  max,
  axisBottom,
  axisLeft,
  line,
  curveMonotoneX,
  pointer,
  bisector,
} from "d3";
import { clampTooltipPosition } from "../simulator/chart-utils";
import { resolveIcon, getAgentInitial, AgentIcon } from "../simulator/agent-icon";
import { ButterflyBars } from "./butterfly-bars";

interface AgentEquityData {
  wallet: string;
  name: string | null;
  trust_grade: string;
  color: string;
  data: { timestamp: number; value: number; progress?: number }[];
  stats: {
    win_rate: number;
    discipline: number;
    trust_score: number;
    total_pnl_sol: number;
    total_trades: number;
    lockout_count: number;
  };
}

type FilterMode = "all" | "top5" | "top10";

interface ArenaChartProps {
  agents: AgentEquityData[];
  height?: number;
}

interface NormalizedPoint {
  progress: number;
  value: number;
}

interface NormalizedAgent {
  wallet: string;
  name: string | null;
  color: string;
  isEnforced: boolean;
  pairHash: string;
  data: NormalizedPoint[];
}

interface HoverState {
  mouseX: number;
  mouseY: number;
  progress: number;
  agents: { wallet: string; name: string | null; color: string; isEnforced: boolean; value: number }[];
}

const MARGIN = { top: 12, right: 16, bottom: 32, left: 56 };

/** Compute a percentile value from a sorted array */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const progressBisector = bisector<NormalizedPoint, number>((d) => d.progress).left;

export function ArenaChart({ agents, height = 360 }: ArenaChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FilterMode>("top10");
  const [selected, setSelected] = useState<string[]>([]);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });

  const displayAgents = useMemo(() => {
    if (filter === "top5") return agents.slice(0, 5);
    if (filter === "top10") return agents.slice(0, 10);
    return agents;
  }, [agents, filter]);

  // Normalize all equity curves to % return from starting value, with progress 0→1
  const normalizedAgents: NormalizedAgent[] = useMemo(() => {
    return displayAgents.map((agent) => {
      const isEnforced = agent.wallet.startsWith("ARENA_ENF_");
      const pairHash = agent.wallet.replace(/^ARENA_(BASE|ENF)_/, "");

      if (agent.data.length === 0) {
        return { wallet: agent.wallet, name: agent.name, color: agent.color, isEnforced, pairHash, data: [] };
      }

      const startValue = agent.data[0].value;
      if (startValue === 0) {
        return {
          wallet: agent.wallet,
          name: agent.name,
          color: agent.color,
          isEnforced,
          pairHash,
          data: agent.data.map((d, i) => ({
            progress: d.progress ?? (agent.data.length > 1 ? i / (agent.data.length - 1) : 0),
            value: d.value,
          })),
        };
      }

      return {
        wallet: agent.wallet,
        name: agent.name,
        color: agent.color,
        isEnforced,
        pairHash,
        data: agent.data.map((d, i) => ({
          progress: d.progress ?? (agent.data.length > 1 ? i / (agent.data.length - 1) : 0),
          value: ((d.value - startValue) / startValue) * 100,
        })),
      };
    });
  }, [displayAgents]);

  const isH2H = selected.length === 2;

  const handleAgentClick = useCallback((wallet: string) => {
    setSelected((prev) => {
      if (prev.includes(wallet)) return prev.filter((w) => w !== wallet);
      if (prev.length >= 2) return [prev[1], wallet];
      return [...prev, wallet];
    });
  }, []);

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

  // Sort agents: baselines first (behind), enforced on top
  const sortedAgents = useMemo(() => {
    return [...normalizedAgents].sort((a, b) => {
      if (a.isEnforced === b.isEnforced) return 0;
      return a.isEnforced ? 1 : -1; // enforced renders last (on top)
    });
  }, [normalizedAgents]);

  useEffect(() => {
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    if (sortedAgents.length === 0 || dimensions.width === 0) return;

    const w = dimensions.width - MARGIN.left - MARGIN.right;
    const h = dimensions.height - MARGIN.top - MARGIN.bottom;

    svg
      .attr("width", dimensions.width)
      .attr("height", dimensions.height);

    const defs = svg.append("defs");

    const g = svg
      .append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const allValues = sortedAgents.flatMap((a) => a.data.map((d) => d.value));
    if (allValues.length === 0) return;

    // --- X-axis: normalized progress 0→1 ---
    const x = scaleLinear().domain([0, 1]).range([0, w]);

    // --- Y-axis: IQR-based domain to handle extreme outliers ---
    // Tukey fences: Q1 - 1.5*IQR to Q3 + 1.5*IQR excludes statistical outliers
    // so agents like Grok 4 with extreme losses don't crush the visible range
    const sorted = [...allValues].sort((a, b) => a - b);
    const Q1 = percentile(sorted, 0.25);
    const Q3 = percentile(sorted, 0.75);
    const IQR = Q3 - Q1;
    const lowerFence = Q1 - 1.5 * IQR;
    const upperFence = Q3 + 1.5 * IQR;
    const yLo = Math.min(lowerFence, 0);
    const yHi = Math.max(upperFence, 0);
    const range = yHi - yLo || 10;
    const pad = range * 0.1;
    const y = scaleLinear()
      .domain([yLo - pad, yHi + pad])
      .range([h, 0]);

    // Clip path for the chart area — lines beyond the domain exit cleanly
    defs.append("clipPath")
      .attr("id", "arena-clip")
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", w)
      .attr("height", h);

    // --- Grid lines (horizontal) ---
    const yTicks = y.ticks(6);
    yTicks.forEach((tick) => {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", w)
        .attr("y1", y(tick))
        .attr("y2", y(tick))
        .attr("stroke", "rgba(255,255,255,0.06)")
        .attr("stroke-width", 1);
    });

    // --- 0% reference line (more prominent) ---
    const zeroY = y(0);
    if (zeroY >= 0 && zeroY <= h) {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", w)
        .attr("y1", zeroY)
        .attr("y2", zeroY)
        .attr("stroke", "#52525b")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.7);
    }

    // --- X-axis: progress labels ---
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(
        axisBottom(x)
          .tickValues([0, 0.25, 0.5, 0.75, 1])
          .tickFormat((d) => `${Math.round((d as number) * 100)}%`),
      )
      .call((sel) => sel.select(".domain").attr("stroke", "#27272a"))
      .call((sel) => sel.selectAll(".tick line").attr("stroke", "#27272a"))
      .call((sel) =>
        sel.selectAll(".tick text").attr("fill", "#71717a").attr("font-size", 9),
      );

    // X-axis label
    g.append("text")
      .attr("x", w / 2)
      .attr("y", h + 26)
      .attr("fill", "#52525b")
      .attr("font-size", 8)
      .attr("text-anchor", "middle")
      .text("Trade Progress");

    // --- Y-axis: % return ---
    g.append("g")
      .call(
        axisLeft(y)
          .ticks(6)
          .tickFormat((d) => {
            const v = d as number;
            return `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;
          }),
      )
      .call((sel) => sel.select(".domain").attr("stroke", "#27272a"))
      .call((sel) => sel.selectAll(".tick line").attr("stroke", "#27272a"))
      .call((sel) =>
        sel.selectAll(".tick text").attr("fill", "#71717a").attr("font-size", 9),
      );

    // --- Lines (rendered inside a clipped group) ---
    const linesG = g.append("g").attr("clip-path", "url(#arena-clip)");

    const lineFn = line<NormalizedPoint>()
      .x((d) => x(d.progress))
      .y((d) => y(d.value))
      .curve(curveMonotoneX);

    sortedAgents.forEach((agent) => {
      if (agent.data.length < 2) return;

      const isSelected = selected.includes(agent.wallet);
      const isDimmed = isH2H && !isSelected;

      const strokeWidth = isSelected ? 3 : agent.isEnforced ? 2 : 1.5;
      const opacity = isDimmed ? 0.08 : agent.isEnforced ? 1 : 0.5;

      const path = linesG
        .append("path")
        .datum(agent.data)
        .attr("fill", "none")
        .attr("stroke", agent.color)
        .attr("stroke-width", strokeWidth)
        .attr("opacity", opacity)
        .attr("d", lineFn);

      // Baseline = dashed, enforced = solid
      if (!agent.isEnforced) {
        path.attr("stroke-dasharray", "6,4");
      }
    });

    // --- Endpoint icons (unclipped, clamped to visible area) ---
    const yDomain = y.domain();
    const endpointsG = g.append("g");

    sortedAgents.forEach((agent) => {
      if (agent.data.length < 2) return;

      const isSelected = selected.includes(agent.wallet);
      const isDimmed = isH2H && !isSelected;
      const opacity = isDimmed ? 0.08 : 1;

      const last = agent.data[agent.data.length - 1];
      const endX = x(last.progress);
      const isClamped = last.value < yDomain[0] || last.value > yDomain[1];
      const clampedValue = Math.max(yDomain[0], Math.min(yDomain[1], last.value));
      const endY = y(clampedValue);

      const iconSrc = resolveIcon(agent.name ?? "");
      const iconSize = agent.isEnforced ? 18 : 14;

      if (iconSrc) {
        // Agent has a known icon — render circular clipped image
        const clipIdIcon = `icon-${agent.wallet.replace(/[^a-zA-Z0-9]/g, "")}`;
        defs.append("clipPath")
          .attr("id", clipIdIcon)
          .append("circle")
          .attr("cx", endX)
          .attr("cy", endY)
          .attr("r", iconSize / 2);

        endpointsG.append("image")
          .attr("href", iconSrc)
          .attr("x", endX - iconSize / 2)
          .attr("y", endY - iconSize / 2)
          .attr("width", iconSize)
          .attr("height", iconSize)
          .attr("clip-path", `url(#${clipIdIcon})`)
          .attr("opacity", opacity);

        // Color ring around icon
        endpointsG.append("circle")
          .attr("cx", endX)
          .attr("cy", endY)
          .attr("r", iconSize / 2)
          .attr("fill", "none")
          .attr("stroke", agent.color)
          .attr("stroke-width", 1.5)
          .attr("opacity", opacity);
      } else {
        // Monogram fallback — colored circle with initial letter
        endpointsG.append("circle")
          .attr("cx", endX)
          .attr("cy", endY)
          .attr("r", iconSize / 2)
          .attr("fill", agent.color)
          .attr("stroke", "#0a0a0b")
          .attr("stroke-width", 1.5)
          .attr("opacity", opacity);

        endpointsG.append("text")
          .attr("x", endX)
          .attr("y", endY)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("fill", "#fff")
          .attr("font-size", iconSize * 0.5)
          .attr("font-weight", "700")
          .attr("font-family", "Outfit, sans-serif")
          .attr("opacity", opacity)
          .attr("pointer-events", "none")
          .text(getAgentInitial(agent.name));
      }

      // Arrow indicator when value is clamped off-chart
      if (isClamped) {
        const arrowChar = last.value < yDomain[0] ? "▼" : "▲";
        const arrowY = last.value < yDomain[0]
          ? endY + iconSize / 2 + 7
          : endY - iconSize / 2 - 7;
        endpointsG.append("text")
          .attr("x", endX)
          .attr("y", arrowY)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("fill", agent.color)
          .attr("font-size", 7)
          .attr("opacity", opacity * 0.7)
          .attr("pointer-events", "none")
          .text(arrowChar);
      }
    });

    // --- Hover overlay ---
    const crosshairLine = g
      .append("line")
      .attr("y1", 0)
      .attr("y2", h)
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("pointer-events", "none")
      .style("display", "none");

    // Hover dots for each agent
    const hoverDots = sortedAgents
      .filter((a) => a.data.length >= 2)
      .map((agent) => ({
        wallet: agent.wallet,
        dot: g
          .append("circle")
          .attr("r", agent.isEnforced ? 4 : 3)
          .attr("fill", agent.color)
          .attr("stroke", "rgba(0,0,0,0.5)")
          .attr("stroke-width", 1)
          .attr("pointer-events", "none")
          .style("display", "none"),
      }));

    g.append("rect")
      .attr("width", w)
      .attr("height", h)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .style("cursor", "crosshair")
      .on("mousemove", function (event: MouseEvent) {
        const [mx, my] = pointer(event, this);
        const prog = Math.max(0, Math.min(1, x.invert(mx)));

        crosshairLine.attr("x1", x(prog)).attr("x2", x(prog)).style("display", null);

        const agentValues: HoverState["agents"] = [];

        sortedAgents.forEach((agent) => {
          if (agent.data.length < 2) return;

          const idx = progressBisector(agent.data, prog);
          const clamped = Math.max(0, Math.min(idx, agent.data.length - 1));
          // Pick closer of clamped and clamped-1
          let closest = clamped;
          if (clamped > 0) {
            const d0 = Math.abs(agent.data[clamped - 1].progress - prog);
            const d1 = Math.abs(agent.data[clamped].progress - prog);
            if (d0 < d1) closest = clamped - 1;
          }

          const pt = agent.data[closest];
          const hd = hoverDots.find((h) => h.wallet === agent.wallet);
          if (hd) {
            hd.dot
              .attr("cx", x(pt.progress))
              .attr("cy", Math.max(0, Math.min(h, y(pt.value))))
              .style("display", null);
          }

          agentValues.push({
            wallet: agent.wallet,
            name: agent.name,
            color: agent.color,
            isEnforced: agent.isEnforced,
            value: pt.value,
          });
        });

        // Sort tooltip by value descending
        agentValues.sort((a, b) => b.value - a.value);

        setHover({ mouseX: mx, mouseY: my, progress: prog, agents: agentValues });
      })
      .on("mouseleave", function () {
        crosshairLine.style("display", "none");
        hoverDots.forEach((h) => h.dot.style("display", "none"));
        setHover(null);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedAgents, dimensions, selected, isH2H]);

  // Tooltip content
  const tooltipContent = useMemo(() => {
    if (!hover || hover.agents.length === 0) return null;

    const tooltipW = 200;
    const tooltipH = Math.min(24 + hover.agents.length * 20, 240);
    const pos = clampTooltipPosition(
      hover.mouseX,
      hover.mouseY,
      tooltipW,
      tooltipH,
      dimensions.width,
      dimensions.height,
      MARGIN,
    );

    return (
      <div
        className="absolute z-20 border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 shadow-lg"
        style={{
          left: pos.x,
          top: pos.y,
          width: tooltipW,
          maxHeight: 240,
          overflow: "hidden",
          pointerEvents: "none" as const,
        }}
      >
        <div className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {Math.round(hover.progress * 100)}% progress
        </div>
        {hover.agents.map((a) => (
          <div key={a.wallet} className="flex items-center gap-1.5 py-[2px]">
            <span
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ backgroundColor: a.color }}
            />
            <span className="min-w-0 truncate font-mono text-[9px] text-[var(--text-secondary)]">
              {a.name ?? `${a.wallet.slice(0, 6)}..`}
            </span>
            <span
              className={`ml-auto shrink-0 font-mono text-[9px] font-medium ${
                a.value >= 0 ? "text-[var(--profit-green)]" : "text-[var(--loss-red)]"
              }`}
            >
              {a.value >= 0 ? "+" : ""}
              {a.value.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    );
  }, [hover, dimensions]);

  const selectedAgents = useMemo(
    () =>
      selected
        .map((w) => agents.find((a) => a.wallet === w))
        .filter(Boolean) as AgentEquityData[],
    [selected, agents],
  );

  const h2hData = useMemo(() => {
    if (selectedAgents.length !== 2) return null;
    const [a, b] = selectedAgents;
    return [
      {
        label: "WIN%",
        valueA: a.stats.win_rate * 100,
        valueB: b.stats.win_rate * 100,
        max: 100,
      },
      {
        label: "DISC",
        valueA: a.stats.discipline,
        valueB: b.stats.discipline,
        max: 99,
      },
      {
        label: "TRUST",
        valueA: a.stats.trust_score,
        valueB: b.stats.trust_score,
        max: 100,
      },
      {
        label: "TRD",
        valueA: a.stats.total_trades,
        valueB: b.stats.total_trades,
        max: Math.max(a.stats.total_trades, b.stats.total_trades) || 1,
      },
      {
        label: "LOCK",
        valueA: a.stats.lockout_count,
        valueB: b.stats.lockout_count,
        max: Math.max(a.stats.lockout_count, b.stats.lockout_count) || 1,
      },
    ];
  }, [selectedAgents]);

  // Build paired legend: group by pairHash
  const pairedLegend = useMemo(() => {
    const pairMap = new Map<
      string,
      { name: string | null; baseline?: AgentEquityData; enforced?: AgentEquityData }
    >();

    for (const agent of displayAgents) {
      const isEnforced = agent.wallet.startsWith("ARENA_ENF_");
      const hash = agent.wallet.replace(/^ARENA_(BASE|ENF)_/, "");

      if (!pairMap.has(hash)) {
        pairMap.set(hash, { name: null });
      }
      const entry = pairMap.get(hash)!;
      if (isEnforced) {
        entry.enforced = agent;
        // Use enforced name without "[Beneat]" suffix for display
        entry.name = agent.name?.replace(" [Beneat]", "") ?? null;
      } else {
        entry.baseline = agent;
        if (!entry.name) entry.name = agent.name;
      }
    }

    // Include unpaired agents (non-arena agents)
    const pairs: {
      hash: string;
      name: string | null;
      baseline?: AgentEquityData;
      enforced?: AgentEquityData;
    }[] = [];

    for (const [hash, entry] of pairMap) {
      pairs.push({ hash, ...entry });
    }

    return pairs;
  }, [displayAgents]);

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-violet)] animate-glow-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Arena Overview
          </span>
          <span className="text-[9px] text-[var(--text-muted)] opacity-60">
            — dashed: baseline · solid: enforced
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(["all", "top10", "top5"] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                filter === f
                  ? "border border-accent bg-accent/10 text-accent"
                  : "border border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f === "all" ? "All" : f === "top10" ? "Top 10" : "Top 5"}
            </button>
          ))}
          {isH2H && (
            <button
              onClick={() => setSelected([])}
              className="ml-2 border border-[var(--loss-red)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--loss-red)] hover:bg-[var(--loss-red)]/10"
            >
              Clear H2H
            </button>
          )}
        </div>
      </div>

      <div className="relative p-4">
        <div ref={containerRef} className="w-full">
          <svg ref={svgRef} className="w-full" />
        </div>

        {tooltipContent}

        {displayAgents.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="text-[10px] text-[var(--text-muted)]">
              No equity data available
            </span>
          </div>
        )}

        {/* Paired legend grid */}
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {pairedLegend.map((pair) => {
            const hasBaseline = !!pair.baseline;
            const hasEnforced = !!pair.enforced;
            const displayName =
              pair.name ??
              `${pair.hash.slice(0, 4)}...${pair.hash.slice(-4)}`;

            return (
              <div key={pair.hash} className="flex items-center gap-1.5 py-0.5">
                {/* Baseline swatch (dashed) */}
                {hasBaseline ? (
                  <button
                    onClick={() => handleAgentClick(pair.baseline!.wallet)}
                    className={`flex items-center rounded-sm px-1 py-0.5 transition-colors ${
                      selected.includes(pair.baseline!.wallet)
                        ? "bg-[var(--bg-elevated)] ring-1 ring-accent"
                        : "hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    <span
                      className="inline-block w-3"
                      style={{
                        height: 0,
                        borderTop: `2px dashed ${pair.baseline!.color}`,
                      }}
                    />
                  </button>
                ) : (
                  <span className="w-5" />
                )}

                {/* Enforced swatch (solid) */}
                {hasEnforced ? (
                  <button
                    onClick={() => handleAgentClick(pair.enforced!.wallet)}
                    className={`flex items-center rounded-sm px-1 py-0.5 transition-colors ${
                      selected.includes(pair.enforced!.wallet)
                        ? "bg-[var(--bg-elevated)] ring-1 ring-accent"
                        : "hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    <span
                      className="inline-block h-0.5 w-3"
                      style={{
                        backgroundColor: pair.enforced!.color,
                      }}
                    />
                  </button>
                ) : (
                  <span className="w-5" />
                )}

                {/* Agent icon */}
                <span className="shrink-0">
                  <AgentIcon
                    name={displayName}
                    size={14}
                    color={pair.enforced?.color ?? pair.baseline?.color ?? "#52525b"}
                  />
                </span>

                {/* Shared agent name */}
                <span className="truncate text-[9px] text-[var(--text-secondary)]">
                  {displayName}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {isH2H && h2hData && selectedAgents.length === 2 && (
        <div className="border-t border-[var(--border-color)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Head to Head
            </span>
          </div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span style={{ color: selectedAgents[0].color }}>
              {selectedAgents[0].name ?? selectedAgents[0].wallet.slice(0, 8)}
            </span>
            <span className="text-[var(--text-muted)]">VS</span>
            <span style={{ color: selectedAgents[1].color }}>
              {selectedAgents[1].name ?? selectedAgents[1].wallet.slice(0, 8)}
            </span>
          </div>
          <ButterflyBars
            data={h2hData}
            colorA={selectedAgents[0].color}
            colorB={selectedAgents[1].color}
          />
        </div>
      )}
    </div>
  );
}
