import { z } from "zod";
import { readVault } from "../lib/vault-reader.js";
import { getSession } from "../lib/session-store.js";
import { fetchAllTransactionHistory } from "../lib/helius-client.js";
import { parseTradeHistory } from "../lib/quant-engine.js";
import { SECONDS_PER_DAY, LAMPORTS_PER_SOL } from "../lib/constants.js";

export const statusSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
});

export async function getStatus(input: z.infer<typeof statusSchema>) {
  const vault = await readVault(input.wallet_address);

  if (!vault.exists) {
    const session = getSession(input.wallet_address);
    const txns = await fetchAllTransactionHistory(input.wallet_address, 7);
    const trades = parseTradeHistory(txns, input.wallet_address);
    const protocols = [...new Set(trades.map((t) => t.market ?? "unknown"))];
    const wins = trades.filter((t) => t.isWin).length;

    return {
      has_vault: false,
      wallet: input.wallet_address,
      can_trade: true,
      mode: "advisory",
      session: {
        daily_pnl_sol: session.dailyPnl,
        trade_count: session.tradeCount,
        last_activity: session.lastActivity,
      },
      recent_activity: {
        trades_7d: trades.length,
        wins: wins,
        losses: trades.length - wins,
        win_rate: trades.length > 0 ? Math.round((wins / trades.length) * 10000) / 10000 : 0,
        protocols_used: protocols,
      },
      message:
        "No vault found. Running in advisory mode with full analytics from on-chain history. Create a vault via beneat_calibrate to enable on-chain enforcement.",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const isLocked = vault.isLocked && now < Number(vault.lockoutUntil);
  const lockoutRemainingSec = isLocked
    ? Number(vault.lockoutUntil) - now
    : 0;
  const isInCooldown =
    vault.lastTradeWasLoss &&
    now < Number(vault.lastTradeTime) + vault.cooldownSeconds;
  const cooldownRemainingSec = isInCooldown
    ? Number(vault.lastTradeTime) + vault.cooldownSeconds - now
    : 0;

  const sessionElapsed = now - Number(vault.sessionStart);
  const sessionExpired = sessionElapsed >= SECONDS_PER_DAY;
  const tradesRemaining = sessionExpired
    ? vault.maxTradesPerDay
    : Math.max(0, vault.maxTradesPerDay - vault.tradesToday);

  const depositedSol = Number(vault.totalDeposited) / LAMPORTS_PER_SOL;
  const withdrawnSol = Number(vault.totalWithdrawn) / LAMPORTS_PER_SOL;
  const dailyLimitSol = Number(vault.dailyLossLimit) / LAMPORTS_PER_SOL;

  return {
    has_vault: true,
    wallet: input.wallet_address,
    is_locked: isLocked,
    lockout_remaining_seconds: lockoutRemainingSec,
    lockout_count: vault.lockoutCount,
    is_in_cooldown: isInCooldown,
    cooldown_remaining_seconds: cooldownRemainingSec,
    trades_today: vault.tradesToday,
    trades_remaining: tradesRemaining,
    max_trades_per_day: vault.maxTradesPerDay,
    daily_loss_limit_sol: dailyLimitSol,
    total_deposited_sol: depositedSol,
    total_withdrawn_sol: withdrawnSol,
    lockout_duration_seconds: vault.lockoutDuration,
    cooldown_seconds: vault.cooldownSeconds,
    swap_in_progress: vault.swapInProgress,
    session_expired: sessionExpired,
    can_trade: !isLocked && !isInCooldown && tradesRemaining > 0 && !vault.swapInProgress,
  };
}
