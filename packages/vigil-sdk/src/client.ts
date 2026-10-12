import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Commitment,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import idl from "./idl.json";
import {
  Market,
  EpochBatchState,
  BatchOrder,
  OrderSide,
  parseMarketMode,
  parseBatchStatus,
  parseOrderSide,
  parseAssetClass,
  toAnchorSide,
} from "./types";
import {
  findRegistryPda,
  findMarketPda,
  findVaultBasePda,
  findVaultQuotePda,
  findEpochBatchPda,
} from "./pda";

export interface AnchorWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export class KeypairWallet implements AnchorWallet {
  constructor(public readonly payer: Keypair) {}
  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if ("partialSign" in tx) {
      (tx as Transaction).partialSign(this.payer);
    } else {
      (tx as VersionedTransaction).sign([this.payer]);
    }
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
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
export class VigilClient {
  public readonly connection: Connection;
  public readonly wallet: AnchorWallet;
  public readonly provider: AnchorProvider;
  public readonly program: Program;
  public readonly programId: PublicKey;

  /**
   * Initializes a new VigilClient instance.
   *
   * @param connectionOrProvider Solana RPC connection or AnchorProvider
   * @param wallet Wallet instance or Keypair for signing transactions (optional if provider passed)
   * @param options Optional configuration including custom programId
   */
  constructor(
    connectionOrProvider: Connection | AnchorProvider,
    wallet?: AnchorWallet | Keypair | VigilClientOptions,
    options?: VigilClientOptions
  ) {
    if (
      connectionOrProvider &&
      typeof connectionOrProvider === "object" &&
      "connection" in connectionOrProvider &&
      "wallet" in connectionOrProvider
    ) {
      this.provider = connectionOrProvider as AnchorProvider;
      this.connection = this.provider.connection;
      this.wallet = this.provider.wallet as AnchorWallet;
      if (wallet && typeof wallet === "object" && !("publicKey" in wallet) && !(wallet instanceof Keypair)) {
        options = wallet as VigilClientOptions;
      }
    } else {
      this.connection = connectionOrProvider as Connection;
      this.wallet = wallet instanceof Keypair ? new KeypairWallet(wallet) : (wallet as AnchorWallet);
      const commitment = options?.commitment || "confirmed";
      this.provider = new AnchorProvider(this.connection, this.wallet as any, { commitment });
    }

    this.programId = options?.programId
      ? new PublicKey(options.programId)
      : new PublicKey(
          (idl as any).address || "J67mmCdpb4NiMRPEF59JupqHpo3BLbk5Cr82qvGff8iX"
        );

    this.program = new Program(idl as any, this.provider);
  }

  /**
   * Discovers and lists all registered market addresses from the on-chain Registry PDA.
   *
   * @returns Array of Market PublicKeys
   */
  public async listMarkets(): Promise<PublicKey[]> {
    const [registryPda] = findRegistryPda(this.programId);
    try {
      const registryAccount = await (this.program.account as any).registry.fetch(
        registryPda
      );
      return (registryAccount.markets as PublicKey[]) || [];
    } catch (err: any) {
      // Returns empty array if registry account has not yet been initialized
      return [];
    }
  }

  /**
   * Fetches and deserializes a Market account into a typed object.
   *
   * @param marketPubkey Address of the Market PDA
   * @returns Typed Market struct
   */
  public async getMarket(marketPubkey: PublicKey): Promise<Market> {
    const raw = await (this.program.account as any).market.fetch(marketPubkey);
    return {
      authority: raw.authority,
      baseMint: raw.baseMint,
      quoteMint: raw.quoteMint,
      vaultBase: raw.vaultBase,
      vaultQuote: raw.vaultQuote,
      pythFeed: raw.pythFeed,
      mode: parseMarketMode(raw.mode),
      currentEpoch: raw.currentEpoch,
      epochDurationSlots: raw.epochDurationSlots,
      epochStartSlot: raw.epochStartSlot,
      maxConfBps: raw.maxConfBps,
      confFilterMult: raw.confFilterMult,
      assetClass: parseAssetClass(raw.assetClass),
      bump: raw.bump,
    };
  }

  /**
   * Fetches the EpochBatchState for a market's currently active epoch.
   *
   * @param marketPubkey Address of the Market PDA
   * @returns Typed EpochBatchState struct
   */
  public async getCurrentEpochBatch(
    marketPubkey: PublicKey
  ): Promise<EpochBatchState> {
    const market = await this.getMarket(marketPubkey);
    return await this.getEpochBatch(marketPubkey, market.currentEpoch);
  }

  /**
   * Fetches a specific EpochBatchState by epoch ID.
   *
   * @param marketPubkey Address of the Market PDA
   * @param epochId Sequential epoch number
   * @returns Typed EpochBatchState struct
   */
  public async getEpochBatch(
    marketPubkey: PublicKey,
    epochId: BN | number | bigint
  ): Promise<EpochBatchState> {
    const [batchPda] = findEpochBatchPda(marketPubkey, epochId, this.programId);
    const raw = await (this.program.account as any).epochBatchState.fetch(batchPda);

    const orders: BatchOrder[] = (raw.orders || [])
      .slice(0, raw.orderCount)
      .map((o: any) => ({
        user: o.user,
        side: parseOrderSide(o.side),
        lotSize: o.lotSize,
        limitPrice: o.limitPrice,
        filledLotSize: o.filledLotSize,
        claimed: o.claimed,
      }));

    return {
      market: raw.market,
      epochId: raw.epochId,
      startSlot: raw.startSlot,
      endSlot: raw.endSlot,
      totalBidVolume: raw.totalBidVolume,
      totalAskVolume: raw.totalAskVolume,
      matchedVolume: raw.matchedVolume,
      clearingPrice: raw.clearingPrice,
      status: parseBatchStatus(raw.status),
      orderCount: raw.orderCount,
      orders,
    };
  }

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
  public async placeBatchOrder(
    marketPubkey: PublicKey,
    side: OrderSide,
    lotSize: BN | number | bigint,
    limitPrice: BN | number | bigint,
    options?: PlaceBatchOrderOptions
  ): Promise<string> {
    const market = await this.getMarket(marketPubkey);
    const [epochBatchPda] = findEpochBatchPda(
      marketPubkey,
      market.currentEpoch,
      this.programId
    );
    const [vaultBase] = findVaultBasePda(marketPubkey, this.programId);
    const [vaultQuote] = findVaultQuotePda(marketPubkey, this.programId);

    const userBaseAta =
      options?.userBaseAta ||
      getAssociatedTokenAddressSync(market.baseMint, this.wallet.publicKey);
    const userQuoteAta =
      options?.userQuoteAta ||
      getAssociatedTokenAddressSync(market.quoteMint, this.wallet.publicKey);

    const sideAnchor = toAnchorSide(side);
    const lotSizeBn = new BN(lotSize.toString());
    const limitPriceBn = new BN(limitPrice.toString());

    return await this.program.methods
      .placeBatchOrder(sideAnchor, lotSizeBn, limitPriceBn)
      .accounts({
        user: this.wallet.publicKey,
        market: marketPubkey,
        epochBatch: epochBatchPda,
        pythFeed: market.pythFeed,
        vaultBase,
        vaultQuote,
        userBaseAta,
        userQuoteAta,
        baseMint: market.baseMint,
        quoteMint: market.quoteMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Cancels an unfilled batch order before the anti-sniping freeze window begins.
   *
   * @param marketPubkey Address of the Market PDA
   * @param orderIndex Slot index of the order in the batch (0..31)
   * @param options Optional epochId and ATA overrides
   * @returns Transaction signature
   */
  public async cancelBatchOrder(
    marketPubkey: PublicKey,
    orderIndex: number,
    options?: CancelBatchOrderOptions
  ): Promise<string> {
    const market = await this.getMarket(marketPubkey);
    const epochId = options?.epochId !== undefined ? options.epochId : market.currentEpoch;
    const [epochBatchPda] = findEpochBatchPda(marketPubkey, epochId, this.programId);
    const [vaultBase] = findVaultBasePda(marketPubkey, this.programId);
    const [vaultQuote] = findVaultQuotePda(marketPubkey, this.programId);

    const userBaseAta =
      options?.userBaseAta ||
      getAssociatedTokenAddressSync(market.baseMint, this.wallet.publicKey);
    const userQuoteAta =
      options?.userQuoteAta ||
      getAssociatedTokenAddressSync(market.quoteMint, this.wallet.publicKey);

    return await this.program.methods
      .cancelBatchOrder(orderIndex)
      .accounts({
        user: this.wallet.publicKey,
        market: marketPubkey,
        epochBatch: epochBatchPda,
        vaultBase,
        vaultQuote,
        userBaseAta,
        userQuoteAta,
        baseMint: market.baseMint,
        quoteMint: market.quoteMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Claims filled proceeds and price-improvement refunds once a batch has been Settled or Voided.
   *
   * @param marketPubkey Address of the Market PDA
   * @param orderIndex Slot index of the order in the batch
   * @param options Optional epochId and ATA overrides (defaults to previous epoch if current is still active)
   * @returns Transaction signature
   */
  public async claimOrderProceeds(
    marketPubkey: PublicKey,
    orderIndex: number,
    options?: ClaimOrderProceedsOptions
  ): Promise<string> {
    const market = await this.getMarket(marketPubkey);

    let epochId: BN;
    if (options?.epochId !== undefined) {
      epochId = new BN(options.epochId.toString());
    } else {
      // If current epoch is still accepting orders, claim defaults to currentEpoch - 1
      const currentBatch = await this.getCurrentEpochBatch(marketPubkey);
      if (currentBatch.status === "AcceptingOrders" && market.currentEpoch.gtn(0)) {
        epochId = market.currentEpoch.subn(1);
      } else {
        epochId = market.currentEpoch;
      }
    }

    const [epochBatchPda] = findEpochBatchPda(marketPubkey, epochId, this.programId);
    const [vaultBase] = findVaultBasePda(marketPubkey, this.programId);
    const [vaultQuote] = findVaultQuotePda(marketPubkey, this.programId);

    const userBaseAta =
      options?.userBaseAta ||
      getAssociatedTokenAddressSync(market.baseMint, this.wallet.publicKey);
    const userQuoteAta =
      options?.userQuoteAta ||
      getAssociatedTokenAddressSync(market.quoteMint, this.wallet.publicKey);

    return await this.program.methods
      .claimOrderProceeds(orderIndex)
      .accounts({
        user: this.wallet.publicKey,
        market: marketPubkey,
        epochBatch: epochBatchPda,
        vaultBase,
        vaultQuote,
        userBaseAta,
        userQuoteAta,
        baseMint: market.baseMint,
        quoteMint: market.quoteMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Permissionless crank instruction: evaluates Pyth oracle feed and flips Continuous/BatchAuction mode.
   * Also lazily initializes epoch 0's EpochBatchState on first call.
   *
   * @param marketPubkey Address of the Market PDA
   * @returns Transaction signature
   */
  public async evaluateMarketMode(marketPubkey: PublicKey): Promise<string> {
    const market = await this.getMarket(marketPubkey);
    const [epochBatchPda] = findEpochBatchPda(
      marketPubkey,
      market.currentEpoch,
      this.programId
    );

    return await this.program.methods
      .evaluateMarketMode()
      .accounts({
        market: marketPubkey,
        pythFeed: market.pythFeed,
        epochBatch: epochBatchPda,
        payer: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Permissionless crank instruction: clears the batch auction once end_slot has passed
   * and rolls the market state to epoch N + 1.
   *
   * @param marketPubkey Address of the Market PDA
   * @returns Transaction signature
   */
  public async settleBatchAuction(marketPubkey: PublicKey): Promise<string> {
    const market = await this.getMarket(marketPubkey);
    const [epochBatchPda] = findEpochBatchPda(
      marketPubkey,
      market.currentEpoch,
      this.programId
    );
    const [nextEpochBatchPda] = findEpochBatchPda(
      marketPubkey,
      market.currentEpoch.addn(1),
      this.programId
    );

    return await this.program.methods
      .settleBatchAuction()
      .accounts({
        keeper: this.wallet.publicKey,
        market: marketPubkey,
        epochBatch: epochBatchPda,
        nextEpochBatch: nextEpochBatchPda,
        pythFeed: market.pythFeed,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }
}
