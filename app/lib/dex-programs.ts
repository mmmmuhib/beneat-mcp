/**
 * Map of Solana program IDs to DEX source names.
 * Names must match the DEFI_SOURCES set in wallet-analytics.ts.
 */
export const DEX_PROGRAM_IDS: Record<string, string> = {
  // Jupiter v6
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "JUPITER",
  // Jupiter v4
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": "JUPITER",
  // Jupiter v3
  "JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph": "JUPITER",
  // Jupiter DCA
  "DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M": "JUPITER",
  // Jupiter Limit Order
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu": "JUPITER",

  // Raydium AMM v4
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "RAYDIUM",
  // Raydium CLMM
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": "RAYDIUM",
  // Raydium CPMM
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C": "RAYDIUM",

  // Orca Whirlpool
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "ORCA",

  // Drift
  "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH": "DRIFT",

  // Meteora DLMM
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": "METEORA",
  // Meteora pools
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB": "METEORA",

  // Phoenix
  "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY": "PHOENIX",

  // Lifinity v2
  "2wT8Yq49kHgDzXuPxZSaeLb88KNbDD6qx4SYnM4trLhs": "LIFINITY",

  // Marinade
  "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD": "MARINADE",

  // OpenBook v2
  "opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb": "OPENBOOK",

  // Tensor
  "TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN": "TENSOR",

  // Pump.fun
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "PUMP_FUN",

  // Saber
  "SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ": "SABER",

  // Sanctum (infinity)
  "5ocnV1qiCgaQR8Jb8xWnVbApfaygJ8tNoZfgPwsgx9kx": "SANCTUM",

  // Kamino
  "KLend2g3cP87ber41GJZPt4HMJniYfEeKHjfEi1vNA6": "KAMINO",

  // MarginFi
  "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA": "MARGINFI",

  // Zeta Markets
  "ZETAxsqBRek56DhiGXrn75yj2NHU3aYUnxvHXpkf1C6": "ZETA",

  // Mango v4
  "4MangoMjqJ2firMokCjjGPuH8HMpgezwVhZKvahkLSFpU": "MANGO",

  // Step Finance
  "SSwpMgqNDsyV7mAgN9ady4LkTVbMaiETrSWTTidVb6V": "STEP_FINANCE",

  // Flash Trade
  "FLASH6Lo6h3iasJKWDs2F8TkW2UKf3s15C8PMGuVfgBN": "FLASH_TRADE",

  // Bonkswap (uses Raydium, but listed for source identification)
  "BSwp6bEBihVLdqJRKGgzjcGLHkcTuzmSo1TQkHepzH8p": "BONKSWAP",
};

/**
 * Given a list of program IDs from a transaction, identify the DEX source.
 * Jupiter takes precedence since it wraps inner DEXs.
 */
export function identifyDexSource(programIds: string[]): string | null {
  let source: string | null = null;
  for (const pid of programIds) {
    const match = DEX_PROGRAM_IDS[pid];
    if (match === "JUPITER") return "JUPITER"; // Jupiter always wins
    if (match && !source) source = match;
  }
  return source;
}
