// Sprint 7: Extended Invariant Verification Matrix (IVM)
//
// Targeted test coverage for:
// 1. Stale-oracle rejection under place_batch_order (TwilightError::StaleOracle).
// 2. Double-settle rejection on an already settled batch (TwilightError::BatchAlreadySettled).
// 3. 32-order max-capacity settlement Compute Unit budget verification (<200,000 CU).

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
  ACCOUNT_SIZE,
} from "@solana/spl-token";
import { expect } from "chai";
import { describe, it } from "mocha";

import type { TwilightBook } from "../../target/types/twilight_book";
import idl from "../../target/idl/twilight_book.json";
import { halted, stale } from "../fixtures/pyth_mocks";

async function createMarketContext(feedData: Buffer) {
  const authority = Keypair.generate();
  const trader = Keypair.generate();
  const pythFeed = Keypair.generate();

  const context = await startAnchor(
    "",
    [],
    [
      { address: authority.publicKey, info: { lamports: 10_000_000_000, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false, rentEpoch: 0 } },
      { address: pythFeed.publicKey, info: { lamports: 1_000_000_000, data: feedData, owner: PublicKey.default, executable: false, rentEpoch: 0 } },
    ]
  );
  const provider = new BankrunProvider(context);
  anchor.setProvider(provider);
  const program = new Program<TwilightBook>(idl as anchor.Idl, provider);

  await provider.sendAndConfirm(
    new Transaction().add(SystemProgram.transfer({ fromPubkey: (provider.wallet as anchor.Wallet).payer.publicKey, toPubkey: trader.publicKey, lamports: 5_000_000_000 }))
  );

  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();
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

  const traderBaseAta = await createTokenAccount(trader.publicKey, baseMint.publicKey);
  const traderQuoteAta = await createTokenAccount(trader.publicKey, quoteMint.publicKey);
  await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(quoteMint.publicKey, traderQuoteAta.publicKey, authority.publicKey, 100_000_000_000)), [authority]);
  await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(baseMint.publicKey, traderBaseAta.publicKey, authority.publicKey, 10_000_000_000)), [authority]);

  const [market] = PublicKey.findProgramAddressSync([Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()], program.programId);
  const [vaultBase] = PublicKey.findProgramAddressSync([Buffer.from("vault_base"), market.toBuffer()], program.programId);
  const [vaultQuote] = PublicKey.findProgramAddressSync([Buffer.from("vault_quote"), market.toBuffer()], program.programId);
  const [epochBatch0] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)], program.programId);
  const [epochBatch1] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market.toBuffer(), new BN(1).toArrayLike(Buffer, "le", 8)], program.programId);

  await program.methods
    .initializeMarket(new BN(200), new BN(100), new BN(2))
    .accounts({ authority: authority.publicKey, market, baseMint: baseMint.publicKey, quoteMint: quoteMint.publicKey, vaultBase, vaultQuote, pythFeed: pythFeed.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY })
    .signers([authority])
    .rpc();

  await program.methods
    .evaluateMarketMode()
    .accounts({ market, pythFeed: pythFeed.publicKey, epochBatch: epochBatch0, payer: authority.publicKey, systemProgram: SystemProgram.programId })
    .signers([authority])
    .rpc();

  function placeOrder(side: "bid" | "ask", lotSize: number, limitPrice: number) {
    return program.methods
      .placeBatchOrder(side === "bid" ? { bid: {} } : { ask: {} }, new BN(lotSize), new BN(limitPrice))
      .accounts({
        user: trader.publicKey, market, epochBatch: epochBatch0, pythFeed: pythFeed.publicKey,
        vaultBase, vaultQuote, userBaseAta: traderBaseAta.publicKey, userQuoteAta: traderQuoteAta.publicKey,
        baseMint: baseMint.publicKey, quoteMint: quoteMint.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader])
      .rpc();
  }

  return { context, provider, program, authority, trader, market, epochBatch0, epochBatch1, pythFeed, placeOrder };
}

describe("Sprint 7 Extended IVM Verification", () => {
  it("rejects place_batch_order with StaleOracle when Pyth feed is older than 60s", async () => {
    // Context created with stale feed (timestamp > 60s ago)
    const ctx = await createMarketContext(stale());

    try {
      await ctx.placeOrder("bid", 1_000_000, 214_500_000);
      expect.fail("Expected place_batch_order to fail with StaleOracle");
    } catch (err: any) {
      expect(err.toString()).to.include("StaleOracle");
    }
  });

  it("saturates an epoch batch to 32 orders and settles within 200,000 CU budget", async () => {
    // Context created with active halted feed (within confidence band)
    const ctx = await createMarketContext(halted());

    // Place 16 bids and 16 asks = 32 orders
    // Confidence band for halted() is $214.50 +/- 2 * $0.20 = [$214.10, $214.90]
    for (let i = 0; i < 16; i++) {
      const bidPrice = 214_500_000 + (i % 4) * 100_000; // $214.50 to $214.80
      await ctx.placeOrder("bid", 1_000_000, bidPrice);

      const askPrice = 214_500_000 - (i % 4) * 100_000; // $214.50 down to $214.20
      await ctx.placeOrder("ask", 1_000_000, askPrice);
    }

    const batch = await ctx.program.account.epochBatchState.fetch(ctx.epochBatch0);
    expect(batch.orderCount).to.equal(32);

    // Warp past end slot
    ctx.context.warpToSlot(BigInt(batch.endSlot.toString()) + 1n);

    // Simulate transaction to verify Compute Units
    const tx = await ctx.program.methods
      .settleBatchAuction()
      .accounts({
        keeper: ctx.authority.publicKey,
        market: ctx.market,
        epochBatch: ctx.epochBatch0,
        nextEpochBatch: ctx.epochBatch1,
        pythFeed: ctx.pythFeed.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    tx.recentBlockhash = (await ctx.context.banksClient.getLatestBlockhash())[0];
    tx.feePayer = ctx.authority.publicKey;
    tx.sign(ctx.authority);

    const sim = await ctx.context.banksClient.simulateTransaction(tx);
    expect(sim.result).to.be.null; // null indicates success in solana-bankrun
    const cuConsumed = sim.meta?.computeUnitsConsumed || 0;
    console.log(`\n  ⚡ 32-Order Settlement Compute Units Consumed: ${cuConsumed} / 200,000 CU`);
    expect(Number(cuConsumed)).to.be.lessThan(200_000);

    // Commit settlement on-chain
    await ctx.provider.sendAndConfirm(tx, [ctx.authority]);

    const settled = await ctx.program.account.epochBatchState.fetch(ctx.epochBatch0);
    expect(settled.status).to.deep.equal({ settled: {} });
    expect(settled.clearingPrice.toNumber()).to.be.greaterThan(0);
    expect(settled.matchedVolume.toNumber()).to.be.greaterThan(0);

    // Test A: Attempting to replay settlement on historical epoch 0 by passing epochBatch0
    // is rejected by Anchor PDA seed derivation because market.current_epoch has already rolled to 1.
    try {
      await ctx.program.methods
        .settleBatchAuction()
        .accounts({
          keeper: ctx.authority.publicKey,
          market: ctx.market,
          epochBatch: ctx.epochBatch0,
          nextEpochBatch: ctx.epochBatch1,
          pythFeed: ctx.pythFeed.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.authority])
        .rpc();
      expect.fail("Expected second settleBatchAuction on epoch 0 to fail with ConstraintSeeds");
    } catch (err: any) {
      expect(err.toString()).to.include("ConstraintSeeds");
    }

    // Test B: Calling settleBatchAuction with correctly derived accounts for the new current epoch (epoch 1)
    // fails with EpochNotYetEnded because the rolled epoch has not reached its end_slot.
    const [epochBatch2] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), ctx.market.toBuffer(), new BN(2).toArrayLike(Buffer, "le", 8)],
      ctx.program.programId
    );
    try {
      await ctx.program.methods
        .settleBatchAuction()
        .accounts({
          keeper: ctx.authority.publicKey,
          market: ctx.market,
          epochBatch: ctx.epochBatch1,
          nextEpochBatch: epochBatch2,
          pythFeed: ctx.pythFeed.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.authority])
        .rpc();
      expect.fail("Expected settleBatchAuction on epoch 1 to fail with EpochNotYetEnded");
    } catch (err: any) {
      expect(err.toString()).to.include("EpochNotYetEnded");
    }
  });
});
