"use client";

import type { MarketAccuracy } from "../../lib/wallet-analytics";

interface MarketBreakdownProps {
  markets: Record<string, MarketAccuracy>;
}

export function MarketBreakdown({ markets }: MarketBreakdownProps) {
  const entries = Object.entries(markets).sort(
    (a, b) => b[1].trades - a[1].trades
  );

  if (entries.length === 0) return null;

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-cyan)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Market Breakdown
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th className="pb-2 pr-4 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Market
              </th>
              <th className="pb-2 pr-4 text-right text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Trades
              </th>
              <th className="pb-2 pr-4 text-right text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Win Rate
              </th>
              <th className="pb-2 text-right text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Avg PnL
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([market, data]) => (
              <tr
                key={market}
                className="border-b border-[var(--border-color)]/50"
              >
                <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">
                  {market}
                </td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {data.trades}
                </td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums"
                  style={{
                    color: data.win_rate >= 0.5 ? "var(--profit-green)" : "var(--loss-red)",
                  }}
                >
                  {(data.win_rate * 100).toFixed(0)}%
                </td>
                <td className="py-2 text-right font-mono tabular-nums"
                  style={{
                    color: data.avg_pnl_sol >= 0 ? "var(--profit-green)" : "var(--loss-red)",
                  }}
                >
                  {data.avg_pnl_sol >= 0 ? "+" : ""}{data.avg_pnl_sol.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
