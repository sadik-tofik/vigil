// Sprint 3. Same IDL/anchor-bankrun prerequisites as earlier test files.
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { startAnchor, ProgramTestContext } from "solana-bankrun";
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

describe("place_batch_order / cancel_batch_order (Sprint 3)", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;
  let authority: Keypair;
  let trader: Keypair;
  let baseMint: Keypair;
  let quoteMint: Keypair;
  let market: PublicKey;
  let vaultBase: PublicKey;
  let vaultQuote: PublicKey;
  let epochBatch: PublicKey;
  let traderBaseAta: Keypair;
  let traderQuoteAta: Keypair;
  const pythFeed = Keypair.generate();

  async function createTokenAccount(owner: PublicKey, mint: PublicKey): Promise<Keypair> {
    const acct = Keypair.generate();
    const rentExempt = await provider.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: acct.publicKey,
        space: ACCOUNT_SIZE,
        lamports: rentExempt,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccount3Instruction(acct.publicKey, mint, owner, TOKEN_PROGRAM_ID)
    );
    await provider.sendAndConfirm(tx, [acct]);
    return acct;
  }

  before(async () => {
    context = await startAnchor(
      "",
      [],
      [
        {
          address: pythFeed.publicKey,
          info: {
            lamports: 1_000_000_000,
            data: halted(), // $214.50 +/- $0.20, Halted status forces BatchAuction mode
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

    authority = (provider.wallet as anchor.Wallet).payer;
    trader = Keypair.generate();
    // fund trader for tx fees
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: trader.publicKey, lamports: 1_000_000_000 })
      )
    );

    baseMint = Keypair.generate();
    quoteMint = Keypair.generate();
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
        [mint]
      );
    }

    traderBaseAta = await createTokenAccount(trader.publicKey, baseMint.publicKey);
    traderQuoteAta = await createTokenAccount(trader.publicKey, quoteMint.publicKey);

    // mint the trader enough quote to cover bids used below (10,000 USDC @ 6 decimals)
    await provider.sendAndConfirm(
      new Transaction().add(
        createMintToInstruction(quoteMint.publicKey, traderQuoteAta.publicKey, authority.publicKey, 10_000_000_000)
      )
    );

    [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()],
      program.programId
    );
    [vaultBase] = PublicKey.findProgramAddressSync([Buffer.from("vault_base"), market.toBuffer()], program.programId);
    [vaultQuote] = PublicKey.findProgramAddressSync([Buffer.from("vault_quote"), market.toBuffer()], program.programId);
    [epochBatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), market.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

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
      .rpc();

    await program.methods
      .evaluateMarketMode()
      .accounts({
        market,
        pythFeed: pythFeed.publicKey,
        epochBatch,
        payer: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  function placeBid(lotSize: number, limitPrice: number) {
    return program.methods
      .placeBatchOrder({ bid: {} }, new BN(lotSize), new BN(limitPrice))
      .accounts({
        user: trader.publicKey,
        market,
        epochBatch,
        pythFeed: pythFeed.publicKey,
        vaultBase,
        vaultQuote,
        userBaseAta: traderBaseAta.publicKey,
        userQuoteAta: traderQuoteAta.publicKey,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader])
      .rpc();
  }

  it("escrows the exact quote amount for a Bid inside the confidence band", async () => {
    // 10 shares @ $214.60 (6-decimal fixed point: 214_600_000), inside
    // [P_ref - 2*sigma, P_ref + 2*sigma] = [214.10, 214.90] roughly
    const lotSize = 10_000_000; // 10 shares @ 6 decimals
    const limitPrice = 214_600_000;
    const before = await getAccount(provider.connection as any, vaultQuote);

    await placeBid(lotSize, limitPrice);

    const after = await getAccount(provider.connection as any, vaultQuote);
    const expectedTransfer = BigInt(lotSize) * BigInt(limitPrice) / 1_000_000n;
    expect(after.amount - before.amount).to.equal(expectedTransfer);

    const batch = await program.account.epochBatchState.fetch(epochBatch);
    expect(batch.orderCount).to.equal(1);
    expect(batch.orders[0].lotSize.toNumber()).to.equal(lotSize);
    expect(batch.orders[0].limitPrice.toNumber()).to.equal(limitPrice);
  });

  it("rejects a limit price outside the confidence band", async () => {
    let threw = false;
    try {
      // Wildly outside [P_ref - 2*sigma, P_ref + 2*sigma] for $214.50 +/- $0.20
      await placeBid(10_000_000, 300_000_000);
    } catch (err: any) {
      threw = true;
      expect(err.toString()).to.include("OrderPriceExceedsConfidenceBand");
    }
    expect(threw, "expected rejection outside confidence band").to.be.true;
  });

  it("refunds the exact escrowed amount on cancel", async () => {
    const lotSize = 5_000_000;
    const limitPrice = 214_550_000;
    const quoteBefore = await getAccount(provider.connection as any, traderQuoteAta.publicKey);

    await placeBid(lotSize, limitPrice);
    const batchAfterPlace = await program.account.epochBatchState.fetch(epochBatch);
    const orderIndex = batchAfterPlace.orderCount - 1;

    await program.methods
      .cancelBatchOrder(orderIndex)
      .accounts({
        user: trader.publicKey,
        market,
        epochBatch,
        vaultBase,
        vaultQuote,
        userBaseAta: traderBaseAta.publicKey,
        userQuoteAta: traderQuoteAta.publicKey,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader])
      .rpc();

    const quoteAfter = await getAccount(provider.connection as any, traderQuoteAta.publicKey);
    expect(quoteAfter.amount).to.equal(quoteBefore.amount); // net zero after place + cancel

    const batch = await program.account.epochBatchState.fetch(epochBatch);
    expect(batch.orders[orderIndex].lotSize.toNumber()).to.equal(0); // zeroed, not compacted
  });

  it("rejects order placement inside the terminal freeze window", async () => {
    const batch = await program.account.epochBatchState.fetch(epochBatch);
    // Warp to end_slot - 5: inside the last FREEZE_WINDOW_SLOTS (10) before end_slot.
    const targetSlot = BigInt(batch.endSlot.toString()) - 5n;
    context.warpToSlot(targetSlot);

    let threw = false;
    try {
      await placeBid(1_000_000, 214_500_000);
    } catch (err: any) {
      threw = true;
      expect(err.toString()).to.include("BatchFrozen");
    }
    expect(threw, "expected rejection inside the freeze window").to.be.true;
  });
});
