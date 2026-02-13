export interface RawCsvRow {
  filled_at: string;
  symbol: string;
  side: string;
  shares: number;
  price: number;
  amount: number;
  reason: string;
  agent_public_id: string;
  run_public_id: string;
  experiment_run_public_id: string;
  closed_pnl?: number;
  dir?: string;
  fee?: number;
}

export interface TradeResult {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  pnl: number;
  pnlPct: number;
  entryDate: string;
  exitDate: string;
}

export interface AgentTradeProfile {
  name: string;
  source: "hyperliquid" | "other";
  totalTrades: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  avgRiskReward: number;
  avgPositionSizePct: number;
  maxDrawdownPct: number;
  totalReturnPct: number;
  startingEquity: number;
  equityCurve: number[];
  rawTrades: TradeResult[];
}

interface FifoLot {
  shares: number;
  price: number;
  date: string;
}

const EPSILON = 1e-10;
const ARENA_COMPETITION_END_ISO = process.env.ARENA_COMPETITION_END_ISO ?? "2025-12-11T23:59:59.999Z";

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseCsv(csvText: string): RawCsvRow[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]);
  const rows: RawCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (values.length < 6) continue;

    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    const shares = parseFloat(row.shares);
    const price = parseFloat(row.price);
    const amount = parseFloat(row.amount);
    if (isNaN(shares) || isNaN(price)) continue;

    const closedPnl = parseFloat(row.closed_pnl);
    const fee = parseFloat(row.fee);

    rows.push({
      filled_at: row.filled_at ?? "",
      symbol: row.symbol ?? "",
      side: (row.side ?? "").toLowerCase(),
      shares,
      price,
      amount: isNaN(amount) ? shares * price : amount,
      reason: row.reason ?? "",
      agent_public_id: row.agent_public_id ?? "",
      run_public_id: row.run_public_id ?? "",
      experiment_run_public_id: row.experiment_run_public_id ?? "",
      closed_pnl: isNaN(closedPnl) ? undefined : closedPnl,
      dir: row.dir || undefined,
      fee: isNaN(fee) ? undefined : fee,
    });
  }

  return rows;
}

function parseIsoTs(value: string): number | null {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function filterRowsByCutoff(rows: RawCsvRow[], cutoffIso: string): RawCsvRow[] {
  const cutoffTs = parseIsoTs(cutoffIso);
  if (cutoffTs === null) return rows;

  return rows.filter((row) => {
    const ts = parseIsoTs(row.filled_at);
    return ts === null || ts <= cutoffTs;
  });
}

export function matchTrades(rows: RawCsvRow[]): TradeResult[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime()
  );

  const lots: Record<string, FifoLot[]> = {};
  const trades: TradeResult[] = [];

  for (const row of sorted) {
    const sym = row.symbol;
    if (!lots[sym]) lots[sym] = [];

    if (row.side === "buy") {
      lots[sym].push({ shares: row.shares, price: row.price, date: row.filled_at });
    } else if (row.side === "sell") {
      let remaining = row.shares;

      while (remaining > EPSILON && lots[sym].length > 0) {
        const lot = lots[sym][0];
        const filled = Math.min(remaining, lot.shares);
        const pnl = (row.price - lot.price) * filled;
        const pnlPct = ((row.price - lot.price) / lot.price) * 100;

        trades.push({
          symbol: sym,
          entryPrice: lot.price,
          exitPrice: row.price,
          shares: filled,
          pnl,
          pnlPct,
          entryDate: lot.date,
          exitDate: row.filled_at,
        });

        lot.shares -= filled;
        remaining -= filled;

        if (lot.shares <= EPSILON) {
          lots[sym].shift();
        }
      }
    }
  }

  return trades;
}

export function matchTradesHL(rows: RawCsvRow[]): TradeResult[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime()
  );
  const merged = coalesceHLRows(sorted);

  const positions: Record<string, number> = {};
  const trades: TradeResult[] = [];

  for (const row of merged) {
    const sym = row.symbol;
    const dir = row.dir ?? "";
    const pos = positions[sym] ?? 0;

    if (dir === "Open Long") {
      positions[sym] = pos + row.shares;
    } else if (dir === "Open Short") {
      positions[sym] = pos - row.shares;
    } else if (dir === "Close Long" || dir === "Close Short") {
      if (row.closed_pnl !== undefined && row.shares > EPSILON) {
        const pnl = row.closed_pnl;
        const isLong = dir === "Close Long";
        const entryPrice = isLong
          ? row.price - pnl / row.shares
          : row.price + pnl / row.shares;
        const pnlPct = entryPrice > 0 ? (pnl / (row.shares * entryPrice)) * 100 : 0;

        trades.push({
          symbol: sym,
          entryPrice,
          exitPrice: row.price,
          shares: row.shares,
          pnl,
          pnlPct,
          entryDate: row.filled_at,
          exitDate: row.filled_at,
        });
      }
      positions[sym] = dir === "Close Long" ? pos - row.shares : pos + row.shares;
    } else if (dir === "Long > Short" || dir === "Short > Long") {
      const closingShares = dir === "Long > Short"
        ? Math.max(pos, 0)
        : Math.max(-pos, 0);

      if (row.closed_pnl !== undefined && closingShares > EPSILON) {
        const pnl = row.closed_pnl;
        const isLong = dir === "Long > Short";
        const entryPrice = isLong
          ? row.price - pnl / closingShares
          : row.price + pnl / closingShares;
        const pnlPct = entryPrice > 0 ? (pnl / (closingShares * entryPrice)) * 100 : 0;

        trades.push({
          symbol: sym,
          entryPrice,
          exitPrice: row.price,
          shares: closingShares,
          pnl,
          pnlPct,
          entryDate: row.filled_at,
          exitDate: row.filled_at,
        });
      }
      positions[sym] = dir === "Long > Short"
        ? pos - row.shares
        : pos + row.shares;
    }
  }

  return trades;
}

function coalesceHLRows(rows: RawCsvRow[]): RawCsvRow[] {
  const grouped = new Map<string, RawCsvRow>();

  for (const row of rows) {
    const key = [
      row.filled_at,
      row.symbol,
      row.side,
      row.dir ?? "",
    ].join("|");

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row });
      continue;
    }

    existing.shares += row.shares;
    existing.amount += row.amount;
    existing.closed_pnl = (existing.closed_pnl ?? 0) + (row.closed_pnl ?? 0);
    existing.fee = (existing.fee ?? 0) + (row.fee ?? 0);
  }

  return Array.from(grouped.values());
}

function isHyperliquidFormat(rows: RawCsvRow[]): boolean {
  return rows.some((r) => r.dir !== undefined);
}

function extractAgentName(filename: string): string {
  let name = filename.replace(/\.csv$/i, "");
  name = name.replace(/\s*\(\d+\)$/, "");
  name = name.replace(/-trade-history.*$/, "");

  const isHL = name.startsWith("hyperliquid-");
  name = name.replace(/^hyperliquid-/i, "");
  name = name.replace(/^maximumreturnswithwebsearch/i, "");
  name = name.replace(/^maximumreturns/i, "");

  const STRATEGY_SUFFIXES: Record<string, string> = {
    "-mm": "MM",
    "-nb": "NB",
  };

  let strategySuffix = "";
  for (const [sfx, label] of Object.entries(STRATEGY_SUFFIXES)) {
    if (name.endsWith(sfx)) {
      strategySuffix = ` ${label}`;
      name = name.slice(0, -sfx.length);
      break;
    }
  }

  const MODEL_NAMES: Record<string, string> = {
    "gpt-5": "GPT-5",
    "gpt-5-1": "GPT 5.1",
    "gpt-4o": "GPT-4o",
    "claude-sonnet-4-5": "Claude Sonnet 4.5",
    "claude-opus-4-6": "Claude Opus 4.6",
    "gemini-25-pro": "Gemini 2.5 Pro",
    "gemini-3-pro": "Gemini 3 Pro",
    "deepseek-chat": "DeepSeek V3",
    "deepseek-v3-1": "DeepSeek V3.1",
    "deepseek-r1": "DeepSeek R1",
    "grok-4": "Grok 4",
    "grok-4-20": "Grok 4.20",
    "kimi-k2-thinking": "Kimi K2",
    "qwen3-max": "Qwen3 Max",
    "llama-4-maverick": "Llama 4 Maverick",
  };

  let displayName = MODEL_NAMES[name];
  if (!displayName) {
    displayName = name
      .replace(/[-_]+/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  displayName += strategySuffix;

  if (isHL) displayName += " (HL)";
  return displayName;
}

export function analyzeAgent(
  csvText: string,
  filename: string,
  startingEquityOverride?: number,
  fundingUsdc?: number
): AgentTradeProfile {
  const parsedRows = parseCsv(csvText);
  const isHL = isHyperliquidFormat(parsedRows);
  const rows = isHL ? filterRowsByCutoff(parsedRows, ARENA_COMPETITION_END_ISO) : parsedRows;
  const startingEquity = startingEquityOverride ?? (isHL ? 10_000 : 100_000);
  const trades = isHL ? matchTradesHL(rows) : matchTrades(rows);

  if (isHL) {
    const totalFees = rows.reduce((s, r) => s + (r.fee ?? 0), 0);
    if (trades.length > 0 && totalFees > 0) {
      const totalNotional = trades.reduce((s, t) => s + t.shares * t.exitPrice, 0);
      for (const t of trades) {
        const tradeNotional = t.shares * t.exitPrice;
        const feePortion = totalNotional > 0 ? totalFees * (tradeNotional / totalNotional) : 0;
        t.pnl -= feePortion;
        t.pnlPct = t.entryPrice > 0 ? (t.pnl / (t.shares * t.entryPrice)) * 100 : 0;
      }
    }
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);

  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const avgWinPct =
    wins.length > 0
      ? wins.reduce((s, t) => s + Math.abs(t.pnlPct), 0) / wins.length
      : 0;
  const avgLossPct =
    losses.length > 0
      ? losses.reduce((s, t) => s + Math.abs(t.pnlPct), 0) / losses.length
      : 1;
  const avgRiskReward = avgLossPct > 0 ? avgWinPct / avgLossPct : avgWinPct;

  let equity = startingEquity;
  const equityCurve = [equity];
  let peak = equity;
  let maxDrawdown = 0;

  const positionSizes: number[] = [];

  for (const trade of trades) {
    const positionValue = trade.shares * trade.entryPrice;
    positionSizes.push((positionValue / equity) * 100);

    equity += trade.pnl;
    equityCurve.push(equity);

    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  if (fundingUsdc) {
    equity += fundingUsdc;
    equityCurve[equityCurve.length - 1] = equity;
    if (equity > peak) peak = equity;
  }

  const avgPositionSizePct = isHL
    ? (positionSizes.length > 0
        ? positionSizes.map(p => Math.min(p, 100)).reduce((s, v) => s + v, 0) / positionSizes.length
        : 0)
    : (positionSizes.length > 0
        ? positionSizes.reduce((s, v) => s + v, 0) / positionSizes.length
        : 0);

  const totalReturnPct = ((equity - startingEquity) / startingEquity) * 100;

  return {
    name: extractAgentName(filename),
    source: isHL ? "hyperliquid" as const : "other" as const,
    totalTrades: trades.length,
    winRate,
    avgWinPct,
    avgLossPct,
    avgRiskReward,
    avgPositionSizePct,
    maxDrawdownPct: maxDrawdown,
    totalReturnPct,
    startingEquity,
    equityCurve,
    rawTrades: trades,
  };
}
