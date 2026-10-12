import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Commitment, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Market, EpochBatchState, OrderSide } from "./types";
export interface AnchorWallet {
    publicKey: PublicKey;
    signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
    signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}
export declare class KeypairWallet implements AnchorWallet {
    readonly payer: Keypair;
    constructor(payer: Keypair);
    get publicKey(): PublicKey;
    signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
    signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}
export interface VigilClientOptions {
    programId?: PublicKey | string;
    commitment?: Commitment;
}
export interface PlaceBatchOrderOptions {
    userBaseAta?: PublicKey;
    userQuoteAta?: PublicKey;
}
export interface CancelBatchOrderOptions {
    epochId?: BN | number | bigint;
    userBaseAta?: PublicKey;
    userQuoteAta?: PublicKey;
}
export interface ClaimOrderProceedsOptions {
    epochId?: BN | number | bigint;
    userBaseAta?: PublicKey;
    userQuoteAta?: PublicKey;
}
/**
 * High-level TypeScript client for interacting with Vigil markets on Solana.
 *
 * Encapsulates all account derivation, PDA math, and Anchor instruction building
 * so developers can build on Vigil without boilerplate.
 */
export declare class VigilClient {
    readonly connection: Connection;
    readonly wallet: AnchorWallet;
    readonly provider: AnchorProvider;
    readonly program: Program;
    readonly programId: PublicKey;
    /**
     * Initializes a new VigilClient instance.
     *
     * @param connectionOrProvider Solana RPC connection or AnchorProvider
     * @param wallet Wallet instance or Keypair for signing transactions (optional if provider passed)
     * @param options Optional configuration including custom programId
     */
    constructor(connectionOrProvider: Connection | AnchorProvider, wallet?: AnchorWallet | Keypair | VigilClientOptions, options?: VigilClientOptions);
    /**
     * Discovers and lists all registered market addresses from the on-chain Registry PDA.
     *
     * @returns Array of Market PublicKeys
     */
    listMarkets(): Promise<PublicKey[]>;
    /**
     * Fetches and deserializes a Market account into a typed object.
     *
     * @param marketPubkey Address of the Market PDA
     * @returns Typed Market struct
     */
    getMarket(marketPubkey: PublicKey): Promise<Market>;
    /**
     * Fetches the EpochBatchState for a market's currently active epoch.
     *
     * @param marketPubkey Address of the Market PDA
     * @returns Typed EpochBatchState struct
     */
    getCurrentEpochBatch(marketPubkey: PublicKey): Promise<EpochBatchState>;
    /**
     * Fetches a specific EpochBatchState by epoch ID.
     *
     * @param marketPubkey Address of the Market PDA
     * @param epochId Sequential epoch number
     * @returns Typed EpochBatchState struct
     */
    getEpochBatch(marketPubkey: PublicKey, epochId: BN | number | bigint): Promise<EpochBatchState>;
    /**
     * Submits a batch limit order to the market's current epoch.
     * Automatically resolves vault PDAs, ATAs, and oracle feed addresses.
     *
     * @param marketPubkey Address of the Market PDA
     * @param side "bid" to buy base asset, "ask" to sell base asset
     * @param lotSize Number of base asset lots
     * @param limitPrice Limit price in 6-decimal fixed point format (e.g. 200_000_000 for $200.00)
     * @param options Optional custom ATA overrides
     * @returns Transaction signature
     */
    placeBatchOrder(marketPubkey: PublicKey, side: OrderSide, lotSize: BN | number | bigint, limitPrice: BN | number | bigint, options?: PlaceBatchOrderOptions): Promise<string>;
    /**
     * Cancels an unfilled batch order before the anti-sniping freeze window begins.
     *
     * @param marketPubkey Address of the Market PDA
     * @param orderIndex Slot index of the order in the batch (0..31)
     * @param options Optional epochId and ATA overrides
     * @returns Transaction signature
     */
    cancelBatchOrder(marketPubkey: PublicKey, orderIndex: number, options?: CancelBatchOrderOptions): Promise<string>;
    /**
     * Claims filled proceeds and price-improvement refunds once a batch has been Settled or Voided.
     *
     * @param marketPubkey Address of the Market PDA
     * @param orderIndex Slot index of the order in the batch
     * @param options Optional epochId and ATA overrides (defaults to previous epoch if current is still active)
     * @returns Transaction signature
     */
    claimOrderProceeds(marketPubkey: PublicKey, orderIndex: number, options?: ClaimOrderProceedsOptions): Promise<string>;
    /**
     * Permissionless crank instruction: evaluates Pyth oracle feed and flips Continuous/BatchAuction mode.
     * Also lazily initializes epoch 0's EpochBatchState on first call.
     *
     * @param marketPubkey Address of the Market PDA
     * @returns Transaction signature
     */
    evaluateMarketMode(marketPubkey: PublicKey): Promise<string>;
    /**
     * Permissionless crank instruction: clears the batch auction once end_slot has passed
     * and rolls the market state to epoch N + 1.
     *
     * @param marketPubkey Address of the Market PDA
     * @returns Transaction signature
     */
    settleBatchAuction(marketPubkey: PublicKey): Promise<string>;
}
//# sourceMappingURL=client.d.ts.map