import { z } from "zod";
import { readVault, readProfile } from "../lib/vault-reader.js";
import { computeTrustScore, computeHistoryScore } from "../lib/scoring.js";
import { fetchAllTransactionHistory } from "../lib/helius-client.js";
import { parseTradeHistory } from "../lib/quant-engine.js";

export const verifySchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
});

export async function verifyAgent(input: z.infer<typeof verifySchema>) {
  const [vault, profile] = await Promise.all([
    readVault(input.wallet_address),
    readProfile(input.wallet_address),
  ]);

  const { trust_score: baseScore, risk_grade: _, factors } = computeTrustScore(vault, profile);

  const txns = await fetchAllTransactionHistory(input.wallet_address, 30);
  const trades = parseTradeHistory(txns, input.wallet_address);
  const historyScore = computeHistoryScore(trades);

  const trust_score = Math.min(100, baseScore + historyScore.score);
  const allFactors = [...factors, ...historyScore.factors];

  let risk_grade: string;
  if (trust_score >= 80) risk_grade = "A";
  else if (trust_score >= 60) risk_grade = "B";
  else if (trust_score >= 40) risk_grade = "C";
  else if (trust_score >= 20) risk_grade = "D";
  else risk_grade = "F";

  return {
    wallet: input.wallet_address,
    trust_score,
    risk_grade,
    factors: allFactors,
    has_vault: vault.exists,
    has_profile: profile.exists,
    trades_analyzed: trades.length,
    verification_timestamp: Math.floor(Date.now() / 1000),
    summary: `Agent ${input.wallet_address.slice(0, 8)}... has risk grade ${risk_grade} (${trust_score}/100). ${allFactors.length} trust factors verified.`,
  };
}
