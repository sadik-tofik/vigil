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

describe("set_mock_oracle (Judge Injection Controls)", () => {
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;
  let payer: Keypair;
  let baseMint: Keypair;
  let quoteMint: Keypair;
  let mockOraclePda: PublicKey;
  let marketPda: PublicKey;
  let vaultBase: PublicKey;
  let vaultQuote: PublicKey;

  before(async () => {
    const context = await startAnchor("", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<TwilightBook>(idl as anchor.Idl, provider);

    payer = (provider.wallet as anchor.Wallet).payer;
    baseMint = Keypair.generate();
    quoteMint = Keypair.generate();

    const rentExemptMint = await getMinimumBalanceForRentExemptMint(provider.connection as any);

    for (const mint of [baseMint, quoteMint]) {
      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MINT_SIZE,
          lamports: rentExemptMint,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint.publicKey, 6, payer.publicKey, null, TOKEN_PROGRAM_ID)
      );
      await provider.sendAndConfirm(tx, [mint]);
    }

    [mockOraclePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("mock_oracle"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()],
      program.programId
    );

    [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()],
      program.programId
    );

    [vaultBase] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_base"), marketPda.toBuffer()],
      program.programId
    );
    [vaultQuote] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_quote"), marketPda.toBuffer()],
      program.programId
    );
  });

  it("lazily creates mock oracle PDA and writes Pyth V2 binary format", async () => {
    const now = Math.floor(Date.now() / 1000);
    const price = new BN(214_500_000); // $214.50
    const conf = new BN(200_000);       // ~9.3 bps
    const expo = -6;
    const status = 1; // Trading
    const publishTime = new BN(now);

    await program.methods
      .setMockOracle(price, conf, expo, status, publishTime)
      .accounts({
        payer: payer.publicKey,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        mockOracle: mockOraclePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const acctInfo = await provider.connection.getAccountInfo(mockOraclePda);
    expect(acctInfo).to.not.be.null;
    expect(acctInfo!.data.length).to.equal(3312);

    // Verify Pyth binary offsets
    const data = acctInfo!.data;
    expect(data.readUInt32LE(0)).to.equal(0xa1b2c3d4); // magic
    expect(data.readUInt32LE(4)).to.equal(2);          // version
    expect(data.readUInt32LE(8)).to.equal(3);          // Price account type
    expect(data.readInt32LE(20)).to.equal(-6);         // expo
    expect(data.readBigInt64LE(96)).to.equal(BigInt(now));
    expect(data.readBigInt64LE(208)).to.equal(BigInt(214_500_000));
    expect(data.readBigUInt64LE(216)).to.equal(BigInt(200_000));
    expect(data.readUInt32LE(224)).to.equal(1);        // status
  });

  it("drives evaluate_market_mode into Continuous with tight confidence mock", async () => {
    await program.methods
      .initializeMarket(new BN(200), new BN(75), new BN(2))
      .accounts({
        authority: payer.publicKey,
        market: marketPda,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        vaultBase,
        vaultQuote,
        pythFeed: mockOraclePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const [epochBatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), marketPda.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .evaluateMarketMode()
      .accounts({
        market: marketPda,
        pythFeed: mockOraclePda,
        epochBatch,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const market = await program.account.market.fetch(marketPda);
    expect(market.mode).to.deep.equal({ continuous: {} });
  });

  it("updates existing mock oracle in place and flips market mode to BatchAuction on shock", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Weekend Shock: conf = 6_000_000 (~2798 bps > 200 bps threshold)
    await program.methods
      .setMockOracle(
        new BN(214_500_000),
        new BN(6_000_000),
        -6,
        1,
        new BN(now)
      )
      .accounts({
        payer: payer.publicKey,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        mockOracle: mockOraclePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const [epochBatch] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), marketPda.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    await program.methods
      .evaluateMarketMode()
      .accounts({
        market: marketPda,
        pythFeed: mockOraclePda,
        epochBatch,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const market = await program.account.market.fetch(marketPda);
    expect(market.mode).to.deep.equal({ batchAuction: {} });
  });

  it("rejects price <= 0 with InvalidOracleData", async () => {
    let failed = false;
    try {
      await program.methods
        .setMockOracle(
          new BN(0),
          new BN(200_000),
          -6,
          1,
          new BN(Math.floor(Date.now() / 1000))
        )
        .accounts({
          payer: payer.publicKey,
          baseMint: baseMint.publicKey,
          quoteMint: quoteMint.publicKey,
          mockOracle: mockOraclePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e: any) {
      failed = true;
      expect(e.message).to.include("InvalidOracleData");
    }
    expect(failed).to.be.true;
  });
});
