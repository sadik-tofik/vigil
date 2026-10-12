import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
/**
 * Program PDA Seed Constants (mirroring programs/vigil/src/state/*.rs)
 */
export declare const REGISTRY_SEED: Buffer;
export declare const MARKET_SEED: Buffer;
export declare const VAULT_BASE_SEED: Buffer;
export declare const VAULT_QUOTE_SEED: Buffer;
export declare const BATCH_SEED: Buffer;
export declare const ORDER_SEED: Buffer;
export declare const MOCK_ORACLE_SEED: Buffer;
/**
 * Derives the canonical Registry PDA
 */
export declare function findRegistryPda(programId: PublicKey): [PublicKey, number];
/**
 * Derives the canonical Market PDA for a base/quote mint pair
 */
export declare function findMarketPda(baseMint: PublicKey, quoteMint: PublicKey, programId: PublicKey): [PublicKey, number];
/**
 * Derives the base token vault PDA for a market
 */
export declare function findVaultBasePda(market: PublicKey, programId: PublicKey): [PublicKey, number];
/**
 * Derives the quote token vault PDA for a market
 */
export declare function findVaultQuotePda(market: PublicKey, programId: PublicKey): [PublicKey, number];
/**
 * Derives the EpochBatchState PDA for a market and epoch index
 */
export declare function findEpochBatchPda(market: PublicKey, epochId: BN | number | bigint, programId: PublicKey): [PublicKey, number];
/**
 * Derives the UserOrderEscrow PDA for a user order
 */
export declare function findUserOrderEscrowPda(epochBatch: PublicKey, user: PublicKey, orderIndex: number, programId: PublicKey): [PublicKey, number];
/**
 * Derives the Mock Oracle PDA (Devnet / Test harness only)
 */
export declare function findMockOraclePda(baseMint: PublicKey, quoteMint: PublicKey, programId: PublicKey): [PublicKey, number];
//# sourceMappingURL=pda.d.ts.map