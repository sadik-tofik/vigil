import { PublicKey, Connection, ComputeBudgetProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import idl from './twilight_book.json';
import { MarketState, EpochBatchState, OracleState, BatchOrder, OrderSide } from './types';
import { decodePythBuffer } from './mockPythDecoder';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';

// TwilightBook Deployed Program ID on Solana Devnet
export const PROGRAM_ID = new PublicKey(idl.address || "HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h");

// Default RPC Endpoint (Solana Devnet)
export const DEFAULT_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Verified Devnet Deployment Addresses
export const DEVNET_DEPLOYMENT = {
  programId: PROGRAM_ID.toBase58(),
  authority: "C8oi9BAzmxdU27ENXunQKYp7UgR4DumaQ6cn55JmpdWd",
  marketPda: new PublicKey("4AzzVo3q7uEA4FhAAXzgEHYVJenawY1srz2ZeTpgvfVm"),
  vaultBase: new PublicKey("5nv9C68XRZrrCoK2Uam7whR5aia6no8QfissnCfiUBVo"),
  vaultQuote: new PublicKey("GqrnFXreCLifnrNi68aP2rmjg6Kb2Kr5BWq94eZZenNG"),
  mockOracle: new PublicKey("9vVo3wcMuzT8mCAhVAJ7Y2Uempbyd8uvw4zhRUASXams"),
  epoch0Batch: new PublicKey("88QgSKk1b8bDAiY4RsRxXQtF2dHztAd7XJduVnXeyYQy"),
  epoch1Batch: new PublicKey("BcehrgwuWTgzFjFP9UyB5sKH5oMA8Jm2spRv2TU2yk4q"),
  baseSymbol: "tTSLA",
  quoteSymbol: "USDC",
  baseMint: new PublicKey("4iYXDWaHC5A1B5ymiLmqAyPt5K2miKS2yBaqHr98p9Am"),
  quoteMint: new PublicKey("Ba7J5A5jCViRSKk1UPfZZthz3sEBdEQBydh4a6ibJjA"),
};

export function getConnection(rpcUrl: string = DEFAULT_RPC_URL): Connection {
  return new Connection(rpcUrl, "confirmed");
}

export function getAnchorProgram(connection: Connection, wallet: any): Program {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(idl as any, provider);
}

// PDA Derivation Helpers
export function findMarketPda(baseMint: PublicKey, quoteMint: PublicKey, programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), baseMint.toBuffer(), quoteMint.toBuffer()],
    programId
  );
}

export function findVaultBasePda(marketPda: PublicKey, programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("vault_base"), marketPda.toBuffer()], programId);
}

export function findVaultQuotePda(marketPda: PublicKey, programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("vault_quote"), marketPda.toBuffer()], programId);
}

export function findMockOraclePda(baseMint: PublicKey, quoteMint: PublicKey, programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mock_oracle"), baseMint.toBuffer(), quoteMint.toBuffer()],
    programId
  );
}

export function findBatchPda(marketPda: PublicKey, epochId: number | bigint, programId = PROGRAM_ID): [PublicKey, number] {
  const epochBn = new BN(epochId.toString());
  return PublicKey.findProgramAddressSync(
    [Buffer.from("batch"), marketPda.toBuffer(), epochBn.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

// On-Chain Fetchers
export async function fetchLiveMarketState(
  connection: Connection,
  marketPda = DEVNET_DEPLOYMENT.marketPda
): Promise<MarketState | null> {
  try {
    const program = new Program(idl as any, new AnchorProvider(connection, {} as any, {}));
    const market = await (program.account as any).market.fetch(marketPda);

    const modeKey = Object.keys(market.mode)[0] || 'continuous';

    return {
      address: marketPda.toBase58(),
      baseSymbol: DEVNET_DEPLOYMENT.baseSymbol,
      quoteSymbol: DEVNET_DEPLOYMENT.quoteSymbol,
      mode: modeKey === 'batchAuction' ? 'batchAuction' : 'continuous',
      currentEpoch: market.currentEpoch.toNumber(),
      epochDurationSlots: market.epochDurationSlots.toNumber(),
      maxConfBps: market.maxConfBps.toNumber(),
      confFilterMult: market.confFilterMult.toNumber(),
      baseVaultBalance: 0,
      quoteVaultBalance: 0,
      pythFeed: market.pythFeed.toBase58(),
    };
  } catch (err) {
    console.warn("fetchLiveMarketState warning:", err);
    return null;
  }
}

export async function fetchLiveBatchState(
  connection: Connection,
  batchPda: PublicKey
): Promise<EpochBatchState | null> {
  try {
    const program = new Program(idl as any, new AnchorProvider(connection, {} as any, {}));
    const batch = await (program.account as any).epochBatchState.fetch(batchPda);
    const curSlot = await connection.getSlot("confirmed").catch(() => batch.endSlot.toNumber());

    const statusKey = Object.keys(batch.status)[0] as any;
    const orders: BatchOrder[] = batch.orders.map((o: any, idx: number) => {
      const isBid = 'bid' in o.side;
      const lotRaw = BigInt(o.lotSize.toString());
      const priceRaw = BigInt(o.limitPrice.toString());
      const filledRaw = BigInt(o.filledLotSize.toString());

      return {
        index: idx,
        user: o.user.toBase58().substring(0, 4) + '...' + o.user.toBase58().slice(-4),
        side: isBid ? 'bid' : 'ask',
        lotSize: Number(lotRaw) / 1_000_000,
        lotSizeRaw: lotRaw,
        limitPrice: Number(priceRaw) / 1_000_000,
        limitPriceRaw: priceRaw,
        filledLotSize: Number(filledRaw) / 1_000_000,
        claimed: o.claimed,
        timestamp: Date.now(),
      };
    });

    return {
      epochId: batch.epochId.toNumber(),
      status: statusKey || 'acceptingOrders',
      startSlot: batch.startSlot.toNumber(),
      endSlot: batch.endSlot.toNumber(),
      currentSlot: curSlot,
      totalBidVolume: batch.totalBidVolume.toNumber() / 1_000_000,
      totalAskVolume: batch.totalAskVolume.toNumber() / 1_000_000,
      clearingPrice: batch.clearingPrice.toNumber() / 1_000_000,
      matchedVolume: batch.matchedVolume.toNumber() / 1_000_000,
      orderCount: batch.orderCount,
      orders,
    };
  } catch (err) {
    console.warn("fetchLiveBatchState warning:", err);
    return null;
  }
}

export async function fetchLiveOracleState(
  connection: Connection,
  oraclePda = DEVNET_DEPLOYMENT.mockOracle,
  confFilterMult = 2
): Promise<OracleState | null> {
  try {
    const acct = await connection.getAccountInfo(oraclePda);
    if (!acct || acct.data.length < 240) return null;
    return decodePythBuffer(acct.data, confFilterMult);
  } catch (err) {
    console.warn("fetchLiveOracleState warning:", err);
    return null;
  }
}

// =========================================================================
// ON-CHAIN TRANSACTION EXECUTORS
// =========================================================================

export async function executeOnChainSetMockOracle(
  program: Program,
  wallet: any,
  priceUSD: number = 214.50,
  confUSD: number = 6.00,
  expo: number = -6,
  status: number = 1,
  publishTimeSeconds?: number,
  marketPda = DEVNET_DEPLOYMENT.marketPda
): Promise<string> {
  const market = await (program.account as any).market.fetch(marketPda);
  const [mockOraclePda] = findMockOraclePda(market.baseMint, market.quoteMint);

  const priceBn = new BN(Math.round(priceUSD * 1_000_000));
  const confBn = new BN(Math.round(confUSD * 1_000_000));
  const now = publishTimeSeconds ?? Math.floor(Date.now() / 1000);

  return await program.methods
    .setMockOracle(priceBn, confBn, expo, status, new BN(now))
    .accounts({
      payer: wallet.publicKey,
      baseMint: market.baseMint,
      quoteMint: market.quoteMint,
      mockOracle: mockOraclePda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
}

export async function executeOnChainEvaluateMarketMode(
  program: Program,
  wallet: any,
  marketPda = DEVNET_DEPLOYMENT.marketPda
): Promise<string> {
  const market = await (program.account as any).market.fetch(marketPda);
  const [epochBatchPda] = findBatchPda(marketPda, market.currentEpoch.toNumber());

  return await program.methods
    .evaluateMarketMode()
    .accounts({
      market: marketPda,
      pythFeed: market.pythFeed,
      epochBatch: epochBatchPda,
      payer: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
}

export async function executeOnChainPlaceOrder(
  program: Program,
  wallet: any,
  side: OrderSide,
  lotSize: number,
  limitPrice: number,
  marketPda = DEVNET_DEPLOYMENT.marketPda
): Promise<string> {
  let market = await (program.account as any).market.fetch(marketPda);
  let [epochBatchPda] = findBatchPda(marketPda, market.currentEpoch.toNumber());

  // Check if current epoch is already expired / frozen on Devnet
  try {
    const curSlot = await program.provider.connection.getSlot('confirmed');
    const batch = await (program.account as any).epochBatchState.fetch(epochBatchPda);
    if (curSlot >= batch.endSlot.toNumber() - 5) {
      console.log("Current epoch expired or within freeze window. Auto-rolling to next epoch via settleBatchAuction...");
      await executeOnChainSettle(program, wallet, marketPda);
      market = await (program.account as any).market.fetch(marketPda);
      [epochBatchPda] = findBatchPda(marketPda, market.currentEpoch.toNumber());
    }
  } catch (e) {
    console.warn("Epoch check warning:", e);
  }

  const userBaseAta = getAssociatedTokenAddressSync(market.baseMint, wallet.publicKey);
  const userQuoteAta = getAssociatedTokenAddressSync(market.quoteMint, wallet.publicKey);

  const lotSizeBn = new BN(Math.round(lotSize * 1_000_000));
  const limitPriceBn = new BN(Math.round(limitPrice * 1_000_000));

  const [mockOraclePda] = findMockOraclePda(market.baseMint, market.quoteMint);
  const now = Math.floor(Date.now() / 1000);
  const updateOracleIx = await program.methods
    .setMockOracle(new BN(214_500_000), new BN(6_000_000), -6, 1, new BN(now))
    .accounts({
      payer: wallet.publicKey,
      baseMint: market.baseMint,
      quoteMint: market.quoteMint,
      mockOracle: mockOraclePda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();

  const preInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      userBaseAta,
      wallet.publicKey,
      market.baseMint
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      userQuoteAta,
      wallet.publicKey,
      market.quoteMint
    ),
    updateOracleIx,
  ];

  return await program.methods
    .placeBatchOrder(side === 'bid' ? { bid: {} } : { ask: {} }, lotSizeBn, limitPriceBn)
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      epochBatch: epochBatchPda,
      vaultBase: market.vaultBase,
      vaultQuote: market.vaultQuote,
      userBaseAta,
      userQuoteAta,
      baseMint: market.baseMint,
      quoteMint: market.quoteMint,
      pythFeed: market.pythFeed,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions(preInstructions)
    .rpc();
}

export async function executeOnChainCancelOrder(
  program: Program,
  wallet: any,
  orderIndex: number,
  marketPda = DEVNET_DEPLOYMENT.marketPda
): Promise<string> {
  const market = await (program.account as any).market.fetch(marketPda);
  const [epochBatchPda] = findBatchPda(marketPda, market.currentEpoch.toNumber());

  const userBaseAta = getAssociatedTokenAddressSync(market.baseMint, wallet.publicKey);
  const userQuoteAta = getAssociatedTokenAddressSync(market.quoteMint, wallet.publicKey);

  return await program.methods
    .cancelBatchOrder(orderIndex)
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      epochBatch: epochBatchPda,
      vaultBase: market.vaultBase,
      vaultQuote: market.vaultQuote,
      userBaseAta,
      userQuoteAta,
      baseMint: market.baseMint,
      quoteMint: market.quoteMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export async function executeOnChainSettle(
  program: Program,
  wallet: any,
  marketPda = DEVNET_DEPLOYMENT.marketPda
): Promise<string> {
  const market = await (program.account as any).market.fetch(marketPda);
  const curEpoch = market.currentEpoch.toNumber();
  const [epochBatchPda] = findBatchPda(marketPda, curEpoch);
  const [nextEpochBatchPda] = findBatchPda(marketPda, curEpoch + 1);

  return await program.methods
    .settleBatchAuction()
    .accounts({
      keeper: wallet.publicKey,
      market: marketPda,
      epochBatch: epochBatchPda,
      nextEpochBatch: nextEpochBatchPda,
      pythFeed: market.pythFeed,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
}

export async function executeOnChainClaim(
  program: Program,
  wallet: any,
  orderIndex: number,
  marketPda = DEVNET_DEPLOYMENT.marketPda
): Promise<string> {
  const market = await (program.account as any).market.fetch(marketPda);
  const [epochBatchPda] = findBatchPda(marketPda, market.currentEpoch.toNumber());

  const userBaseAta = getAssociatedTokenAddressSync(market.baseMint, wallet.publicKey);
  const userQuoteAta = getAssociatedTokenAddressSync(market.quoteMint, wallet.publicKey);

  return await program.methods
    .claimOrderProceeds(orderIndex)
    .accounts({
      user: wallet.publicKey,
      market: marketPda,
      epochBatch: epochBatchPda,
      vaultBase: market.vaultBase,
      vaultQuote: market.vaultQuote,
      userBaseAta,
      userQuoteAta,
      baseMint: market.baseMint,
      quoteMint: market.quoteMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

