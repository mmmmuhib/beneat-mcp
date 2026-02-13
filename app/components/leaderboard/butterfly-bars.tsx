"use client";

interface BarData {
  label: string;
  valueA: number;
  valueB: number;
  max: number;
}

interface ButterflyBarsProps {
  data: BarData[];
  colorA: string;
  colorB: string;
}

export function ButterflyBars({ data, colorA, colorB }: ButterflyBarsProps) {
  return (
    <div className="space-y-2">
      {data.map((row) => {
        const pctA = (row.valueA / row.max) * 100;
        const pctB = (row.valueB / row.max) * 100;
        return (
          <div key={row.label} className="grid grid-cols-[4rem_1fr_3rem_1fr_4rem] items-center gap-2 text-xs">
            <span
              className="text-right font-mono tabular-nums"
              style={{ color: colorA }}
            >
              {typeof row.valueA === "number" && row.valueA % 1 !== 0
                ? row.valueA.toFixed(1)
                : row.valueA}
            </span>
            <div className="flex justify-end">
              <div
                className="h-2 rounded-l-sm transition-all"
                style={{
                  width: `${pctA}%`,
                  backgroundColor: colorA,
                  opacity: 0.7,
                }}
              />
            </div>
            <span className="text-center text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {row.label}
            </span>
            <div className="flex justify-start">
              <div
                className="h-2 rounded-r-sm transition-all"
                style={{
                  width: `${pctB}%`,
                  backgroundColor: colorB,
                  opacity: 0.7,
                }}
              />
            </div>
            <span
              className="font-mono tabular-nums"
              style={{ color: colorB }}
            >
              {typeof row.valueB === "number" && row.valueB % 1 !== 0
                ? row.valueB.toFixed(1)
                : row.valueB}
            </span>
          </div>
        );
      })}
    </div>
  );
}
