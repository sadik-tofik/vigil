import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  ACCOUNT_SIZE,
  createInitializeMint2Instruction,
  createInitializeAccount3Instruction,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { startAnchor, BankrunProvider, ProgramTestContext } from "anchor-bankrun";
import idl from "../../target/idl/twilight_book.json";
import { TwilightBook } from "../../target/types/twilight_book";
import { mockPythPriceAccountData, PRICE_STATUS } from "../fixtures/pyth_mocks";
import {
  VigilClient,
  findRegistryPda,
  findMarketPda,
  findVaultBasePda,
  findVaultQuotePda,
} from "../../packages/vigil-sdk/src/index";

describe("VigilClient SDK: full end-to-end integration test", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;

  let authority: Keypair;
  let buyer: Keypair;
  let seller: Keypair;

  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();
  const baseMint2 = Keypair.generate();
  const quoteMint2 = Keypair.generate();
  const pythFeed = Keypair.generate();

  let marketPda: PublicKey;
  let vaultBasePda: PublicKey;
  let vaultQuotePda: PublicKey;
  let market2Pda: PublicKey;
  let vaultBase2Pda: PublicKey;
  let vaultQuote2Pda: PublicKey;
  let registryPda: PublicKey;

  let buyerBaseAta: Keypair;
  let buyerQuoteAta: Keypair;
  let sellerBaseAta: Keypair;
  let sellerQuoteAta: Keypair;

  let buyerClient: VigilClient;
  let sellerClient: VigilClient;

  async function createTokenAccount(owner: PublicKey, mint: PublicKey): Promise<Keypair> {
    const acct = Keypair.generate();
    const rent = await provider.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: acct.publicKey,
          space: ACCOUNT_SIZE,
          lamports: rent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeAccount3Instruction(acct.publicKey, mint, owner, TOKEN_PROGRAM_ID)
      ),
      [acct, authority]
    );
    return acct;
  }

  before(async () => {
    authority = Keypair.generate();
    buyer = Keypair.generate();
    seller = Keypair.generate();

    const now = BigInt(Math.floor(Date.now() / 1000));

    // Mock Pyth Oracle: $214.50, Halted to force BatchAuction mode
    const oracleData = mockPythPriceAccountData({
      price: 214_500_000n,
      conf: 200_000n,
      expo: -6,
      status: PRICE_STATUS.Halted,
      publishTime: now,
    });

    context = await startAnchor(
      "",
      [],
      [
        {
          address: authority.publicKey,
          info: {
            lamports: 10_000_000_000,
            data: Buffer.alloc(0),
            owner: SystemProgram.programId,
            executable: false,
            rentEpoch: 0,
          },
        },
        {
          address: pythFeed.publicKey,
          info: {
            lamports: 1_000_000_000,
            data: oracleData,
            owner: PublicKey.default,
            executable: false,
            rentEpoch: 0,
          },
        },
      ]
    );

    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<TwilightBook>(idl as anchor.Idl, provider);

    // Fund buyer & seller with SOL for fees
    for (const kp of [buyer, seller]) {
      await provider.sendAndConfirm(
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            toPubkey: kp.publicKey,
            lamports: 1_000_000_000,
          })
        ),
        [authority]
      );
    }

    // Initialize base & quote mints for Market 1 and Market 2
    const rentExemptMint = await getMinimumBalanceForRentExemptMint(
      provider.connection as any
    );
    for (const mint of [baseMint, quoteMint, baseMint2, quoteMint2]) {
      await provider.sendAndConfirm(
        new Transaction().add(
          SystemProgram.createAccount({
            fromPubkey: authority.publicKey,
            newAccountPubkey: mint.publicKey,
            space: MINT_SIZE,
            lamports: rentExemptMint,
            programId: TOKEN_PROGRAM_ID,
          }),
          createInitializeMint2Instruction(
            mint.publicKey,
            6,
            authority.publicKey,
            null,
            TOKEN_PROGRAM_ID
          )
        ),
        [mint, authority]
      );
    }

    // Initialize token accounts
    buyerBaseAta = await createTokenAccount(buyer.publicKey, baseMint.publicKey);
    buyerQuoteAta = await createTokenAccount(buyer.publicKey, quoteMint.publicKey);
    sellerBaseAta = await createTokenAccount(seller.publicKey, baseMint.publicKey);
    sellerQuoteAta = await createTokenAccount(seller.publicKey, quoteMint.publicKey);

    // Fund buyer with 3,000 quote tokens (USDC) and seller with 20 base tokens (tTSLA)
    await provider.sendAndConfirm(
      new Transaction().add(
        createMintToInstruction(
          quoteMint.publicKey,
          buyerQuoteAta.publicKey,
          authority.publicKey,
          3_000_000_000
        )
      ),
      [authority]
    );
    await provider.sendAndConfirm(
      new Transaction().add(
        createMintToInstruction(
          baseMint.publicKey,
          sellerBaseAta.publicKey,
          authority.publicKey,
          20_000_000
        )
      ),
      [authority]
    );

    // Derive PDAs using SDK PDA helpers for Market 1
    [marketPda] = findMarketPda(
      baseMint.publicKey,
      quoteMint.publicKey,
      program.programId
    );
    [vaultBasePda] = findVaultBasePda(marketPda, program.programId);
    [vaultQuotePda] = findVaultQuotePda(marketPda, program.programId);
    [registryPda] = findRegistryPda(program.programId);

    // Derive PDAs for Market 2 (RWA asset class)
    [market2Pda] = findMarketPda(
      baseMint2.publicKey,
      quoteMint2.publicKey,
      program.programId
    );
    [vaultBase2Pda] = findVaultBasePda(market2Pda, program.programId);
    [vaultQuote2Pda] = findVaultQuotePda(market2Pda, program.programId);

    // Initialize Market 1 with Registry (AssetClass::TokenizedEquity)
    await (program.methods as any)
      .initializeMarketWithAssetClass(
        new BN(200),
        new BN(75),
        new BN(2),
        { tokenizedEquity: {} }
      )
      .accounts({
        authority: authority.publicKey,
        market: marketPda,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        vaultBase: vaultBasePda,
        vaultQuote: vaultQuotePda,
        pythFeed: pythFeed.publicKey,
        registry: registryPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    // Initialize Market 2 with Registry (AssetClass::RWA)
    await (program.methods as any)
      .initializeMarketWithAssetClass(
        new BN(200),
        new BN(75),
        new BN(2),
        { rwa: {} }
      )
      .accounts({
        authority: authority.publicKey,
        market: market2Pda,
        baseMint: baseMint2.publicKey,
        quoteMint: quoteMint2.publicKey,
        vaultBase: vaultBase2Pda,
        vaultQuote: vaultQuote2Pda,
        pythFeed: pythFeed.publicKey,
        registry: registryPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    // Instantiate VigilClient SDK instances for buyer and seller
    const buyerProvider = new BankrunProvider(context, new anchor.Wallet(buyer));
    const sellerProvider = new BankrunProvider(context, new anchor.Wallet(seller));
    buyerClient = new VigilClient(buyerProvider as any, {
      programId: program.programId,
    });
    sellerClient = new VigilClient(sellerProvider as any, {
      programId: program.programId,
    });
  });

  it("lists markets from on-chain Registry via SDK", async () => {
    const markets = await buyerClient.listMarkets();
    expect(markets.length).to.be.at.least(2);
    const stringified = markets.map((m) => m.toBase58());
    expect(stringified).to.include(marketPda.toBase58());
    expect(stringified).to.include(market2Pda.toBase58());
  });

  it("fetches strongly-typed Market account via SDK", async () => {
    // Market 1: TokenizedEquity
    const market = await buyerClient.getMarket(marketPda);
    expect(market.baseMint.toBase58()).to.equal(baseMint.publicKey.toBase58());
    expect(market.quoteMint.toBase58()).to.equal(quoteMint.publicKey.toBase58());
    expect(market.currentEpoch.toNumber()).to.equal(0);
    expect(market.epochDurationSlots.toNumber()).to.equal(75);
    expect(market.assetClass).to.equal("TokenizedEquity");

    // Market 2 regression test: verify RWA asset class deserialization
    const market2 = await buyerClient.getMarket(market2Pda);
    expect(market2.baseMint.toBase58()).to.equal(baseMint2.publicKey.toBase58());
    expect(market2.quoteMint.toBase58()).to.equal(quoteMint2.publicKey.toBase58());
    expect(market2.currentEpoch.toNumber()).to.equal(0);
    expect(market2.assetClass).to.equal("RWA");
  });

  it("evaluates market mode and boots epoch 0 via SDK", async () => {
    // Crank evaluateMarketMode via SDK
    await buyerClient.evaluateMarketMode(marketPda);

    const market = await buyerClient.getMarket(marketPda);
    expect(market.mode).to.equal("BatchAuction");

    const batch = await buyerClient.getCurrentEpochBatch(marketPda);
    expect(batch.market.toBase58()).to.equal(marketPda.toBase58());
    expect(batch.epochId.toNumber()).to.equal(0);
    expect(batch.status).to.equal("AcceptingOrders");
    expect(batch.orderCount).to.equal(0);
  });

  it("places batch bid and ask orders using VigilClient with automatic PDA resolution", async () => {
    // Buyer bids 10 shares @ $214.80 ($2,148.00 quote escrowed)
    const bidSig = await buyerClient.placeBatchOrder(
      marketPda,
      "bid",
      10_000_000,
      214_800_000,
      {
        userBaseAta: buyerBaseAta.publicKey,
        userQuoteAta: buyerQuoteAta.publicKey,
      }
    );
    expect(bidSig).to.be.a("string");

    // Seller asks 10 shares @ $214.20 (10 shares base escrowed)
    const askSig = await sellerClient.placeBatchOrder(
      marketPda,
      "ask",
      10_000_000,
      214_200_000,
      {
        userBaseAta: sellerBaseAta.publicKey,
        userQuoteAta: sellerQuoteAta.publicKey,
      }
    );
    expect(askSig).to.be.a("string");

    // Verify batch state through SDK
    const batch = await buyerClient.getCurrentEpochBatch(marketPda);
    expect(batch.orderCount).to.equal(2);
    expect(batch.orders.length).to.equal(2);

    expect(batch.orders[0].side).to.equal("bid");
    expect(batch.orders[0].lotSize.toNumber()).to.equal(10_000_000);
    expect(batch.orders[0].limitPrice.toNumber()).to.equal(214_800_000);
    expect(batch.orders[0].claimed).to.be.false;

    expect(batch.orders[1].side).to.equal("ask");
    expect(batch.orders[1].lotSize.toNumber()).to.equal(10_000_000);
    expect(batch.orders[1].limitPrice.toNumber()).to.equal(214_200_000);
    expect(batch.orders[1].claimed).to.be.false;
  });

  it("settles batch auction via SDK and rolls to epoch 1 after end_slot", async () => {
    const batchBefore = await buyerClient.getCurrentEpochBatch(marketPda);

    // Warp slot past end_slot
    context.warpToSlot(BigInt(batchBefore.endSlot.toString()) + 1n);

    // Trigger settlement via SDK
    const settleSig = await buyerClient.settleBatchAuction(marketPda);
    expect(settleSig).to.be.a("string");

    // Inspect settled epoch 0 batch
    const batch0 = await buyerClient.getEpochBatch(marketPda, 0);
    expect(batch0.status).to.equal("Settled");
    expect(batch0.clearingPrice.toNumber()).to.equal(214_200_000); // P* = $214.20
    expect(batch0.matchedVolume.toNumber()).to.equal(10_000_000);  // 10 shares matched

    // Inspect rolled market state: current epoch must be 1
    const marketAfter = await buyerClient.getMarket(marketPda);
    expect(marketAfter.currentEpoch.toNumber()).to.equal(1);

    // Epoch 1 is initialized and accepting orders
    const batch1 = await buyerClient.getCurrentEpochBatch(marketPda);
    expect(batch1.epochId.toNumber()).to.equal(1);
    expect(batch1.status).to.equal("AcceptingOrders");
  });

  it("claims filled proceeds and surplus refunds via SDK", async () => {
    const buyerBaseBefore = await getAccount(provider.connection as any, buyerBaseAta.publicKey);
    const buyerQuoteBefore = await getAccount(provider.connection as any, buyerQuoteAta.publicKey);

    // Buyer claims order #0 (filled shares + price improvement surplus)
    const buyerClaimSig = await buyerClient.claimOrderProceeds(marketPda, 0, {
      epochId: 0,
      userBaseAta: buyerBaseAta.publicKey,
      userQuoteAta: buyerQuoteAta.publicKey,
    });
    expect(buyerClaimSig).to.be.a("string");

    const buyerBaseAfter = await getAccount(provider.connection as any, buyerBaseAta.publicKey);
    const buyerQuoteAfter = await getAccount(provider.connection as any, buyerQuoteAta.publicKey);

    // Buyer received 10 shares base
    expect(buyerBaseAfter.amount - buyerBaseBefore.amount).to.equal(10_000_000n);
    // Buyer received $6.00 price improvement refund ($214.80 bid - $214.20 clearing) * 10 = $6.00
    expect(buyerQuoteAfter.amount - buyerQuoteBefore.amount).to.equal(6_000_000n);

    // Seller claims order #1
    const sellerQuoteBefore = await getAccount(provider.connection as any, sellerQuoteAta.publicKey);
    const sellerClaimSig = await sellerClient.claimOrderProceeds(marketPda, 1, {
      epochId: 0,
      userBaseAta: sellerBaseAta.publicKey,
      userQuoteAta: sellerQuoteAta.publicKey,
    });
    expect(sellerClaimSig).to.be.a("string");

    const sellerQuoteAfter = await getAccount(provider.connection as any, sellerQuoteAta.publicKey);
    // Seller received 10 shares * $214.20 = $2,142.00
    expect(sellerQuoteAfter.amount - sellerQuoteBefore.amount).to.equal(2_142_000_000n);

    // Both vaults land at exactly zero (zero-leakage invariant)
    const vb = await getAccount(provider.connection as any, vaultBasePda);
    const vq = await getAccount(provider.connection as any, vaultQuotePda);
    expect(vb.amount).to.equal(0n);
    expect(vq.amount).to.equal(0n);
  });
});
