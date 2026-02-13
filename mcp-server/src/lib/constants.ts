import { address, type Address } from "@solana/kit";

export const VAULT_PROGRAM_ID = address(
  "GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki"
);

export const DRIFT_PROGRAM_ID =
  "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH" as Address;

export const SYSTEM_PROGRAM_ID =
  "11111111111111111111111111111111" as Address;

export const VAULT_SEED = new Uint8Array([118, 97, 117, 108, 116]); // "vault"
export const TRADER_PROFILE_SEED = new Uint8Array([
  116, 114, 97, 100, 101, 114, 95, 112, 114, 111, 102, 105, 108, 101,
]); // "trader_profile"

export const DISCRIMINATORS = {
  initialize: new Uint8Array([175, 175, 109, 31, 13, 152, 155, 237]),
  deposit: new Uint8Array([242, 35, 198, 137, 82, 225, 242, 182]),
  withdraw: new Uint8Array([183, 18, 70, 156, 148, 109, 161, 34]),
  setRules: new Uint8Array([66, 148, 196, 43, 232, 210, 174, 169]),
  manualLock: new Uint8Array([128, 7, 199, 201, 41, 62, 228, 177]),
  unlock: new Uint8Array([101, 155, 40, 21, 158, 189, 56, 203]),
  swapWithEnforcement: new Uint8Array([41, 90, 136, 244, 222, 10, 24, 210]),
  vaultAccount: new Uint8Array([211, 8, 232, 43, 2, 152, 117, 119]),
  profileAccount: new Uint8Array([99, 135, 170, 100, 49, 79, 225, 169]),
} as const;

export const ANCHOR_DISCRIMINATOR_SIZE = 8;

export const VAULT_ACCOUNT_SIZE_CODAMA = 105;

export const VAULT_ACCOUNT_SIZE_FULL = 8 + 32 + 1 + 1 + 8 + 4 + 4 + 8 + 1 + 1 + 8 + 8 + 8 + 1 + 8 + 4 + 1 + 32 + 32 + 8 + 8 + 8; // 194

export const SECONDS_PER_DAY = 86400;

export const CRYPTO_TRADING_DAYS_PER_YEAR = 365;

export const REVENGE_TRADE_WINDOWS: Record<string, number> = {
  scalping: 30,
  day_trading: 120,
  swing_trading: 600,
  conservative: 1800,
};

export const STRATEGY_DEFAULTS: Record<
  string,
  { maxTrades: number; cooldownSeconds: number }
> = {
  scalping: { maxTrades: 50, cooldownSeconds: 30 },
  day_trading: { maxTrades: 20, cooldownSeconds: 120 },
  swing_trading: { maxTrades: 5, cooldownSeconds: 600 },
  conservative: { maxTrades: 3, cooldownSeconds: 1800 },
};

export const RISK_TOLERANCE_MULTIPLIERS: Record<
  string,
  { dailyLossPct: number; lockoutDuration: number }
> = {
  low: { dailyLossPct: 0.01, lockoutDuration: 86400 },
  medium: { dailyLossPct: 0.03, lockoutDuration: 43200 },
  high: { dailyLossPct: 0.05, lockoutDuration: 21600 },
  degen: { dailyLossPct: 0.1, lockoutDuration: 7200 },
};

export const LAMPORTS_PER_SOL = 1_000_000_000;

export const DEFAULT_ADVISORY_DAILY_LOSS_PCT = 0.03;
export const DEFAULT_ADVISORY_MAX_TRADES = 20;
export const DEFAULT_ADVISORY_COOLDOWN_MS = 120_000;
export const DEFAULT_ADVISORY_LOCKOUT_SECONDS = 12 * 60 * 60;
export const DEFAULT_MIN_RISK_REWARD_RATIO = 3.0;

export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

export function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? process.env.HELIUS_RPC_URL ?? DEFAULT_RPC_URL;
}

export function getHeliusApiKey(): string | undefined {
  return process.env.HELIUS_API_KEY;
}
