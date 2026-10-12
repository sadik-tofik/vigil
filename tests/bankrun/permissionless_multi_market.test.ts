import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
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

describe("permissionless_multi_market: concurrent markets & on-chain registry", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;

  let authority: Keypair;
  let buyer1: Keypair;
  let seller1: Keypair;
  let buyer2: Keypair;
  let seller2: Keypair;

  // Market 1: TokenizedEquity (e.g. tAAPL / USDC)
  const baseMint1 = Keypair.generate();
  const quoteMint1 = Keypair.generate();
  const pythFeed1 = Keypair.generate();
  let market1: PublicKey;
  let vaultBase1: PublicKey;
  let vaultQuote1: PublicKey;
  let epochBatch0_M1: PublicKey;
  let epochBatch1_M1: PublicKey;
  let buyer1BaseAta: Keypair;
  let buyer1QuoteAta: Keypair;
  let seller1BaseAta: Keypair;
  let seller1QuoteAta: Keypair;

  // Market 2: RWA (e.g. RealEstateToken / USDY)
  const baseMint2 = Keypair.generate();
  const quoteMint2 = Keypair.generate();
  const pythFeed2 = Keypair.generate();
  let market2: PublicKey;
  let vaultBase2: PublicKey;
  let vaultQuote2: PublicKey;
  let epochBatch0_M2: PublicKey;
  let epochBatch1_M2: PublicKey;
  let buyer2BaseAta: Keypair;
  let buyer2QuoteAta: Keypair;
  let seller2BaseAta: Keypair;
  let seller2QuoteAta: Keypair;

  let registryPda: PublicKey;

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
    buyer1 = Keypair.generate();
    seller1 = Keypair.generate();
    buyer2 = Keypair.generate();
    seller2 = Keypair.generate();

    const now = BigInt(Math.floor(Date.now() / 1000));

    // Mock oracle 1: $214.50, Halted -> triggers BatchAuction mode
    const oracleData1 = mockPythPriceAccountData({
      price: 214_500_000n,
      conf: 200_000n,
      expo: -6,
      status: PRICE_STATUS.Halted,
      publishTime: now,
    });

    // Mock oracle 2: $102.50, Halted -> triggers BatchAuction mode
    const oracleData2 = mockPythPriceAccountData({
      price: 102_500_000n,
      conf: 100_000n,
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
          info: { lamports: 10_000_000_000, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false, rentEpoch: 0 },
        },
        {
          address: pythFeed1.publicKey,
          info: { lamports: 1_000_000_000, data: oracleData1, owner: PublicKey.default, executable: false, rentEpoch: 0 },
        },
        {
          address: pythFeed2.publicKey,
          info: { lamports: 1_000_000_000, data: oracleData2, owner: PublicKey.default, executable: false, rentEpoch: 0 },
        },
      ]
    );
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<TwilightBook>(idl as anchor.Idl, provider);

    // Fund test participants
    for (const kp of [buyer1, seller1, buyer2, seller2]) {
      await provider.sendAndConfirm(
        new Transaction().add(SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: kp.publicKey, lamports: 1_000_000_000 })),
        [authority]
      );
    }

    // Initialize 4 distinct mints (2 pairs)
    const rentExemptMint = await getMinimumBalanceForRentExemptMint(provider.connection as any);
    for (const mint of [baseMint1, quoteMint1, baseMint2, quoteMint2]) {
      await provider.sendAndConfirm(
        new Transaction().add(
          SystemProgram.createAccount({
            fromPubkey: authority.publicKey,
            newAccountPubkey: mint.publicKey,
            space: MINT_SIZE,
            lamports: rentExemptMint,
            programId: TOKEN_PROGRAM_ID,
          }),
          createInitializeMint2Instruction(mint.publicKey, 6, authority.publicKey, null, TOKEN_PROGRAM_ID)
        ),
        [mint, authority]
      );
    }

    // Token accounts for Market 1
    buyer1BaseAta = await createTokenAccount(buyer1.publicKey, baseMint1.publicKey);
    buyer1QuoteAta = await createTokenAccount(buyer1.publicKey, quoteMint1.publicKey);
    seller1BaseAta = await createTokenAccount(seller1.publicKey, baseMint1.publicKey);
    seller1QuoteAta = await createTokenAccount(seller1.publicKey, quoteMint1.publicKey);

    // Fund Market 1 participants
    await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(quoteMint1.publicKey, buyer1QuoteAta.publicKey, authority.publicKey, 3_000_000_000)), [authority]);
    await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(baseMint1.publicKey, seller1BaseAta.publicKey, authority.publicKey, 20_000_000)), [authority]);

    // Token accounts for Market 2
    buyer2BaseAta = await createTokenAccount(buyer2.publicKey, baseMint2.publicKey);
    buyer2QuoteAta = await createTokenAccount(buyer2.publicKey, quoteMint2.publicKey);
    seller2BaseAta = await createTokenAccount(seller2.publicKey, baseMint2.publicKey);
    seller2QuoteAta = await createTokenAccount(seller2.publicKey, quoteMint2.publicKey);

    // Fund Market 2 participants
    await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(quoteMint2.publicKey, buyer2QuoteAta.publicKey, authority.publicKey, 3_000_000_000)), [authority]);
    await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(baseMint2.publicKey, seller2BaseAta.publicKey, authority.publicKey, 20_000_000)), [authority]);

    // Derive PDAs for Market 1
    [market1] = PublicKey.findProgramAddressSync([Buffer.from("market"), baseMint1.publicKey.toBuffer(), quoteMint1.publicKey.toBuffer()], program.programId);
    [vaultBase1] = PublicKey.findProgramAddressSync([Buffer.from("vault_base"), market1.toBuffer()], program.programId);
    [vaultQuote1] = PublicKey.findProgramAddressSync([Buffer.from("vault_quote"), market1.toBuffer()], program.programId);
    [epochBatch0_M1] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market1.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)], program.programId);
    [epochBatch1_M1] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market1.toBuffer(), new BN(1).toArrayLike(Buffer, "le", 8)], program.programId);

    // Derive PDAs for Market 2
    [market2] = PublicKey.findProgramAddressSync([Buffer.from("market"), baseMint2.publicKey.toBuffer(), quoteMint2.publicKey.toBuffer()], program.programId);
    [vaultBase2] = PublicKey.findProgramAddressSync([Buffer.from("vault_base"), market2.toBuffer()], program.programId);
    [vaultQuote2] = PublicKey.findProgramAddressSync([Buffer.from("vault_quote"), market2.toBuffer()], program.programId);
    [epochBatch0_M2] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market2.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)], program.programId);
    [epochBatch1_M2] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market2.toBuffer(), new BN(1).toArrayLike(Buffer, "le", 8)], program.programId);

    // Registry PDA
    [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], program.programId);
  });

  it("initializes two concurrent markets with different asset_class values and different mint pairs, confirming both appear in Registry", async () => {
    // 1. Initialize Market 1 with AssetClass::TokenizedEquity
    await (program.methods as any)
      .initializeMarketWithAssetClass(new BN(200), new BN(75), new BN(2), { tokenizedEquity: {} })
      .accounts({
        authority: authority.publicKey,
        market: market1,
        baseMint: baseMint1.publicKey,
        quoteMint: quoteMint1.publicKey,
        vaultBase: vaultBase1,
        vaultQuote: vaultQuote1,
        pythFeed: pythFeed1.publicKey,
        registry: registryPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    // 2. Initialize Market 2 with AssetClass::RWA
    await (program.methods as any)
      .initializeMarketWithAssetClass(new BN(200), new BN(75), new BN(2), { rwa: {} })
      .accounts({
        authority: authority.publicKey,
        market: market2,
        baseMint: baseMint2.publicKey,
        quoteMint: quoteMint2.publicKey,
        vaultBase: vaultBase2,
        vaultQuote: vaultQuote2,
        pythFeed: pythFeed2.publicKey,
        registry: registryPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    // 3. Confirm on-chain Registry contains both Market pubkeys
    const registryAccount = await (program.account as any).registry.fetch(registryPda);
    expect(registryAccount.markets.length).to.be.at.least(2);

    const stringifiedMarkets = registryAccount.markets.map((m: PublicKey) => m.toBase58());
    expect(stringifiedMarkets).to.include(market1.toBase58());
    expect(stringifiedMarkets).to.include(market2.toBase58());

    // 4. Verify Market 1 state and asset_class
    const m1Data = await program.account.market.fetch(market1);
    expect(m1Data.baseMint.toBase58()).to.equal(baseMint1.publicKey.toBase58());
    expect(m1Data.quoteMint.toBase58()).to.equal(quoteMint1.publicKey.toBase58());
    expect((m1Data as any).assetClass).to.deep.equal({ tokenizedEquity: {} });

    // 5. Verify Market 2 state and asset_class
    const m2Data = await program.account.market.fetch(market2);
    expect(m2Data.baseMint.toBase58()).to.equal(baseMint2.publicKey.toBase58());
    expect(m2Data.quoteMint.toBase58()).to.equal(quoteMint2.publicKey.toBase58());
    expect((m2Data as any).assetClass).to.deep.equal({ rwa: {} });
  });

  it("executes a full place-order -> settle -> claim cycle on Market 1 (TokenizedEquity)", async () => {
    // Flip Market 1 to BatchAuction mode
    await program.methods
      .evaluateMarketMode()
      .accounts({ market: market1, pythFeed: pythFeed1.publicKey, epochBatch: epochBatch0_M1, payer: authority.publicKey, systemProgram: SystemProgram.programId })
      .signers([authority])
      .rpc();

    // Market 1 Orders: Buyer 1 bids 10 shares @ $214.80, Seller 1 asks 10 shares @ $214.20
    await program.methods
      .placeBatchOrder({ bid: {} }, new BN(10_000_000), new BN(214_800_000))
      .accounts({
        user: buyer1.publicKey,
        market: market1,
        epochBatch: epochBatch0_M1,
        pythFeed: pythFeed1.publicKey,
        vaultBase: vaultBase1,
        vaultQuote: vaultQuote1,
        userBaseAta: buyer1BaseAta.publicKey,
        userQuoteAta: buyer1QuoteAta.publicKey,
        baseMint: baseMint1.publicKey,
        quoteMint: quoteMint1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer1])
      .rpc();

    await program.methods
      .placeBatchOrder({ ask: {} }, new BN(10_000_000), new BN(214_200_000))
      .accounts({
        user: seller1.publicKey,
        market: market1,
        epochBatch: epochBatch0_M1,
        pythFeed: pythFeed1.publicKey,
        vaultBase: vaultBase1,
        vaultQuote: vaultQuote1,
        userBaseAta: seller1BaseAta.publicKey,
        userQuoteAta: seller1QuoteAta.publicKey,
        baseMint: baseMint1.publicKey,
        quoteMint: quoteMint1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller1])
      .rpc();

    // Warp slot to end of Market 1 batch
    const batch1 = await program.account.epochBatchState.fetch(epochBatch0_M1);
    context.warpToSlot(BigInt(batch1.endSlot.toString()) + 1n);

    // Settle Market 1
    await program.methods
      .settleBatchAuction()
      .accounts({
        keeper: authority.publicKey,
        market: market1,
        epochBatch: epochBatch0_M1,
        nextEpochBatch: epochBatch1_M1,
        pythFeed: pythFeed1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const settled1 = await program.account.epochBatchState.fetch(epochBatch0_M1);
    expect(settled1.status).to.deep.equal({ settled: {} });
    expect(settled1.clearingPrice.toNumber()).to.equal(214_200_000);
    expect(settled1.matchedVolume.toNumber()).to.equal(10_000_000);

    // Claim buyer 1 proceeds
    const buyer1BaseBefore = await getAccount(provider.connection as any, buyer1BaseAta.publicKey);
    await program.methods
      .claimOrderProceeds(0)
      .accounts({
        user: buyer1.publicKey,
        market: market1,
        epochBatch: epochBatch0_M1,
        vaultBase: vaultBase1,
        vaultQuote: vaultQuote1,
        userBaseAta: buyer1BaseAta.publicKey,
        userQuoteAta: buyer1QuoteAta.publicKey,
        baseMint: baseMint1.publicKey,
        quoteMint: quoteMint1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer1])
      .rpc();
    const buyer1BaseAfter = await getAccount(provider.connection as any, buyer1BaseAta.publicKey);
    expect(buyer1BaseAfter.amount - buyer1BaseBefore.amount).to.equal(10_000_000n);

    // Claim seller 1 proceeds
    const seller1QuoteBefore = await getAccount(provider.connection as any, seller1QuoteAta.publicKey);
    await program.methods
      .claimOrderProceeds(1)
      .accounts({
        user: seller1.publicKey,
        market: market1,
        epochBatch: epochBatch0_M1,
        vaultBase: vaultBase1,
        vaultQuote: vaultQuote1,
        userBaseAta: seller1BaseAta.publicKey,
        userQuoteAta: seller1QuoteAta.publicKey,
        baseMint: baseMint1.publicKey,
        quoteMint: quoteMint1.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller1])
      .rpc();
    const seller1QuoteAfter = await getAccount(provider.connection as any, seller1QuoteAta.publicKey);
    expect(seller1QuoteAfter.amount - seller1QuoteBefore.amount).to.equal(2_142_000_000n); // 10 shares * $214.20

    // Vaults invariant: both vaults zero
    const vb1 = await getAccount(provider.connection as any, vaultBase1);
    const vq1 = await getAccount(provider.connection as any, vaultQuote1);
    expect(vb1.amount).to.equal(0n);
    expect(vq1.amount).to.equal(0n);
  });

  it("executes a full place-order -> settle -> claim cycle on Market 2 (RWA) with zero changes to clearing.rs", async () => {
    // Flip Market 2 to BatchAuction mode
    await program.methods
      .evaluateMarketMode()
      .accounts({ market: market2, pythFeed: pythFeed2.publicKey, epochBatch: epochBatch0_M2, payer: authority.publicKey, systemProgram: SystemProgram.programId })
      .signers([authority])
      .rpc();

    // Market 2 Orders: Buyer 2 bids 5 shares @ $102.60, Seller 2 asks 5 shares @ $102.40
    await program.methods
      .placeBatchOrder({ bid: {} }, new BN(5_000_000), new BN(102_600_000))
      .accounts({
        user: buyer2.publicKey,
        market: market2,
        epochBatch: epochBatch0_M2,
        pythFeed: pythFeed2.publicKey,
        vaultBase: vaultBase2,
        vaultQuote: vaultQuote2,
        userBaseAta: buyer2BaseAta.publicKey,
        userQuoteAta: buyer2QuoteAta.publicKey,
        baseMint: baseMint2.publicKey,
        quoteMint: quoteMint2.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer2])
      .rpc();

    await program.methods
      .placeBatchOrder({ ask: {} }, new BN(5_000_000), new BN(102_400_000))
      .accounts({
        user: seller2.publicKey,
        market: market2,
        epochBatch: epochBatch0_M2,
        pythFeed: pythFeed2.publicKey,
        vaultBase: vaultBase2,
        vaultQuote: vaultQuote2,
        userBaseAta: seller2BaseAta.publicKey,
        userQuoteAta: seller2QuoteAta.publicKey,
        baseMint: baseMint2.publicKey,
        quoteMint: quoteMint2.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller2])
      .rpc();

    // Warp slot to end of Market 2 batch
    const batch2 = await program.account.epochBatchState.fetch(epochBatch0_M2);
    context.warpToSlot(BigInt(batch2.endSlot.toString()) + 1n);

    // Settle Market 2 (clearing logic solves P* = $102.40 without ANY changes to clearing.rs)
    await program.methods
      .settleBatchAuction()
      .accounts({
        keeper: authority.publicKey,
        market: market2,
        epochBatch: epochBatch0_M2,
        nextEpochBatch: epochBatch1_M2,
        pythFeed: pythFeed2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const settled2 = await program.account.epochBatchState.fetch(epochBatch0_M2);
    expect(settled2.status).to.deep.equal({ settled: {} });
    expect(settled2.clearingPrice.toNumber()).to.equal(102_400_000);
    expect(settled2.matchedVolume.toNumber()).to.equal(5_000_000);

    // Claim buyer 2 proceeds
    const buyer2BaseBefore = await getAccount(provider.connection as any, buyer2BaseAta.publicKey);
    await program.methods
      .claimOrderProceeds(0)
      .accounts({
        user: buyer2.publicKey,
        market: market2,
        epochBatch: epochBatch0_M2,
        vaultBase: vaultBase2,
        vaultQuote: vaultQuote2,
        userBaseAta: buyer2BaseAta.publicKey,
        userQuoteAta: buyer2QuoteAta.publicKey,
        baseMint: baseMint2.publicKey,
        quoteMint: quoteMint2.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer2])
      .rpc();
    const buyer2BaseAfter = await getAccount(provider.connection as any, buyer2BaseAta.publicKey);
    expect(buyer2BaseAfter.amount - buyer2BaseBefore.amount).to.equal(5_000_000n);

    // Claim seller 2 proceeds
    const seller2QuoteBefore = await getAccount(provider.connection as any, seller2QuoteAta.publicKey);
    await program.methods
      .claimOrderProceeds(1)
      .accounts({
        user: seller2.publicKey,
        market: market2,
        epochBatch: epochBatch0_M2,
        vaultBase: vaultBase2,
        vaultQuote: vaultQuote2,
        userBaseAta: seller2BaseAta.publicKey,
        userQuoteAta: seller2QuoteAta.publicKey,
        baseMint: baseMint2.publicKey,
        quoteMint: quoteMint2.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller2])
      .rpc();
    const seller2QuoteAfter = await getAccount(provider.connection as any, seller2QuoteAta.publicKey);
    expect(seller2QuoteAfter.amount - seller2QuoteBefore.amount).to.equal(512_000_000n); // 5 shares * $102.40

    // Vaults invariant: both vaults zero
    const vb2 = await getAccount(provider.connection as any, vaultBase2);
    const vq2 = await getAccount(provider.connection as any, vaultQuote2);
    expect(vb2.amount).to.equal(0n);
    expect(vq2.amount).to.equal(0n);
  });

  it("confirms total state and vault isolation between Market 1 and Market 2", async () => {
    // Market 1 and Market 2 addresses are completely distinct
    expect(market1.toBase58()).to.not.equal(market2.toBase58());
    expect(vaultBase1.toBase58()).to.not.equal(vaultBase2.toBase58());
    expect(vaultQuote1.toBase58()).to.not.equal(vaultQuote2.toBase58());

    // Both markets are recorded in Registry
    const registryAccount = await (program.account as any).registry.fetch(registryPda);
    expect(registryAccount.markets.length).to.equal(2);
    expect(registryAccount.markets[0].toBase58()).to.equal(market1.toBase58());
    expect(registryAccount.markets[1].toBase58()).to.equal(market2.toBase58());
  });
});
