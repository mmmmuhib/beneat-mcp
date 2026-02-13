import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENTWALLET_BASE = "https://agentwallet.mcpay.tech";
const CONFIG_PATH = join(homedir(), ".agentwallet", "config.json");

interface AgentWalletConfig {
  apiToken: string;
  username: string;
}

export interface AgentWalletPolicy {
  max_per_tx_usd?: string;
  allow_chains?: string[];
  allow_contracts?: string[];
}

export interface PolicyEnforcementResult {
  enforced: boolean;
  action: "frozen" | "restored" | "updated";
  policy: AgentWalletPolicy;
  error?: string;
}

export interface AgentWalletTransferResult {
  actionId?: string;
  status?: string;
  txHash?: string;
  explorer?: string;
  error?: string;
}

let cachedConfig: AgentWalletConfig | null = null;

const normalPolicies = new Map<string, AgentWalletPolicy>();

export async function loadConfig(): Promise<AgentWalletConfig | null> {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.apiToken && parsed.username) {
      cachedConfig = {
        apiToken: parsed.apiToken,
        username: parsed.username,
      };
      return cachedConfig;
    }
    return null;
  } catch {
    return null;
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getPolicy(
  username: string,
  token: string
): Promise<AgentWalletPolicy | null> {
  try {
    const res = await fetch(
      `${AGENTWALLET_BASE}/api/wallets/${username}/policy`,
      {
        headers: authHeaders(token),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as AgentWalletPolicy;
  } catch {
    return null;
  }
}

export async function updatePolicy(
  username: string,
  token: string,
  policy: AgentWalletPolicy
): Promise<AgentWalletPolicy | null> {
  try {
    const res = await fetch(
      `${AGENTWALLET_BASE}/api/wallets/${username}/policy`,
      {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify(policy),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as AgentWalletPolicy;
  } catch {
    return null;
  }
}

export async function freezePolicy(
  username: string,
  token: string
): Promise<PolicyEnforcementResult> {
  const current = await getPolicy(username, token);
  if (current && !normalPolicies.has(username)) {
    normalPolicies.set(username, { ...current });
  }

  const frozen: AgentWalletPolicy = {
    max_per_tx_usd: "0",
    allow_chains: ["solana"],
  };
  const result = await updatePolicy(username, token, frozen);
  if (!result) {
    return {
      enforced: false,
      action: "frozen",
      policy: frozen,
      error: "Failed to update AgentWallet policy",
    };
  }
  return { enforced: true, action: "frozen", policy: result };
}

export async function restorePolicy(
  username: string,
  token: string,
  dailyLossLimitSol?: number
): Promise<PolicyEnforcementResult> {
  const saved = normalPolicies.get(username);
  const restored: AgentWalletPolicy = saved ?? {
    allow_chains: ["solana"],
  };

  if (dailyLossLimitSol !== undefined && dailyLossLimitSol > 0) {
    restored.max_per_tx_usd = estimateMaxTxUsd(dailyLossLimitSol);
  }

  const result = await updatePolicy(username, token, restored);
  if (!result) {
    return {
      enforced: false,
      action: "restored",
      policy: restored,
      error: "Failed to restore AgentWallet policy",
    };
  }
  normalPolicies.delete(username);
  return { enforced: true, action: "restored", policy: result };
}

export async function setRiskPolicy(
  username: string,
  token: string,
  dailyLossLimitSol: number,
  maxTradesPerDay: number
): Promise<PolicyEnforcementResult> {
  const maxTxUsd = estimateMaxTxUsd(dailyLossLimitSol / Math.max(1, maxTradesPerDay));
  const policy: AgentWalletPolicy = {
    max_per_tx_usd: maxTxUsd,
    allow_chains: ["solana"],
  };

  const result = await updatePolicy(username, token, policy);
  if (!result) {
    return {
      enforced: false,
      action: "updated",
      policy,
      error: "Failed to set risk policy on AgentWallet",
    };
  }
  normalPolicies.set(username, { ...result });
  return { enforced: true, action: "updated", policy: result };
}

export async function transferSolana(
  username: string,
  token: string,
  to: string,
  amountLamports: string,
  asset: "sol" | "usdc" = "sol",
  network: "mainnet" | "devnet" = "devnet"
): Promise<AgentWalletTransferResult> {
  try {
    const res = await fetch(
      `${AGENTWALLET_BASE}/api/wallets/${username}/actions/transfer-solana`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ to, amount: amountLamports, asset, network }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok) {
      return { error: `AgentWallet returned ${res.status}` };
    }
    return (await res.json()) as AgentWalletTransferResult;
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function requestDevnetSol(
  username: string,
  token: string
): Promise<AgentWalletTransferResult> {
  try {
    const res = await fetch(
      `${AGENTWALLET_BASE}/api/wallets/${username}/actions/faucet-sol`,
      {
        method: "POST",
        headers: authHeaders(token),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) {
      return { error: `Faucet returned ${res.status}` };
    }
    return (await res.json()) as AgentWalletTransferResult;
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export function isConfigured(): boolean {
  return cachedConfig !== null;
}

export function getSavedNormalPolicy(
  username: string
): AgentWalletPolicy | undefined {
  return normalPolicies.get(username);
}

function estimateMaxTxUsd(solAmount: number): string {
  const solPrice = parseFloat(process.env.SOL_PRICE_USD ?? "150");
  return (solAmount * solPrice).toFixed(2);
}
