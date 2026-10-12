import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
/**
 * Market trading modes
 */
export type MarketMode = "Continuous" | "BatchAuction";
export type MarketModeAnchor = {
    continuous: Record<string, never>;
} | {
    batchAuction: Record<string, never>;
};
/**
 * Supported asset classes
 */
export type AssetClass = "TokenizedEquity" | "RWA" | "EmergingMarketFX" | "EventContingent";
export type AssetClassAnchor = {
    tokenizedEquity: Record<string, never>;
} | {
    rwa: Record<string, never>;
} | {
    emergingMarketFx: Record<string, never>;
} | {
    eventContingent: Record<string, never>;
};
/**
 * Epoch batch auction lifecycle statuses
 */
export type BatchStatus = "AcceptingOrders" | "Frozen" | "Settled" | "Voided";
export type BatchStatusAnchor = {
    acceptingOrders: Record<string, never>;
} | {
    frozen: Record<string, never>;
} | {
    settled: Record<string, never>;
} | {
    voided: Record<string, never>;
};
/**
 * Batch order side
 */
export type OrderSide = "bid" | "ask";
export type OrderSideAnchor = {
    bid: Record<string, never>;
} | {
    ask: Record<string, never>;
};
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
export declare function parseMarketMode(mode: any): MarketMode;
export declare function parseBatchStatus(status: any): BatchStatus;
export declare function parseOrderSide(side: any): OrderSide;
export declare function parseAssetClass(assetClass: any): AssetClass;
export declare function toAnchorSide(side: OrderSide | OrderSideAnchor): OrderSideAnchor;
export declare function toAnchorAssetClass(assetClass: AssetClass | AssetClassAnchor): AssetClassAnchor;
//# sourceMappingURL=types.d.ts.map