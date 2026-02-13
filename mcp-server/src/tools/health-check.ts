import { z } from "zod";
import { readVault, readDriftPositions } from "../lib/vault-reader.js";
import { getSession } from "../lib/session-store.js";
import { LAMPORTS_PER_SOL } from "../lib/constants.js";

export const healthCheckSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
});

const DRIFT_PRECISION = 1e9;
const QUOTE_PRECISION = 1e6;

const MARKET_NAMES: Record<number, string> = {
  0: "SOL-PERP",
  1: "BTC-PERP",
  2: "ETH-PERP",
  3: "APT-PERP",
  4: "BONK-PERP",
  5: "MATIC-PERP",
  6: "ARB-PERP",
  7: "DOGE-PERP",
  8: "BNB-PERP",
  9: "SUI-PERP",
  10: "PEPE-PERP",
};

export async function healthCheck(input: z.infer<typeof healthCheckSchema>) {
  const [vault, positions] = await Promise.all([
    readVault(input.wallet_address),
    readDriftPositions(input.wallet_address).catch(() => []),
  ]);

  const session = getSession(input.wallet_address);
  const warnings: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  if (vault.exists) {
    const isLocked = vault.isLocked && now < Number(vault.lockoutUntil);
    if (isLocked) {
      const remaining = Number(vault.lockoutUntil) - now;
      warnings.push(
        `Vault is locked for ${Math.ceil(remaining / 60)} more minutes`
      );
    }

    if (vault.swapInProgress) {
      warnings.push(
        "A swap is currently in progress — vault cannot execute new trades"
      );
    }

    const balance = Number(vault.totalDeposited) - Number(vault.totalWithdrawn);
    if (balance < LAMPORTS_PER_SOL * 0.1) {
      warnings.push(
        `Low vault balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      );
    }

    if (Number(vault.dailyLossLimit) > 0 && session.dailyPnl < 0) {
      const pctUsed =
        (Math.abs(session.dailyPnl) * LAMPORTS_PER_SOL) /
        Number(vault.dailyLossLimit);
      if (pctUsed >= 0.5) {
        warnings.push(
          `Session losses are ${Math.round(pctUsed * 100)}% of daily loss limit`
        );
      }
    }
  }

  const sessionHealth = {
    trade_count: session.tradeCount,
    daily_pnl_sol: Math.round(session.dailyPnl * 10000) / 10000,
    session_start: session.sessionStart,
    last_activity: session.lastActivity,
  };

  const positionSummaries = positions.map((pos) => {
    const marketName =
      MARKET_NAMES[pos.marketIndex] ?? `PERP-${pos.marketIndex}`;
    const baseAmount = Number(pos.baseAssetAmount) / DRIFT_PRECISION;
    const quoteAmount = Number(pos.quoteAssetAmount) / QUOTE_PRECISION;
    const entryQuote = Number(pos.quoteEntryAmount) / QUOTE_PRECISION;
    const unrealizedPnl = quoteAmount - entryQuote;
    const settledPnl = Number(pos.settledPnl) / QUOTE_PRECISION;

    const isLong = pos.baseAssetAmount > 0n;
    const side = isLong ? "long" : "short";
    const absBase = Math.abs(baseAmount);

    if (unrealizedPnl < -50) {
      warnings.push(
        `${marketName}: unrealized loss of $${Math.abs(unrealizedPnl).toFixed(2)}`
      );
    }

    return {
      market: marketName,
      side,
      size: absBase,
      unrealized_pnl_usd: Math.round(unrealizedPnl * 100) / 100,
      settled_pnl_usd: Math.round(settledPnl * 100) / 100,
      open_orders: pos.openOrders,
    };
  });

  const totalUnrealizedPnl = positionSummaries.reduce(
    (sum, p) => sum + p.unrealized_pnl_usd,
    0
  );

  if (
    vault.exists &&
    Number(vault.dailyLossLimit) > 0 &&
    totalUnrealizedPnl < 0
  ) {
    const limitUsd = Number(vault.dailyLossLimit) / LAMPORTS_PER_SOL;
    const pctOfLimit = Math.abs(totalUnrealizedPnl) / limitUsd;
    if (pctOfLimit > 0.5) {
      warnings.push(
        `Unrealized losses ($${Math.abs(totalUnrealizedPnl).toFixed(2)}) are ${Math.round(pctOfLimit * 100)}% of daily loss limit`
      );
    }
  }

  return {
    wallet: input.wallet_address,
    has_vault: vault.exists,
    session: sessionHealth,
    drift_positions:
      positionSummaries.length > 0 ? positionSummaries : undefined,
    total_unrealized_pnl_usd:
      positionSummaries.length > 0
        ? Math.round(totalUnrealizedPnl * 100) / 100
        : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    health: warnings.length === 0 ? "healthy" : "attention_needed",
  };
}
