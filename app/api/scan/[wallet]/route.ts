import { NextResponse } from "next/server";
import { fetchAllTransactionHistory } from "../../../lib/helius-client";
import {
  parseTradeHistory,
  computeAgentAnalytics,
  computeKellyFraction,
  computeSharpe,
  computeMaxDrawdown,
  computeDailyReturns,
  generateDirectives,
  inferStrategyType,
  estimateCapitalFromHistory,
} from "../../../lib/wallet-analytics";

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;

  if (!BASE58_REGEX.test(wallet)) {
    return NextResponse.json(
      { error: "Invalid wallet address" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const lookbackDays = Math.min(
    90,
    Math.max(1, parseInt(searchParams.get("lookback_days") ?? "30", 10) || 30)
  );

  const cacheKey = `${wallet}:${lookbackDays}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const result = await fetchAllTransactionHistory(wallet, lookbackDays);

    // If fetch failed and we got no data, return an error instead of fake empty results
    if (result.error && result.data.length === 0) {
      return NextResponse.json(
        { error: result.error },
        { status: 502 }
      );
    }

    const transactions = result.data;
    const trades = parseTradeHistory(transactions, wallet);

    if (trades.length === 0) {
      const emptyResponse = {
        wallet,
        trade_count: 0,
        strategy_type: "unknown",
        protocols_detected: [] as string[],
        analytics: null,
        directives: [],
        kelly_fraction: 0,
        sharpe_ratio: 0,
        max_drawdown: 0,
        equity_curve: [],
        lookback_days: lookbackDays,
        // Include partial error if some pages failed
        ...(result.error ? { warning: result.error } : {}),
      };
      // Only cache genuinely empty results, not errors
      if (!result.error) {
        cache.set(cacheKey, { data: emptyResponse, timestamp: Date.now() });
      }
      return NextResponse.json(emptyResponse);
    }

    const capitalLamports = estimateCapitalFromHistory(trades);
    const analytics = computeAgentAnalytics(trades, 0, capitalLamports);
    const kellyFraction = computeKellyFraction(trades);
    const dailyReturns = computeDailyReturns(trades, capitalLamports);
    const sharpeRatio = computeSharpe(dailyReturns);
    const maxDrawdown = computeMaxDrawdown(trades, capitalLamports);
    const directives = generateDirectives(analytics, kellyFraction);
    const strategyType = inferStrategyType(trades);

    const protocols = new Set<string>();
    for (const tx of transactions) {
      if (tx.source) protocols.add(tx.source);
    }

    const LAMPORTS_PER_SOL = 1_000_000_000;
    const startEquity = capitalLamports / LAMPORTS_PER_SOL;
    let cumValue = startEquity;
    const equityCurve = trades.map((t) => {
      cumValue += t.pnlLamports / LAMPORTS_PER_SOL;
      return { timestamp: t.timestamp * 1000, value: parseFloat(cumValue.toFixed(4)) };
    });
    equityCurve.unshift({
      timestamp: (trades[0].timestamp - 1) * 1000,
      value: parseFloat(startEquity.toFixed(4)),
    });

    const response = {
      wallet,
      trade_count: trades.length,
      strategy_type: strategyType,
      protocols_detected: Array.from(protocols),
      analytics,
      directives,
      kelly_fraction: parseFloat(kellyFraction.toFixed(4)),
      sharpe_ratio: parseFloat(sharpeRatio.toFixed(4)),
      max_drawdown: parseFloat(maxDrawdown.toFixed(4)),
      equity_curve: equityCurve,
      lookback_days: lookbackDays,
      // Include warning if some pages failed but we still got partial data
      ...(result.error ? { warning: result.error } : {}),
    };

    cache.set(cacheKey, { data: response, timestamp: Date.now() });
    return NextResponse.json(response);
  } catch (err) {
    console.error(`[scan] Unexpected error for wallet ${wallet}:`, err);
    return NextResponse.json(
      { error: "Internal server error while processing wallet scan" },
      { status: 502 }
    );
  }
}
