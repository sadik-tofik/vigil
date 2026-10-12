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
  createInitializeMint2Instruction,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { expect } from "chai";
import { startAnchor, BankrunProvider, ProgramTestContext } from "anchor-bankrun";
import idl from "../../target/idl/twilight_book.json";
import { TwilightBook } from "../../target/types/twilight_book";
import { mockPythPriceAccountData, PRICE_STATUS } from "../fixtures/pyth_mocks";
import {
  createKeeperState,
  runKeeperCycle,
  KeeperConfig,
} from "../../keeper/index";
import {
  findRegistryPda,
  findMarketPda,
  findVaultBasePda,
  findVaultQuotePda,
  findEpochBatchPda,
} from "../../keeper/registry";

describe("keeper bot: off-chain permissionless cranker integration", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<TwilightBook>;

  let authority: Keypair;
  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();
  const pythFeed = Keypair.generate();

  let marketPda: PublicKey;
  let vaultBasePda: PublicKey;
  let vaultQuotePda: PublicKey;
  let registryPda: PublicKey;

  const EPOCH_DURATION_SLOTS = 75;

  const keeperConfig: KeeperConfig = {
    rpcUrl: "http://127.0.0.1:8899",
    intervalMs: 1000,
    registryRefreshCycles: 5,
    maxRetries: 3,
    baseBackoffMs: 100,
    maxBackoffMs: 1000,
  };

  before(async () => {
    authority = Keypair.generate();
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Mock Pyth Oracle: $200.00, Halted to force BatchAuction mode
    const oracleData = mockPythPriceAccountData({
      price: 200_000_000n,
      conf: 500_000n,
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
            data: oracleData,
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

    // Initialize base & quote mints
    const rentExemptMint = await getMinimumBalanceForRentExemptMint(
      provider.connection as any
    );
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
          createInitializeMint2Instruction(
            mint.publicKey,
            6,
            authority.publicKey,
            null,
            TOKEN_PROGRAM_ID
          )
        ),
        [mint, authority]
      );
    }

    // Derive PDAs using keeper/registry derivation helpers
    [marketPda] = findMarketPda(
      baseMint.publicKey,
      quoteMint.publicKey,
      program.programId
    );
    [vaultBasePda] = findVaultBasePda(marketPda, program.programId);
    [vaultQuotePda] = findVaultQuotePda(marketPda, program.programId);
    [registryPda] = findRegistryPda(program.programId);

    // Initialize Market with Registry
    await (program.methods as any)
      .initializeMarketWithAssetClass(
        new BN(200),
        new BN(EPOCH_DURATION_SLOTS),
        new BN(2),
        { tokenizedEquity: {} }
      )
      .accounts({
        authority: authority.publicKey,
        market: marketPda,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        vaultBase: vaultBasePda,
        vaultQuote: vaultQuotePda,
        pythFeed: pythFeed.publicKey,
        registry: registryPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();
  });

  it("runs keeper cycle on startup: discovers market from Registry and evaluates market mode", async () => {
    const state = createKeeperState();

    // Run cycle 1 via exported runKeeperCycle function
    const cycleResult = await runKeeperCycle(program, state, keeperConfig);

    expect(cycleResult.marketsServiced).to.equal(1);
    expect(state.registryMarkets.length).to.be.at.least(1);
    expect(state.trackedMarkets.has(marketPda.toBase58())).to.be.true;

    const mResult = cycleResult.results[0];
    expect(mResult.market).to.equal(marketPda.toBase58());
    expect(mResult.evaluated).to.be.true;
    expect(mResult.evaluateTx).to.be.a("string");
    // settle should not have run because current slot has not reached end_slot
    expect(mResult.settled).to.be.false;

    // Verify on-chain state: market should be in BatchAuction mode
    const market = await program.account.market.fetch(marketPda);
    expect(market.mode).to.deep.equal({ batchAuction: {} });
    expect(market.currentEpoch.toNumber()).to.equal(0);

    // Verify epoch 0 EpochBatchState was lazily initialized by evaluate_market_mode
    const [epoch0Pda] = findEpochBatchPda(marketPda, 0, program.programId);
    const batch0 = await program.account.epochBatchState.fetch(epoch0Pda);
    expect(batch0.market.toBase58()).to.equal(marketPda.toBase58());
    expect(batch0.epochId.toNumber()).to.equal(0);
    expect(batch0.status).to.deep.equal({ acceptingOrders: {} });
  });

  it("treats premature settlement as a no-op (EpochNotYetEnded 6008) and continues without error", async () => {
    const state = createKeeperState();

    // Advance clock only 10 slots (far before endSlot which is startSlot + 75)
    const currentSlot = Number(await context.banksClient.getSlot());
    context.warpToSlot(BigInt(currentSlot + 10));

    const cycleResult = await runKeeperCycle(program, state, keeperConfig);
    expect(cycleResult.marketsServiced).to.equal(1);

    const mResult = cycleResult.results[0];
    expect(mResult.evaluated).to.be.true;
    expect(mResult.settled).to.be.false;
    expect(mResult.error).to.be.undefined;

    // Current epoch must still be 0
    const market = await program.account.market.fetch(marketPda);
    expect(market.currentEpoch.toNumber()).to.equal(0);
  });

  it("advances slots past end_slot and verifies keeper cycle settles batch and rolls epoch to 1", async () => {
    const state = createKeeperState();
    const [epoch0Pda] = findEpochBatchPda(marketPda, 0, program.programId);
    const batch0Before = await program.account.epochBatchState.fetch(epoch0Pda);

    // Warp slot past batch0 endSlot
    const targetSlot = BigInt(batch0Before.endSlot.toString()) + 5n;
    context.warpToSlot(targetSlot);

    // Run keeper cycle past endSlot
    const cycleResult = await runKeeperCycle(program, state, keeperConfig);

    expect(cycleResult.marketsServiced).to.equal(1);
    const mResult = cycleResult.results[0];
    expect(mResult.evaluated).to.be.true;
    expect(mResult.settled).to.be.true;
    expect(mResult.settleTx).to.be.a("string");

    // Assert on-chain epoch rollover: market.current_epoch must now be 1
    const marketAfter = await program.account.market.fetch(marketPda);
    expect(marketAfter.currentEpoch.toNumber()).to.equal(1);

    // Epoch 0 must now be settled/finalized (Voided because order count = 0)
    const batch0After = await program.account.epochBatchState.fetch(epoch0Pda);
    expect(batch0After.status).to.deep.equal({ voided: {} });

    // Epoch 1 EpochBatchState must be initialized and accepting orders
    const [epoch1Pda] = findEpochBatchPda(marketPda, 1, program.programId);
    const batch1 = await program.account.epochBatchState.fetch(epoch1Pda);
    expect(batch1.market.toBase58()).to.equal(marketPda.toBase58());
    expect(batch1.epochId.toNumber()).to.equal(1);
    expect(batch1.status).to.deep.equal({ acceptingOrders: {} });
  });

  it("emits health warning when market epoch exceeds 2x duration without settlement", async () => {
    const state = createKeeperState();
    const [epoch1Pda] = findEpochBatchPda(marketPda, 1, program.programId);
    const batch1 = await program.account.epochBatchState.fetch(epoch1Pda);

    // Warp slot by > 2 * EPOCH_DURATION_SLOTS (e.g. startSlot + 200)
    const warpSlot = BigInt(batch1.startSlot.toString()) + BigInt(2 * EPOCH_DURATION_SLOTS + 20);
    context.warpToSlot(warpSlot);

    // Simulate slot override or bankrun slot
    const cycleResult = await runKeeperCycle(program, state, keeperConfig);

    const mResult = cycleResult.results[0];
    // In this cycle, it will detect > 2x epoch duration and settle it
    expect(mResult.healthWarning).to.be.true;
    expect(mResult.settled).to.be.true;

    // Rolled over to epoch 2
    const market = await program.account.market.fetch(marketPda);
    expect(market.currentEpoch.toNumber()).to.equal(2);
  });
});
