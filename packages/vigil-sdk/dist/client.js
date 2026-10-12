"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VigilClient = exports.KeypairWallet = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const idl_json_1 = __importDefault(require("./idl.json"));
const types_1 = require("./types");
const pda_1 = require("./pda");
class KeypairWallet {
    payer;
    constructor(payer) {
        this.payer = payer;
    }
    get publicKey() {
        return this.payer.publicKey;
    }
    async signTransaction(tx) {
        if ("partialSign" in tx) {
            tx.partialSign(this.payer);
        }
        else {
            tx.sign([this.payer]);
        }
        return tx;
    }
    async signAllTransactions(txs) {
        return Promise.all(txs.map((t) => this.signTransaction(t)));
    }
}
exports.KeypairWallet = KeypairWallet;
/**
 * High-level TypeScript client for interacting with Vigil markets on Solana.
 *
 * Encapsulates all account derivation, PDA math, and Anchor instruction building
 * so developers can build on Vigil without boilerplate.
 */
class VigilClient {
    connection;
    wallet;
    provider;
    program;
    programId;
    /**
     * Initializes a new VigilClient instance.
     *
     * @param connectionOrProvider Solana RPC connection or AnchorProvider
     * @param wallet Wallet instance or Keypair for signing transactions (optional if provider passed)
     * @param options Optional configuration including custom programId
     */
    constructor(connectionOrProvider, wallet, options) {
        if (connectionOrProvider &&
            typeof connectionOrProvider === "object" &&
            "connection" in connectionOrProvider &&
            "wallet" in connectionOrProvider) {
            this.provider = connectionOrProvider;
            this.connection = this.provider.connection;
            this.wallet = this.provider.wallet;
            if (wallet && typeof wallet === "object" && !("publicKey" in wallet) && !(wallet instanceof web3_js_1.Keypair)) {
                options = wallet;
            }
        }
        else {
            this.connection = connectionOrProvider;
            this.wallet = wallet instanceof web3_js_1.Keypair ? new KeypairWallet(wallet) : wallet;
            const commitment = options?.commitment || "confirmed";
            this.provider = new anchor_1.AnchorProvider(this.connection, this.wallet, { commitment });
        }
        this.programId = options?.programId
            ? new web3_js_1.PublicKey(options.programId)
            : new web3_js_1.PublicKey(idl_json_1.default.address || "J67mmCdpb4NiMRPEF59JupqHpo3BLbk5Cr82qvGff8iX");
        this.program = new anchor_1.Program(idl_json_1.default, this.provider);
    }
    /**
     * Discovers and lists all registered market addresses from the on-chain Registry PDA.
     *
     * @returns Array of Market PublicKeys
     */
    async listMarkets() {
        const [registryPda] = (0, pda_1.findRegistryPda)(this.programId);
        try {
            const registryAccount = await this.program.account.registry.fetch(registryPda);
            return registryAccount.markets || [];
        }
        catch (err) {
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
    async getMarket(marketPubkey) {
        const raw = await this.program.account.market.fetch(marketPubkey);
        return {
            authority: raw.authority,
            baseMint: raw.baseMint,
            quoteMint: raw.quoteMint,
            vaultBase: raw.vaultBase,
            vaultQuote: raw.vaultQuote,
            pythFeed: raw.pythFeed,
            mode: (0, types_1.parseMarketMode)(raw.mode),
            currentEpoch: raw.currentEpoch,
            epochDurationSlots: raw.epochDurationSlots,
            epochStartSlot: raw.epochStartSlot,
            maxConfBps: raw.maxConfBps,
            confFilterMult: raw.confFilterMult,
            assetClass: (0, types_1.parseAssetClass)(raw.assetClass),
            bump: raw.bump,
        };
    }
    /**
     * Fetches the EpochBatchState for a market's currently active epoch.
     *
     * @param marketPubkey Address of the Market PDA
     * @returns Typed EpochBatchState struct
     */
    async getCurrentEpochBatch(marketPubkey) {
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
    async getEpochBatch(marketPubkey, epochId) {
        const [batchPda] = (0, pda_1.findEpochBatchPda)(marketPubkey, epochId, this.programId);
        const raw = await this.program.account.epochBatchState.fetch(batchPda);
        const orders = (raw.orders || [])
            .slice(0, raw.orderCount)
            .map((o) => ({
            user: o.user,
            side: (0, types_1.parseOrderSide)(o.side),
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
            status: (0, types_1.parseBatchStatus)(raw.status),
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
    async placeBatchOrder(marketPubkey, side, lotSize, limitPrice, options) {
        const market = await this.getMarket(marketPubkey);
        const [epochBatchPda] = (0, pda_1.findEpochBatchPda)(marketPubkey, market.currentEpoch, this.programId);
        const [vaultBase] = (0, pda_1.findVaultBasePda)(marketPubkey, this.programId);
        const [vaultQuote] = (0, pda_1.findVaultQuotePda)(marketPubkey, this.programId);
        const userBaseAta = options?.userBaseAta ||
            (0, spl_token_1.getAssociatedTokenAddressSync)(market.baseMint, this.wallet.publicKey);
        const userQuoteAta = options?.userQuoteAta ||
            (0, spl_token_1.getAssociatedTokenAddressSync)(market.quoteMint, this.wallet.publicKey);
        const sideAnchor = (0, types_1.toAnchorSide)(side);
        const lotSizeBn = new anchor_1.BN(lotSize.toString());
        const limitPriceBn = new anchor_1.BN(limitPrice.toString());
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
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
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
    async cancelBatchOrder(marketPubkey, orderIndex, options) {
        const market = await this.getMarket(marketPubkey);
        const epochId = options?.epochId !== undefined ? options.epochId : market.currentEpoch;
        const [epochBatchPda] = (0, pda_1.findEpochBatchPda)(marketPubkey, epochId, this.programId);
        const [vaultBase] = (0, pda_1.findVaultBasePda)(marketPubkey, this.programId);
        const [vaultQuote] = (0, pda_1.findVaultQuotePda)(marketPubkey, this.programId);
        const userBaseAta = options?.userBaseAta ||
            (0, spl_token_1.getAssociatedTokenAddressSync)(market.baseMint, this.wallet.publicKey);
        const userQuoteAta = options?.userQuoteAta ||
            (0, spl_token_1.getAssociatedTokenAddressSync)(market.quoteMint, this.wallet.publicKey);
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
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
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
    async claimOrderProceeds(marketPubkey, orderIndex, options) {
        const market = await this.getMarket(marketPubkey);
        let epochId;
        if (options?.epochId !== undefined) {
            epochId = new anchor_1.BN(options.epochId.toString());
        }
        else {
            // If current epoch is still accepting orders, claim defaults to currentEpoch - 1
            const currentBatch = await this.getCurrentEpochBatch(marketPubkey);
            if (currentBatch.status === "AcceptingOrders" && market.currentEpoch.gtn(0)) {
                epochId = market.currentEpoch.subn(1);
            }
            else {
                epochId = market.currentEpoch;
            }
        }
        const [epochBatchPda] = (0, pda_1.findEpochBatchPda)(marketPubkey, epochId, this.programId);
        const [vaultBase] = (0, pda_1.findVaultBasePda)(marketPubkey, this.programId);
        const [vaultQuote] = (0, pda_1.findVaultQuotePda)(marketPubkey, this.programId);
        const userBaseAta = options?.userBaseAta ||
            (0, spl_token_1.getAssociatedTokenAddressSync)(market.baseMint, this.wallet.publicKey);
        const userQuoteAta = options?.userQuoteAta ||
            (0, spl_token_1.getAssociatedTokenAddressSync)(market.quoteMint, this.wallet.publicKey);
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
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
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
    async evaluateMarketMode(marketPubkey) {
        const market = await this.getMarket(marketPubkey);
        const [epochBatchPda] = (0, pda_1.findEpochBatchPda)(marketPubkey, market.currentEpoch, this.programId);
        return await this.program.methods
            .evaluateMarketMode()
            .accounts({
            market: marketPubkey,
            pythFeed: market.pythFeed,
            epochBatch: epochBatchPda,
            payer: this.wallet.publicKey,
            systemProgram: web3_js_1.SystemProgram.programId,
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
    async settleBatchAuction(marketPubkey) {
        const market = await this.getMarket(marketPubkey);
        const [epochBatchPda] = (0, pda_1.findEpochBatchPda)(marketPubkey, market.currentEpoch, this.programId);
        const [nextEpochBatchPda] = (0, pda_1.findEpochBatchPda)(marketPubkey, market.currentEpoch.addn(1), this.programId);
        return await this.program.methods
            .settleBatchAuction()
            .accounts({
            keeper: this.wallet.publicKey,
            market: marketPubkey,
            epochBatch: epochBatchPda,
            nextEpochBatch: nextEpochBatchPda,
            pythFeed: market.pythFeed,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc();
    }
}
exports.VigilClient = VigilClient;
