"use client";

export interface Trade {
  side: "LONG" | "SHORT";
  token: string;
  entry_price: number;
  exit_price: number;
  size: number;
  hold_time: string;
  fees: number;
  net_pnl: number;
}

export function TradeHistory({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Trade History
          </span>
        </div>
        <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">
          No trades recorded
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-glow-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Last {trades.length} Trades
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              {["SIDE", "TOKEN", "ENTRY", "EXIT", "SIZE", "HOLD", "FEES", "NET P&L"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-2 py-1.5 text-left font-bold uppercase tracking-widest text-[var(--text-muted)]"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr
                key={`${trade.token}-${trade.side}-${trade.entry_price}-${trade.net_pnl}-${i}`}
                className="border-b border-[var(--border-color)] hover:bg-[var(--bg-elevated)]"
              >
                <td
                  className={`px-2 py-1.5 font-bold ${
                    trade.side === "LONG"
                      ? "text-[var(--profit-green)]"
                      : "text-[var(--loss-red)]"
                  }`}
                >
                  {trade.side}
                </td>
                <td className="px-2 py-1.5 text-[var(--text-primary)]">
                  {trade.token}
                </td>
                <td className="px-2 py-1.5 font-mono tabular-nums text-[var(--text-primary)]">
                  ${trade.entry_price.toFixed(2)}
                </td>
                <td className="px-2 py-1.5 font-mono tabular-nums text-[var(--text-primary)]">
                  ${trade.exit_price.toFixed(2)}
                </td>
                <td className="px-2 py-1.5 font-mono tabular-nums text-[var(--text-primary)]">
                  {trade.size}
                </td>
                <td className="px-2 py-1.5 text-[var(--text-muted)]">
                  {trade.hold_time}
                </td>
                <td className="px-2 py-1.5 font-mono tabular-nums text-[var(--text-muted)]">
                  {trade.fees.toFixed(4)}
                </td>
                <td
                  className={`px-2 py-1.5 font-mono font-bold tabular-nums ${
                    trade.net_pnl >= 0
                      ? "text-[var(--profit-green)]"
                      : "text-[var(--loss-red)]"
                  }`}
                >
                  {trade.net_pnl >= 0 ? "+" : ""}
                  {trade.net_pnl.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
