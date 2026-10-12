import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/**
 * Market trading modes
 */
export type MarketMode = "Continuous" | "BatchAuction";

export type MarketModeAnchor =
  | { continuous: Record<string, never> }
  | { batchAuction: Record<string, never> };

/**
 * Supported asset classes
 */
export type AssetClass =
  | "TokenizedEquity"
  | "RWA"
  | "EmergingMarketFX"
  | "EventContingent";

export type AssetClassAnchor =
  | { tokenizedEquity: Record<string, never> }
  | { rwa: Record<string, never> }
  | { emergingMarketFx: Record<string, never> }
  | { eventContingent: Record<string, never> };

/**
 * Epoch batch auction lifecycle statuses
 */
export type BatchStatus = "AcceptingOrders" | "Frozen" | "Settled" | "Voided";

export type BatchStatusAnchor =
  | { acceptingOrders: Record<string, never> }
  | { frozen: Record<string, never> }
  | { settled: Record<string, never> }
  | { voided: Record<string, never> };

/**
 * Batch order side
 */
export type OrderSide = "bid" | "ask";

export type OrderSideAnchor =
  | { bid: Record<string, never> }
  | { ask: Record<string, never> };

/**
 * Single limit order within an EpochBatchState
 */
export interface BatchOrder {
  /** User wallet pubkey placing the order */
  user: PublicKey;
  /** Order side: bid or ask */
  side: OrderSide;
  /** Base token lots submitted in escrow */
  lotSize: BN;
  /** Limit price in 6-decimal fixed point (e.g. 214_500_000 = $214.50) */
  limitPrice: BN;
  /** Quantity of lots filled after auction clearing */
  filledLotSize: BN;
  /** Whether proceeds/refund have already been claimed */
  claimed: boolean;
}

/**
 * Full discrete epoch batch auction state
 */
export interface EpochBatchState {
  /** Target Market account address */
  market: PublicKey;
  /** Monotonic epoch sequence index (0, 1, 2, ...) */
  epochId: BN;
  /** Solana slot when this epoch started accepting orders */
  startSlot: BN;
  /** Terminal slot after which auction is ready for uniform clearing */
  endSlot: BN;
  /** Cumulative bid volume queued in batch */
  totalBidVolume: BN;
  /** Cumulative ask volume queued in batch */
  totalAskVolume: BN;
  /** Matched trade volume solved at clearing price */
  matchedVolume: BN;
  /** Uniform clearing price P* calculated by the matching engine */
  clearingPrice: BN;
  /** Current status of the batch */
  status: BatchStatus;
  /** Active orders in this batch (max 32) */
  orderCount: number;
  /** Array of batch orders */
  orders: BatchOrder[];
}

/**
 * On-chain Market account state
 */
export interface Market {
  /** Market creator / admin authority */
  authority: PublicKey;
  /** Base asset mint (e.g. tTSLA, real estate token, gold) */
  baseMint: PublicKey;
  /** Quote asset mint (e.g. USDC, EURC, USDY) */
  quoteMint: PublicKey;
  /** Escrow vault PDA holding base tokens */
  vaultBase: PublicKey;
  /** Escrow vault PDA holding quote tokens */
  vaultQuote: PublicKey;
  /** Pyth Network price oracle feed address */
  pythFeed: PublicKey;
  /** Active trading mode: Continuous or BatchAuction */
  mode: MarketMode;
  /** Current active epoch number */
  currentEpoch: BN;
  /** Duration of each batch auction in slots (e.g. 75 slots ~ 30s) */
  epochDurationSlots: BN;
  /** Slot when the current epoch began */
  epochStartSlot: BN;
  /** Maximum confidence spread tolerance in bps (e.g. 200 = 2.00%) */
  maxConfBps: BN;
  /** Multiplier k for dynamic confidence band [P - k*sigma, P + k*sigma] */
  confFilterMult: BN;
  /** Classification tag for display */
  assetClass: AssetClass;
  /** Canonical Market PDA bump seed */
  bump: number;
}

/**
 * On-chain Registry holding all permissionlessly created markets
 */
export interface Registry {
  bump: number;
  markets: PublicKey[];
}

/**
 * Normalize Anchor enum object to string
 */
export function parseMarketMode(mode: any): MarketMode {
  if (typeof mode === "string") return mode as MarketMode;
  if (mode && "continuous" in mode) return "Continuous";
  if (mode && "batchAuction" in mode) return "BatchAuction";
  return "Continuous";
}

export function parseBatchStatus(status: any): BatchStatus {
  if (typeof status === "string") return status as BatchStatus;
  if (status && "acceptingOrders" in status) return "AcceptingOrders";
  if (status && "frozen" in status) return "Frozen";
  if (status && "settled" in status) return "Settled";
  if (status && "voided" in status) return "Voided";
  return "AcceptingOrders";
}

export function parseOrderSide(side: any): OrderSide {
  if (typeof side === "string") {
    return side.toLowerCase() === "bid" ? "bid" : "ask";
  }
  if (side && "bid" in side) return "bid";
  if (side && "ask" in side) return "ask";
  return "bid";
}

export function parseAssetClass(assetClass: any): AssetClass {
  if (typeof assetClass === "string") return assetClass as AssetClass;
  if (typeof assetClass === "number") {
    switch (assetClass) {
      case 0:
        return "TokenizedEquity";
      case 1:
        return "RWA";
      case 2:
        return "EmergingMarketFX";
      case 3:
        return "EventContingent";
    }
  }
  if (assetClass && typeof assetClass === "object") {
    if ("tokenizedEquity" in assetClass || "TokenizedEquity" in assetClass)
      return "TokenizedEquity";
    if ("rwa" in assetClass || "Rwa" in assetClass || "RWA" in assetClass)
      return "RWA";
    if (
      "emergingMarketFx" in assetClass ||
      "EmergingMarketFx" in assetClass ||
      "emergingMarketFX" in assetClass
    )
      return "EmergingMarketFX";
    if ("eventContingent" in assetClass || "EventContingent" in assetClass)
      return "EventContingent";
  }
  return "TokenizedEquity";
}

export function toAnchorSide(side: OrderSide | OrderSideAnchor): OrderSideAnchor {
  if (typeof side === "string") {
    return side.toLowerCase() === "bid" ? { bid: {} } : { ask: {} };
  }
  return side;
}

export function toAnchorAssetClass(
  assetClass: AssetClass | AssetClassAnchor
): AssetClassAnchor {
  if (typeof assetClass === "string") {
    switch (assetClass) {
      case "TokenizedEquity":
        return { tokenizedEquity: {} };
      case "RWA":
        return { rwa: {} };
      case "EmergingMarketFX":
        return { emergingMarketFx: {} };
      case "EventContingent":
        return { eventContingent: {} };
      default:
        return { tokenizedEquity: {} };
    }
  }
  return assetClass;
}
