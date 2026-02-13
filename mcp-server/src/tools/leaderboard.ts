import { z } from "zod";
import {
  createSolanaRpc,
  address,
  getAddressDecoder,
} from "@solana/kit";
import {
  getRpcUrl,
  VAULT_PROGRAM_ID,
  DISCRIMINATORS,
  ANCHOR_DISCRIMINATOR_SIZE,
  VAULT_ACCOUNT_SIZE_CODAMA,
  LAMPORTS_PER_SOL,
} from "../lib/constants.js";
import { getVaultDecoder } from "../generated/vault/accounts/vault.js";
import { deriveProfilePDA } from "../lib/pda.js";
import { computeTrustScore } from "../lib/scoring.js";
import type { VaultState, TraderProfileState, LeaderboardEntry } from "../lib/types.js";

export const leaderboardSchema = z.object({
  limit: z
    .number()
    .optional()
    .describe("Max entries to return (default 20)"),
  sort_by: z
    .enum(["rating", "win_rate", "trades", "discipline", "trust", "pnl"])
    .optional()
    .describe("Sort field (default rating)"),
});

const NEXT_APP_URL = process.env.NEXT_APP_URL ?? "http://localhost:3000";

interface TrackedWallet {
  wallet: string;
  name: string;
  project_url: string | null;
  description: string | null;
}

async function fetchTrackedWallets(): Promise<TrackedWallet[]> {
  try {
    const res = await fetch(`${NEXT_APP_URL}/api/leaderboard/register`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.wallets ?? [];
  } catch {
    return [];
  }
}

export async function getLeaderboard(
  input: z.infer<typeof leaderboardSchema>
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  const limit = input.limit ?? 20;
  const sortBy = input.sort_by ?? "rating";
  const rpc = createSolanaRpc(getRpcUrl());

  const vaultDiscBase58 = bs58Encode(DISCRIMINATORS.vaultAccount);
  const response = await rpc
    .getProgramAccounts(VAULT_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        { memcmp: { offset: 0n, bytes: vaultDiscBase58 as any, encoding: "base58" } },
      ],
    })
    .send();

  const vaultAccounts = Array.isArray(response) ? response : (response as any).value ?? response;

  const trackedWallets = await fetchTrackedWallets();
  const trackedByAddress = new Map(trackedWallets.map((tw) => [tw.wallet, tw]));

  const entries: LeaderboardEntry[] = [];
  const seenWallets = new Set<string>();
  const vaultDecoder = getVaultDecoder();
  const addrDecoder = getAddressDecoder();

  for (const account of vaultAccounts as any[]) {
    try {
      const rawData = account.account.data;
      const b64 = Array.isArray(rawData) ? rawData[0] : rawData;
      const data = Buffer.from(b64, "base64");

      const baseFields = vaultDecoder.decode(data);
      const ownerAddr = baseFields.owner as string;
      seenWallets.add(ownerAddr);

      const vault: VaultState = {
        exists: true,
        owner: ownerAddr,
        bump: baseFields.bump,
        isLocked: baseFields.isLocked,
        lockoutUntil: baseFields.lockoutUntil,
        lockoutCount: baseFields.lockoutCount,
        lockoutDuration: baseFields.lockoutDuration,
        dailyLossLimit: baseFields.dailyLossLimit,
        maxTradesPerDay: baseFields.maxTradesPerDay,
        tradesToday: baseFields.tradesToday,
        sessionStart: baseFields.sessionStart,
        totalDeposited: baseFields.totalDeposited,
        totalWithdrawn: baseFields.totalWithdrawn,
        lastTradeWasLoss: baseFields.lastTradeWasLoss,
        lastTradeTime: baseFields.lastTradeTime,
        cooldownSeconds: baseFields.cooldownSeconds,
        swapInProgress: data.length > VAULT_ACCOUNT_SIZE_CODAMA ? data[VAULT_ACCOUNT_SIZE_CODAMA] === 1 : false,
      };

      const [profilePda] = await deriveProfilePDA(address(ownerAddr));
      const profileInfo = await rpc
        .getAccountInfo(profilePda, { encoding: "base64" })
        .send();

      let profile: TraderProfileState;
      if (profileInfo.value) {
        const pData = Buffer.from(profileInfo.value.data[0], "base64");
        const profileDisc = Array.from(pData.subarray(0, 8));
        const expected = Array.from(DISCRIMINATORS.profileAccount);

        if (profileDisc.every((b, i) => b === expected[i])) {
          let offset = ANCHOR_DISCRIMINATOR_SIZE;
          const authority = addrDecoder.decode(pData.subarray(offset, offset + 32)) as string;
          offset += 32;
          const bump = pData[offset]; offset += 1;
          const overallRating = pData[offset]; offset += 1;
          const discipline = pData[offset]; offset += 1;
          const patience = pData[offset]; offset += 1;
          const consistency = pData[offset]; offset += 1;
          const timing = pData[offset]; offset += 1;
          const riskControl = pData[offset]; offset += 1;
          const endurance = pData[offset]; offset += 1;
          const totalTrades = pData.readUInt32LE(offset); offset += 4;
          const totalWins = pData.readUInt32LE(offset); offset += 4;
          const totalPnl = pData.readBigInt64LE(offset); offset += 8;
          const avgTradeSize = pData.readBigUInt64LE(offset); offset += 8;
          const tradingDays = pData.readUInt16LE(offset); offset += 2;
          const lastUpdated = pData.readBigInt64LE(offset);

          profile = {
            exists: true, authority, bump, overallRating, discipline, patience,
            consistency, timing, riskControl, endurance, totalTrades, totalWins,
            totalPnl, avgTradeSize, tradingDays, lastUpdated,
          };
        } else {
          profile = emptyProfile(ownerAddr);
        }
      } else {
        profile = emptyProfile(ownerAddr);
      }

      const { trust_score, risk_grade } = computeTrustScore(vault, profile);
      const winRate = profile.totalTrades > 0
        ? profile.totalWins / profile.totalTrades
        : 0;

      const tracked = trackedByAddress.get(ownerAddr);
      entries.push({
        wallet: ownerAddr,
        name: tracked?.name ?? null,
        project_url: tracked?.project_url ?? null,
        description: tracked?.description ?? null,
        trust_grade: risk_grade,
        trust_score,
        overall_rating: profile.overallRating,
        discipline: profile.discipline,
        win_rate: Math.round(winRate * 10000) / 10000,
        total_trades: profile.totalTrades,
        total_pnl: profile.totalPnl.toString(),
        lockout_count: vault.lockoutCount,
        daily_loss_limit: vault.dailyLossLimit.toString(),
        trading_days: profile.tradingDays,
        status: "verified",
      });
    } catch {
      continue;
    }
  }

  for (const tw of trackedWallets) {
    if (seenWallets.has(tw.wallet)) continue;
    entries.push({
      wallet: tw.wallet,
      name: tw.name,
      project_url: tw.project_url,
      description: tw.description,
      trust_grade: "F",
      trust_score: 0,
      overall_rating: 0,
      discipline: 0,
      win_rate: 0,
      total_trades: 0,
      total_pnl: "0",
      lockout_count: 0,
      daily_loss_limit: "0",
      trading_days: 0,
      status: "tracked",
    });
  }

  const sortFns: Record<string, (a: LeaderboardEntry, b: LeaderboardEntry) => number> = {
    rating: (a, b) => b.overall_rating - a.overall_rating || b.trust_score - a.trust_score,
    win_rate: (a, b) => b.win_rate - a.win_rate,
    trades: (a, b) => b.total_trades - a.total_trades,
    discipline: (a, b) => b.discipline - a.discipline,
    trust: (a, b) => b.trust_score - a.trust_score,
    pnl: (a, b) => Number(BigInt(b.total_pnl) - BigInt(a.total_pnl)),
  };

  entries.sort(sortFns[sortBy] ?? sortFns.rating);

  return {
    entries: entries.slice(0, limit),
    total: entries.length,
  };
}

function emptyProfile(wallet: string): TraderProfileState {
  return {
    exists: false, authority: wallet, bump: 0, overallRating: 0,
    discipline: 0, patience: 0, consistency: 0, timing: 0, riskControl: 0,
    endurance: 0, totalTrades: 0, totalWins: 0, totalPnl: 0n,
    avgTradeSize: 0n, tradingDays: 0, lastUpdated: 0n,
  };
}

const BS58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    str += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    str += BS58_ALPHABET[digits[i]];
  }
  return str;
}
