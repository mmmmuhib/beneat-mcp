export const CHART_MARGINS = { top: 24, right: 56, bottom: 40, left: 12 };

export const PERCENTILE_COLORS = {
  best: "#22c55e",
  p75: "#06b6d4",
  median: "#3b82f6",
  p25: "#eab308",
  worst: "#ef4444",
} as const;

export const PERCENTILE_LABELS = {
  best: "Best Case",
  p75: "75th Percentile",
  median: "Median",
  p25: "25th Percentile",
  worst: "Worst Case",
} as const;

export const PERCENTILE_ORDER: (keyof typeof PERCENTILE_COLORS)[] = [
  "worst",
  "p25",
  "median",
  "p75",
  "best",
];

export const INTERVENTION_COLORS = {
  stop_loss: "#ef4444",
  cooldown: "#f59e0b",
  lockout: "#ef4444",
  tilt_reduction: "#8b5cf6",
  post_loss_reduction: "#06b6d4",
} as const;

export const TIMELINE_MARGINS = { top: 20, right: 56, bottom: 36, left: 12 };
export const DIFF_MARGINS = { top: 16, right: 80, bottom: 16, left: 120 };

export function formatDollarAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return `$${Math.round(value)}`;
  if (abs < 10000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value / 1000)}k`;
}

export function clampTooltipPosition(
  mouseX: number,
  mouseY: number,
  tooltipW: number,
  tooltipH: number,
  containerW: number,
  containerH: number,
  margin: { top: number; right: number; bottom: number; left: number }
): { x: number; y: number } {
  const pad = 12;
  let x = mouseX + margin.left + pad;
  let y = mouseY + margin.top - tooltipH / 2;

  if (x + tooltipW > containerW) {
    x = mouseX + margin.left - tooltipW - pad;
  }
  if (x < 0) x = pad;

  if (y < 0) y = pad;
  if (y + tooltipH > containerH) {
    y = containerH - tooltipH - pad;
  }

  return { x, y };
}
