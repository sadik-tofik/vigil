# @vigil-protocol/sdk

Official TypeScript client SDK for **Vigil**, the discrete batch-auction and adaptive circuit-breaker protocol on Solana.

This package enables external protocols, frontends, market makers, and aggregators to query and trade on Vigil markets with zero manual PDA derivation or Anchor boilerplate.

---

## Installation

```bash
npm install @vigil-protocol/sdk @coral-xyz/anchor @solana/web3.js @solana/spl-token bn.js
```

---

## Quickstart

### 1. Initialize the Client

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { VigilClient } from "@vigil-protocol/sdk";
import * as fs from "fs";

// 1. Connect to cluster (Devnet / Mainnet)
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// 2. Load wallet / signer
const secretKey = JSON.parse(fs.readFileSync("~/.config/solana/id.json", "utf-8"));
const wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));

// 3. Instantiate VigilClient (all PDA seed schemes are abstracted internally)
const client = new VigilClient(connection, wallet);
```

---

### 2. Discover & Inspect Markets

```typescript
// Query the on-chain Registry PDA to discover all active markets
const marketAddresses = await client.listMarkets();
console.log(`Discovered ${marketAddresses.length} market(s):`);

const marketPubkey = marketAddresses[0];

// Fetch strongly-typed Market state
const market = await client.getMarket(marketPubkey);
console.log(`Base Mint:     ${market.baseMint.toBase58()}`);
console.log(`Quote Mint:    ${market.quoteMint.toBase58()}`);
console.log(`Current Mode:  ${market.mode}`); // "Continuous" | "BatchAuction"
console.log(`Current Epoch: ${market.currentEpoch.toString()}`);

// Fetch current active epoch batch
const batch = await client.getCurrentEpochBatch(marketPubkey);
console.log(`Batch Status:  ${batch.status}`); // "AcceptingOrders" | "Frozen" | "Settled"
console.log(`End Slot:      ${batch.endSlot.toString()}`);
console.log(`Total Orders:  ${batch.orderCount}`);
```

---

### 3. Place a Batch Limit Order

All PDA vaults (`vault_base`, `vault_quote`), user Associated Token Accounts, and oracle feeds are derived automatically.

```typescript
// Place a Bid for 10 shares of base asset at $214.50 limit price
// (6 decimals fixed point: 10 shares = 10_000_000 lots, $214.50 = 214_500_000)
const placeTx = await client.placeBatchOrder(
  marketPubkey,
  "bid",         // "bid" (buy) or "ask" (sell)
  10_000_000,    // lot size (base token units)
  214_500_000    // limit price (6-decimal fixed-point)
);

console.log("Order submitted in transaction:", placeTx);
```

---

### 4. Check Order Status

```typescript
// Inspect orders in the active batch
const currentBatch = await client.getCurrentEpochBatch(marketPubkey);

currentBatch.orders.forEach((order, index) => {
  if (order.user.equals(wallet.publicKey)) {
    console.log(`Order #${index}:`);
    console.log(`  Side:        ${order.side}`);
    console.log(`  Lots:        ${order.lotSize.toString()}`);
    console.log(`  Limit Price: $${order.limitPrice.toNumber() / 1e6}`);
    console.log(`  Filled Lots: ${order.filledLotSize.toString()}`);
    console.log(`  Claimed:     ${order.claimed}`);
  }
});
```

---

### 5. Cancel an Order (Before Terminal Freeze Window)

```typescript
// Cancel order at index 0 before the anti-sniping freeze window
const cancelTx = await client.cancelBatchOrder(marketPubkey, 0);
console.log("Order cancelled in transaction:", cancelTx);
```

---

### 6. Claim Proceeds & Refunds After Settlement

Once the epoch batch status is `Settled` or `Voided`, participants claim their filled tokens and price-improvement surpluses:

```typescript
// Claim proceeds for order at index 0
const claimTx = await client.claimOrderProceeds(marketPubkey, 0);
console.log("Proceeds claimed in transaction:", claimTx);
```

---

## Advanced: Permissionless Cranker Instructions

The SDK also exposes the permissionless crank methods used by off-chain keepers:

```typescript
// 1. Re-evaluate Pyth oracle and toggle Continuous <-> BatchAuction mode
await client.evaluateMarketMode(marketPubkey);

// 2. Clear batch auction and roll market state to Epoch N + 1
await client.settleBatchAuction(marketPubkey);
```

---

## Exported TypeScript Types

The SDK exports clean, strongly-typed representations of all on-chain structs:

- `Market`: Deserialized on-chain market configuration, current epoch, and mode.
- `EpochBatchState`: Active discrete auction queue, volume counters, and clearing price.
- `BatchOrder`: Individual order record containing lot size, limit price, filled amount, and claim status.
- `OrderSide`: `"bid"` | `"ask"`.
- `MarketMode`: `"Continuous"` | `"BatchAuction"`.
- `BatchStatus`: `"AcceptingOrders"` | `"Frozen"` | `"Settled"` | `"Voided"`.
- `AssetClass`: `"TokenizedEquity"` | `"RWA"` | `"EmergingMarketFX"` | `"EventContingent"`.

---

## Canonical PDA Seed Scheme

For low-level integrations, canonical PDA derivation utilities are exported:

```typescript
import {
  findRegistryPda,
  findMarketPda,
  findVaultBasePda,
  findVaultQuotePda,
  findEpochBatchPda,
} from "@vigil-protocol/sdk";

const [registryPda]   = findRegistryPda(programId);
const [marketPda]     = findMarketPda(baseMint, quoteMint, programId);
const [vaultBasePda]  = findVaultBasePda(marketPda, programId);
const [vaultQuotePda] = findVaultQuotePda(marketPda, programId);
const [epochBatchPda] = findEpochBatchPda(marketPda, epochId, programId);
```
