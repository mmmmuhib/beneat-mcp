import { z } from "zod";
import { readVault } from "../lib/vault-reader.js";
import { getSession } from "../lib/session-store.js";
import { calibrateConfidence } from "../lib/quant-engine.js";
import { LAMPORTS_PER_SOL } from "../lib/constants.js";

export const calibrateConfidenceSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Agent's confidence in the next trade (0-1)"),
});

export async function getCalibrateConfidence(
  input: z.infer<typeof calibrateConfidenceSchema>
) {
  const session = getSession(input.wallet_address);
  const vault = await readVault(input.wallet_address);

  const capitalSol = vault.exists
    ? Number(vault.totalDeposited) / LAMPORTS_PER_SOL
    : 1;

  const calibration = calibrateConfidence(
    input.confidence,
    session,
    capitalSol
  );

  return {
    wallet: input.wallet_address,
    session_trades_with_confidence: session.trades.filter(
      (t) => t.confidence !== undefined
    ).length,
    calibration,
  };
}
