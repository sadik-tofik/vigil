import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { TwilightBook } from "../target/types/twilight_book";
import {
  createKeeperState,
  runKeeperCycle,
  getKeeperConfigFromEnv,
} from "../keeper/index";
import { findEpochBatchPda } from "../keeper/registry";

async function main() {
  const config = getKeeperConfigFromEnv();
  console.log(`[VERIFY] Starting Keeper Live Devnet Verification...`);
  console.log(`[VERIFY] RPC URL:    ${config.rpcUrl}`);
  console.log(`[VERIFY] Keypair:    ${config.keypairPath}`);

  const secretKey = JSON.parse(fs.readFileSync(config.keypairPath!, "utf-8"));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`[VERIFY] Keeper Fee Payer: ${payer.publicKey.toBase58()}`);

  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.resolve(__dirname, "../target/idl/twilight_book.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program<TwilightBook>(idl as anchor.Idl, provider);

  const state = createKeeperState();

  console.log(`\n=================== CYCLE 1: STARTUP & DISCOVERY ===================`);
  const cycle1 = await runKeeperCycle(program, state, config);
  console.log(`Cycle 1 completed. Markets serviced: ${cycle1.marketsServiced}`);
  console.log(`Results:`, JSON.stringify(cycle1.results, null, 2));

  // Find the tracked market
  const marketPubkey = state.registryMarkets[0];
  console.log(`\nTracked Market: ${marketPubkey.toBase58()}`);

  // Fetch epoch 0 batch to see end_slot
  const [epoch0Pda] = findEpochBatchPda(marketPubkey, 0, program.programId);
  const batch0 = await program.account.epochBatchState.fetch(epoch0Pda);
  console.log(`Epoch 0 Batch PDA: ${epoch0Pda.toBase58()}`);
  console.log(`Epoch 0 start_slot: ${batch0.startSlot.toString()}`);
  console.log(`Epoch 0 end_slot:   ${batch0.endSlot.toString()}`);

  let currentSlot = await connection.getSlot("confirmed");
  console.log(`Current devnet slot: ${currentSlot}`);

  if (currentSlot < batch0.endSlot.toNumber()) {
    const slotsRemaining = batch0.endSlot.toNumber() - currentSlot;
    const waitSec = Math.ceil((slotsRemaining * 450) / 1000) + 2;
    console.log(
      `Waiting ${waitSec}s (${slotsRemaining} slots) for devnet to advance past end_slot (${batch0.endSlot.toString()})...`
    );
    await new Promise((r) => setTimeout(r, waitSec * 1000));
  }

  currentSlot = await connection.getSlot("confirmed");
  console.log(`Slot after wait: ${currentSlot} (Target: >= ${batch0.endSlot.toString()})`);

  console.log(`\n=================== CYCLE 2: SETTLEMENT & ROLLOVER ===================`);
  const cycle2 = await runKeeperCycle(program, state, config);
  console.log(`Cycle 2 completed. Markets serviced: ${cycle2.marketsServiced}`);
  console.log(`Results:`, JSON.stringify(cycle2.results, null, 2));

  // Verify on-chain rollover
  const marketAfter = await program.account.market.fetch(marketPubkey);
  console.log(`\n--- ON-CHAIN VERIFICATION ---`);
  console.log(`Market current_epoch: ${marketAfter.currentEpoch.toString()}`);

  const [epoch1Pda] = findEpochBatchPda(marketPubkey, 1, program.programId);
  const batch1 = await program.account.epochBatchState.fetch(epoch1Pda);
  console.log(`Epoch 1 Batch PDA: ${epoch1Pda.toBase58()}`);
  console.log(`Epoch 1 status:    ${JSON.stringify(batch1.status)}`);
  console.log(`Epoch 1 start_slot: ${batch1.startSlot.toString()}`);
  console.log(`Epoch 1 end_slot:   ${batch1.endSlot.toString()}`);

  if (marketAfter.currentEpoch.toNumber() >= 1) {
    console.log(`\n🎉 SUCCESS: Keeper successfully evaluated market mode and settled batch auction on devnet!`);
  } else {
    throw new Error(`Failed: Market current_epoch was expected to be >= 1`);
  }
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
