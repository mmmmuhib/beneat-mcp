import {
  createSolanaRpc,
  address,
  type Address,
  getAddressDecoder,
} from "@solana/kit";
import { getRpcUrl, VAULT_ACCOUNT_SIZE_CODAMA, ANCHOR_DISCRIMINATOR_SIZE } from "./constants.js";
import { deriveVaultPDA, deriveProfilePDA } from "./pda.js";
import { getVaultDecoder } from "../generated/vault/accounts/vault.js";
import type { VaultState, TraderProfileState, DriftPosition } from "./types.js";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

function isValidBase58Address(value: string): boolean {
  return value.length >= 32 && value.length <= 44 && BASE58_RE.test(value);
}

function getRpc() {
  return createSolanaRpc(getRpcUrl());
}

const EMPTY_VAULT: Omit<VaultState, "owner"> = {
  exists: false,
  bump: 0,
  isLocked: false,
  lockoutUntil: 0n,
  lockoutCount: 0,
  lockoutDuration: 0,
  dailyLossLimit: 0n,
  maxTradesPerDay: 0,
  tradesToday: 0,
  sessionStart: 0n,
  totalDeposited: 0n,
  totalWithdrawn: 0n,
  lastTradeWasLoss: false,
  lastTradeTime: 0n,
  cooldownSeconds: 0,
  swapInProgress: false,
};

export async function readVault(wallet: string): Promise<VaultState> {
  if (!isValidBase58Address(wallet)) {
    return { ...EMPTY_VAULT, owner: wallet };
  }

  const rpc = getRpc();
  const ownerAddress = address(wallet);
  const [vaultPda] = await deriveVaultPDA(ownerAddress);

  const accountInfo = await rpc
    .getAccountInfo(vaultPda, { encoding: "base64" })
    .send();

  if (!accountInfo.value) {
    return { ...EMPTY_VAULT, owner: wallet };
  }

  const data = Buffer.from(accountInfo.value.data[0], "base64");

  const decoder = getVaultDecoder();
  const baseFields = decoder.decode(data);

  let swapInProgress = false;
  let pendingSwapSourceMint: string | undefined;
  let pendingSwapDestMint: string | undefined;
  let pendingSwapAmountIn: bigint | undefined;
  let pendingSwapMinOut: bigint | undefined;
  let balanceBeforeSwap: bigint | undefined;

  if (data.length > VAULT_ACCOUNT_SIZE_CODAMA) {
    const offset = VAULT_ACCOUNT_SIZE_CODAMA;
    swapInProgress = data[offset] === 1;

    if (data.length >= offset + 1 + 32 + 32 + 8 + 8 + 8) {
      const addrDecoder = getAddressDecoder();
      pendingSwapSourceMint = addrDecoder.decode(data.subarray(offset + 1, offset + 33)) as string;
      pendingSwapDestMint = addrDecoder.decode(data.subarray(offset + 33, offset + 65)) as string;
      pendingSwapAmountIn = data.readBigUInt64LE(offset + 65);
      pendingSwapMinOut = data.readBigUInt64LE(offset + 73);
      balanceBeforeSwap = data.readBigUInt64LE(offset + 81);
    }
  }

  return {
    exists: true,
    owner: baseFields.owner as string,
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
    swapInProgress,
    pendingSwapSourceMint,
    pendingSwapDestMint,
    pendingSwapAmountIn,
    pendingSwapMinOut,
    balanceBeforeSwap,
  };
}

const EMPTY_PROFILE: Omit<TraderProfileState, "authority"> = {
  exists: false,
  bump: 0,
  overallRating: 0,
  discipline: 0,
  patience: 0,
  consistency: 0,
  timing: 0,
  riskControl: 0,
  endurance: 0,
  totalTrades: 0,
  totalWins: 0,
  totalPnl: 0n,
  avgTradeSize: 0n,
  tradingDays: 0,
  lastUpdated: 0n,
};

export async function readProfile(wallet: string): Promise<TraderProfileState> {
  if (!isValidBase58Address(wallet)) {
    return { ...EMPTY_PROFILE, authority: wallet };
  }

  const rpc = getRpc();
  const authorityAddress = address(wallet);
  const [profilePda] = await deriveProfilePDA(authorityAddress);

  const accountInfo = await rpc
    .getAccountInfo(profilePda, { encoding: "base64" })
    .send();

  if (!accountInfo.value) {
    return { ...EMPTY_PROFILE, authority: wallet };
  }

  const data = Buffer.from(accountInfo.value.data[0], "base64");

  const PROFILE_DISCRIMINATOR = [99, 135, 170, 100, 49, 79, 225, 169];
  const disc = Array.from(data.subarray(0, 8));
  if (disc.some((b, i) => b !== PROFILE_DISCRIMINATOR[i])) {
    throw new Error("Account data does not match TraderProfile discriminator");
  }

  let offset = ANCHOR_DISCRIMINATOR_SIZE;

  const addrDecoder = getAddressDecoder();
  const authority = addrDecoder.decode(data.subarray(offset, offset + 32)) as string;
  offset += 32;

  const bump = data[offset];
  offset += 1;

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
  const avgTradeSize = data.readBigUInt64LE(offset); offset += 8;
  const tradingDays = data.readUInt16LE(offset); offset += 2;
  const lastUpdated = data.readBigInt64LE(offset);

  return {
    exists: true,
    authority,
    bump,
    overallRating,
    discipline,
    patience,
    consistency,
    timing,
    riskControl,
    endurance,
    totalTrades,
    totalWins,
    totalPnl,
    avgTradeSize,
    tradingDays,
    lastUpdated,
  };
}

export async function readDriftPositions(
  wallet: string
): Promise<DriftPosition[]> {
  if (!isValidBase58Address(wallet)) {
    return [];
  }

  const rpc = getRpc();
  const DRIFT_PROGRAM = address("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH");

  const authority = address(wallet);
  const subAccountId = 0;
  const subAccountBytes = Buffer.alloc(2);
  subAccountBytes.writeUInt16LE(subAccountId);

  const { getProgramDerivedAddress, getBytesEncoder, getAddressEncoder } =
    await import("@solana/kit");

  const [userPda] = await getProgramDerivedAddress({
    programAddress: DRIFT_PROGRAM,
    seeds: [
      getBytesEncoder().encode(new TextEncoder().encode("user")),
      getAddressEncoder().encode(authority),
      getBytesEncoder().encode(subAccountBytes),
    ],
  });

  const accountInfo = await rpc
    .getAccountInfo(userPda, { encoding: "base64" })
    .send();

  if (!accountInfo.value) return [];

  const data = Buffer.from(accountInfo.value.data[0], "base64");
  const positions: DriftPosition[] = [];

  const PERP_POSITION_OFFSET = 264;
  const PERP_POSITION_SIZE = 112;
  const MAX_PERP_POSITIONS = 8;

  for (let i = 0; i < MAX_PERP_POSITIONS; i++) {
    const start = PERP_POSITION_OFFSET + i * PERP_POSITION_SIZE;
    if (start + PERP_POSITION_SIZE > data.length) break;

    const marketIndex = data.readUInt16LE(start);
    const baseAssetAmount = data.readBigInt64LE(start + 16);
    const quoteAssetAmount = data.readBigInt64LE(start + 24);
    const quoteEntryAmount = data.readBigInt64LE(start + 32);
    const quoteBreakEvenAmount = data.readBigInt64LE(start + 40);
    const settledPnl = data.readBigInt64LE(start + 48);
    const openOrders = data[start + 88];

    if (baseAssetAmount === 0n && quoteAssetAmount === 0n) continue;

    positions.push({
      marketIndex,
      baseAssetAmount,
      quoteAssetAmount,
      quoteEntryAmount,
      quoteBreakEvenAmount,
      settledPnl,
      openOrders,
    });
  }

  return positions;
}
