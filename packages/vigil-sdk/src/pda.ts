import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/**
 * Program PDA Seed Constants (mirroring programs/vigil/src/state/*.rs)
 */
export const REGISTRY_SEED = Buffer.from("registry");
export const MARKET_SEED = Buffer.from("market");
export const VAULT_BASE_SEED = Buffer.from("vault_base");
export const VAULT_QUOTE_SEED = Buffer.from("vault_quote");
export const BATCH_SEED = Buffer.from("batch");
export const ORDER_SEED = Buffer.from("order");
export const MOCK_ORACLE_SEED = Buffer.from("mock_oracle");

/**
 * Derives the canonical Registry PDA
 */
export function findRegistryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([REGISTRY_SEED], programId);
}

/**
 * Derives the canonical Market PDA for a base/quote mint pair
 */
export function findMarketPda(
  baseMint: PublicKey,
  quoteMint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MARKET_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    programId
  );
}

/**
 * Derives the base token vault PDA for a market
 */
export function findVaultBasePda(
  market: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_BASE_SEED, market.toBuffer()],
    programId
  );
}

/**
 * Derives the quote token vault PDA for a market
 */
export function findVaultQuotePda(
  market: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_QUOTE_SEED, market.toBuffer()],
    programId
  );
}

/**
 * Derives the EpochBatchState PDA for a market and epoch index
 */
export function findEpochBatchPda(
  market: PublicKey,
  epochId: BN | number | bigint,
  programId: PublicKey
): [PublicKey, number] {
  const epochBn = new BN(epochId.toString());
  return PublicKey.findProgramAddressSync(
    [BATCH_SEED, market.toBuffer(), epochBn.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

/**
 * Derives the UserOrderEscrow PDA for a user order
 */
export function findUserOrderEscrowPda(
  epochBatch: PublicKey,
  user: PublicKey,
  orderIndex: number,
  programId: PublicKey
): [PublicKey, number] {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(orderIndex, 0);
  return PublicKey.findProgramAddressSync(
    [ORDER_SEED, epochBatch.toBuffer(), user.toBuffer(), buf],
    programId
  );
}

/**
 * Derives the Mock Oracle PDA (Devnet / Test harness only)
 */
export function findMockOraclePda(
  baseMint: PublicKey,
  quoteMint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MOCK_ORACLE_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    programId
  );
}
