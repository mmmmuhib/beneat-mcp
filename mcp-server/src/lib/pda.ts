import {
  getAddressEncoder,
  getBytesEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import { VAULT_PROGRAM_ID, VAULT_SEED, TRADER_PROFILE_SEED } from "./constants.js";

export async function deriveVaultPDA(
  owner: Address
): Promise<[Address, number]> {
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: VAULT_PROGRAM_ID,
    seeds: [
      getBytesEncoder().encode(VAULT_SEED),
      getAddressEncoder().encode(owner),
    ],
  });
  return [pda as Address, bump];
}

export async function deriveProfilePDA(
  authority: Address
): Promise<[Address, number]> {
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: VAULT_PROGRAM_ID,
    seeds: [
      getBytesEncoder().encode(TRADER_PROFILE_SEED),
      getAddressEncoder().encode(authority),
    ],
  });
  return [pda as Address, bump];
}
