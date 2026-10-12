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
} from "@solana/spl-token";
import { expect } from "chai";
import { startAnchor, BankrunProvider, ProgramTestContext } from "anchor-bankrun";
import idl from "../../target/idl/twilight_book.json";
import { TwilightBook } from "../../target/types/twilight_book";
import { halted } from "../fixtures/pyth_mocks";

describe("IVM Row 1 Invariant: Order-Splitting Non-Exploitability (§4.4 / §6.4)", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;

  let authority: Keypair;
  let seller: Keypair;
  let singleUser: Keypair;
  let splitUser: Keypair;
  let competitor: Keypair;

  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();
  const pythFeed = Keypair.generate();

  let market: PublicKey;
  let vaultBase: PublicKey;
  let vaultQuote: PublicKey;
  let epochBatch0: PublicKey;
  let epochBatch1: PublicKey;

  let sellerBaseAta: Keypair;
  let sellerQuoteAta: Keypair;
  let singleUserBaseAta: Keypair;
  let singleUserQuoteAta: Keypair;
  let splitUserBaseAta: Keypair;
  let splitUserQuoteAta: Keypair;
  let competitorBaseAta: Keypair;
  let competitorQuoteAta: Keypair;

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
    seller = Keypair.generate();
    singleUser = Keypair.generate();
    splitUser = Keypair.generate();
    competitor = Keypair.generate();

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
            data: halted(), // $214.50 +/- $0.20, Halted forces BatchAuction mode
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

    // Fund all participants with SOL for transaction fees
    for (const kp of [seller, singleUser, splitUser, competitor]) {
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

    // Initialize mints
    const rentExemptMint = await getMinimumBalanceForRentExemptMint(provider.connection as any);
    for (const mint of [baseMint, quoteMint]) {
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

    // Token accounts
    sellerBaseAta = await createTokenAccount(seller.publicKey, baseMint.publicKey);
    sellerQuoteAta = await createTokenAccount(seller.publicKey, quoteMint.publicKey);
    singleUserBaseAta = await createTokenAccount(singleUser.publicKey, baseMint.publicKey);
    singleUserQuoteAta = await createTokenAccount(singleUser.publicKey, quoteMint.publicKey);
    splitUserBaseAta = await createTokenAccount(splitUser.publicKey, baseMint.publicKey);
    splitUserQuoteAta = await createTokenAccount(splitUser.publicKey, quoteMint.publicKey);
    competitorBaseAta = await createTokenAccount(competitor.publicKey, baseMint.publicKey);
    competitorQuoteAta = await createTokenAccount(competitor.publicKey, quoteMint.publicKey);

    // Mint base tokens to seller (100 shares)
    await provider.sendAndConfirm(
      new Transaction().add(
        createMintToInstruction(baseMint.publicKey, sellerBaseAta.publicKey, authority.publicKey, 100_000_000)
      ),
      [authority]
    );

    // Mint quote tokens to buyers (10,000 USDC each)
    for (const quoteAta of [singleUserQuoteAta, splitUserQuoteAta, competitorQuoteAta]) {
      await provider.sendAndConfirm(
        new Transaction().add(
          createMintToInstruction(quoteMint.publicKey, quoteAta.publicKey, authority.publicKey, 10_000_000_000)
        ),
        [authority]
      );
    }

    // PDAs
    [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()],
      program.programId
    );
    [vaultBase] = PublicKey.findProgramAddressSync([Buffer.from("vault_base"), market.toBuffer()], program.programId);
    [vaultQuote] = PublicKey.findProgramAddressSync([Buffer.from("vault_quote"), market.toBuffer()], program.programId);
    [epochBatch0] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), market.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [epochBatch1] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), market.toBuffer(), new BN(1).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Initialize market
    await program.methods
      .initializeMarket(new BN(200), new BN(75), new BN(2))
      .accounts({
        authority: authority.publicKey,
        market,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        vaultBase,
        vaultQuote,
        pythFeed: pythFeed.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    // Evaluate mode to activate BatchAuction and lazily init epoch 0
    await program.methods
      .evaluateMarketMode()
      .accounts({
        market,
        pythFeed: pythFeed.publicKey,
        epochBatch: epochBatch0,
        payer: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  });

  function placeBid(
    trader: Keypair,
    userBaseAta: PublicKey,
    userQuoteAta: PublicKey,
    epochBatchPda: PublicKey,
    lotSize: number,
    limitPrice: number
  ) {
    return program.methods
      .placeBatchOrder({ bid: {} }, new BN(lotSize), new BN(limitPrice))
      .accounts({
        user: trader.publicKey,
        market,
        epochBatch: epochBatchPda,
        pythFeed: pythFeed.publicKey,
        vaultBase,
        vaultQuote,
        userBaseAta,
        userQuoteAta,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader])
      .rpc();
  }

  function placeAsk(
    trader: Keypair,
    userBaseAta: PublicKey,
    userQuoteAta: PublicKey,
    epochBatchPda: PublicKey,
    lotSize: number,
    limitPrice: number
  ) {
    return program.methods
      .placeBatchOrder({ ask: {} }, new BN(lotSize), new BN(limitPrice))
      .accounts({
        user: trader.publicKey,
        market,
        epochBatch: epochBatchPda,
        pythFeed: pythFeed.publicKey,
        vaultBase,
        vaultQuote,
        userBaseAta,
        userQuoteAta,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader])
      .rpc();
  }

  it("proves IVM Row 1: splitting lot L across N orders at tie price cannot increase aggregate fill (flooring dust loss)", async () => {
    // SCENARIO (Epoch 0):
    // Tie price: $214.50 (214_500_000)
    // Seller provides 11 shares (11_000_000) at $214.50.
    // Single User places 1 bid of L = 7 shares (7_000_000) at $214.50.
    // Split User places 2 bids of 3 shares (3_000_000) and 4 shares (4_000_000), sum = 7 shares (7_000_000).
    // Competitor places 1 bid of 9 shares (9_000_000) at $214.50.
    // Total demand at $214.50 = 7 + (3 + 4) + 9 = 23 shares (23_000_000, prime denominator).
    // Available remaining supply = 11 shares (11_000_000).
    //
    // Mathematical expected fills:
    // Single User fill = floor(7_000_000 * 11_000_000 / 23_000_000) = 3_347_826.
    // Split User Order 1 = floor(3_000_000 * 11_000_000 / 23_000_000) = 1_434_782.
    // Split User Order 2 = floor(4_000_000 * 11_000_000 / 23_000_000) = 1_913_043.
    // Split User aggregate fill = 1_434_782 + 1_913_043 = 3_347_825.
    // Split User gets 3_347_825 <= Single User 3_347_826 (exactly 1 lot unit lost to independent flooring).

    const tiePrice = 214_500_000;

    // 1. Seller places 11 shares
    await placeAsk(seller, sellerBaseAta.publicKey, sellerQuoteAta.publicKey, epochBatch0, 11_000_000, tiePrice);

    // 2. Single User places 1 order of 7 shares
    await placeBid(singleUser, singleUserBaseAta.publicKey, singleUserQuoteAta.publicKey, epochBatch0, 7_000_000, tiePrice);

    // 3. Split User places 2 orders summing to 7 shares (3 + 4)
    await placeBid(splitUser, splitUserBaseAta.publicKey, splitUserQuoteAta.publicKey, epochBatch0, 3_000_000, tiePrice);
    await placeBid(splitUser, splitUserBaseAta.publicKey, splitUserQuoteAta.publicKey, epochBatch0, 4_000_000, tiePrice);

    // 4. Competitor places 9 shares to create prime denominator (23_000_000)
    await placeBid(competitor, competitorBaseAta.publicKey, competitorQuoteAta.publicKey, epochBatch0, 9_000_000, tiePrice);

    // Warp past end slot and settle
    const batchBefore = await program.account.epochBatchState.fetch(epochBatch0);
    context.warpToSlot(BigInt(batchBefore.endSlot.toString()) + 1n);

    await program.methods
      .settleBatchAuction()
      .accounts({
        keeper: authority.publicKey,
        market,
        epochBatch: epochBatch0,
        nextEpochBatch: epochBatch1,
        pythFeed: pythFeed.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // Inspect settled batch 0
    const batch0 = await program.account.epochBatchState.fetch(epochBatch0);
    expect(batch0.status).to.deep.equal({ settled: {} });
    expect(batch0.clearingPrice.toNumber()).to.equal(tiePrice);
    expect(batch0.matchedVolume.toNumber()).to.equal(11_000_000);

    // Orders in batch:
    // index 0: Seller Ask (11 shares)
    // index 1: Single User Bid (7 shares)
    // index 2: Split User Bid 1 (3 shares)
    // index 3: Split User Bid 2 (4 shares)
    // index 4: Competitor Bid (9 shares)
    const singleUserFill = batch0.orders[1].filledLotSize;
    const splitUserFill1 = batch0.orders[2].filledLotSize;
    const splitUserFill2 = batch0.orders[3].filledLotSize;
    const splitUserTotalFill = splitUserFill1.add(splitUserFill2);

    expect(singleUserFill.toNumber()).to.equal(3_347_826);
    expect(splitUserFill1.toNumber()).to.equal(1_434_782);
    expect(splitUserFill2.toNumber()).to.equal(1_913_043);
    expect(splitUserTotalFill.toNumber()).to.equal(3_347_825);

    // Core Invariant Assertion: Split User aggregate fill is <= Single User fill
    expect(splitUserTotalFill.lte(singleUserFill)).to.be.true;
    // Specifically strictly less due to integer flooring dust
    expect(splitUserTotalFill.toNumber()).to.be.lessThan(singleUserFill.toNumber());
    expect(singleUserFill.sub(splitUserTotalFill).toNumber()).to.equal(1);
  });

  it("proves IVM Row 1 in extreme split case: dividing lot L into ten 1-lot orders maximizes integer-division flooring penalty", async () => {
    // SCENARIO (Epoch 1):
    // Tie price: $214.50 (214_500_000)
    // Seller provides 10 shares (10_000_000) at $214.50.
    // Single User places 1 bid of L = 10 shares (10_000_000) at $214.50.
    // Split User places 10 bids of 1 share each (1_000_000 each), sum = 10 shares (10_000_000).
    // Competitor places 1 bid of 11 shares (11_000_000) at $214.50.
    // Total demand at $214.50 = 10 + (10 * 1) + 11 = 31 shares (31_000_000, prime denominator, 13 total orders <= 32).
    // Available remaining supply = 10 shares (10_000_000).
    //
    // Mathematical expected fills:
    // Single User fill = floor(10_000_000 * 10_000_000 / 31_000_000) = 3_225_806.
    // For each of Split User's 10 orders: floor(1_000_000 * 10_000_000 / 31_000_000) = 322_580.
    // Split User aggregate fill across 10 orders = 10 * 322_580 = 3_225_800.
    // Split User gets 3_225_800 <= Single User 3_225_806 (6 lot units lost to cumulative independent flooring).

    const tiePrice = 214_500_000;

    // 1. Seller places 10 shares
    await placeAsk(seller, sellerBaseAta.publicKey, sellerQuoteAta.publicKey, epochBatch1, 10_000_000, tiePrice);

    // 2. Single User places 1 order of 10 shares
    await placeBid(singleUser, singleUserBaseAta.publicKey, singleUserQuoteAta.publicKey, epochBatch1, 10_000_000, tiePrice);

    // 3. Split User places 10 orders of 1 share each (extreme split)
    for (let i = 0; i < 10; i++) {
      await placeBid(splitUser, splitUserBaseAta.publicKey, splitUserQuoteAta.publicKey, epochBatch1, 1_000_000, tiePrice);
    }

    // 4. Competitor places 11 shares to establish 31_000_000 denominator
    await placeBid(competitor, competitorBaseAta.publicKey, competitorQuoteAta.publicKey, epochBatch1, 11_000_000, tiePrice);

    // Warp past end slot and settle
    const batchBefore = await program.account.epochBatchState.fetch(epochBatch1);
    context.warpToSlot(BigInt(batchBefore.endSlot.toString()) + 1n);

    const [epochBatch2] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), market.toBuffer(), new BN(2).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .settleBatchAuction()
      .accounts({
        keeper: authority.publicKey,
        market,
        epochBatch: epochBatch1,
        nextEpochBatch: epochBatch2,
        pythFeed: pythFeed.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // Inspect settled batch 1
    const batch1 = await program.account.epochBatchState.fetch(epochBatch1);
    expect(batch1.status).to.deep.equal({ settled: {} });
    expect(batch1.clearingPrice.toNumber()).to.equal(tiePrice);
    expect(batch1.matchedVolume.toNumber()).to.equal(10_000_000);

    // Orders in batch 1:
    // index 0: Seller Ask (10 shares)
    // index 1: Single User Bid (10 shares)
    // index 2..11: Split User 10 Bids (1 share each)
    // index 12: Competitor Bid (11 shares)
    const singleUserFill = batch1.orders[1].filledLotSize;
    expect(singleUserFill.toNumber()).to.equal(3_225_806);

    let splitUserTotalFill = new BN(0);
    for (let i = 2; i <= 11; i++) {
      const orderFill = batch1.orders[i].filledLotSize;
      expect(orderFill.toNumber()).to.equal(322_580);
      splitUserTotalFill = splitUserTotalFill.add(orderFill);
    }
    expect(splitUserTotalFill.toNumber()).to.equal(3_225_800);

    // Core Invariant Assertion: Split User aggregate fill is <= Single User fill
    expect(splitUserTotalFill.lte(singleUserFill)).to.be.true;
    expect(splitUserTotalFill.toNumber()).to.be.lessThan(singleUserFill.toNumber());
    expect(singleUserFill.sub(splitUserTotalFill).toNumber()).to.equal(6);
  });
});
