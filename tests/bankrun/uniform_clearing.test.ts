// Sprint 4. Same IDL/anchor-bankrun prerequisites as earlier test files.
//
// The crossing scenario below is hand-solved, not just "does the code
// agree with itself": with bids (10@214.80, 5@214.50) and asks
// (8@214.20, 10@214.60), walking TDD §2's algorithm by hand gives
// P* = 214.60, Q* = 10 (a TIE at volume 10 between candidates 214.60 and
// 214.80, broken toward 214.60 for being closer to p_ref = 214.50) — bid1
// fills 100% (10), bid2 fills 0%, ask1 fills 100% (8), ask2 pro-rates the
// remaining 2 out of its own 10. If solve_uniform_price ever disagrees
// with these exact numbers, trust the hand solve, not the code.
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
  ACCOUNT_SIZE,
} from "@solana/spl-token";
import { expect } from "chai";
import { describe, it, before } from "mocha";

import type { TwilightBook } from "../../target/types/twilight_book";
import idl from "../../target/idl/twilight_book.json";
import { halted } from "../fixtures/pyth_mocks"; // forces BatchAuction mode, same fixture Sprint 3 settled on

async function setup() {
  const authority = Keypair.generate();
  const trader = Keypair.generate();
  const pythFeed = Keypair.generate();

  const context = await startAnchor(
    "",
    [],
    [
      { address: authority.publicKey, info: { lamports: 10_000_000_000, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false, rentEpoch: 0 } },
      { address: pythFeed.publicKey, info: { lamports: 1_000_000_000, data: halted(), owner: PublicKey.default, executable: false, rentEpoch: 0 } },
    ]
  );
  const provider = new BankrunProvider(context);
  anchor.setProvider(provider);
  const program = new Program<TwilightBook>(idl as anchor.Idl, provider);

  await provider.sendAndConfirm(
    new Transaction().add(SystemProgram.transfer({ fromPubkey: (provider.wallet as anchor.Wallet).payer.publicKey, toPubkey: trader.publicKey, lamports: 2_000_000_000 }))
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
  await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(quoteMint.publicKey, traderQuoteAta.publicKey, authority.publicKey, 10_000_000_000)), [authority]);
  await provider.sendAndConfirm(new Transaction().add(createMintToInstruction(baseMint.publicKey, traderBaseAta.publicKey, authority.publicKey, 100_000_000)), [authority]);

  const [market] = PublicKey.findProgramAddressSync([Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()], program.programId);
  const [vaultBase] = PublicKey.findProgramAddressSync([Buffer.from("vault_base"), market.toBuffer()], program.programId);
  const [vaultQuote] = PublicKey.findProgramAddressSync([Buffer.from("vault_quote"), market.toBuffer()], program.programId);
  const [epochBatch0] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)], program.programId);
  const [epochBatch1] = PublicKey.findProgramAddressSync([Buffer.from("batch"), market.toBuffer(), new BN(1).toArrayLike(Buffer, "le", 8)], program.programId);

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

  return { context, provider, program, authority, market, epochBatch0, epochBatch1, placeOrder };
}

describe("settle_batch_auction (Sprint 4)", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  before(async () => {
    ctx = await setup();
    await ctx.placeOrder("bid", 10_000_000, 214_800_000); // order 0
    await ctx.placeOrder("bid", 5_000_000, 214_500_000); // order 1
    await ctx.placeOrder("ask", 8_000_000, 214_200_000); // order 2
    await ctx.placeOrder("ask", 10_000_000, 214_600_000); // order 3

    const batch = await ctx.program.account.epochBatchState.fetch(ctx.epochBatch0);
    ctx.context.warpToSlot(BigInt(batch.endSlot.toString()) + 1n);

    await ctx.program.methods
      .settleBatchAuction()
      .accounts({
        keeper: ctx.authority.publicKey,
        market: ctx.market,
        epochBatch: ctx.epochBatch0,
        nextEpochBatch: ctx.epochBatch1,
        pythFeed: (await ctx.program.account.market.fetch(ctx.market)).pythFeed,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.authority])
      .rpc();
  });

  it("resolves P* = 214.60, Q* = 10 shares, matching the hand-solved tie-break", async () => {
    const batch = await ctx.program.account.epochBatchState.fetch(ctx.epochBatch0);
    expect(batch.status).to.deep.equal({ settled: {} });
    expect(batch.clearingPrice.toNumber()).to.equal(214_600_000);
    expect(batch.matchedVolume.toNumber()).to.equal(10_000_000);
  });

  it("fills orders exactly as hand-solved: bid1 full, bid2 zero, ask1 full, ask2 pro-rated to 2/10", async () => {
    const batch = await ctx.program.account.epochBatchState.fetch(ctx.epochBatch0);
    const filled = (i: number) => batch.orders[i].filledLotSize.toNumber();
    expect(filled(0)).to.equal(10_000_000); // bid @ 214.80, strictly above P*
    expect(filled(1)).to.equal(0); // bid @ 214.50, below P*, never crosses
    expect(filled(2)).to.equal(8_000_000); // ask @ 214.20, strictly below P*
    expect(filled(3)).to.equal(2_000_000); // ask @ 214.60 == P*, pro-rated

    // INV-04-style check: every filled bid's limit >= P*, every filled ask's limit <= P*.
    const p = batch.clearingPrice.toNumber();
    for (const o of batch.orders.slice(0, 4)) {
      if (o.filledLotSize.toNumber() === 0) continue;
      if (JSON.stringify(o.side) === JSON.stringify({ bid: {} })) {
        expect(o.limitPrice.toNumber()).to.be.at.least(p);
      } else {
        expect(o.limitPrice.toNumber()).to.be.at.most(p);
      }
    }

    // No side's total fill exceeds matched_volume (proxy for the
    // zero-leakage invariant at the individual-order level — full
    // vault-balance conservation needs claim_order_proceeds, Sprint 5).
    const totalAskFilled = batch.orders
      .slice(0, 4)
      .filter((o: any) => JSON.stringify(o.side) === JSON.stringify({ ask: {} }))
      .reduce((sum: number, o: any) => sum + o.filledLotSize.toNumber(), 0);
    expect(totalAskFilled).to.be.at.most(batch.matchedVolume.toNumber());
  });

  it("rolls over to epoch 1 with AcceptingOrders and order_count 0", async () => {
    const nextBatch = await ctx.program.account.epochBatchState.fetch(ctx.epochBatch1);
    expect(nextBatch.epochId.toNumber()).to.equal(1);
    expect(nextBatch.status).to.deep.equal({ acceptingOrders: {} });
    expect(nextBatch.orderCount).to.equal(0);

    const market = await ctx.program.account.market.fetch(ctx.market);
    expect(market.currentEpoch.toNumber()).to.equal(1);
  });
});

describe("settle_batch_auction: one-sided book (Sprint 4)", () => {
  it("Voids the batch when only one side has orders (Q* = 0)", async () => {
    const ctx = await setup();
    await ctx.placeOrder("bid", 10_000_000, 214_500_000); // no asks at all

    const batch = await ctx.program.account.epochBatchState.fetch(ctx.epochBatch0);
    ctx.context.warpToSlot(BigInt(batch.endSlot.toString()) + 1n);

    await ctx.program.methods
      .settleBatchAuction()
      .accounts({
        keeper: ctx.authority.publicKey,
        market: ctx.market,
        epochBatch: ctx.epochBatch0,
        nextEpochBatch: ctx.epochBatch1,
        pythFeed: (await ctx.program.account.market.fetch(ctx.market)).pythFeed,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.authority])
      .rpc();

    const settled = await ctx.program.account.epochBatchState.fetch(ctx.epochBatch0);
    expect(settled.status).to.deep.equal({ voided: {} });
    expect(settled.clearingPrice.toNumber()).to.equal(0);
    expect(settled.orders[0].filledLotSize.toNumber()).to.equal(0); // unfilled, reclaimable via claim (Sprint 5)
  });
});
