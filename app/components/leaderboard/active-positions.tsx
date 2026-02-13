"use client";

export interface Position {
  side: "LONG" | "SHORT";
  token: string;
  entry_price: number;
  current_price: number;
  size: number;
  unrealized_pnl: number;
  entry_time: string;
}

export function ActivePositions({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return (
      <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Active Positions
          </span>
        </div>
        <p className="py-4 text-center text-[10px] text-[var(--text-muted)]">
          No active positions
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-cyan)] animate-glow-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Active Positions
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">
          Total Unrealized:{" "}
          <span
            className={`font-mono font-bold tabular-nums ${
              positions.reduce((s, p) => s + p.unrealized_pnl, 0) >= 0
                ? "text-[var(--profit-green)]"
                : "text-[var(--loss-red)]"
            }`}
          >
            {positions.reduce((s, p) => s + p.unrealized_pnl, 0) >= 0
              ? "+"
              : ""}
            {positions.reduce((s, p) => s + p.unrealized_pnl, 0).toFixed(2)} SOL
          </span>
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {positions.map((pos, i) => {
          const isProfit = pos.unrealized_pnl >= 0;
          return (
            <div
              key={`${pos.token}-${pos.side}-${pos.entry_price}-${pos.entry_time}`}
              className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    pos.side === "LONG"
                      ? "text-[var(--profit-green)]"
                      : "text-[var(--loss-red)]"
                  }`}
                >
                  {pos.side} {pos.token}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-[10px]">
                <span className="text-[var(--text-muted)]">Entry</span>
                <span className="text-right font-mono tabular-nums text-[var(--text-primary)]">
                  ${pos.entry_price.toFixed(2)}
                </span>
                <span className="text-[var(--text-muted)]">Current</span>
                <span className="text-right font-mono tabular-nums text-[var(--text-primary)]">
                  ${pos.current_price.toFixed(2)}
                </span>
                <span className="text-[var(--text-muted)]">Size</span>
                <span className="text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {pos.size} SOL
                </span>
                <span className="text-[var(--text-muted)]">uP&L</span>
                <span
                  className={`text-right font-mono font-bold tabular-nums ${
                    isProfit
                      ? "text-[var(--profit-green)]"
                      : "text-[var(--loss-red)]"
                  }`}
                >
                  {isProfit ? "+" : ""}
                  {pos.unrealized_pnl.toFixed(2)} SOL
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
