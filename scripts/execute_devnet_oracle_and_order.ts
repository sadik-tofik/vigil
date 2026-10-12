import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Import Vigil SDK and IDL
import idl from '../app/src/lib/vigil.json';

const PROGRAM_ID = new PublicKey('J67mmCdpb4NiMRPEF59JupqHpo3BLbk5Cr82qvGff8iX');
const MARKET_1_PDA = new PublicKey('5mYPKECACVSUpKjLe3snsCUgGaETJbCfb3gGZz5V1nLG');

async function main() {
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  console.log(`[VIGIL-DEVNET] Connecting to ${rpcUrl}...`);
  const connection = new Connection(rpcUrl, 'confirmed');

  // 1. Load payer
  const keyPath = path.resolve(process.env.HOME || '/home/sadik', '.config/solana/id.json');
  const secretKey = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`[VIGIL-DEVNET] Payer: ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`[VIGIL-DEVNET] SOL Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl as any, provider);

  // 2. Fetch Market 1
  const market = await (program.account as any).market.fetch(MARKET_1_PDA);
  console.log(`[VIGIL-DEVNET] Market 1 Current Epoch: ${market.currentEpoch.toString()}`);
  console.log(`[VIGIL-DEVNET] Base Mint: ${market.baseMint.toBase58()}`);
  console.log(`[VIGIL-DEVNET] Quote Mint: ${market.quoteMint.toBase58()}`);
  console.log(`[VIGIL-DEVNET] Pyth Feed: ${market.pythFeed.toBase58()}`);

  // 3. Update Mock Oracle on-chain to Sprint 3 Verified Band:
  // P_ref = $214.50 (214_500_000), conf = $0.20 (200_000), expo = -6, status = 1 (Trading), k = 2 -> [$214.10, $214.90]
  console.log('\n--- STEP 1: Updating On-Chain Pyth Oracle Feed to $214.50 ± $0.20 ---');
  const now = Math.floor(Date.now() / 1000);
  const oracleTx = await program.methods
    .setMockOracle(
      new BN(214_500_000), // $214.50
      new BN(200_000),     // $0.20
      -6,                  // expo
      1,                   // status: 1 = Trading
      new BN(now)          // publish_time
    )
    .accounts({
      payer: payer.publicKey,
      baseMint: market.baseMint,
      quoteMint: market.quoteMint,
      mockOracle: market.pythFeed,
      systemProgram: PublicKey.default,
    })
    .rpc();
  console.log(`[VIGIL-DEVNET] setMockOracle Tx Signature: ${oracleTx}`);
  await connection.confirmTransaction(oracleTx, 'confirmed');

  // Verify updated oracle account data
  const oracleInfo = await connection.getAccountInfo(market.pythFeed);
  if (oracleInfo) {
    const view = new DataView(oracleInfo.data.buffer, oracleInfo.data.byteOffset, oracleInfo.data.byteLength);
    const expo = view.getInt32(20, true);
    const priceRaw = view.getBigInt64(208, true);
    const confRaw = view.getBigUint64(216, true);
    const status = view.getUint32(224, true);
    const factor = Math.pow(10, Math.abs(expo));
    const price = Number(priceRaw) / factor;
    const conf = Number(confRaw) / factor;
    console.log(`[VIGIL-DEVNET] Verified On-Chain Oracle: Price=$${price.toFixed(2)}, Conf=$${conf.toFixed(2)}, Status=${status}`);
    console.log(`[VIGIL-DEVNET] Verified Confidence Band [P_ref ± 2*conf]: [$${(price - 2 * conf).toFixed(2)}, $${(price + 2 * conf).toFixed(2)}]`);
  }

  // 4. Ensure payer has base & quote ATAs and sufficient funds
  console.log('\n--- STEP 2: Ensuring User Token Accounts & Minting Escrow Collateral ---');
  const userBaseAta = getAssociatedTokenAddressSync(market.baseMint, payer.publicKey);
  const userQuoteAta = getAssociatedTokenAddressSync(market.quoteMint, payer.publicKey);

  const setupTx = new (await import('@solana/web3.js')).Transaction();
  setupTx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      userBaseAta,
      payer.publicKey,
      market.baseMint
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      userQuoteAta,
      payer.publicKey,
      market.quoteMint
    ),
    // Mint 100 tTSLA base lots (100_000_000 atomic) & 50,000 USDC quote (50_000_000_000 atomic)
    createMintToInstruction(
      market.baseMint,
      userBaseAta,
      payer.publicKey,
      100_000_000
    ),
    createMintToInstruction(
      market.quoteMint,
      userQuoteAta,
      payer.publicKey,
      50_000_000_000
    )
  );
  const setupSig = await provider.sendAndConfirm(setupTx);
  console.log(`[VIGIL-DEVNET] Token Accounts Setup & Mint Tx: ${setupSig}`);

  const quoteAcct = await getAccount(connection, userQuoteAta);
  console.log(`[VIGIL-DEVNET] User Quote ATA USDC Balance: ${Number(quoteAcct.amount) / 1e6} USDC`);

  // 5. Place real unscripted batch limit order
  console.log('\n--- STEP 3: Placing Real On-Chain Batch Limit Order (Bid 5 lots @ $214.60) ---');
  let currentEpoch = market.currentEpoch.toNumber();
  let [epochBatchPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('batch'),
      MARKET_1_PDA.toBuffer(),
      new BN(currentEpoch).toArrayLike(Buffer, 'le', 8),
    ],
    PROGRAM_ID
  );
  let [nextEpochBatchPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('batch'),
      MARKET_1_PDA.toBuffer(),
      new BN(currentEpoch + 1).toArrayLike(Buffer, 'le', 8),
    ],
    PROGRAM_ID
  );

  const curSlot = await connection.getSlot('confirmed');
  const batchState = await (program.account as any).epochBatchState.fetch(epochBatchPda);
  console.log(`[VIGIL-DEVNET] Current Slot: ${curSlot}, Epoch #${currentEpoch} End Slot: ${batchState.endSlot.toString()}`);

  if (curSlot >= batchState.endSlot.toNumber() - 10) {
    console.log(`[VIGIL-DEVNET] Epoch #${currentEpoch} is past/in freeze window. Cranking settlement to roll to Epoch #${currentEpoch + 1}...`);
    const settleTx = await program.methods
      .settleBatchAuction()
      .accounts({
        keeper: payer.publicKey,
        market: MARKET_1_PDA,
        epochBatch: epochBatchPda,
        nextEpochBatch: nextEpochBatchPda,
        pythFeed: market.pythFeed,
        systemProgram: PublicKey.default,
      })
      .rpc();
    console.log(`[VIGIL-DEVNET] Settle Tx Signature: ${settleTx}`);
    await connection.confirmTransaction(settleTx, 'confirmed');

    currentEpoch = currentEpoch + 1;
    epochBatchPda = nextEpochBatchPda;
  }

  console.log(`[VIGIL-DEVNET] Submitting Order to Active Epoch #${currentEpoch} (Batch PDA: ${epochBatchPda.toBase58()})...`);

  const orderTx = await program.methods
    .placeBatchOrder(
      { bid: {} },             // side: OrderSide::Bid
      new BN(5_000_000),       // lot_size: 5 lots
      new BN(214_600_000)      // limit_price: $214.60
    )
    .accounts({
      user: payer.publicKey,
      market: MARKET_1_PDA,
      epochBatch: epochBatchPda,
      pythFeed: market.pythFeed,
      vaultBase: market.vaultBase,
      vaultQuote: market.vaultQuote,
      userBaseAta,
      userQuoteAta,
      baseMint: market.baseMint,
      quoteMint: market.quoteMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log('\n================================================================');
  console.log('REAL DEVNET ON-CHAIN TRANSACTION SIGNATURE:');
  console.log(orderTx);
  console.log(`Solana Explorer: https://explorer.solana.com/tx/${orderTx}?cluster=devnet`);
  console.log('================================================================\n');

  // Verify batch ring buffer state on-chain
  const finalBatchState = await (program.account as any).epochBatchState.fetch(epochBatchPda);
  console.log(`[VIGIL-DEVNET] On-Chain Batch Order Count: ${finalBatchState.orderCount}`);
  console.log(`[VIGIL-DEVNET] Total Bid Volume: ${finalBatchState.totalBidVolume.toNumber() / 1e6} USDC`);
  console.log(`[VIGIL-DEVNET] Batch Status: ${JSON.stringify(finalBatchState.status)}`);
  const lastOrder = finalBatchState.orders[finalBatchState.orderCount - 1];
  console.log(`[VIGIL-DEVNET] Placed Order Details:`, {
    user: lastOrder.user.toBase58(),
    side: lastOrder.side,
    lotSize: (lastOrder.lotSize.toNumber() / 1e6).toFixed(2),
    limitPrice: (lastOrder.limitPrice.toNumber() / 1e6).toFixed(2),
  });
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
