import { z } from "zod";
import { setAdvisoryLimits } from "../lib/session-store.js";

export const setAdvisoryLimitsSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  daily_loss_limit: z.number().describe("Maximum daily loss in USD before lockout"),
  max_trades: z.number().describe("Maximum trades per session"),
  cooldown_ms: z.number().describe("Cooldown between trades in milliseconds"),
  min_risk_reward_ratio: z
    .number()
    .positive()
    .optional()
    .describe("Minimum risk:reward ratio required for trades (default 3.0, meaning reward must be 3x the risk)"),
});

export async function setAdvisoryLimitsHandler(
  input: z.infer<typeof setAdvisoryLimitsSchema>
) {
  setAdvisoryLimits(input.wallet_address, {
    dailyLossLimit: input.daily_loss_limit,
    maxTrades: input.max_trades,
    cooldownMs: input.cooldown_ms,
    minRiskRewardRatio: input.min_risk_reward_ratio,
  });

  return {
    success: true,
    wallet: input.wallet_address,
    limits: {
      daily_loss_limit: input.daily_loss_limit,
      max_trades: input.max_trades,
      cooldown_ms: input.cooldown_ms,
      min_risk_reward_ratio: input.min_risk_reward_ratio,
    },
  };
}
