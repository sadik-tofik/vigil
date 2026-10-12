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
import { halted } from "../fixtures/pyth_mocks";

describe("IVM Row 5 Invariant: Confidence-Band Exact Boundary Integrity (§5.2)", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;

  let authority: Keypair;
  let trader: Keypair;

  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();
  const pythFeed = Keypair.generate();

  let market: PublicKey;
  let vaultBase: PublicKey;
  let vaultQuote: PublicKey;
  let epochBatch0: PublicKey;

  let traderBaseAta: Keypair;
  let traderQuoteAta: Keypair;

  // Boundary parameters derived from oracle ($214.50 +/- $0.20, k=2)
  const P_REF = 214_500_000;
  const SIGMA = 200_000;
  const K = 2;
  const WIDTH = SIGMA * K; // 400_000
  const P_MIN = P_REF - WIDTH; // 214_100_000 ($214.10)
  const P_MAX = P_REF + WIDTH; // 214_900_000 ($214.90)

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
    trader = Keypair.generate();

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
            data: halted(), // $214.50, sigma $0.20, status Halted
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

    // Fund trader with SOL
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: trader.publicKey,
          lamports: 2_000_000_000,
        })
      ),
      [authority]
    );

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
    traderBaseAta = await createTokenAccount(trader.publicKey, baseMint.publicKey);
    traderQuoteAta = await createTokenAccount(trader.publicKey, quoteMint.publicKey);

    // Fund trader with 100 shares base and 50,000 quote
    await provider.sendAndConfirm(
      new Transaction().add(
        createMintToInstruction(baseMint.publicKey, traderBaseAta.publicKey, authority.publicKey, 100_000_000),
        createMintToInstruction(quoteMint.publicKey, traderQuoteAta.publicKey, authority.publicKey, 50_000_000_000)
      ),
      [authority]
    );

    // Derive PDAs
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

    // Initialize market with k = 2
    await program.methods
      .initializeMarket(new BN(200), new BN(75), new BN(K))
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

    // Activate BatchAuction mode
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

  function placeOrder(side: "bid" | "ask", lotSize: number, limitPrice: number) {
    return program.methods
      .placeBatchOrder(side === "bid" ? { bid: {} } : { ask: {} }, new BN(lotSize), new BN(limitPrice))
      .accounts({
        user: trader.publicKey,
        market,
        epochBatch: epochBatch0,
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

  it("accepts orders at the exact lower confidence band boundary: limit_price == p_min ($214.10)", async () => {
    // Both bid and ask at exactly p_min must be admitted (inclusive check: limit_price >= p_min)
    const bidLot = 2_000_000;
    const askLot = 2_000_000;

    const bidSig = await placeOrder("bid", bidLot, P_MIN);
    expect(bidSig).to.be.a("string");

    const askSig = await placeOrder("ask", askLot, P_MIN);
    expect(askSig).to.be.a("string");

    const batch = await program.account.epochBatchState.fetch(epochBatch0);
    expect(batch.orderCount).to.equal(2);
    expect(batch.orders[0].limitPrice.toNumber()).to.equal(P_MIN);
    expect(batch.orders[1].limitPrice.toNumber()).to.equal(P_MIN);
  });

  it("accepts orders at the exact upper confidence band boundary: limit_price == p_max ($214.90)", async () => {
    // Both bid and ask at exactly p_max must be admitted (inclusive check: limit_price <= p_max)
    const bidLot = 3_000_000;
    const askLot = 3_000_000;

    const bidSig = await placeOrder("bid", bidLot, P_MAX);
    expect(bidSig).to.be.a("string");

    const askSig = await placeOrder("ask", askLot, P_MAX);
    expect(askSig).to.be.a("string");

    const batch = await program.account.epochBatchState.fetch(epochBatch0);
    expect(batch.orderCount).to.equal(4);
    expect(batch.orders[2].limitPrice.toNumber()).to.equal(P_MAX);
    expect(batch.orders[3].limitPrice.toNumber()).to.equal(P_MAX);
  });

  it("rejects orders off-by-one below the lower boundary: limit_price == p_min - 1 ($214.099999)", async () => {
    const invalidPrice = P_MIN - 1; // 214_099_999

    // Bid at p_min - 1 must fail
    let bidFailed = false;
    try {
      await placeOrder("bid", 1_000_000, invalidPrice);
    } catch (err: any) {
      bidFailed = true;
      expect(err.toString()).to.include("OrderPriceExceedsConfidenceBand");
    }
    expect(bidFailed, "expected bid at p_min - 1 to be rejected").to.be.true;

    // Ask at p_min - 1 must fail
    let askFailed = false;
    try {
      await placeOrder("ask", 1_000_000, invalidPrice);
    } catch (err: any) {
      askFailed = true;
      expect(err.toString()).to.include("OrderPriceExceedsConfidenceBand");
    }
    expect(askFailed, "expected ask at p_min - 1 to be rejected").to.be.true;

    // Order count in batch remains unchanged (4)
    const batch = await program.account.epochBatchState.fetch(epochBatch0);
    expect(batch.orderCount).to.equal(4);
  });

  it("rejects orders off-by-one above the upper boundary: limit_price == p_max + 1 ($214.900001)", async () => {
    const invalidPrice = P_MAX + 1; // 214_900_001

    // Bid at p_max + 1 must fail
    let bidFailed = false;
    try {
      await placeOrder("bid", 1_000_000, invalidPrice);
    } catch (err: any) {
      bidFailed = true;
      expect(err.toString()).to.include("OrderPriceExceedsConfidenceBand");
    }
    expect(bidFailed, "expected bid at p_max + 1 to be rejected").to.be.true;

    // Ask at p_max + 1 must fail
    let askFailed = false;
    try {
      await placeOrder("ask", 1_000_000, invalidPrice);
    } catch (err: any) {
      askFailed = true;
      expect(err.toString()).to.include("OrderPriceExceedsConfidenceBand");
    }
    expect(askFailed, "expected ask at p_max + 1 to be rejected").to.be.true;

    // Order count in batch remains unchanged (4)
    const batch = await program.account.epochBatchState.fetch(epochBatch0);
    expect(batch.orderCount).to.equal(4);
  });
});
