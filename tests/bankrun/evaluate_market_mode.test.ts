// Sprint 2. Same IDL/anchor-bankrun prerequisites as market_mode.test.ts —
// see that file's header comment.
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
} from "@solana/spl-token";
import { expect } from "chai";
import { describe, it, before } from "mocha";

import type { TwilightBook } from "../../target/types/twilight_book";
import idl from "../../target/idl/twilight_book.json";
import {
  PYTH_PRICE_ACCOUNT_SIZE,
  tradingTightConf,
  tradingWideConf,
  halted,
  stale,
} from "../fixtures/pyth_mocks";

describe("evaluate_market_mode (Sprint 2)", () => {
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;
  let authority: Keypair;
  let baseMint: Keypair;
  let quoteMint: Keypair;
  let market: PublicKey;
  const pythFeed = Keypair.generate();

  // Writes fresh bytes into the SAME pyth_feed pubkey between test cases —
  // real Pyth publishers overwrite their price account in place, so this
  // matches on-chain behavior rather than requiring a new feed account per
  // scenario. Bankrun's AddedAccount only sets initial state at startup,
  // so mode changes are exercised as separate startAnchor() contexts below,
  // not by mutating a shared one.
  async function setUpWithFeed(feedData: Buffer) {
    const context = await startAnchor(
      "",
      [],
      [
        {
          address: pythFeed.publicKey,
          info: {
            lamports: 1_000_000_000,
            data: feedData,
            owner: PublicKey.default, // pyth accounts are owned by the Pyth program in reality; ownership isn't checked by evaluate_market_mode's `address` constraint, only the pubkey match is
            executable: false,
            rentEpoch: 0,
          },
        },
      ]
    );
    const p = new BankrunProvider(context);
    anchor.setProvider(p);
    const prog = new Program<TwilightBook>(idl as anchor.Idl, p);
    return { provider: p, program: prog };
  }

  before(async () => {
    // Mints created once against a throwaway context just to get
    // deterministic pubkeys — re-created fresh inside each scenario's
    // own startAnchor() context below, since each needs its own ledger.
    baseMint = Keypair.generate();
    quoteMint = Keypair.generate();
  });

  async function initMarketIn(p: BankrunProvider, prog: Program<TwilightBook>) {
    authority = (p.wallet as anchor.Wallet).payer;
    const rentExemptMint = await getMinimumBalanceForRentExemptMint(p.connection as any);

    for (const mint of [baseMint, quoteMint]) {
      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MINT_SIZE,
          lamports: rentExemptMint,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint.publicKey, 6, authority.publicKey, null, TOKEN_PROGRAM_ID)
      );
      await p.sendAndConfirm(tx, [mint]);
    }

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()],
      prog.programId
    );
    const [vaultBase] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_base"), marketPda.toBuffer()],
      prog.programId
    );
    const [vaultQuote] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_quote"), marketPda.toBuffer()],
      prog.programId
    );

    await prog.methods
      .initializeMarket(new BN(200), new BN(75), new BN(2)) // max_conf_bps=200 (2.00%), matches BRS Rule 1 default
      .accounts({
        authority: authority.publicKey,
        market: marketPda,
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

    return marketPda;
  }

  async function evaluateIn(p: BankrunProvider, prog: Program<TwilightBook>, marketPda: PublicKey) {
    const [epochBatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), marketPda.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
      prog.programId
    );
    await prog.methods
      .evaluateMarketMode()
      .accounts({
        market: marketPda,
        pythFeed: pythFeed.publicKey,
        epochBatch,
        payer: (p.wallet as anchor.Wallet).payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return epochBatch;
  }

  it("tight confidence + Trading -> Continuous", async () => {
    const { provider: p, program: prog } = await setUpWithFeed(tradingTightConf());
    const marketPda = await initMarketIn(p, prog);
    await evaluateIn(p, prog, marketPda);
    const acct = await prog.account.market.fetch(marketPda);
    expect(acct.mode).to.deep.equal({ continuous: {} });
  });

  it("wide confidence (>200bps) + Trading -> BatchAuction", async () => {
    const { provider: p, program: prog } = await setUpWithFeed(tradingWideConf());
    const marketPda = await initMarketIn(p, prog);
    await evaluateIn(p, prog, marketPda);
    const acct = await prog.account.market.fetch(marketPda);
    expect(acct.mode).to.deep.equal({ batchAuction: {} });
  });

  it("Halted status -> BatchAuction, regardless of confidence", async () => {
    const { provider: p, program: prog } = await setUpWithFeed(halted());
    const marketPda = await initMarketIn(p, prog);
    await evaluateIn(p, prog, marketPda);
    const acct = await prog.account.market.fetch(marketPda);
    expect(acct.mode).to.deep.equal({ batchAuction: {} });
  });

  it("stale publish_time (>60s) -> BatchAuction, even with tight confidence + Trading", async () => {
    const { provider: p, program: prog } = await setUpWithFeed(stale());
    const marketPda = await initMarketIn(p, prog);
    await evaluateIn(p, prog, marketPda);
    const acct = await prog.account.market.fetch(marketPda);
    expect(acct.mode).to.deep.equal({ batchAuction: {} });
  });

  it("lazily creates epoch 0's EpochBatchState on first call, AcceptingOrders, order_count 0", async () => {
    const { provider: p, program: prog } = await setUpWithFeed(tradingTightConf());
    const marketPda = await initMarketIn(p, prog);
    const epochBatchPda = await evaluateIn(p, prog, marketPda);
    const batch = await prog.account.epochBatchState.fetch(epochBatchPda);
    expect(batch.epochId.toNumber()).to.equal(0);
    expect(batch.orderCount).to.equal(0);
    expect(batch.status).to.deep.equal({ acceptingOrders: {} });
  });
});
