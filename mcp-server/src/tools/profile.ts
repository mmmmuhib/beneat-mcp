import { z } from "zod";
import { readProfile } from "../lib/vault-reader.js";

export const profileSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
});

export async function getProfile(input: z.infer<typeof profileSchema>) {
  const profile = await readProfile(input.wallet_address);

  if (!profile.exists) {
    return {
      has_profile: false,
      wallet: input.wallet_address,
      message:
        "No trader profile found. Use beneat_calibrate to create one.",
    };
  }

  const winRate =
    profile.totalTrades > 0
      ? (profile.totalWins / profile.totalTrades) * 100
      : 0;

  return {
    has_profile: true,
    wallet: input.wallet_address,
    ratings: {
      overall: profile.overallRating,
      discipline: profile.discipline,
      patience: profile.patience,
      consistency: profile.consistency,
      timing: profile.timing,
      risk_control: profile.riskControl,
      endurance: profile.endurance,
    },
    stats: {
      total_trades: profile.totalTrades,
      total_wins: profile.totalWins,
      win_rate_pct: Math.round(winRate * 10) / 10,
      total_pnl_lamports: profile.totalPnl.toString(),
      avg_trade_size_lamports: profile.avgTradeSize.toString(),
      trading_days: profile.tradingDays,
    },
    last_updated: Number(profile.lastUpdated),
  };
}
