import { z } from "zod";
import { clearSession } from "../lib/session-store.js";

export const resetSessionSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
});

export async function resetSession(input: z.infer<typeof resetSessionSchema>) {
  clearSession(input.wallet_address);
  return { reset: true, wallet: input.wallet_address };
}
