import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { TwilightBook } from "../target/types/twilight_book";
import {
  findRegistryPda,
  findMarketPda,
  findVaultBasePda,
  findVaultQuotePda,
  findEpochBatchPda,
} from "../keeper/registry";

async function main() {
  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  console.log(`[SETUP-M2] Connecting to ${rpcUrl}...`);

  const keypairPath = path.resolve(
    process.env.HOME || "~",
    ".config/solana/id.json"
  );
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`[SETUP-M2] Payer: ${payer.publicKey.toBase58()}`);

  const connection = new Connection(rpcUrl, "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`[SETUP-M2] Payer balance: ${balance / 1e9} SOL`);

  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.resolve(__dirname, "../target/idl/twilight_book.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program<TwilightBook>(idl as anchor.Idl, provider);
  console.log(`[SETUP-M2] Program ID: ${program.programId.toBase58()}`);

  // Create new unique mints for base (RWA: Generic Test Mint) and quote (USDC)
  console.log(`[SETUP-M2] Creating SPL base (RWA Test Token) & quote mints...`);
  const baseMint = await createMint(connection, payer, payer.publicKey, null, 6);
  const quoteMint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log(`[SETUP-M2] Base Mint (RWA): ${baseMint.toBase58()}`);
  console.log(`[SETUP-M2] Quote Mint (USDC): ${quoteMint.toBase58()}`);

  // PDAs
  const [marketPda] = findMarketPda(baseMint, quoteMint, program.programId);
  const [vaultBasePda] = findVaultBasePda(marketPda, program.programId);
  const [vaultQuotePda] = findVaultQuotePda(marketPda, program.programId);
  const [registryPda] = findRegistryPda(program.programId);

  const [mockOraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mock_oracle"), baseMint.toBuffer(), quoteMint.toBuffer()],
    program.programId
  );

  console.log(`[SETUP-M2] Market 2 PDA:      ${marketPda.toBase58()}`);
  console.log(`[SETUP-M2] Mock Oracle PDA:   ${mockOraclePda.toBase58()}`);
  console.log(`[SETUP-M2] Registry PDA:      ${registryPda.toBase58()}`);

  // 1. Initialize Mock Oracle (Price: $102.50, Conf: $1.50, Halted to activate BatchAuction)
  console.log(`[SETUP-M2] Initializing mock oracle...`);
  const now = Math.floor(Date.now() / 1000);
  const oracleTx = await program.methods
    .setMockOracle(
      new BN(102_500_000), // $102.50
      new BN(1_500_000),   // $1.50
      -6,
      2,                   // Status: 2 = Halted (triggers BatchAuction)
      new BN(now)
    )
    .accounts({
      payer: payer.publicKey,
      baseMint: baseMint,
      quoteMint: quoteMint,
      mockOracle: mockOraclePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`[SETUP-M2] Mock oracle tx: ${oracleTx}`);

  // 2. Initialize Market with Registry as AssetClass::RWA
  const epochDurationSlots = new BN(25);
  const maxConfBps = new BN(200);
  const confFilterMult = new BN(2);

  console.log(`[SETUP-M2] Initializing Market 2 (RWA) in Registry...`);
  const initTx = await (program.methods as any)
    .initializeMarketWithAssetClass(
      maxConfBps,
      epochDurationSlots,
      confFilterMult,
      { rwa: {} }
    )
    .accounts({
      authority: payer.publicKey,
      market: marketPda,
      baseMint: baseMint,
      quoteMint: quoteMint,
      vaultBase: vaultBasePda,
      vaultQuote: vaultQuotePda,
      pythFeed: mockOraclePda,
      registry: registryPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log(`[SETUP-M2] Market 2 initialized! Tx: ${initTx}`);

  // 3. Evaluate market mode to lazily initialize Epoch 0
  const [epoch0Pda] = findEpochBatchPda(marketPda, 0, program.programId);
  console.log(`[SETUP-M2] Evaluating market mode to boot Epoch 0 (${epoch0Pda.toBase58()})...`);
  const evalTx = await program.methods
    .evaluateMarketMode()
    .accounts({
      market: marketPda,
      pythFeed: mockOraclePda,
      epochBatch: epoch0Pda,
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`[SETUP-M2] EvaluateMarketMode tx: ${evalTx}`);

  // 4. Confirm Registry contains both markets
  const registryAccount = await (program.account as any).registry.fetch(registryPda);
  console.log(
    `[SETUP-M2] Registry now contains ${registryAccount.markets.length} market(s):`
  );
  for (let i = 0; i < registryAccount.markets.length; i++) {
    const m = registryAccount.markets[i];
    const mState = await (program.account as any).market.fetch(m);
    console.log(`  Market ${i + 1}: ${m.toBase58()} | AssetClass: ${JSON.stringify(mState.assetClass)} | Epoch: ${mState.currentEpoch.toString()}`);
  }

  console.log(`[SETUP-M2] Market 2 (RWA) is live on Devnet!`);
}

main().catch((err) => {
  console.error("Setup Market 2 failed:", err);
  process.exit(1);
});
