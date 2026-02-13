import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { join } from "path";
import { loadArenaAgents } from "../../lib/arena-agents";

const VAULT_PROGRAM_ID = new PublicKey("GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki");
const VAULT_DISC = Buffer.from([211, 8, 232, 43, 2, 152, 117, 119]);
const PROFILE_DISC = Buffer.from([99, 135, 170, 100, 49, 79, 225, 169]);
const LAMPORTS_PER_SOL = 1_000_000_000;
const WALLETS_PATH = join(process.cwd(), "data", "tracked-wallets.json");
const BENCHMARK_PATH = join(process.cwd(), "data", "benchmark-results.json");

interface BenchmarkAgentData {
  wallet: string;
  name: string;
  trust_grade: string;
  overall_rating: number;
  total_pnl: string;
  daily_loss_limit: string;
  trading_days: number;
  archetype: string;
  archetype_color: string;
  stats: {
    win_rate: number;
    discipline: number;
    trust_score: number;
    total_pnl_sol: number;
    total_trades: number;
    lockout_count: number;
  };
}

function readBenchmarkAgents(): BenchmarkAgentData[] {
  try {
    const raw = readFileSync(BENCHMARK_PATH, "utf-8");
    return JSON.parse(raw).agents ?? [];
  } catch {
    return [];
  }
}

interface TrackedWallet {
  wallet: string;
  name: string;
  project_url: string | null;
  description: string | null;
  registered_at: string;
  status: "tracked";
}

function readTrackedWallets(): TrackedWallet[] {
  try {
    const raw = readFileSync(WALLETS_PATH, "utf-8");
    return JSON.parse(raw).wallets ?? [];
  } catch {
    return [];
  }
}

interface LeaderboardEntry {
  rank: number;
  wallet: string;
  name: string | null;
  project_url: string | null;
  description: string | null;
  trust_grade: string;
  trust_score: number;
  overall_rating: number;
  discipline: number;
  win_rate: number;
  total_trades: number;
  total_pnl: string;
  lockout_count: number;
  daily_loss_limit: string;
  trading_days: number;
  status: "verified" | "tracked" | "arena_baseline" | "arena_enforced";
  is_beneat_enforced?: boolean;
  archetype: string;
  archetype_color: string;
}

const ARCHETYPE_COLORS: Record<string, string> = {
  Specter: "#f0f0f0", Apex: "#ffd700", Phantom: "#a855f7", Sentinel: "#3b82f6",
  Ironclad: "#9ca3af", Swarm: "#06b6d4", Rogue: "#ef4444", Glitch: "#ec4899", Unclassed: "#52525b",
};

function classifyArchetypeServer(s: {
  discipline: number; patience: number; consistency: number; endurance: number;
  risk_control: number; overall_rating: number; total_trades: number;
  lockout_count: number; win_rate: number; trading_days: number;
}): { archetype: string; color: string } {
  let archetype = "Unclassed";
  if (s.overall_rating >= 90) archetype = "Apex";
  else if (s.discipline >= 80 && s.patience >= 75 && s.total_trades < 50) archetype = "Phantom";
  else if (s.discipline >= 80 && s.risk_control >= 75 && s.lockout_count <= 1) archetype = "Sentinel";
  else if (s.endurance >= 80 && s.consistency >= 75 && s.trading_days >= 30) archetype = "Ironclad";
  else if (s.total_trades >= 200 && s.consistency >= 70) archetype = "Swarm";
  else if (s.discipline < 40 && s.total_trades >= 50) archetype = "Rogue";
  else if (s.lockout_count >= 5 || (s.discipline < 30 && s.consistency < 30)) archetype = "Glitch";
  return { archetype, color: ARCHETYPE_COLORS[archetype] };
}

let cache: { entries: LeaderboardEntry[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000;

function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
}

function computeTrustScore(vaultData: Buffer, profileData: Buffer | null): { score: number; grade: string } {
  let score = 0;

  score += 20;
  const lockoutDuration = vaultData.readUInt32LE(8 + 32 + 1 + 1 + 8 + 4 + 4 + 8 + 1 + 1 + 8 + 8 + 8 + 1 + 8);
  if (lockoutDuration > 0) score += 10;
  const dailyLossLimit = vaultData.readBigUInt64LE(8 + 32 + 1 + 1 + 8 + 4);
  if (Number(dailyLossLimit) > 0) score += 10;
  const maxTradesPerDay = vaultData.readUInt32LE(8 + 32 + 1 + 1 + 8 + 4 + 8);
  if (maxTradesPerDay > 0 && maxTradesPerDay <= 50) score += 10;
  const totalDeposited = vaultData.readBigUInt64LE(8 + 32 + 1 + 1 + 8 + 4 + 4 + 8 + 1 + 1);
  if (Number(totalDeposited) > LAMPORTS_PER_SOL) score += 5;
  const lockoutCount = vaultData.readUInt32LE(8 + 32 + 1 + 1 + 8);
  if (lockoutCount > 0) score += 5;

  if (profileData) {
    score += 15;
    let offset = 8 + 32 + 1;
    offset += 8; // skip rating bytes through endurance
    const totalTrades = profileData.readUInt32LE(8 + 32 + 1 + 8);
    const discipline = profileData[8 + 32 + 1 + 1];
    const overallRating = profileData[8 + 32 + 1];
    const tradingDays = profileData.readUInt16LE(8 + 32 + 1 + 8 + 4 + 4 + 8 + 8);

    if (totalTrades >= 10) score += 5;
    if (totalTrades >= 100) score += 5;
    if (tradingDays >= 7) score += 5;
    if (overallRating >= 60) score += 5;
    if (discipline >= 70) score += 5;
  }

  score = Math.min(100, score);
  let grade: string;
  if (score >= 80) grade = "A";
  else if (score >= 60) grade = "B";
  else if (score >= 40) grade = "C";
  else if (score >= 20) grade = "D";
  else grade = "F";

  return { score, grade };
}

function decodeVaultOwner(data: Buffer): string {
  return new PublicKey(data.subarray(8, 40)).toBase58();
}

function deriveProfilePDA(owner: PublicKey): PublicKey {
  const SEED = Buffer.from("trader_profile");
  const [pda] = PublicKey.findProgramAddressSync(
    [SEED, owner.toBuffer()],
    VAULT_PROGRAM_ID
  );
  return pda;
}

function parseProfile(data: Buffer) {
  const disc = data.subarray(0, 8);
  if (!disc.equals(PROFILE_DISC)) return null;

  let offset = 8 + 32 + 1;
  const overallRating = data[offset]; offset += 1;
  const discipline = data[offset]; offset += 1;
  const patience = data[offset]; offset += 1;
  const consistency = data[offset]; offset += 1;
  const timing = data[offset]; offset += 1;
  const riskControl = data[offset]; offset += 1;
  const endurance = data[offset]; offset += 1;
  const totalTrades = data.readUInt32LE(offset); offset += 4;
  const totalWins = data.readUInt32LE(offset); offset += 4;
  const totalPnl = data.readBigInt64LE(offset); offset += 8;
  offset += 8; // avgTradeSize
  const tradingDays = data.readUInt16LE(offset);

  return { overallRating, discipline, patience, consistency, timing, riskControl, endurance, totalTrades, totalWins, totalPnl, tradingDays };
}

function parseVaultLockoutCount(data: Buffer): number {
  return data.readUInt32LE(8 + 32 + 1 + 1 + 8);
}

function parseVaultDailyLossLimit(data: Buffer): bigint {
  return data.readBigUInt64LE(8 + 32 + 1 + 1 + 8 + 4);
}

async function fetchOnChainEntries(): Promise<LeaderboardEntry[]> {
  const connection = new Connection(getRpcUrl(), "confirmed");

  const vaultAccounts = await connection.getProgramAccounts(VAULT_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58Encode(VAULT_DISC) } }],
  });

  const entries: LeaderboardEntry[] = [];

  const profileAddresses = vaultAccounts.map((acc) => {
    const owner = new PublicKey(acc.account.data.subarray(8, 40));
    return deriveProfilePDA(owner);
  });

  const profileInfos = await connection.getMultipleAccountsInfo(profileAddresses);

  for (let i = 0; i < vaultAccounts.length; i++) {
    try {
      const vaultData = vaultAccounts[i].account.data;
      const owner = decodeVaultOwner(vaultData);
      const profileData = profileInfos[i]?.data ?? null;
      const profileBuf = profileData ? Buffer.from(profileData) : null;

      const { score, grade } = computeTrustScore(vaultData, profileBuf);
      const profile = profileBuf ? parseProfile(profileBuf) : null;

      const winRate = profile && profile.totalTrades > 0
        ? profile.totalWins / profile.totalTrades
        : 0;

      const lockoutCount = parseVaultLockoutCount(vaultData);
      const tradingDays = profile?.tradingDays ?? 0;
      const { archetype, color: archetypeColor } = classifyArchetypeServer({
        discipline: profile?.discipline ?? 0,
        patience: profile?.patience ?? 0,
        consistency: profile?.consistency ?? 0,
        endurance: profile?.endurance ?? 0,
        risk_control: profile?.riskControl ?? 0,
        overall_rating: profile?.overallRating ?? 0,
        total_trades: profile?.totalTrades ?? 0,
        lockout_count: lockoutCount,
        win_rate: winRate,
        trading_days: tradingDays,
      });

      entries.push({
        rank: 0,
        wallet: owner,
        name: null,
        project_url: null,
        description: null,
        trust_grade: grade,
        trust_score: score,
        overall_rating: profile?.overallRating ?? 0,
        discipline: profile?.discipline ?? 0,
        win_rate: Math.round(winRate * 10000) / 10000,
        total_trades: profile?.totalTrades ?? 0,
        total_pnl: (profile?.totalPnl ?? 0n).toString(),
        lockout_count: lockoutCount,
        daily_loss_limit: parseVaultDailyLossLimit(vaultData).toString(),
        trading_days: tradingDays,
        status: "verified",
        archetype,
        archetype_color: archetypeColor,
      });
    } catch {
      continue;
    }
  }

  return entries;
}

function mergeWithTrackedWallets(onChainEntries: LeaderboardEntry[]): LeaderboardEntry[] {
  const trackedWallets = readTrackedWallets();
  const benchmarkAgents = readBenchmarkAgents();
  const trackedByAddress = new Map(trackedWallets.map((tw) => [tw.wallet, tw]));
  const seenWallets = new Set<string>();

  const entries = onChainEntries.map((entry) => {
    seenWallets.add(entry.wallet);
    const tracked = trackedByAddress.get(entry.wallet);
    if (tracked) {
      return { ...entry, name: tracked.name, project_url: tracked.project_url, description: tracked.description };
    }
    return entry;
  });

  for (const tw of trackedWallets) {
    if (!tw.wallet) continue;
    if (seenWallets.has(tw.wallet)) continue;
    seenWallets.add(tw.wallet);
    entries.push({
      rank: 0,
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
      archetype: "Unclassed",
      archetype_color: "#52525b",
    });
  }

  for (const ba of benchmarkAgents) {
    if (seenWallets.has(ba.wallet)) continue;
    seenWallets.add(ba.wallet);
    entries.push({
      rank: 0,
      wallet: ba.wallet,
      name: ba.name,
      project_url: null,
      description: "Benchmark agent",
      trust_grade: ba.trust_grade,
      trust_score: ba.stats.trust_score,
      overall_rating: ba.overall_rating,
      discipline: ba.stats.discipline,
      win_rate: ba.stats.win_rate,
      total_trades: ba.stats.total_trades,
      total_pnl: ba.total_pnl,
      lockout_count: ba.stats.lockout_count,
      daily_loss_limit: ba.daily_loss_limit,
      trading_days: ba.trading_days,
      status: "tracked",
      archetype: ba.archetype,
      archetype_color: ba.archetype_color,
    });
  }

  // Append arena agents (Alpha Arena baseline + enforced entries)
  const arenaAgents = loadArenaAgents();
  for (const aa of arenaAgents) {
    if (seenWallets.has(aa.wallet)) continue;
    seenWallets.add(aa.wallet);
    entries.push(aa as LeaderboardEntry);
  }

  entries.sort((a, b) => b.overall_rating - a.overall_rating || b.trust_score - a.trust_score);
  entries.forEach((e, i) => (e.rank = i + 1));

  return entries;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get("sort_by") ?? "rating";
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));

    let onChainEntries: LeaderboardEntry[];
    let cached = false;

    if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
      onChainEntries = cache.entries;
      cached = true;
    } else {
      onChainEntries = await fetchOnChainEntries();
      cache = { entries: onChainEntries, timestamp: Date.now() };
    }

    const merged = mergeWithTrackedWallets([...onChainEntries]);
    const sorted = sortEntries(merged, sortBy);

    return NextResponse.json({
      entries: sorted.slice(0, limit),
      total: merged.length,
      cached,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}

function sortEntries(entries: LeaderboardEntry[], sortBy: string): LeaderboardEntry[] {
  const fns: Record<string, (a: LeaderboardEntry, b: LeaderboardEntry) => number> = {
    rating: (a, b) => b.overall_rating - a.overall_rating || b.trust_score - a.trust_score,
    win_rate: (a, b) => b.win_rate - a.win_rate,
    trades: (a, b) => b.total_trades - a.total_trades,
    discipline: (a, b) => b.discipline - a.discipline,
    trust: (a, b) => b.trust_score - a.trust_score,
    pnl: (a, b) => Number(BigInt(b.total_pnl) - BigInt(a.total_pnl)),
  };
  entries.sort(fns[sortBy] ?? fns.rating);
  entries.forEach((e, i) => (e.rank = i + 1));
  return entries;
}

const BS58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(bytes: Buffer): string {
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
