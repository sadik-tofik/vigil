// Sprint 1: initialize_market. Requires `target/idl/twilight_book.json` and
// `target/types/twilight_book.ts` to exist — i.e. a plain `anchor build`
// (NOT --no-idl) must have run at least once. Also requires `anchor-bankrun`
// (not yet in package.json — add it: `npm i -D anchor-bankrun`).
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
  getMinimumBalanceForRentExemptMint,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { describe, it, before } from "mocha";

import type { TwilightBook } from "../../target/types/twilight_book";
import idl from "../../target/idl/twilight_book.json";

describe("initialize_market (Sprint 1)", () => {
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;
  let authority: Keypair;
  let baseMint: Keypair;
  let quoteMint: Keypair;
  // Sprint 2 replaces this with a real mocked Pyth PriceFeed account
  // (tests/fixtures/pyth_mocks.ts) — initialize_market only stores the
  // pubkey, it doesn't deserialize this account yet.
  const pythFeedStub = Keypair.generate();

  before(async () => {
    const context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<TwilightBook>(idl as anchor.Idl, provider);

    authority = (provider.wallet as anchor.Wallet).payer;
    baseMint = Keypair.generate();
    quoteMint = Keypair.generate();

    const rentExemptMint = await getMinimumBalanceForRentExemptMint(
      provider.connection as any
    );

    for (const mint of [baseMint, quoteMint]) {
      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MINT_SIZE,
          lamports: rentExemptMint,
          programId: TOKEN_PROGRAM_ID,
        }),
        // 6 decimals — matches TwilightBook's PRICE_SCALE fixed-point convention
        createInitializeMint2Instruction(mint.publicKey, 6, authority.publicKey, null, TOKEN_PROGRAM_ID)
      );
      await provider.sendAndConfirm(tx, [mint]);
    }
  });

  function derivePdas() {
    const [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()],
      program.programId
    );
    const [vaultBase] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_base"), market.toBuffer()],
      program.programId
    );
    const [vaultQuote] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_quote"), market.toBuffer()],
      program.programId
    );
    return { market, vaultBase, vaultQuote };
  }

  it("creates Market + vaults at the correct PDAs, with the Market PDA (not the caller) as vault authority", async () => {
    const { market, vaultBase, vaultQuote } = derivePdas();

    await program.methods
      .initializeMarket(new BN(200), new BN(75), new BN(2)) // max_conf_bps, epoch_duration_slots, conf_filter_mult — BRS Rule 1 / SRS 2.1/5.2 defaults
      .accounts({
        authority: authority.publicKey,
        market,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        vaultBase,
        vaultQuote,
        pythFeed: pythFeedStub.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const marketAccount = await program.account.market.fetch(market);
    expect(marketAccount.vaultBase.equals(vaultBase)).to.be.true;
    expect(marketAccount.vaultQuote.equals(vaultQuote)).to.be.true;
    expect(marketAccount.baseMint.equals(baseMint.publicKey)).to.be.true;
    expect(marketAccount.quoteMint.equals(quoteMint.publicKey)).to.be.true;
    expect(marketAccount.pythFeed.equals(pythFeedStub.publicKey)).to.be.true;
    expect(marketAccount.currentEpoch.toNumber()).to.equal(0);
    // Anchor's default enum encoding: unit variant -> { <lowercase name>: {} }
    expect(marketAccount.mode).to.deep.equal({ continuous: {} });

    // The invariant that actually matters: the vault's SPL-Token-level
    // authority is the Market PDA, not `authority`'s wallet. If this were
    // ever `authority.publicKey` instead, the user's own keypair — not a
    // program instruction signing with the Market's seeds — could move
    // vault funds directly, which breaks every zero-leakage invariant in
    // the IVM before settlement logic even exists.
    const vaultBaseAccount = await getAccount(provider.connection as any, vaultBase);
    expect(vaultBaseAccount.mint.equals(baseMint.publicKey)).to.be.true;
    expect(vaultBaseAccount.owner.equals(market)).to.be.true;

    const vaultQuoteAccount = await getAccount(provider.connection as any, vaultQuote);
    expect(vaultQuoteAccount.mint.equals(quoteMint.publicKey)).to.be.true;
    expect(vaultQuoteAccount.owner.equals(market)).to.be.true;
  });

  it("rejects epoch_duration_slots = 0", async () => {
    // Reuses baseMint/quoteMint from the first test, so this must derive a
    // *different* market — same (base, quote) pair would collide with the
    // already-initialized PDA above and fail for the wrong reason.
    const altQuote = Keypair.generate();
    const rentExemptMint = await getMinimumBalanceForRentExemptMint(provider.connection as any);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: altQuote.publicKey,
          space: MINT_SIZE,
          lamports: rentExemptMint,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(altQuote.publicKey, 6, authority.publicKey, null, TOKEN_PROGRAM_ID)
      ),
      [altQuote]
    );

    const [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.publicKey.toBuffer(), altQuote.publicKey.toBuffer()],
      program.programId
    );
    const [vaultBase] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_base"), market.toBuffer()],
      program.programId
    );
    const [vaultQuote] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_quote"), market.toBuffer()],
      program.programId
    );

    let threw = false;
    try {
      await program.methods
        .initializeMarket(new BN(200), new BN(0), new BN(2)) // epoch_duration_slots = 0 — invalid
        .accounts({
          authority: authority.publicKey,
          market,
          baseMint: baseMint.publicKey,
          quoteMint: altQuote.publicKey,
          vaultBase,
          vaultQuote,
          pythFeed: pythFeedStub.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    } catch (err: any) {
      threw = true;
      expect(err.toString()).to.include("InvalidOracleData");
    }
    expect(threw, "expected initialize_market to reject epoch_duration_slots = 0").to.be.true;
  });
});
