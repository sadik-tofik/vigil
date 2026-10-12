import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TwilightBook } from "../target/types/twilight_book";

/**
 * On-chain PDA seed constants directly mirroring state/*.rs:
 * - programs/vigil/src/state/registry.rs: REGISTRY_SEED = b"registry"
 * - programs/vigil/src/state/market.rs: MARKET_SEED = b"market", VAULT_BASE_SEED = b"vault_base", VAULT_QUOTE_SEED = b"vault_quote"
 * - programs/vigil/src/state/epoch_batch.rs: BATCH_SEED = b"batch", ORDER_SEED = b"order"
 */
export const REGISTRY_SEED = Buffer.from("registry");
export const MARKET_SEED = Buffer.from("market");
export const VAULT_BASE_SEED = Buffer.from("vault_base");
export const VAULT_QUOTE_SEED = Buffer.from("vault_quote");
export const BATCH_SEED = Buffer.from("batch");
export const ORDER_SEED = Buffer.from("order");

/**
 * Types mirroring deserialized on-chain state
 */
export interface RegistryAccountData {
  bump: number;
  markets: PublicKey[];
}

export interface MarketAccountData {
  authority: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  vaultBase: PublicKey;
  vaultQuote: PublicKey;
  pythFeed: PublicKey;
  mode: { continuous?: Record<string, never> } | { batchAuction?: Record<string, never> } | any;
  currentEpoch: BN;
  epochDurationSlots: BN;
  epochStartSlot: BN;
  maxConfBps: BN;
  confFilterMult: BN;
  assetClass: any;
  bump: number;
}

export interface EpochBatchAccountData {
  market: PublicKey;
  epochId: BN;
  startSlot: BN;
  endSlot: BN;
  totalBidVolume: BN;
  totalAskVolume: BN;
  matchedVolume: BN;
  clearingPrice: BN;
  status:
    | { acceptingOrders?: Record<string, never> }
    | { frozen?: Record<string, never> }
    | { settled?: Record<string, never> }
    | { voided?: Record<string, never> }
    | any;
  orderCount: number;
  orders: any[];
}

/**
 * PDA Derivation Functions
 */
export function findRegistryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([REGISTRY_SEED], programId);
}

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

export function findVaultBasePda(
  market: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_BASE_SEED, market.toBuffer()],
    programId
  );
}

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
 * Account fetching helpers
 */
export async function fetchRegistryMarkets(
  program: Program<TwilightBook>
): Promise<PublicKey[]> {
  const [registryPda] = findRegistryPda(program.programId);
  try {
    const registryAccount = await (program.account as any).registry.fetch(registryPda);
    return (registryAccount.markets as PublicKey[]) || [];
  } catch (err: any) {
    // If registry doesn't exist yet, return empty list
    return [];
  }
}

export async function fetchMarket(
  program: Program<TwilightBook>,
  marketPubkey: PublicKey
): Promise<MarketAccountData | null> {
  try {
    const market = await (program.account as any).market.fetch(marketPubkey);
    return market as MarketAccountData;
  } catch (err: any) {
    return null;
  }
}

export async function fetchEpochBatch(
  program: Program<TwilightBook>,
  epochBatchPubkey: PublicKey
): Promise<EpochBatchAccountData | null> {
  try {
    const batch = await (program.account as any).epochBatchState.fetch(epochBatchPubkey);
    return batch as EpochBatchAccountData;
  } catch (err: any) {
    return null;
  }
}

/**
 * Status and mode inspectors
 */
export function isAcceptingOrders(status: any): boolean {
  if (!status) return false;
  if (typeof status === "object" && "acceptingOrders" in status) return true;
  if (status === 0 || status === "AcceptingOrders" || status === "acceptingOrders") return true;
  return false;
}

export function isBatchAuctionMode(mode: any): boolean {
  if (!mode) return false;
  if (typeof mode === "object" && "batchAuction" in mode) return true;
  if (mode === 1 || mode === "BatchAuction" || mode === "batchAuction") return true;
  return false;
}
