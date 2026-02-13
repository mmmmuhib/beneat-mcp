import { z } from "zod";
import { readVault } from "../lib/vault-reader.js";

export const cancelSwapSchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
});

export async function cancelSwap(input: z.infer<typeof cancelSwapSchema>) {
  const vault = await readVault(input.wallet_address);

  if (!vault.exists) {
    return {
      swap_in_progress: false,
      message: "No vault found for this wallet.",
    };
  }

  if (!vault.swapInProgress) {
    return {
      swap_in_progress: false,
      message:
        "No swap is currently in progress. The vault is ready for new trades.",
    };
  }

  return {
    swap_in_progress: true,
    pending_swap: {
      source_mint: vault.pendingSwapSourceMint,
      dest_mint: vault.pendingSwapDestMint,
      amount_in: vault.pendingSwapAmountIn?.toString(),
      min_out: vault.pendingSwapMinOut?.toString(),
      balance_before: vault.balanceBeforeSwap?.toString(),
    },
    resolution_steps: [
      "1. The swap may still be processing — wait 30-60 seconds and check status again.",
      "2. If the swap transaction failed, call post_swap_update to clear the pending state.",
      "3. The post_swap_update instruction will reset swap_in_progress to false.",
      "4. You'll need to build and sign a post_swap_update transaction to clear the stuck state.",
    ],
    message:
      "A swap is stuck in progress. This typically happens when a Jupiter swap transaction fails after pre_swap_check succeeded. Follow the resolution steps above.",
  };
}
