import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
} from "@solana/web3.js";
import { getRpcUrl, LAMPORTS_PER_SOL } from "./constants.js";
import type { UnsignedTransactionResult, VaultParameters } from "./types.js";

const VAULT_PROGRAM = new PublicKey(
  "GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki"
);
const VAULT_SEED = Buffer.from("vault");
const TRADER_PROFILE_SEED = Buffer.from("trader_profile");

const DISC = {
  initialize: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]),
  deposit: Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]),
  setRules: Buffer.from([66, 148, 196, 43, 232, 210, 174, 169]),
  manualLock: Buffer.from([128, 7, 199, 201, 41, 62, 228, 177]),
  unlock: Buffer.from([101, 155, 40, 21, 158, 189, 56, 203]),
  initializeProfile: Buffer.from([32, 145, 77, 213, 58, 39, 251, 234]),
  updateStats: Buffer.from([145, 138, 9, 150, 178, 31, 158, 244]),
};

function getConnection(): Connection {
  return new Connection(getRpcUrl(), "confirmed");
}

function deriveVaultPDASync(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, owner.toBuffer()],
    VAULT_PROGRAM
  );
}

function deriveProfilePDASync(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TRADER_PROFILE_SEED, authority.toBuffer()],
    VAULT_PROGRAM
  );
}

async function buildVersionedTx(
  ownerPubkey: PublicKey,
  instructions: TransactionInstruction[]
): Promise<UnsignedTransactionResult> {
  const connection = getConnection();
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const messageV0 = new TransactionMessage({
    payerKey: ownerPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  const serialized = Buffer.from(tx.serialize()).toString("base64");

  return {
    transaction: serialized,
    blockhash,
    lastValidBlockHeight,
    description: "",
  };
}

export async function buildInitializeVaultTx(
  owner: string,
  lockoutDuration: number
): Promise<UnsignedTransactionResult> {
  const ownerPubkey = new PublicKey(owner);
  const [vaultPda] = deriveVaultPDASync(ownerPubkey);

  const data = Buffer.alloc(8 + 4);
  DISC.initialize.copy(data, 0);
  data.writeUInt32LE(lockoutDuration, 8);

  const ix = new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const result = await buildVersionedTx(ownerPubkey, [ix]);
  result.description = `Initialize vault with ${lockoutDuration}s lockout`;
  return result;
}

export async function buildDepositTx(
  owner: string,
  amount: number
): Promise<UnsignedTransactionResult> {
  const ownerPubkey = new PublicKey(owner);
  const [vaultPda] = deriveVaultPDASync(ownerPubkey);

  const lamports = BigInt(Math.floor(amount * LAMPORTS_PER_SOL));

  const data = Buffer.alloc(8 + 8);
  DISC.deposit.copy(data, 0);
  data.writeBigUInt64LE(lamports, 8);

  const ix = new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const result = await buildVersionedTx(ownerPubkey, [ix]);
  result.description = `Deposit ${amount} SOL into vault`;
  return result;
}

export async function buildSetRulesTx(
  owner: string,
  params: VaultParameters
): Promise<UnsignedTransactionResult> {
  const ownerPubkey = new PublicKey(owner);
  const [vaultPda] = deriveVaultPDASync(ownerPubkey);

  const data = Buffer.alloc(8 + 8 + 1 + 4);
  DISC.setRules.copy(data, 0);
  data.writeBigUInt64LE(params.dailyLossLimit, 8);
  data.writeUInt8(params.maxTradesPerDay, 16);
  data.writeUInt32LE(params.lockoutDuration, 17);

  const ix = new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: ownerPubkey, isSigner: true, isWritable: false },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
    ],
    data,
  });

  const result = await buildVersionedTx(ownerPubkey, [ix]);
  result.description = `Set vault rules: ${params.maxTradesPerDay} trades/day, ${Number(params.dailyLossLimit) / LAMPORTS_PER_SOL} SOL daily loss limit`;
  return result;
}

export async function buildManualLockTx(
  owner: string
): Promise<UnsignedTransactionResult> {
  const ownerPubkey = new PublicKey(owner);
  const [vaultPda] = deriveVaultPDASync(ownerPubkey);

  const data = Buffer.alloc(8);
  DISC.manualLock.copy(data, 0);

  const ix = new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: ownerPubkey, isSigner: true, isWritable: false },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
    ],
    data,
  });

  const result = await buildVersionedTx(ownerPubkey, [ix]);
  result.description = "Manually lock vault";
  return result;
}

export async function buildUnlockTx(
  owner: string
): Promise<UnsignedTransactionResult> {
  const ownerPubkey = new PublicKey(owner);
  const [vaultPda] = deriveVaultPDASync(ownerPubkey);

  const data = Buffer.alloc(8);
  DISC.unlock.copy(data, 0);

  const ix = new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: ownerPubkey, isSigner: true, isWritable: false },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
    ],
    data,
  });

  const result = await buildVersionedTx(ownerPubkey, [ix]);
  result.description = "Unlock vault (only works after lockout expires)";
  return result;
}

export async function buildInitializeProfileTx(
  authority: string
): Promise<UnsignedTransactionResult> {
  const authorityPubkey = new PublicKey(authority);
  const [profilePda] = deriveProfilePDASync(authorityPubkey);

  const data = Buffer.alloc(8);
  DISC.initializeProfile.copy(data, 0);

  const ix = new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: authorityPubkey, isSigner: true, isWritable: true },
      { pubkey: profilePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const result = await buildVersionedTx(authorityPubkey, [ix]);
  result.description = "Initialize trader profile";
  return result;
}

export async function buildUpdateStatsTx(
  authority: string,
  stats: {
    discipline: number;
    patience: number;
    consistency: number;
    timing: number;
    riskControl: number;
    endurance: number;
    overallRating: number;
    totalTrades: number;
    totalWins: number;
    totalPnl: bigint;
    avgTradeSize: bigint;
    tradingDays: number;
  }
): Promise<UnsignedTransactionResult> {
  const authorityPubkey = new PublicKey(authority);
  const [profilePda] = deriveProfilePDASync(authorityPubkey);

  const data = Buffer.alloc(8 + 7 + 4 + 4 + 8 + 8 + 2);
  let offset = 0;

  DISC.updateStats.copy(data, offset); offset += 8;
  data.writeUInt8(stats.discipline, offset); offset += 1;
  data.writeUInt8(stats.patience, offset); offset += 1;
  data.writeUInt8(stats.consistency, offset); offset += 1;
  data.writeUInt8(stats.timing, offset); offset += 1;
  data.writeUInt8(stats.riskControl, offset); offset += 1;
  data.writeUInt8(stats.endurance, offset); offset += 1;
  data.writeUInt8(stats.overallRating, offset); offset += 1;
  data.writeUInt32LE(stats.totalTrades, offset); offset += 4;
  data.writeUInt32LE(stats.totalWins, offset); offset += 4;
  data.writeBigInt64LE(stats.totalPnl, offset); offset += 8;
  data.writeBigUInt64LE(stats.avgTradeSize, offset); offset += 8;
  data.writeUInt16LE(stats.tradingDays, offset);

  const ix = new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: authorityPubkey, isSigner: true, isWritable: true },
      { pubkey: profilePda, isSigner: false, isWritable: true },
    ],
    data,
  });

  const result = await buildVersionedTx(authorityPubkey, [ix]);
  result.description = `Update trader profile stats (${stats.totalTrades} trades, ${stats.overallRating}/99 rating)`;
  return result;
}
