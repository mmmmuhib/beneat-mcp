import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { join } from "path";
import { getArenaAgentDetail } from "../../../lib/arena-agents";

const VAULT_PROGRAM_ID = new PublicKey("GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki");
const WALLETS_PATH = join(process.cwd(), "data", "tracked-wallets.json");

interface TrackedWallet {
  wallet: string;
  name: string;
  project_url: string | null;
  description: string | null;
  registered_at: string;
  status: "tracked";
}

function findTrackedWallet(walletAddr: string): TrackedWallet | null {
  try {
    const raw = readFileSync(WALLETS_PATH, "utf-8");
    const wallets: TrackedWallet[] = JSON.parse(raw).wallets ?? [];
    return wallets.find((w) => w.wallet === walletAddr) ?? null;
  } catch {
    return null;
  }
}
const PROFILE_DISC = Buffer.from([99, 135, 170, 100, 49, 79, 225, 169]);
const VAULT_DISC = Buffer.from([211, 8, 232, 43, 2, 152, 117, 119]);
const LAMPORTS_PER_SOL = 1_000_000_000;

import { classifyArchetype } from "../../../lib/archetypes";

function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
}

function deriveVaultPDA(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    VAULT_PROGRAM_ID
  );
  return pda;
}

function deriveProfilePDA(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trader_profile"), owner.toBuffer()],
    VAULT_PROGRAM_ID
  );
  return pda;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    // Handle arena agents (synthetic wallets from CSV data)
    if (wallet.startsWith("ARENA_")) {
      const detail = getArenaAgentDetail(wallet);
      if (!detail) {
        return NextResponse.json({ error: "Arena agent not found" }, { status: 404 });
      }
      const isEnforced = wallet.startsWith("ARENA_ENF_");
      const profile = detail.profile;
      const discipline = Math.max(0, Math.round(100 - profile.maxDrawdownPct * 2));
      const enfDiscipline = Math.min(99, discipline + 15);
      const d = isEnforced ? enfDiscipline : discipline;
      const wr = isEnforced ? detail.enforcement.enforced.stats.profitablePercent / 100 : profile.winRate;
      const rating = Math.round(wr * 50 + (d / 100) * 50);
      const trustScore = Math.min(100, Math.round(rating * 0.6 + d * 0.4) + (isEnforced ? 10 : 0));
      const tradingDays = new Set(profile.rawTrades.map((t) => t.exitDate.slice(0, 10))).size;

      return NextResponse.json({
        wallet,
        name: isEnforced ? `${profile.name} [Beneat]` : profile.name,
        project_url: null,
        description: isEnforced ? "Alpha Arena agent — Beneat enforcement applied" : "Alpha Arena agent — baseline performance",
        registered_at: null,
        has_vault: false,
        has_profile: true,
        trust_score: trustScore,
        trust_grade: trustScore >= 80 ? "A" : trustScore >= 60 ? "B" : trustScore >= 40 ? "C" : trustScore >= 20 ? "D" : "F",
        trust_factors: ["arena_agent", ...(isEnforced ? ["beneat_enforced"] : [])],
        tier: rating >= 90 ? "Legendary" : rating >= 75 ? "Diamond" : rating >= 60 ? "Gold" : rating >= 40 ? "Silver" : "Bronze",
        archetype: "Swarm",
        archetype_color: "#06b6d4",
        archetype_narrative: isEnforced
          ? "This agent operates under Beneat enforcement — stop-losses, daily caps, and tilt reduction are active, improving risk-adjusted returns."
          : "This Alpha Arena agent trades autonomously on HyperLiquid. Its behavior is analyzed but not enforced.",
        vault: null,
        profile: {
          overall_rating: rating,
          discipline: d,
          patience: 50,
          consistency: Math.round(wr * 80),
          timing: 50,
          risk_control: d,
          endurance: Math.min(99, tradingDays * 5),
          total_trades: profile.totalTrades,
          total_wins: Math.round(profile.totalTrades * wr),
          win_rate: Math.round(wr * 10000) / 10000,
          total_pnl: Math.round((isEnforced ? detail.enforcement.enforced.stats.medianReturn : profile.totalReturnPct) / 100 * profile.startingEquity * 1e9).toString(),
          total_pnl_sol: (isEnforced ? detail.enforcement.enforced.stats.medianReturn : profile.totalReturnPct) / 100 * profile.startingEquity,
          avg_trade_size: "0",
          trading_days: tradingDays,
        },
        status: isEnforced ? "arena_enforced" : "arena_baseline",
        is_arena: true,
        is_beneat_enforced: isEnforced,
        counterpart_wallet: detail.counterpartWallet,
      });
    }

    let ownerKey: PublicKey;
    try {
      ownerKey = new PublicKey(wallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const vaultPda = deriveVaultPDA(ownerKey);
    const profilePda = deriveProfilePDA(ownerKey);

    const [vaultInfo, profileInfo] = await connection.getMultipleAccountsInfo([
      vaultPda,
      profilePda,
    ]);

    const hasVault = !!vaultInfo?.data;
    const hasProfile = !!profileInfo?.data;

    let vault = null;
    if (vaultInfo?.data) {
      const d = Buffer.from(vaultInfo.data);
      const disc = d.subarray(0, 8);
      if (disc.equals(VAULT_DISC)) {
        let offset = 8 + 32 + 1;
        const isLocked = d[offset] === 1; offset += 1;
        const lockoutUntil = d.readBigInt64LE(offset); offset += 8;
        const lockoutCount = d.readUInt32LE(offset); offset += 4;
        const dailyLossLimit = d.readBigUInt64LE(offset); offset += 8;
        const maxTradesPerDay = d.readUInt32LE(offset); offset += 4;
        const tradesToday = d.readUInt32LE(offset); offset += 4;
        offset += 8; // sessionStart
        offset += 1; // lastTradeWasLoss
        offset += 1; // padding
        const totalDeposited = d.readBigUInt64LE(offset); offset += 8;
        const totalWithdrawn = d.readBigUInt64LE(offset); offset += 8;
        offset += 8; // padding
        offset += 1; // lastTradeWasLoss (actual)
        const lastTradeTime = d.readBigInt64LE(offset); offset += 8;
        const cooldownSeconds = d.readUInt32LE(offset); offset += 4;
        const lockoutDuration = d.readUInt32LE(offset);

        vault = {
          is_locked: isLocked,
          lockout_until: lockoutUntil.toString(),
          lockout_count: lockoutCount,
          lockout_duration: lockoutDuration,
          daily_loss_limit: dailyLossLimit.toString(),
          daily_loss_limit_sol: Number(dailyLossLimit) / LAMPORTS_PER_SOL,
          max_trades_per_day: maxTradesPerDay,
          trades_today: tradesToday,
          total_deposited: totalDeposited.toString(),
          total_deposited_sol: Number(totalDeposited) / LAMPORTS_PER_SOL,
          total_withdrawn: totalWithdrawn.toString(),
          cooldown_seconds: cooldownSeconds,
        };
      }
    }

    let profile = null;
    if (profileInfo?.data) {
      const d = Buffer.from(profileInfo.data);
      if (d.subarray(0, 8).equals(PROFILE_DISC)) {
        let offset = 8 + 32 + 1;
        const overallRating = d[offset]; offset += 1;
        const discipline = d[offset]; offset += 1;
        const patience = d[offset]; offset += 1;
        const consistency = d[offset]; offset += 1;
        const timing = d[offset]; offset += 1;
        const riskControl = d[offset]; offset += 1;
        const endurance = d[offset]; offset += 1;
        const totalTrades = d.readUInt32LE(offset); offset += 4;
        const totalWins = d.readUInt32LE(offset); offset += 4;
        const totalPnl = d.readBigInt64LE(offset); offset += 8;
        const avgTradeSize = d.readBigUInt64LE(offset); offset += 8;
        const tradingDays = d.readUInt16LE(offset);

        const winRate = totalTrades > 0 ? totalWins / totalTrades : 0;

        profile = {
          overall_rating: overallRating,
          discipline,
          patience,
          consistency,
          timing,
          risk_control: riskControl,
          endurance,
          total_trades: totalTrades,
          total_wins: totalWins,
          win_rate: Math.round(winRate * 10000) / 10000,
          total_pnl: totalPnl.toString(),
          total_pnl_sol: Number(totalPnl) / LAMPORTS_PER_SOL,
          avg_trade_size: avgTradeSize.toString(),
          trading_days: tradingDays,
        };
      }
    }

    let trustScore = 0;
    const factors: string[] = [];
    if (hasVault && vault) {
      trustScore += 20; factors.push("has_vault");
      if (vault.lockout_duration > 0) { trustScore += 10; factors.push("lockout_configured"); }
      if (Number(vault.daily_loss_limit) > 0) { trustScore += 10; factors.push("loss_limit_set"); }
      if (vault.max_trades_per_day > 0 && vault.max_trades_per_day <= 50) { trustScore += 10; factors.push("trade_limit_set"); }
      if (vault.total_deposited_sol > 1) { trustScore += 5; factors.push("deposited_gt_1sol"); }
      if (vault.lockout_count > 0) { trustScore += 5; factors.push("has_lockout_history"); }
    }
    if (hasProfile && profile) {
      trustScore += 15; factors.push("has_profile");
      if (profile.total_trades >= 10) { trustScore += 5; factors.push("10plus_trades"); }
      if (profile.total_trades >= 100) { trustScore += 5; factors.push("100plus_trades"); }
      if (profile.trading_days >= 7) { trustScore += 5; factors.push("7plus_days"); }
      if (profile.overall_rating >= 60) { trustScore += 5; factors.push("rating_above_60"); }
      if (profile.discipline >= 70) { trustScore += 5; factors.push("high_discipline"); }
    }
    trustScore = Math.min(100, trustScore);
    let trustGrade: string;
    if (trustScore >= 80) trustGrade = "A";
    else if (trustScore >= 60) trustGrade = "B";
    else if (trustScore >= 40) trustGrade = "C";
    else if (trustScore >= 20) trustGrade = "D";
    else trustGrade = "F";

    function getTier(rating: number): string {
      if (rating >= 90) return "Legendary";
      if (rating >= 75) return "Diamond";
      if (rating >= 60) return "Gold";
      if (rating >= 40) return "Silver";
      return "Bronze";
    }

    const tracked = findTrackedWallet(wallet);

    const archetypeResult = classifyArchetype({
      discipline: profile?.discipline ?? 0,
      patience: profile?.patience ?? 0,
      consistency: profile?.consistency ?? 0,
      timing: profile?.timing ?? 0,
      risk_control: profile?.risk_control ?? 0,
      endurance: profile?.endurance ?? 0,
      overall_rating: profile?.overall_rating ?? 0,
      total_trades: profile?.total_trades ?? 0,
      lockout_count: vault?.lockout_count ?? 0,
      win_rate: profile?.win_rate ?? 0,
      trading_days: profile?.trading_days ?? 0,
    });

    return NextResponse.json({
      wallet,
      name: tracked?.name ?? null,
      project_url: tracked?.project_url ?? null,
      description: tracked?.description ?? null,
      registered_at: tracked?.registered_at ?? null,
      has_vault: hasVault,
      has_profile: hasProfile,
      trust_score: trustScore,
      trust_grade: trustGrade,
      trust_factors: factors,
      tier: getTier(profile?.overall_rating ?? 0),
      archetype: archetypeResult.archetype,
      archetype_color: archetypeResult.color,
      archetype_narrative: archetypeResult.narrative,
      vault,
      profile,
      status: hasVault ? "verified" : (tracked ? "tracked" : "unknown"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch agent details" },
      { status: 500 }
    );
  }
}
