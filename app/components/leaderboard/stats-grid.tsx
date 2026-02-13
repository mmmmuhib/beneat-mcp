"use client";

interface Stat {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3"
        >
          <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {stat.label}
          </div>
          <div
            className="mt-1 font-mono text-lg font-bold tabular-nums"
            style={{ color: stat.color ?? "var(--text-primary)" }}
          >
            {stat.value}
          </div>
          {stat.sub && (
            <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
              {stat.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
