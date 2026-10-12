import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { VigilClient } from '../packages/vigil-sdk/src';
import * as fs from 'fs';
import * as path from 'path';

async function runLiveInteraction() {
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  console.log(`[DEMO-DEVNET] Connecting to ${rpcUrl}...`);
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load fee payer / authority keypair
  const keyPath = path.resolve(process.env.HOME || '~', '.config/solana/id.json');
  const secretKey = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`[DEMO-DEVNET] Payer: ${payer.publicKey.toBase58()}`);

  const client = new VigilClient(connection, payer);

  // Market 1: Tesla Tokenized Equity
  const marketPubkey = new PublicKey('5mYPKECACVSUpKjLe3snsCUgGaETJbCfb3gGZz5V1nLG');
  const market = await client.getMarket(marketPubkey);
  console.log(`[DEMO-DEVNET] Market 1: ${marketPubkey.toBase58()}, AssetClass: ${market.assetClass}, CurrentEpoch: ${market.currentEpoch.toString()}`);

  // Current batch
  const currentBatch = await client.getCurrentEpochBatch(marketPubkey);
  console.log(`[DEMO-DEVNET] Epoch #${currentBatch.epochId.toString()}, Status: ${currentBatch.status}, Orders: ${currentBatch.orderCount}`);

  // 1. Ensure user has SPL base & quote tokens via devnet faucet API
  console.log(`[DEMO-DEVNET] Funding token accounts via faucet API...`);
  const faucetRes = await fetch('http://localhost:3000/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: payer.publicKey.toBase58(),
      baseMint: market.baseMint.toBase58(),
      quoteMint: market.quoteMint.toBase58(),
    }),
  });
  const faucetData = await faucetRes.json();
  console.log(`[DEMO-DEVNET] Faucet signature:`, faucetData.signature);

  // 2. Place crossed orders: 1 BID (buy 10 lots @ $214.80) & 1 ASK (sell 10 lots @ $214.20)
  console.log(`[DEMO-DEVNET] Placing BID: 10 lots @ $214.80...`);
  const bidSig = await client.placeBatchOrder(
    marketPubkey,
    'bid',
    10_000_000,   // 10 lots (with 6 decimals)
    214_800_000   // $214.80 (with 6 decimals)
  );
  console.log(`[DEMO-DEVNET] BID placed on-chain! Tx: https://explorer.solana.com/tx/${bidSig}?cluster=devnet`);

  console.log(`[DEMO-DEVNET] Placing ASK: 10 lots @ $214.20...`);
  const askSig = await client.placeBatchOrder(
    marketPubkey,
    'ask',
    10_000_000,   // 10 lots (with 6 decimals)
    214_200_000   // $214.20 (with 6 decimals)
  );
  console.log(`[DEMO-DEVNET] ASK placed on-chain! Tx: https://explorer.solana.com/tx/${askSig}?cluster=devnet`);

  // Verify batch state after order placement
  const updatedBatch = await client.getCurrentEpochBatch(marketPubkey);
  console.log(`[DEMO-DEVNET] Batch now has ${updatedBatch.orderCount} active orders in ring buffer!`);
  for (let i = 0; i < updatedBatch.orders.length; i++) {
    const o = updatedBatch.orders[i];
    console.log(`  Order #${i}: ${o.side.toUpperCase()} ${o.lotSize.toNumber() / 1e6} shares @ $${(o.limitPrice.toNumber() / 1e6).toFixed(2)} [User: ${o.user.toBase58().slice(0, 4)}...]`);
  }

  // 3. Wait for Keeper bot (task-753) to settle the batch auction
  console.log(`[DEMO-DEVNET] Waiting for keeper bot to crank settlement once end_slot passes...`);
  let settled = false;
  let attempts = 0;
  const targetEpoch = market.currentEpoch;

  while (!settled && attempts < 15) {
    await new Promise((r) => setTimeout(r, 4000));
    attempts++;
    const slot = await connection.getSlot('confirmed');
    const b = await client.getEpochBatch(marketPubkey, targetEpoch);
    console.log(`  [Attempt ${attempts}] Slot: ${slot}, EndSlot: ${b.endSlot.toString()}, Status: ${b.status}, ClearingPrice: $${(b.clearingPrice.toNumber() / 1e6).toFixed(2)}, MatchedVolume: ${b.matchedVolume.toNumber() / 1e6} shares`);
    if (b.status === 'Settled' || b.status === 'Voided') {
      settled = true;
      console.log(`[DEMO-DEVNET] SUCCESS: Epoch #${targetEpoch.toString()} SETTLED on Devnet!`);
      console.log(`  Uniform Clearing Price P*: $${(b.clearingPrice.toNumber() / 1e6).toFixed(2)}`);
      console.log(`  Matched Volume Q*:         ${b.matchedVolume.toNumber() / 1e6} shares`);

      // 4. Claim proceeds for filled orders
      for (let i = 0; i < b.orders.length; i++) {
        const order = b.orders[i];
        if (!order.claimed && order.filledLotSize.gtn(0)) {
          console.log(`[DEMO-DEVNET] Claiming proceeds for order #${i}...`);
          const claimSig = await client.claimOrderProceeds(marketPubkey, i, { epochId: targetEpoch });
          console.log(`[DEMO-DEVNET] Order #${i} claimed! Tx: https://explorer.solana.com/tx/${claimSig}?cluster=devnet`);
        }
      }
      break;
    }
  }

  console.log(`[DEMO-DEVNET] Live interaction complete!`);
}

runLiveInteraction().catch(console.error);
