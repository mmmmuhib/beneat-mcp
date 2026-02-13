import { z } from "zod";
import { readVault } from "../lib/vault-reader.js";
import { LAMPORTS_PER_SOL } from "../lib/constants.js";
import {
  loadConfig,
  getPolicy,
  freezePolicy,
  restorePolicy,
  setRiskPolicy,
} from "../lib/agentwallet-client.js";

export const setPolicySchema = z.object({
  wallet_address: z.string().describe("Solana wallet address (base58)"),
  action: z
    .enum(["freeze", "restore", "sync", "status"])
    .describe(
      "freeze = block all transactions, restore = unfreeze to normal limits, sync = derive policy from vault risk rules, status = view current policy"
    ),
});

export async function setPolicy(input: z.infer<typeof setPolicySchema>) {
  const config = await loadConfig();
  if (!config) {
    return {
      success: false,
      error:
        "AgentWallet not configured. Create ~/.agentwallet/config.json with apiToken and username.",
      setup_instructions: {
        step_1: "POST https://agentwallet.mcpay.tech/api/connect/start with your email",
        step_2: "POST https://agentwallet.mcpay.tech/api/connect/complete with OTP",
        step_3: "Save { apiToken, username } to ~/.agentwallet/config.json",
      },
    };
  }

  const { username, apiToken } = config;

  if (input.action === "status") {
    const policy = await getPolicy(username, apiToken);
    const vault = await readVault(input.wallet_address);
    const isFrozen = policy?.max_per_tx_usd === "0";

    return {
      success: true,
      agentwallet_username: username,
      current_policy: policy,
      is_frozen: isFrozen,
      vault_exists: vault.exists,
      vault_locked: vault.exists
        ? vault.isLocked &&
          Math.floor(Date.now() / 1000) < Number(vault.lockoutUntil)
        : false,
    };
  }

  if (input.action === "freeze") {
    const result = await freezePolicy(username, apiToken);
    return {
      success: result.enforced,
      action: "freeze",
      detail: result.enforced
        ? "AgentWallet frozen. max_per_tx_usd set to 0. No transactions will be signed."
        : `Freeze failed: ${result.error}`,
      policy: result.policy,
    };
  }

  if (input.action === "restore") {
    const vault = await readVault(input.wallet_address);
    const dailyLimitSol = vault.exists
      ? Number(vault.dailyLossLimit) / LAMPORTS_PER_SOL
      : undefined;
    const result = await restorePolicy(username, apiToken, dailyLimitSol);
    return {
      success: result.enforced,
      action: "restore",
      detail: result.enforced
        ? "AgentWallet policy restored to normal spending limits."
        : `Restore failed: ${result.error}`,
      policy: result.policy,
    };
  }

  if (input.action === "sync") {
    const vault = await readVault(input.wallet_address);
    if (!vault.exists) {
      return {
        success: false,
        action: "sync",
        error:
          "No vault found. Use beneat_calibrate first to create vault and set risk rules.",
      };
    }

    const dailyLimitSol = Number(vault.dailyLossLimit) / LAMPORTS_PER_SOL;
    const maxTrades = vault.maxTradesPerDay;

    if (dailyLimitSol <= 0 || maxTrades <= 0) {
      return {
        success: false,
        action: "sync",
        error:
          "Vault has no risk rules configured. Use beneat_calibrate to set rules first.",
      };
    }

    const result = await setRiskPolicy(
      username,
      apiToken,
      dailyLimitSol,
      maxTrades
    );
    return {
      success: result.enforced,
      action: "sync",
      detail: result.enforced
        ? `AgentWallet policy synced to vault rules: max $${result.policy.max_per_tx_usd}/tx derived from ${dailyLimitSol.toFixed(4)} SOL daily limit across ${maxTrades} trades.`
        : `Sync failed: ${result.error}`,
      vault_rules: {
        daily_loss_limit_sol: dailyLimitSol,
        max_trades_per_day: maxTrades,
      },
      policy: result.policy,
    };
  }

  return { success: false, error: "Unknown action" };
}
