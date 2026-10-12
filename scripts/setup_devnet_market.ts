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
} from "../keeper/registry";

async function main() {
  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  console.log(`[SETUP] Connecting to ${rpcUrl}...`);

  const keypairPath = path.resolve(
    process.env.HOME || "~",
    ".config/solana/id.json"
  );
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`[SETUP] Payer: ${payer.publicKey.toBase58()}`);

  const connection = new Connection(rpcUrl, "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`[SETUP] Payer balance: ${balance / 1e9} SOL`);

  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.resolve(__dirname, "../target/idl/twilight_book.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program<TwilightBook>(idl as anchor.Idl, provider);
  console.log(`[SETUP] Program ID: ${program.programId.toBase58()}`);

  // Create new unique mints for base and quote
  console.log(`[SETUP] Creating SPL base & quote mints...`);
  const baseMint = await createMint(connection, payer, payer.publicKey, null, 6);
  const quoteMint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log(`[SETUP] Base Mint:  ${baseMint.toBase58()}`);
  console.log(`[SETUP] Quote Mint: ${quoteMint.toBase58()}`);

  // PDAs
  const [marketPda] = findMarketPda(baseMint, quoteMint, program.programId);
  const [vaultBasePda] = findVaultBasePda(marketPda, program.programId);
  const [vaultQuotePda] = findVaultQuotePda(marketPda, program.programId);
  const [registryPda] = findRegistryPda(program.programId);

  const [mockOraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mock_oracle"), baseMint.toBuffer(), quoteMint.toBuffer()],
    program.programId
  );

  console.log(`[SETUP] Market PDA:      ${marketPda.toBase58()}`);
  console.log(`[SETUP] Mock Oracle PDA: ${mockOraclePda.toBase58()}`);
  console.log(`[SETUP] Registry PDA:    ${registryPda.toBase58()}`);

  // 1. Initialize Mock Oracle (Price: $214.50, Conf: $0.20, Halted to force BatchAuction; Band: [$214.10, $214.90])
  console.log(`[SETUP] Initializing mock oracle...`);
  const now = Math.floor(Date.now() / 1000);
  const oracleTx = await program.methods
    .setMockOracle(
      new BN(214_500_000), // $214.50
      new BN(200_000),     // $0.20 (k=2 gives confidence band [$214.10, $214.90])
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
  console.log(`[SETUP] Mock oracle tx: ${oracleTx}`);

  // 2. Initialize Market with Registry
  // Short epoch duration of 20 slots (~8s on devnet) so settlement can be cranked quickly!
  const epochDurationSlots = new BN(20);
  const maxConfBps = new BN(200);
  const confFilterMult = new BN(2);

  console.log(`[SETUP] Initializing Market in Registry...`);
  const initTx = await (program.methods as any)
    .initializeMarketWithAssetClass(
      maxConfBps,
      epochDurationSlots,
      confFilterMult,
      { tokenizedEquity: {} }
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

  console.log(`[SETUP] Market initialized! Tx: ${initTx}`);

  // 3. Confirm Registry contains this market
  const registryAccount = await (program.account as any).registry.fetch(registryPda);
  console.log(
    `[SETUP] Registry now contains ${registryAccount.markets.length} market(s):`
  );
  for (const m of registryAccount.markets) {
    console.log(`  - ${m.toBase58()}`);
  }

  console.log(`[SETUP] Done! Market is live and registered in on-chain Registry.`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
