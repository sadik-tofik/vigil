import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
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
  createInitializeMint2Instruction,
  createInitializeAccount3Instruction,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
  getAccount,
  ACCOUNT_SIZE,
} from "@solana/spl-token";
import { expect } from "chai";
import { describe, it, before } from "mocha";

import type { TwilightBook } from "../../target/types/twilight_book";
import idl from "../../target/idl/twilight_book.json";
import { halted } from "../fixtures/pyth_mocks";

describe("zero-leakage: full place -> settle -> claim cycle (Sprint 5)", () => {
  let program: Program<TwilightBook>;
  let provider: BankrunProvider;
  let context: Awaited<ReturnType<typeof startAnchor>>;
  let authority: Keypair;
  let buyer: Keypair;
  let seller: Keypair;
  let market: PublicKey;
  let vaultBase: PublicKey;
  let vaultQuote: PublicKey;
  let epochBatch0: PublicKey;
  let epochBatch1: PublicKey;
  let buyerBaseAta: Keypair;
  let buyerQuoteAta: Keypair;
  let sellerBaseAta: Keypair;
  let sellerQuoteAta: Keypair;
  const pythFeed = Keypair.generate();
  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();

  async function createTokenAccount(owner: PublicKey, mint: PublicKey) {
    const acct = Keypair.generate();
    const rent = await provider.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.createAccount({ fromPubkey: authority.publicKey, newAccountPubkey: acct.publicKey, space: ACCOUNT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
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

    context = await startAnchor(
      "",
      [],
      [
        { address: authority.publicKey, info: { lamports: 10_000_000_000, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false, rentEpoch: 0 } },
        { address: pythFeed.publicKey, info: { lamports: 1_000_000_000, data: halted(), owner: PublicKey.default, executable: false, rentEpoch: 0 } },
      ]
    );
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<TwilightBook>(idl as anchor.Idl, provider);

    for (const kp of [buyer, seller]) {
      await provider.sendAndConfirm(
        new Transaction().add(SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: kp.publicKey, lamports: 1_000_000_000 })),
        [authority]
      );
    }

    const rentExemptMint = await getMinimumBalanceForRentExemptMint(provider.connection as any);
    for (const mint of [baseMint, quoteMint]) {
      await provider.sendAndConfirm(
        new Transaction().add(
          SystemProgram.createAccount({ fromPubkey: authority.publicKey, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports: rentExemptMint, programId: TOKEN_PROGRAM_ID }),
          createInitializeMint2Instruction(mint.publicKey, 6, authority.publicKey, null, TOKEN_PROGRAM_ID)
        ),
        [mint, authority]
      );
    }

    buyerBaseAta = await createTokenAccount(buyer.publicKey, baseMint.publicKey);
    buyerQuoteAta = await createTokenAccount(buyer.publicKey, quoteMint.publicKey);
    sellerBaseAta = await createTokenAccount(seller.publicKey, baseMint.publicKey);
    sellerQuoteAta = await createTokenAccount(seller.publicKey, quoteMint.publicKey);

    // buyer needs quote to escrow the bid; seller needs base to escrow the ask
    await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(quoteMint.publicKey, buyerQuoteAta.publicKey, authority.publicKey, 3_000_000_000)), [authority]);
    await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(baseMint.publicKey, sellerBaseAta.publicKey, authority.publicKey, 20_000_000)), [authority]);

    [market] = PublicKey.findProgramAddressSync([Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()], program.programId);
    [vaultBase] = PublicKey.findProgramAddressSync([Buffer.from("vault_base"), market.toBuffer()], program.programId);
    [vaultQuote] = PublicKey.findProgramAddressSync([Buffer.from("vault_quote"), market.toBuffer()], program.programId);
    [epochBatch0] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)], program.programId);
    [epochBatch1] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market.toBuffer(), new BN(1).toArrayLike(Buffer, "le", 8)], program.programId);

    await program.methods
      .initializeMarket(new BN(200), new BN(75), new BN(2))
      .accounts({ authority: authority.publicKey, market, baseMint: baseMint.publicKey, quoteMint: quoteMint.publicKey, vaultBase, vaultQuote, pythFeed: pythFeed.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY })
      .signers([authority])
      .rpc();

    await program.methods
      .evaluateMarketMode()
      .accounts({ market, pythFeed: pythFeed.publicKey, epochBatch: epochBatch0, payer: authority.publicKey, systemProgram: SystemProgram.programId })
      .signers([authority])
      .rpc();

    // bid: 10 shares @ $214.80 (escrows 2,148.00 USDC)
    await program.methods
      .placeBatchOrder({ bid: {} }, new BN(10_000_000), new BN(214_800_000))
      .accounts({ user: buyer.publicKey, market, epochBatch: epochBatch0, pythFeed: pythFeed.publicKey, vaultBase, vaultQuote, userBaseAta: buyerBaseAta.publicKey, userQuoteAta: buyerQuoteAta.publicKey, baseMint: baseMint.publicKey, quoteMint: quoteMint.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([buyer])
      .rpc();

    // ask: 10 shares @ $214.20 (escrows 10 shares of base)
    await program.methods
      .placeBatchOrder({ ask: {} }, new BN(10_000_000), new BN(214_200_000))
      .accounts({ user: seller.publicKey, market, epochBatch: epochBatch0, pythFeed: pythFeed.publicKey, vaultBase, vaultQuote, userBaseAta: sellerBaseAta.publicKey, userQuoteAta: sellerQuoteAta.publicKey, baseMint: baseMint.publicKey, quoteMint: quoteMint.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([seller])
      .rpc();

    const batch = await program.account.epochBatchState.fetch(epochBatch0);
    context.warpToSlot(BigInt(batch.endSlot.toString()) + 1n);

    await program.methods
      .settleBatchAuction()
      .accounts({ keeper: authority.publicKey, market, epochBatch: epochBatch0, nextEpochBatch: epochBatch1, pythFeed: pythFeed.publicKey, systemProgram: SystemProgram.programId })
      .signers([authority])
      .rpc();
  });

  it("clears at P* = $214.20 with zero pro-rata dust (both orders 100% filled)", async () => {
    const batch = await program.account.epochBatchState.fetch(epochBatch0);
    expect(batch.status).to.deep.equal({ settled: {} });
    expect(batch.clearingPrice.toNumber()).to.equal(214_200_000);
    expect(batch.matchedVolume.toNumber()).to.equal(10_000_000);
    expect(batch.orders[0].filledLotSize.toNumber()).to.equal(10_000_000); // bid, full
    expect(batch.orders[1].filledLotSize.toNumber()).to.equal(10_000_000); // ask, full
  });

  it("refunds the buyer's price-improvement surplus ($6.00) on top of their shares", async () => {
    const quoteBefore = await getAccount(provider.connection as any, buyerQuoteAta.publicKey);
    const baseBefore = await getAccount(provider.connection as any, buyerBaseAta.publicKey);

    await program.methods
      .claimOrderProceeds(0)
      .accounts({ user: buyer.publicKey, market, epochBatch: epochBatch0, vaultBase, vaultQuote, userBaseAta: buyerBaseAta.publicKey, userQuoteAta: buyerQuoteAta.publicKey, baseMint: baseMint.publicKey, quoteMint: quoteMint.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([buyer])
      .rpc();

    const quoteAfter = await getAccount(provider.connection as any, buyerQuoteAta.publicKey);
    const baseAfter = await getAccount(provider.connection as any, buyerBaseAta.publicKey);

    expect(baseAfter.amount - baseBefore.amount).to.equal(10_000_000n); // 10 shares received
    expect(quoteAfter.amount - quoteBefore.amount).to.equal(6_000_000n); // $6.00 surplus refund, NOT zero
  });

  it("pays the seller at the clearing price, with zero base left to refund", async () => {
    const quoteBefore = await getAccount(provider.connection as any, sellerQuoteAta.publicKey);
    const baseBefore = await getAccount(provider.connection as any, sellerBaseAta.publicKey);

    await program.methods
      .claimOrderProceeds(1)
      .accounts({ user: seller.publicKey, market, epochBatch: epochBatch0, vaultBase, vaultQuote, userBaseAta: sellerBaseAta.publicKey, userQuoteAta: sellerQuoteAta.publicKey, baseMint: baseMint.publicKey, quoteMint: quoteMint.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([seller])
      .rpc();

    const quoteAfter = await getAccount(provider.connection as any, sellerQuoteAta.publicKey);
    const baseAfter = await getAccount(provider.connection as any, sellerBaseAta.publicKey);

    expect(quoteAfter.amount - quoteBefore.amount).to.equal(2_142_000_000n); // 10 shares @ $214.20
    expect(baseAfter.amount - baseBefore.amount).to.equal(0n);
  });

  it("INV-01/INV-02: both vaults land at EXACTLY zero after both claims — nothing stuck, nothing leaked", async () => {
    const vaultBaseAcct = await getAccount(provider.connection as any, vaultBase);
    const vaultQuoteAcct = await getAccount(provider.connection as any, vaultQuote);
    expect(vaultBaseAcct.amount).to.equal(0n);
    expect(vaultQuoteAcct.amount).to.equal(0n);
  });

  it("rejects a second claim on an already-claimed order", async () => {
    let threw = false;
    try {
      await program.methods
        .claimOrderProceeds(0)
        .accounts({ user: buyer.publicKey, market, epochBatch: epochBatch0, vaultBase, vaultQuote, userBaseAta: buyerBaseAta.publicKey, userQuoteAta: buyerQuoteAta.publicKey, baseMint: baseMint.publicKey, quoteMint: quoteMint.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([buyer])
        .rpc();
    } catch (err: any) {
      threw = true;
      expect(err.toString()).to.include("OrderAlreadyClaimed");
    }
    expect(threw, "expected second claim to be rejected").to.be.true;
  });
});
