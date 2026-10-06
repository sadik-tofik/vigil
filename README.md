# TwilightBook

Tokenized stocks trade 24/7 — the market they track doesn't. TwilightBook switches between continuous swaps and Pyth-bounded batch auctions the instant the oracle can't be trusted.

---

## Deployments & Verification Links

- **Live Application**: [https://twilight-book.vercel.app](https://twilight-book.vercel.app) (Trading Cockpit: [/app](https://twilight-book.vercel.app/app))
- **Interactive Documentation**: [https://twilight-book.vercel.app/docs](https://twilight-book.vercel.app/docs)
- **Devnet Program (Solana Explorer)**: [`HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h`](https://explorer.solana.com/address/HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h?cluster=devnet)
- **Formal Verification & Evidence**: [`EVIDENCE.md`](./EVIDENCE.md)
- **Security Audit Report**: [`AUDIT.md`](./AUDIT.md)
- **Live Judging Walkthrough Script**: [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md)

---

## Overview

Traditional financial markets operate roughly 39.5 hours per week (Monday through Friday, 9:30 AM to 4:00 PM ET). The remaining 128.5 hours—evenings, weekends, and market holidays—are dark. When earnings reports leak, macroeconomic data breaks, or geopolitical events occur during these off-hours, continuous automated market makers (AMMs) and central limit order books (CLOBs) on public blockchains suffer severe adverse selection. Latency arbitrageurs and MEV bots pick off passive liquidity orders against stale off-chain prices before regular market participants can cancel or reposition.

TwilightBook resolves this structural failure by deploying an adaptive on-chain state machine powered by Pyth Network. Instead of treating the oracle as an informational display or a one-off liquidation trigger, TwilightBook treats Pyth's aggregate confidence interval ($\sigma$) as an active circuit breaker. When market volatility widens the confidence interval beyond a parameterized threshold ($\sigma / P_{\text{ref}} \ge \text{max\_conf\_bps}$, e.g. 200 bps), or when Pyth flags `Status::Halted` or stale reporting ($>60\text{s}$), the protocol immediately suspends continuous trading and diverts flow into a discrete, uniform-price batch auction ("Twilight Mode").

During an auction epoch, incoming orders are admitted only if their limit price falls within a Pyth-anchored confidence envelope ($[P_{\text{ref}} - k\sigma, P_{\text{ref}} + k\sigma]$), filtering out unexecutable and manipulative orders. To prevent last-millisecond front-running, order placement and cancellation are frozen during a terminal slot window. At epoch expiry, all crossed orders execute at a single uniform clearing price ($P^*$) that mathematically maximizes aggregate matched volume ($Q^*$). Multiple maximum-volume clearing prices are resolved by selecting the price closest to Pyth's reference price ($P_{\text{ref}}$). Orders cleared at prices more favorable than their limit receive an automatic cash price-improvement refund upon claim.

This design is uniquely viable on Solana. With sub-second slot times (~400 ms), batch auctions run at discrete 30-second epoch granularities (75 slots), providing frequent clearing cycles without locking trader liquidity in multi-minute queues. In-memory execution allows sorting, cumulative supply-demand evaluation, tie-breaking, and pro-rata fill calculation to settle natively on L1 in a single transaction.

---

## Architecture

```
                  ┌─────────────────────────────────┐
                  │    Pyth Network Oracle Feed     │
                  │    (Price: P_ref, Conf: ±σ)     │
                  └────────────────┬────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   σ / P_ref < 200 bps                       σ / P_ref ≥ 200 bps
   & Status == Trading                       or Status == Halted / Stale
              │                                         │
              ▼                                         ▼
  ┌───────────────────────┐                 ┌───────────────────────┐
  │   Continuous Trading  │                 │ Discrete Batch Auction│
  │   (Normal Market)     │                 │ (Twilight Epochs)     │
  └───────────────────────┘                 └───────────┬───────────┘
                                                        │
                      ┌─────────────────────────────────┼─────────────────────────────────┐
                      ▼                                 ▼                                 ▼
           [Confidence Band Guard]             [Anti-Sniping Freeze]            [Uniform Clearing & Tie-Break]
           Limit ∈ [P_ref ± k*σ]               Slots < end_slot - freeze         Argmin |P* - P_ref|
```

Detailed architectural diagrams and state models are available in the [Documentation Architecture Guide](https://twilight-book.vercel.app/docs/start-here/architecture).

### Core Instructions

- `initialize_market`: Creates the market state account, registers base and quote token mints, binds the Pyth price feed, and initializes base/quote vaults owned exclusively by the Market PDA.
- `evaluate_market_mode`: Permissionless circuit evaluator that decodes the Pyth V2 zero-copy price account on-chain and transitions market state between `Continuous` and `BatchAuction`.
- `place_batch_order` / `cancel_batch_order`: Escrows tokens into the vault and inserts limit bids or asks into the active epoch ring buffer within Pyth confidence bands ($[P_{\text{ref}} \pm k\sigma]$); rejects actions within the anti-sniping freeze window.
- `settle_batch_auction`: Solves the discrete clearing price $P^*$ maximizing matched quantity $Q^*$, executes the Pyth reference tie-break on volume plateaus, calculates pro-rata allocations, and rolls the market forward to epoch $E_{n+1}$.
- `claim_order_proceeds`: Permissionlessly disburses bought base tokens, seller quote proceeds, unfilled order returns, and buyer price-improvement refunds ($P_{\text{limit}} - P^*$) from the escrow vaults.

---

## Verified Results & Empirical Proof

TwilightBook's settlement mechanics, math libraries, and account lifecycles are backed by reproducible on-chain and unit-level verification:

- **26 Passing Tests**: Full test suite (`npm test`) passes across `solana-bankrun` and `anchor-bankrun`, evaluating all 15 protocol invariants, edge cases (void auctions, single-sided liquidity, stale oracles, and freeze constraints) in ~10 seconds.
- **78,229 CU Benchmark**: A fully saturated 32-order batch auction (16 bids and 16 asks) settles on-chain in 78,229 compute units—well within Solana's default 200,000 CU limit (60.9% unused capacity) with no compute budget extension requested.
- **Byte-Identical Hand-Solved Settlement**: A deterministic 4-order cross scenario ($P_{\text{ref}} = \$214.50$, bids at $\$214.80$ & $\$214.50$, asks at $\$214.20$ & $\$214.60$, hand-solved clearing at $P^* = \$214.60, Q^* = 10$, with a $\$2.00$ buyer cash refund) was calculated from first principles and proven byte-identical across Bankrun, local test validator (`scripts/e2e_verify.ts`), and live Solana Devnet.
- **Zero-Leakage Vault Conservation (INV-01 & INV-02)**: Post-settlement and post-claim, base and quote vault balances evaluate to exactly `0.000000` tokens remaining. All escrowed capital is either disbursed to counterparties or refunded to depositors with zero atomic units trapped.

Complete cryptographic proof, account derivations, and transaction signatures are documented in [`EVIDENCE.md`](./EVIDENCE.md) and [`evidence_run.json`](./evidence_run.json).

---

## Bounty Alignment

### Pyth Network: Best Use of Market Data ($5,000+)
Pyth Network is not a peripheral data source in TwilightBook; it functions as the central architectural state machine of the exchange:
1. **Dynamic Circuit Breaker**: The ratio of Pyth's aggregate confidence interval to reference price ($\sigma / P_{\text{ref}}$) drives real-time state transitions between continuous and discrete execution modes.
2. **On-Chain Confidence Envelope**: Pyth's confidence interval actively validates limit prices during order entry ($[P_{\text{ref}} - k\sigma, P_{\text{ref}} + k\sigma]$), rejecting manipulative or off-market submissions at the smart contract boundary.
3. **Reference Tie-Breaking**: When discrete batch matching produces multiple candidate clearing prices that maximize volume, the protocol chooses the candidate price that minimizes $|P^* - P_{\text{ref}}|$, preventing arbitrary price drift.

### Meteora Dynamic Bonding Curve (DBC) Composability
To prove composability with Solana's native capital formation primitives, TwilightBook includes an end-to-end integration with **Meteora Dynamic Bonding Curves** (`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`):
- Pre-market equities and tokenized stock tokens (such as `bTSLA`, mint `oV46RdoFrSLSipxi9FEUVFbnQiY39Zc4s4dXsE2Lrue`) launch friction-free on Meteora DBC against SOL to establish initial bootstrapping liquidity.
- Once trading, TwilightBook provides a paired batch-auction market (`9N5oJRLyQciYuE1yPDtqFgUTMFAecmws1RnxFpE6i1EJ`) against USDC, providing 24/7 off-hours volatility protection and MEV immunization.
- Verified on devnet: curve deployment, multi-swap liquidity seeding, and TwilightBook market initialization are reproducible via `scripts/launch_via_dbc.ts` and logged in [`evidence_dbc_launch.json`](./evidence_dbc_launch.json).

---

## Quick Start

### Prerequisites
- [Rust](https://rustup.rs/) (v1.79+)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (v1.18.17)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (v0.30.1)
- [Node.js](https://nodejs.org/) (v18+)

### 1. Clone & Install
```bash
git clone https://github.com/sadik-tofik/twilight-book.git
cd twilight-book
npm install
```

### 2. Build & Test Smart Contracts
TwilightBook utilizes local patches for `proc-macro2` and `anchor-syn` in `patches/` to ensure deterministic builds under recent Rust releases:
```bash
# Build Anchor program and IDL
anchor build

# Run all 26 Bankrun invariant and clearing tests
npm test
```

### 3. Run Frontend & Docs Locally
The Next.js web application includes both the Trading Cockpit and the Developer Documentation site:
```bash
cd app
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) for the landing page and interactive Cockpit, or [http://localhost:3000/docs](http://localhost:3000/docs) for the documentation site.

### 4. Deploy & Verify on Devnet
To deploy the compiled program to Solana Devnet and execute verification scripts:
```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Run 7-step E2E lifecycle against a local or remote validator
npx ts-node -T scripts/e2e_verify.ts

# Execute the Meteora Dynamic Bonding Curve launch and integration
npx ts-node -T scripts/launch_via_dbc.ts
```

---

## Tech Stack

- **Smart Contract**: Solana L1 / SBF, Anchor 0.30.1, Rust 1.79+, SPL Token 0.4.9
- **Oracle & DeFi Integrations**: `pyth-sdk-solana` (Pyth V2 Price Account zero-copy deserialization), `@meteora-ag/dynamic-bonding-curve-sdk`
- **Testing & Formal Verification**: `solana-bankrun`, `anchor-bankrun`, `@solana/web3.js`, `@coral-xyz/anchor`, `ts-mocha`, `chai`
- **Frontend & Trading Cockpit**: Next.js 15+ (App Router), React 19, Tailwind CSS v4, Lucide React, `@solana/wallet-adapter-react`

---

## Known Limitations

- **Pro-Rata Settlement Rounding Dust**: When multiple orders sit at the exact uniform clearing price $P^*$ and combined volume exceeds matched quantity $Q^*$, order fills are allocated pro-rata using integer division. Any remainder (at most $n-1$ atomic units per side) stays in the participant's unfilled order balance. This dust is never lost or trapped in the protocol; it is unconditionally returned to the user when invoking `claim_order_proceeds`.
- **Demo Mock Oracle Scope**: The `set_mock_oracle` instruction exists solely on devnet and localnet environments to allow judges and evaluators to inject synthetic volatility spikes, confidence blowouts, and market halts on demand. In production deployments, `market.pyth_feed` binds directly to Pyth's immutable on-chain Price account with no administrative override path.
- **Ring Buffer Batch Capacity**: Each discrete epoch batch is bounded to 32 orders (`MAX_ORDERS_PER_BATCH = 32`). This guarantees that sorting and clearing algorithms execute within a predictable, bounded compute footprint (78,229 CU), avoiding single-transaction execution failure. Higher order volumes can be served through multi-batch rollups or chunked settlement passes.

---

## Documentation & License

- **Formal Evidence & Audit Proof**: [`EVIDENCE.md`](./EVIDENCE.md)
- **Security Audit & Invariant Matrix**: [`AUDIT.md`](./AUDIT.md)
- **Demo Script**: [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md)
- **Online Documentation**: [https://twilight-book.vercel.app/docs](https://twilight-book.vercel.app/docs)
- **License**: MIT License — see [`LICENSE`](./LICENSE)
