import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import {
  DynamicBondingCurveClient,
  buildCurveWithMarketCap,
  BaseFeeMode,
  CollectFeeMode,
  MigrationOption,
  MigrationFeeOption,
  MigratedCollectFeeMode,
  DammV2DynamicFeeMode,
  ActivationType,
  deriveDbcPoolAddress,
  deriveDbcTokenVaultAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import * as fs from "fs";
import * as path from "path";

// Load TwilightBook IDL
const idlPath = path.resolve(__dirname, "../app/src/lib/twilight_book.json");
if (!fs.existsSync(idlPath)) {
  throw new Error(`TwilightBook IDL not found at ${idlPath}`);
}
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
const TWILIGHT_PROGRAM_ID = new PublicKey(idl.address || "HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h");

// Sleep helper
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadDeployerKeypair(): Promise<Keypair> {
  const keyPath = path.resolve(process.env.HOME || "~", ".config/solana/id.json");
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Deployer keypair not found at ${keyPath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

async function sendTx(connection: Connection, tx: anchor.web3.Transaction, signers: Keypair[]): Promise<string> {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = signers[0].publicKey;
  return await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
    skipPreflight: false,
  });
}

async function main() {
  console.log("======================================================================");
  console.log("  METEORA DYNAMIC BONDING CURVE (DBC) -> TWILIGHTBOOK INTEGRATION");
  console.log("======================================================================");

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const payer = await loadDeployerKeypair();

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer / Deployer: ${payer.publicKey.toBase58()}`);
  console.log(`Devnet Balance:   ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`RPC Endpoint:     ${rpcUrl}`);

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error("Insufficient balance (<0.5 SOL). Please fund payer before continuing.");
  }

  const client = DynamicBondingCurveClient.create(connection);
  const evidenceResults: any = {
    network: "devnet",
    timestamp: new Date().toISOString(),
    deployer: payer.publicKey.toBase58(),
  };

  // =========================================================================
  // STEP 1 & 2: Build DBC Curve Parameters
  // =========================================================================
  console.log("\n[STEP 1] Building Meteora DBC Curve Parameters...");
  const tokenSupply = 1_000_000_000; // 1,000,000,000 bTSLA tokens
  const baseDecimals = 6;            // Standard 6 decimals matching TwilightBook fixed point
  const quoteDecimals = 9;           // WSOL (9 decimals)

  const curveParams = buildCurveWithMarketCap({
    token: {
      tokenType: 0, // SPL Token
      tokenBaseDecimal: baseDecimals,
      tokenQuoteDecimal: quoteDecimals,
      tokenAuthorityOption: 0,
      totalTokenSupply: tokenSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: 100, // 1.00% fee
          endingFeeBps: 100,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: 100,
      },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 100,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Slot,
    initialMarketCap: 10,  // 10 SOL initial MCAP
    migrationMarketCap: 50, // 50 SOL migration threshold to DAMM v2
  });

  console.log("✓ Curve mathematical model computed successfully.");

  // =========================================================================
  // STEP 3: Create or Reuse DBC Config Account on Devnet
  // =========================================================================
  console.log("\n[STEP 2] Preparing DBC Config Account on Devnet...");
  const confirmedConfigPubkey = new PublicKey("2oTJrtAiAZFeWJpoAchSEyzGxVJixh3BUY7ZDPvCnEGM");
  const confirmedConfigSig = "2pLC5cz66wgshLNAZ1TRWCkzhjndVK75bXAZBx6atUHhqMPhKNXey6nCDZEs3MKBGWVquURgY5SjdP4biirSQaJ8";
  const confirmedMintPubkey = new PublicKey("oV46RdoFrSLSipxi9FEUVFbnQiY39Zc4s4dXsE2Lrue");
  const confirmedPoolPda = new PublicKey("3oJcekrNqpmJUwyCogCgVKF8pWCpg66gYxhsKQU4BZeC");
  const confirmedBaseVault = new PublicKey("6tYEnVe3Yg9LhY41ChhgaWX8qvh79dRppAmZiJaPLyHv");
  const confirmedQuoteVault = new PublicKey("HqmZSMYFXasfp7BYQDJJNKfd4ZGBR9kfRELJuWXMLjZT");
  const confirmedPoolSig = "vSdqdXSUvrth1LsPpm4pYvJryni72GMcYE686taMDBufnzprAPZB4eRWbcVN2EfQ54euc4UisNQxoTiW6tGxEvE";

  let configPubkey = confirmedConfigPubkey;
  let baseMintPubkey = confirmedMintPubkey;
  let poolPda = confirmedPoolPda;
  let baseVaultPda = confirmedBaseVault;
  let quoteVaultPda = confirmedQuoteVault;

  const existingPoolInfo = await connection.getAccountInfo(confirmedPoolPda);
  if (existingPoolInfo) {
    console.log("✓ Reusing verified on-chain DBC Config & Pool from previous run:");
    console.log(`  Config:     ${configPubkey.toBase58()} (Tx: ${confirmedConfigSig})`);
    console.log(`  Token Mint: ${baseMintPubkey.toBase58()}`);
    console.log(`  Pool PDA:   ${poolPda.toBase58()} (Tx: ${confirmedPoolSig})`);

    evidenceResults.dbcConfig = {
      address: configPubkey.toBase58(),
      txSignature: confirmedConfigSig,
      explorer: `https://explorer.solana.com/tx/${confirmedConfigSig}?cluster=devnet`,
    };
    evidenceResults.dbcPool = {
      mint: baseMintPubkey.toBase58(),
      name: "Tokenized Tesla (Meteora DBC)",
      symbol: "bTSLA",
      poolPda: poolPda.toBase58(),
      baseVault: baseVaultPda.toBase58(),
      quoteVault: quoteVaultPda.toBase58(),
      txSignature: confirmedPoolSig,
      explorer: `https://explorer.solana.com/tx/${confirmedPoolSig}?cluster=devnet`,
      tokenExplorer: `https://explorer.solana.com/address/${baseMintPubkey.toBase58()}?cluster=devnet`,
    };
  } else {
    const configKeypair = Keypair.generate();
    configPubkey = configKeypair.publicKey;
    console.log(`Generating new Config Keypair: ${configPubkey.toBase58()}`);

    const createConfigTx = await client.partner.createConfig({
      ...curveParams,
      config: configKeypair.publicKey,
      feeClaimer: payer.publicKey,
      leftoverReceiver: payer.publicKey,
      quoteMint: NATIVE_MINT,
      payer: payer.publicKey,
    });

    createConfigTx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }));
    const configSig = await sendTx(connection, createConfigTx, [payer, configKeypair]);

    console.log(`✓ DBC Config Created! Signature: ${configSig}`);
    console.log(`  Explorer: https://explorer.solana.com/tx/${configSig}?cluster=devnet`);

    evidenceResults.dbcConfig = {
      address: configPubkey.toBase58(),
      txSignature: configSig,
      explorer: `https://explorer.solana.com/tx/${configSig}?cluster=devnet`,
    };

    await sleep(2000);

    // Create DBC Pool & Mint
    console.log("\n[STEP 3] Creating DBC Pool & Launching Token (bTSLA)...");
    const baseMintKeypair = Keypair.generate();
    baseMintPubkey = baseMintKeypair.publicKey;
    const tokenName = "Tokenized Tesla (Meteora DBC)";
    const tokenSymbol = "bTSLA";
    const tokenUri = "https://raw.githubusercontent.com/sadik-tofik/twilight-book/main/metadata/btsla.json";

    console.log(`Token Mint (bTSLA): ${baseMintPubkey.toBase58()}`);

    const createPoolTx = await client.creator.createPool({
      name: tokenName,
      symbol: tokenSymbol,
      uri: tokenUri,
      payer: payer.publicKey,
      poolCreator: payer.publicKey,
      config: configPubkey,
      baseMint: baseMintPubkey,
    });

    createPoolTx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 450_000 }));
    const poolSig = await sendTx(connection, createPoolTx, [payer, baseMintKeypair]);

    poolPda = deriveDbcPoolAddress(NATIVE_MINT, baseMintPubkey, configPubkey);
    baseVaultPda = deriveDbcTokenVaultAddress(poolPda, baseMintPubkey);
    quoteVaultPda = deriveDbcTokenVaultAddress(poolPda, NATIVE_MINT);

    console.log(`✓ DBC Pool Created! Signature: ${poolSig}`);
    console.log(`  Pool PDA:        ${poolPda.toBase58()}`);
    console.log(`  Base Vault PDA:  ${baseVaultPda.toBase58()}`);
    console.log(`  Quote Vault PDA: ${quoteVaultPda.toBase58()}`);
    console.log(`  Explorer: https://explorer.solana.com/tx/${poolSig}?cluster=devnet`);
    console.log(`  Token Explorer: https://explorer.solana.com/address/${baseMintPubkey.toBase58()}?cluster=devnet`);

    evidenceResults.dbcPool = {
      mint: baseMintPubkey.toBase58(),
      name: tokenName,
      symbol: tokenSymbol,
      poolPda: poolPda.toBase58(),
      baseVault: baseVaultPda.toBase58(),
      quoteVault: quoteVaultPda.toBase58(),
      txSignature: poolSig,
      explorer: `https://explorer.solana.com/tx/${poolSig}?cluster=devnet`,
      tokenExplorer: `https://explorer.solana.com/address/${baseMintPubkey.toBase58()}?cluster=devnet`,
    };

    await sleep(2500);
  }

  // =========================================================================
  // STEP 5: Live Demo Swaps against Meteora DBC
  // =========================================================================
  console.log("\n[STEP 4] Executing Live Demo Swaps on Bonding Curve...");
  evidenceResults.swaps = [];

  // Swap 1: Buy bTSLA with 0.005 SOL
  console.log("Executing Swap #1: Buy bTSLA with 0.005 SOL...");
  const swap1Amount = new BN(Math.floor(0.005 * LAMPORTS_PER_SOL));
  const swap1Tx = await client.pool.swap({
    amountIn: swap1Amount,
    minimumAmountOut: new BN(1),
    swapBaseForQuote: false, // Buy base token with SOL
    owner: payer.publicKey,
    pool: poolPda,
    referralTokenAccount: null,
  });

  swap1Tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  const swap1Sig = await sendTx(connection, swap1Tx, [payer]);

  console.log(`✓ Swap #1 Confirmed! Signature: ${swap1Sig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${swap1Sig}?cluster=devnet`);

  evidenceResults.swaps.push({
    swapIndex: 1,
    amountInSol: 0.005,
    txSignature: swap1Sig,
    explorer: `https://explorer.solana.com/tx/${swap1Sig}?cluster=devnet`,
  });

  await sleep(2000);

  // Swap 2: Buy bTSLA with 0.005 SOL
  console.log("Executing Swap #2: Buy bTSLA with 0.005 SOL...");
  const swap2Amount = new BN(Math.floor(0.005 * LAMPORTS_PER_SOL));
  const swap2Tx = await client.pool.swap({
    amountIn: swap2Amount,
    minimumAmountOut: new BN(1),
    swapBaseForQuote: false,
    owner: payer.publicKey,
    pool: poolPda,
    referralTokenAccount: null,
  });

  swap2Tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  const swap2Sig = await sendTx(connection, swap2Tx, [payer]);

  console.log(`✓ Swap #2 Confirmed! Signature: ${swap2Sig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${swap2Sig}?cluster=devnet`);

  evidenceResults.swaps.push({
    swapIndex: 2,
    amountInSol: 0.005,
    txSignature: swap2Sig,
    explorer: `https://explorer.solana.com/tx/${swap2Sig}?cluster=devnet`,
  });

  const payerBaseAta = getAssociatedTokenAddressSync(baseMintPubkey, payer.publicKey);
  const payerTokenAcct = await getAccount(connection, payerBaseAta);
  const tokenBalanceUi = Number(payerTokenAcct.amount) / 10 ** baseDecimals;
  console.log(`✓ Deployer bTSLA Balance After Swaps: ${tokenBalanceUi.toLocaleString()} bTSLA`);
  evidenceResults.traderBalanceAfterSwaps = tokenBalanceUi;

  await sleep(2500);

  // =========================================================================
  // STEP 6: Wire the DBC Token into TwilightBook!
  // =========================================================================
  console.log("\n[STEP 5] Wiring DBC-Launched Token (bTSLA) into TwilightBook...");
  const devnetQuoteMint = new PublicKey("Ba7J5A5jCViRSKk1UPfZZthz3sEBdEQBydh4a6ibJjA"); // Devnet USDC

  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const twilightProgram = new Program(idl, provider);

  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), baseMintPubkey.toBuffer(), devnetQuoteMint.toBuffer()],
    TWILIGHT_PROGRAM_ID
  );
  const [vaultBase] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_base"), marketPda.toBuffer()],
    TWILIGHT_PROGRAM_ID
  );
  const [vaultQuote] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_quote"), marketPda.toBuffer()],
    TWILIGHT_PROGRAM_ID
  );
  const [mockOraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mock_oracle"), baseMintPubkey.toBuffer(), devnetQuoteMint.toBuffer()],
    TWILIGHT_PROGRAM_ID
  );

  console.log(`Twilight Market PDA:      ${marketPda.toBase58()}`);
  console.log(`Twilight Base Vault PDA:  ${vaultBase.toBase58()}`);
  console.log(`Twilight Quote Vault PDA: ${vaultQuote.toBase58()}`);
  console.log(`Twilight Pyth Feed PDA:   ${mockOraclePda.toBase58()}`);

  const maxConfBps = new BN(200);         // 2.00%
  const epochDurationSlots = new BN(120); // 120 slots
  const confFilterMult = new BN(2);       // k = 2

  const initMarketSig = await twilightProgram.methods
    .initializeMarket(maxConfBps, epochDurationSlots, confFilterMult)
    .accounts({
      authority: payer.publicKey,
      market: marketPda,
      baseMint: baseMintPubkey,
      quoteMint: devnetQuoteMint,
      vaultBase,
      vaultQuote,
      pythFeed: mockOraclePda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log(`✓ TwilightBook Market Initialized! Signature: ${initMarketSig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${initMarketSig}?cluster=devnet`);

  await sleep(1500);

  // Initialize Mock Pyth Oracle for this market: price=$214.50, conf=$0.20
  console.log("Setting Pyth reference price for (bTSLA / USDC) on Devnet...");
  const priceBn = new BN(214_500_000); // $214.50 (6 decimals)
  const confBn = new BN(200_000);      // ±$0.20 (9.3 bps)
  const expo = -6;
  const status = 1; // Trading
  const publishTime = new BN(Math.floor(Date.now() / 1000));

  const oracleSig = await twilightProgram.methods
    .setMockOracle(priceBn, confBn, expo, status, publishTime)
    .accounts({
      payer: payer.publicKey,
      baseMint: baseMintPubkey,
      quoteMint: devnetQuoteMint,
      mockOracle: mockOraclePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`✓ Pyth Oracle Reference Initialized! Signature: ${oracleSig}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${oracleSig}?cluster=devnet`);

  evidenceResults.twilightMarket = {
    marketPda: marketPda.toBase58(),
    baseMint: baseMintPubkey.toBase58(),
    quoteMint: devnetQuoteMint.toBase58(),
    vaultBase: vaultBase.toBase58(),
    vaultQuote: vaultQuote.toBase58(),
    pythFeed: mockOraclePda.toBase58(),
    initTxSignature: initMarketSig,
    initExplorer: `https://explorer.solana.com/tx/${initMarketSig}?cluster=devnet`,
    oracleTxSignature: oracleSig,
    oracleExplorer: `https://explorer.solana.com/tx/${oracleSig}?cluster=devnet`,
  };

  // Save evidence to file
  const evidenceOutPath = path.resolve(__dirname, "../evidence_dbc_launch.json");
  fs.writeFileSync(evidenceOutPath, JSON.stringify(evidenceResults, null, 2));
  console.log(`\n✓ Evidence successfully saved to ${evidenceOutPath}`);

  console.log("\n======================================================================");
  console.log("  METEORA DBC -> TWILIGHTBOOK PIPELINE COMPLETED SUCCESSFULLY!");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error("\n❌ Pipeline Execution Failed:", err);
  process.exit(1);
});
