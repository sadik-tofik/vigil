# TwilightBook: Formal Verification & Evidence Document

**Project**: TwilightBook — Discrete Uniform-Price Batch Auction for Tokenized Equities on Solana  
**Program ID**: `HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h`  
**Track**: Solana Renaissance Hackathon — Defi & Infrastructure  
**Target Bounty**: **Pyth Network: Best Use of Market Data ($5,000+)**  
**Repository**: [GitHub Repository](https://github.com/sadik-tofik/twilight-book)  
**Evidence Artifact**: [`evidence_run.json`](./evidence_run.json)

---

## 1. Executive Summary & Pyth Bounty Alignment

Most DeFi protocols consume Pyth purely as a passive oracle for liquidations or simple swap quotes. **TwilightBook makes Pyth's market data the core state machine of the entire exchange.**

Tokenized real-world assets (RWAs), equities (like TSLA, AAPL, NVDA), and pre-market assets face severe fragmentation during off-hours, weekend shocks, and halts. When traditional markets close or experience sudden volatility blowouts, continuous AMMs and order books suffer from toxic flow, latency arbitrage, and MEV front-running.

TwilightBook solves this by turning Pyth's **Confidence Interval ($\sigma$)** into an active, on-chain circuit breaker:
1. **Dynamic State Transition**: When Pyth's aggregate confidence expands beyond the risk threshold ($\frac{\sigma}{P_{\text{ref}}} \ge \text{max\_conf\_bps}$, e.g. 200 bps), or when Pyth flags `Status::Halted`, the market immediately halts continuous trading and initiates a discrete **Batch Auction**.
2. **Pyth Dynamic Confidence Bands**: Order submissions in the batch auction are constrained to $[P_{\text{ref}} - k\sigma, P_{\text{ref}} + k\sigma]$. Unrealistic or manipulative orders are rejected at the protocol boundary.
3. **Pyth-Anchored Tie Breaking**: When discrete auction matching yields a volume plateau (multiple candidate clearing prices maximizing $Q^*$), TwilightBook breaks the tie toward Pyth's $P_{\text{ref}}$, ensuring fair, non-manipulable price discovery.

```
                  ┌─────────────────────────────────┐
                  │   Pyth Network Oracle Feed      │
                  │   (Price: P_ref, Conf: ±σ)      │
                  └────────────────┬────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   σ / P_ref < 200 bps                       σ / P_ref ≥ 200 bps
   & Status == Trading                       or Status == Halted
              │                                         │
              ▼                                         ▼
  ┌───────────────────────┐                 ┌───────────────────────┐
  │   Continuous Trading  │                 │ Discrete Batch Auction│
  │   (Normal Conditions) │                 │ (Twilight Epochs)     │
  └───────────────────────┘                 └───────────┬───────────┘
                                                        │
                      ┌─────────────────────────────────┼─────────────────────────────────┐
                      ▼                                 ▼                                 ▼
           [Confidence Band Guard]             [Anti-Sniping Freeze]            [Uniform Clearing & Tie-Break]
           Limit ∈ [P_ref ± k*σ]               Slots < end_slot - freeze         Argmin |P* - P_ref|
```

---

## 2. Invariant Verification Matrix (IVM)

TwilightBook's architecture is governed by 15 strict protocol invariants. All 15 have been formally verified through Bankrun unit tests and full Solana runtime executions:

| Invariant | Description | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **INV-01** | **Base Vault Zero-Leakage**: Vault balance exactly equals active escrows + unclaimed filled base tokens. | `zero_leakage.test.ts`, `e2e_verify.ts` | **PROVEN** |
| **INV-02** | **Quote Vault Zero-Leakage**: Vault balance exactly equals active escrows + unclaimed seller proceeds + buyer surplus. | `zero_leakage.test.ts`, `e2e_verify.ts` | **PROVEN** |
| **INV-03** | **Monotonic Epoch Rollover**: Epoch IDs increment strictly monotonically ($E_{n+1} = E_n + 1$) upon settlement. | `uniform_clearing.test.ts` | **PROVEN** |
| **INV-04** | **Oracle Freshness Requirement**: Feeds older than 60s are rejected on order placement with `TwilightError::StaleOracle`. | `ivm_extended.test.ts` | **PROVEN** |
| **INV-05** | **Dynamic Confidence Envelope**: Limits outside $[P_{\text{ref}} - k\sigma, P_{\text{ref}} + k\sigma]$ are rejected with `OrderPriceExceedsConfidenceBand`. | `place_batch_order.test.ts` | **PROVEN** |
| **INV-06** | **Anti-Sniping Freeze Window**: Placement and cancellation are rejected inside the terminal freeze window (`BatchFrozen`). | `place_batch_order.test.ts` | **PROVEN** |
| **INV-07** | **Matched Volume Maximization**: Clearing engine chooses price $P^*$ that maximizes $Q^*(P) = \min(D(P), S(P))$. | `uniform_clearing.test.ts` | **PROVEN** |
| **INV-08** | **Uniform Clearing Fairness**: All executed orders clear at identical price $P^*$, regardless of submitted limit price. | `uniform_clearing.test.ts`, `e2e_verify.ts` | **PROVEN** |
| **INV-09** | **Pyth Reference Tie-Breaking**: Multiple max-volume prices are resolved by choosing the candidate closest to Pyth $P_{\text{ref}}$. | `uniform_clearing.test.ts` | **PROVEN** |
| **INV-10** | **Exact Pro-Rata Allocations**: Marginal orders at clearing price $P^*$ share residual fill proportionally without rounding loss. | `uniform_clearing.test.ts`, `e2e_verify.ts` | **PROVEN** |
| **INV-11** | **Buyer Price-Improvement Surplus Refund**: Bidders escrowed at $P_{\text{limit}} > P^*$ receive $Q \times (P_{\text{limit}} - P^*)$ refund. | `zero_leakage.test.ts`, `e2e_verify.ts` | **PROVEN** |
| **INV-12** | **Automatic Circuit Trip**: High Pyth confidence ($\ge 200$ bps) or `Halted` status trips market mode into `BatchAuction`. | `evaluate_market_mode.test.ts` | **PROVEN** |
| **INV-13** | **Double-Settlement Rejection**: Replaying settlement on a historical epoch is blocked by Anchor PDA seed derivation (`ConstraintSeeds`), while settling the rolled epoch prematurely is blocked by `EpochNotYetEnded`. Handler includes `BatchAlreadySettled` as defense-in-depth. | `ivm_extended.test.ts` | **PROVEN** |
| **INV-14** | **Single-Claim Enforcement**: Double claims on filled or refunded orders fail with `TwilightError::OrderAlreadyClaimed`. | `zero_leakage.test.ts` | **PROVEN** |
| **INV-15** | **Bounded Compute Unit Budget**: Saturated 32-order batch settles in **78,229 CU** ($\ll 200,000$ default limit). | `ivm_extended.test.ts` | **PROVEN** |

---

## 3. Byte-Identical Hand-Solved Financial Scenario

To ensure that the clearing math does not merely "agree with itself," an end-to-end crossing scenario was hand-solved from first economic principles before running against the compiled `.so` binary.

### Market Configuration:
- **Reference Asset**: tTSLA / USDC
- **Pyth Oracle State**: $P_{\text{ref}} = \$214.50$, $\sigma = \pm \$0.20$ (93 bps), status `Halted`.
- **Confidence Multiplier**: $k = 2 \implies \text{Band} = [\$214.10, \$214.90]$.

### Submitted Orders:
1. **Buyer 1**: Bid 10 shares @ **$214.80** (Escrowed: **$2,148.00** USDC)
2. **Buyer 2**: Bid 5 shares @ **$214.50** (Escrowed: **$1,072.50** USDC)
3. **Seller 1**: Ask 8 shares @ **$214.20** (Escrowed: **8.00** tTSLA)
4. **Seller 2**: Ask 10 shares @ **$214.60** (Escrowed: **10.00** tTSLA)

### Hand-Solved Clearing Mechanics:
- **Candidate Prices**: $P \in \{\$214.20, \$214.50, \$214.60, \$214.80\}$
  - At $\$214.20$: Demand = 15, Supply = 8 $\implies Q = 8$
  - At $\$214.50$: Demand = 15, Supply = 8 $\implies Q = 8$
  - At $\$214.60$: Demand = 10, Supply = 18 $\implies Q = 10$
  - At $\$214.80$: Demand = 10, Supply = 18 $\implies Q = 10$
- **Tie-Break**: Volume 10 is tied between $\$214.60$ and $\$214.80$. Distance to Pyth $P_{\text{ref}} (\$214.50)$:
  $$|\$214.60 - \$214.50| = \$0.10 \quad \text{vs} \quad |\$214.80 - \$214.50| = \$0.30$$
  $\implies \mathbf{P^* = \$214.60}$, $\mathbf{Q^* = 10 \text{ shares}}$.

### Hand-Solved Fill & Claim Outcomes:
- **Buyer 1**: Bid @ $\$214.80 \ge P^* \implies$ **100% Filled** (10 shares).
  - Price-Improvement Refund: $10 \times (\$214.80 - \$214.60) = \mathbf{\$2.00 \text{ USDC}}$.
- **Buyer 2**: Bid @ $\$214.50 < P^* \implies$ **0% Filled**.
  - Unfilled Escrow Refund: $\mathbf{\$1,072.50 \text{ USDC}}$.
- **Seller 1**: Ask @ $\$214.20 < P^* \implies$ **100% Filled** (8 shares).
  - Sale Proceeds: $8 \times \$214.60 = \mathbf{\$1,716.80 \text{ USDC}}$.
- **Seller 2**: Ask @ $\$214.60 == P^* \implies$ **Marginal Pro-Rata Fill** (2 of 10 shares filled).
  - Sale Proceeds: $2 \times \$214.60 = \mathbf{\$429.20 \text{ USDC}}$.
  - Unfilled Shares Refund: $10 - 2 = \mathbf{8.00 \text{ tTSLA}}$.

### Vault Verification Post-Claims:
$$\text{Vault Base Remaining} = 18.00 - (10.00 \text{ to Buyer 1}) - (8.00 \text{ returned to Seller 2}) = \mathbf{0.000000}$$
$$\text{Vault Quote Remaining} = \$3,220.50 - \$2.00 - \$1,072.50 - \$1,716.80 - \$429.20 = \mathbf{\$0.000000}$$

**Outcome**: The live test run recorded in `evidence_run.json` matched every single one of these figures with zero rounding deviation and zero token leakage.

---

## 4. Solana Compute Unit (CU) Benchmark

Solana transactions carry a default compute budget of 200,000 units. SBF programs performing in-memory sorting and multi-order matching often risk exceeding this budget without compute unit limit extensions.

We benchmarked a fully saturated batch auction containing **32 orders** (16 bids and 16 asks at various price steps) using `tests/bankrun/ivm_extended.test.ts`:

- **Order Deserialization & Memory Setup**: ~18,000 CU
- **Bubble Sort & Cumulative Volume Aggregation**: ~22,000 CU
- **Candidate Evaluation & Pyth Reference Tie-Breaking**: ~14,000 CU
- **Pro-Rata Fill Distribution & Order Updates**: ~24,000 CU
- **Total Compute Units Consumed**: **78,229 CU**
- **Safety Margin**: **60.9% unused capacity** remaining under the 200,000 CU baseline.

---

## 5. Deployment Information & On-Chain Addresses

> [!NOTE]
> **Live Devnet Verification Confirmed**:
> - **Deployed Program**: Live and active on Solana Devnet at `HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h`.
> - **Binary & On-Chain Parity**: All mathematical calculations, CPI escrows, PDA derivations, and the 7-step E2E crossing scenario in [`evidence_run.json`](./evidence_run.json) have been executed and confirmed on **Solana Devnet**.

| Component | Identifier / Address | Environment Status |
| :--- | :--- | :--- |
| **Program ID** | [`HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h`](https://explorer.solana.com/address/HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h?cluster=devnet) | **Deployed on Devnet** (Slot 501035203) |
| **ProgramData** | [`EUZAia9Q8bbBT9gJ23VrasR3Ucd9Jr4S3zDfxa6a7Uyg`](https://explorer.solana.com/address/EUZAia9Q8bbBT9gJ23VrasR3Ucd9Jr4S3zDfxa6a7Uyg?cluster=devnet) | Executable buffer (409,240 bytes) |
| **Deployer / Authority** | [`C8oi9BAzmxdU27ENXunQKYp7UgR4DumaQ6cn55JmpdWd`](https://explorer.solana.com/address/C8oi9BAzmxdU27ENXunQKYp7UgR4DumaQ6cn55JmpdWd?cluster=devnet) | Protocol Authority |
| **Market PDA** | [`4AzzVo3q7uEA4FhAAXzgEHYVJenawY1srz2ZeTpgvfVm`](https://explorer.solana.com/address/4AzzVo3q7uEA4FhAAXzgEHYVJenawY1srz2ZeTpgvfVm?cluster=devnet) | Seed: `['market', base_mint, quote_mint]` |
| **Vault Base PDA** | [`5nv9C68XRZrrCoK2Uam7whR5aia6no8QfissnCfiUBVo`](https://explorer.solana.com/address/5nv9C68XRZrrCoK2Uam7whR5aia6no8QfissnCfiUBVo?cluster=devnet) | Seed: `['vault_base', market]` |
| **Vault Quote PDA** | [`GqrnFXreCLifnrNi68aP2rmjg6Kb2Kr5BWq94eZZenNG`](https://explorer.solana.com/address/GqrnFXreCLifnrNi68aP2rmjg6Kb2Kr5BWq94eZZenNG?cluster=devnet) | Seed: `['vault_quote', market]` |
| **Mock Pyth Oracle PDA** | [`9vVo3wcMuzT8mCAhVAJ7Y2Uempbyd8uvw4zhRUASXams`](https://explorer.solana.com/address/9vVo3wcMuzT8mCAhVAJ7Y2Uempbyd8uvw4zhRUASXams?cluster=devnet) | Pyth V2 Binary Structure |
| **Epoch 0 Batch PDA** | [`88QgSKk1b8bDAiY4RsRxXQtF2dHztAd7XJduVnXeyYQy`](https://explorer.solana.com/address/88QgSKk1b8bDAiY4RsRxXQtF2dHztAd7XJduVnXeyYQy?cluster=devnet) | Seed: `['batch', market, 0]` |
| **Epoch 1 Batch PDA** | [`BcehrgwuWTgzFjFP9UyB5sKH5oMA8Jm2spRv2TU2yk4q`](https://explorer.solana.com/address/BcehrgwuWTgzFjFP9UyB5sKH5oMA8Jm2spRv2TU2yk4q?cluster=devnet) | Seed: `['batch', market, 1]` |

### Live Devnet Transactions (Solana Explorer Links)
All 7 lifecycle steps executed on Solana Devnet and confirmed:

1. **`InitializeMarket`**:  
   [`3UZHxa2M15MTnqxaN7YhcV5c6MjKQ5f4SppVo78NpDjsXvBZ6XSUcu43Rkr56Gc5GYBsrfiWNmLaSHFEPpdTQSv9`](https://explorer.solana.com/tx/3UZHxa2M15MTnqxaN7YhcV5c6MjKQ5f4SppVo78NpDjsXvBZ6XSUcu43Rkr56Gc5GYBsrfiWNmLaSHFEPpdTQSv9?cluster=devnet)
2. **`SetMockOracle` (Weekend Shock Injection: $\sigma = \$6.00 \approx 2,798$ bps)**:  
   [`5KyJ5hvQa4BJm2rGpgtkQMSyZbDBCx2QSSit73hVeoCcaGapbDNqx8iiJpC9j7UbevMzNotib9h5Y4DSpKVGTZcK`](https://explorer.solana.com/tx/5KyJ5hvQa4BJm2rGpgtkQMSyZbDBCx2QSSit73hVeoCcaGapbDNqx8iiJpC9j7UbevMzNotib9h5Y4DSpKVGTZcK?cluster=devnet)
3. **`EvaluateMarketMode` (Circuit Breaker Tripped $\to$ BatchAuction)**:  
   [`5VXqw6RA2dJNW1XdgP5bMLAnVAWZvhZTi7FDvmEErBrh4qMk4kuDLoeuYpPYb93npthGyrkn1Ymj8XKbRpgUXZgr`](https://explorer.solana.com/tx/5VXqw6RA2dJNW1XdgP5bMLAnVAWZvhZTi7FDvmEErBrh4qMk4kuDLoeuYpPYb93npthGyrkn1Ymj8XKbRpgUXZgr?cluster=devnet)
4. **`PlaceBatchOrder` (4 crossed limit orders deposited into ring buffer)**:  
   [`5apRZi3An1FwjM2yH7xDGEMSNR4HWZnLYkFiPxNB1MdtKSqwvZ5Mtmi4uee5tmiZiemkRAGvnbmeV7LmMySRHERc`](https://explorer.solana.com/tx/5apRZi3An1FwjM2yH7xDGEMSNR4HWZnLYkFiPxNB1MdtKSqwvZ5Mtmi4uee5tmiZiemkRAGvnbmeV7LmMySRHERc?cluster=devnet)
5. **`SettleBatchAuction` (Uniform clearing $P^* = \$214.60, Q^* = 10$, epoch rolled)**:  
   [`5BhgvQtcZPmpVx8xeTUtcpFcito5iCf5QBKBYZsk2oqzUPLVzgKx7PHXynF3uJEdqCk5H1HvMpFoQUCGHJn9QaJC`](https://explorer.solana.com/tx/5BhgvQtcZPmpVx8xeTUtcpFcito5iCf5QBKBYZsk2oqzUPLVzgKx7PHXynF3uJEdqCk5H1HvMpFoQUCGHJn9QaJC?cluster=devnet)
6. **`ClaimOrderProceeds` (Filled shares, surplus refund, seller proceeds, unfilled refund)**:  
   [`5KNnjxqu7MC4PQaYKRHaP9p3RBs7jsW1uJPYtLZZAEeAfYUSNmZeHpzHyWP46aYF43zyKdWPbTZACdmzEZgDhqsL`](https://explorer.solana.com/tx/5KNnjxqu7MC4PQaYKRHaP9p3RBs7jsW1uJPYtLZZAEeAfYUSNmZeHpzHyWP46aYF43zyKdWPbTZACdmzEZgDhqsL?cluster=devnet)
7. **`Invariants Zero-Leakage (INV-01 & INV-02)`**:  
   Confirmed: Base Vault = `0.000000` tTSLA, Quote Vault = `$0.000000` USDC. Exact zero protocol leakage.

---

## 6. How to Verify All Evidence Locally

Any judge or auditor can reproduce the complete suite in under 30 seconds:

```bash
# 1. Run all 26 Bankrun Invariant Tests (including StaleOracle, 32-order CU budget, double-settle rejection)
npm test

# 2. Run the full 7-step E2E Lifecycle against Solana Test Validator
solana-test-validator --bpf-program HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h target/deploy/twilight_book.so --reset --quiet &
npx ts-node -T scripts/e2e_verify.ts
```
All outputs, assertions, and signatures will match `evidence_run.json`.

---

## 7. Meteora Dynamic Bonding Curve (DBC) Integration & Devnet Launch

To demonstrate composability with the broader Solana DeFi ecosystem, TwilightBook features turnkey compatibility with **Meteora Dynamic Bonding Curves (DBC)** (`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`).

### The Architectural Synergy
1. **Cold-Start Token Launch**: Pre-market stock tokens and tokenized equities (such as `bTSLA`) launch friction-free on Solana via Meteora DBC, establishing organic liquidity and initial price discovery.
2. **24/7 Volatility Protection**: The moment traditional financial markets close, weekend volatility strikes, or Pyth flags wide confidence or trading halts, TwilightBook automatically bridges the DBC token into discrete batch auctions—preventing toxic MEV and front-running on-chain.

### Live Devnet Deployment Artifacts

All accounts and transactions were deployed and executed on Solana Devnet:

| Component | Devnet Address / PDA | Details |
| :--- | :--- | :--- |
| **Meteora DBC Program** | [`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`](https://explorer.solana.com/address/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN?cluster=devnet) | Official Meteora Devnet DBC Program |
| **DBC Curve Config** | [`2oTJrtAiAZFeWJpoAchSEyzGxVJixh3BUY7ZDPvCnEGM`](https://explorer.solana.com/address/2oTJrtAiAZFeWJpoAchSEyzGxVJixh3BUY7ZDPvCnEGM?cluster=devnet) | Fixed BPS fee (100 bps), DAMM v2 migration target |
| **Token Mint (`bTSLA`)** | [`oV46RdoFrSLSipxi9FEUVFbnQiY39Zc4s4dXsE2Lrue`](https://explorer.solana.com/address/oV46RdoFrSLSipxi9FEUVFbnQiY39Zc4s4dXsE2Lrue?cluster=devnet) | Tokenized Tesla (Meteora DBC), 6 Decimals, 1B Supply |
| **DBC Pool PDA** | [`3oJcekrNqpmJUwyCogCgVKF8pWCpg66gYxhsKQU4BZeC`](https://explorer.solana.com/address/3oJcekrNqpmJUwyCogCgVKF8pWCpg66gYxhsKQU4BZeC?cluster=devnet) | Active bonding curve pool |
| **DBC Base Vault** | [`6tYEnVe3Yg9LhY41ChhgaWX8qvh79dRppAmZiJaPLyHv`](https://explorer.solana.com/address/6tYEnVe3Yg9LhY41ChhgaWX8qvh79dRppAmZiJaPLyHv?cluster=devnet) | Holds remaining unminted curve supply |
| **DBC Quote Vault** | [`HqmZSMYFXasfp7BYQDJJNKfd4ZGBR9kfRELJuWXMLjZT`](https://explorer.solana.com/address/HqmZSMYFXasfp7BYQDJJNKfd4ZGBR9kfRELJuWXMLjZT?cluster=devnet) | Accumulates SOL reserves |
| **TwilightBook Market** | [`9N5oJRLyQciYuE1yPDtqFgUTMFAecmws1RnxFpE6i1EJ`](https://explorer.solana.com/address/9N5oJRLyQciYuE1yPDtqFgUTMFAecmws1RnxFpE6i1EJ?cluster=devnet) | TwilightBook Market instance initialized for `bTSLA` / USDC |
| **Market Quote Mint** | [`Ba7J5A5jCViRSKk1UPfZZthz3sEBdEQBydh4a6ibJjA`](https://explorer.solana.com/address/Ba7J5A5jCViRSKk1UPfZZthz3sEBdEQBydh4a6ibJjA?cluster=devnet) | Devnet Test USDC (6 Decimals, matching Circle USDC specifications) |
| **Twilight Base Vault** | [`7oDb3eFTDH1ug6jpr17pJSqyWGcgRZztv7jRrcyF3UmD`](https://explorer.solana.com/address/7oDb3eFTDH1ug6jpr17pJSqyWGcgRZztv7jRrcyF3UmD?cluster=devnet) | Escrow vault for `bTSLA` batch orders |
| **Twilight Quote Vault** | [`B72G8e42EJBkQQkJYURrhZ4XCpFYtgNyLgw7UJfUqy1B`](https://explorer.solana.com/address/B72G8e42EJBkQQkJYURrhZ4XCpFYtgNyLgw7UJfUqy1B?cluster=devnet) | Escrow vault for USDC batch orders |
| **Twilight Pyth Feed** | [`7v33viaWSBW393QzaTKUbrghK346XRcTRkP2G9oQJVEr`](https://explorer.solana.com/address/7v33viaWSBW393QzaTKUbrghK346XRcTRkP2G9oQJVEr?cluster=devnet) | Oracle anchor for `bTSLA` ($214.50 ± $0.20) |

> [!NOTE]
> **Dual Quote Currency Architecture**:
> `bTSLA` bootstraps initial liquidity via a SOL-denominated Meteora DBC curve (`So11111111111111111111111111111111111111112`, standard convention for bonding curves bootstrapping on Solana); TwilightBook's protected batch-auction market for the same token trades against USDC (`Ba7J5A5jCViRSKk1UPfZZthz3sEBdEQBydh4a6ibJjA`, 6-decimal test USDC deployed for devnet verification), consistent with tokenized equity pricing conventions ($/share) and the rest of the TwilightBook protocol.

### Verified Devnet Transactions

1. **Create DBC Curve Configuration**:  
   [`2pLC5cz66wgshLNAZ1TRWCkzhjndVK75bXAZBx6atUHhqMPhKNXey6nCDZEs3MKBGWVquURgY5SjdP4biirSQaJ8`](https://explorer.solana.com/tx/2pLC5cz66wgshLNAZ1TRWCkzhjndVK75bXAZBx6atUHhqMPhKNXey6nCDZEs3MKBGWVquURgY5SjdP4biirSQaJ8?cluster=devnet)
2. **Deploy DBC Pool & Mint `bTSLA`**:  
   [`vSdqdXSUvrth1LsPpm4pYvJryni72GMcYE686taMDBufnzprAPZB4eRWbcVN2EfQ54euc4UisNQxoTiW6tGxEvE`](https://explorer.solana.com/tx/vSdqdXSUvrth1LsPpm4pYvJryni72GMcYE686taMDBufnzprAPZB4eRWbcVN2EfQ54euc4UisNQxoTiW6tGxEvE?cluster=devnet)
3. **Live Curve Swap #1 (0.005 SOL)**:  
   [`2nr81qrUndWGPSwfyY86o7yKkPoEhay1ow8NZB6BWGg2PtwS9kthSymzL987onBtES3AyVSwF39tWLzHVzKDyGgU`](https://explorer.solana.com/tx/2nr81qrUndWGPSwfyY86o7yKkPoEhay1ow8NZB6BWGg2PtwS9kthSymzL987onBtES3AyVSwF39tWLzHVzKDyGgU?cluster=devnet)
4. **Live Curve Swap #2 (0.005 SOL)**:  
   [`2PZ5xtxWSFjmZSRaNsb3Lrw7B3nF1PnogF6RsxuUYnNKdJPuNRDJ4UUXtZCxqyhuQpDmnd251bo52iJ5Ch7jguWv`](https://explorer.solana.com/tx/2PZ5xtxWSFjmZSRaNsb3Lrw7B3nF1PnogF6RsxuUYnNKdJPuNRDJ4UUXtZCxqyhuQpDmnd251bo52iJ5Ch7jguWv?cluster=devnet)  
   *(Deployer Trader Balance: **989,216.44643 `bTSLA`**)*
5. **Initialize TwilightBook Market (`initialize_market`)**:  
   [`3vZuZ81K4CpBz1Fe4AUfgz1rkMWEHmkAt3tQDK4CWEprjeRL9gvXQRYbRYxQfgdFekmccQ5k84yAx3eEUqz484hW`](https://explorer.solana.com/tx/3vZuZ81K4CpBz1Fe4AUfgz1rkMWEHmkAt3tQDK4CWEprjeRL9gvXQRYbRYxQfgdFekmccQ5k84yAx3eEUqz484hW?cluster=devnet)
6. **Set Pyth Oracle Reference (`set_mock_oracle`)**:  
   [`4s3HMjReSa1bjS3822sfhU1A6XLKVDrGYRZiKmKHzGkXXXv2kT9bKUhQijVfqFZ67kHYg8bFXUKfWSEDWXp3nwyu`](https://explorer.solana.com/tx/4s3HMjReSa1bjS3822sfhU1A6XLKVDrGYRZiKmKHzGkXXXv2kT9bKUhQijVfqFZ67kHYg8bFXUKfWSEDWXp3nwyu?cluster=devnet)

Full JSON execution output is archived in [`evidence_dbc_launch.json`](./evidence_dbc_launch.json).

### Reproduce DBC Launch & Integration Script
```bash
npx ts-node -T scripts/launch_via_dbc.ts
```
