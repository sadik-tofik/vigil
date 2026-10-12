# Vigil Keeper / Crank Bot

Off-chain permissionless keeper and crank service for the Vigil protocol on Solana.

The Vigil exchange utilizes an adaptive market state machine where continuous order matching transitions to discrete uniform-price batch auctions during high volatility, market halts, or off-hours TradFi shocks. The keeper bot ensures the protocol progresses automatically without requiring trusted admin intervention.

---

## 1. Responsibilities

1. **Dynamic Market Mode Evaluation (`evaluate_market_mode`)**:
   - Re-evaluates Pyth oracle confidence intervals and status feeds.
   - Idempotently creates the epoch 0 `EpochBatchState` PDA on initial market boot.
   - Transitions markets between `Continuous` and `BatchAuction` mode.
2. **Batch Auction Settlement (`settle_batch_auction`)**:
   - Triggered when `current_slot >= epoch_batch.end_slot` and batch status is `AcceptingOrders`.
   - Executes uniform clearing price calculation and order matching on-chain.
   - Solely owns epoch rollover, initializing epoch $N + 1$'s `EpochBatchState` PDA and updating `Market.current_epoch`.
3. **Dynamic Market Discovery (`Registry`)**:
   - Discovers all live trading pairs by reading the on-chain `Registry` PDA (`seeds = [b"registry"]`).
   - Periodically refreshes the registry (every $N$ cycles) to discover newly created permissionless markets without restarting.
4. **Health & Liveness Monitoring**:
   - Emits a visible health warning if any market has remained unsettled for $> 2\times$ its expected epoch duration.
   - Applies per-market exponential backoff on RPC errors to prevent blocking concurrent markets or hammering dead endpoints.

---

## 2. Environment Variables

| Variable | Description | Default | Required? |
| :--- | :--- | :--- | :--- |
| `RPC_URL` | Solana JSON RPC endpoint URL | `https://api.devnet.solana.com` | Optional |
| `KEEPER_KEYPAIR_PATH` | Path to the fee-payer wallet JSON file | `~/.config/solana/id.json` | Yes |
| `KEEPER_INTERVAL_MS` | Interval between crank cycles in milliseconds | `5000` (5 seconds) | Optional |
| `KEEPER_REGISTRY_REFRESH_CYCLES` | Number of crank ticks between re-reading on-chain `Registry` | `12` (~60s at 5s ticks) | Optional |
| `KEEPER_MAX_RETRIES` | Max consecutive failures before entering extended backoff & emitting alert | `5` | Optional |

---

## 3. How to Run

### Prerequisites
- Node.js v18+ and `npm`
- Solana CLI keypair with SOL for transaction fee payer (the keeper only pays gas and account rent; it never has custody over market funds).

### Running on Devnet
```bash
# Set environment variables
export RPC_URL="https://api.devnet.solana.com"
export KEEPER_KEYPAIR_PATH="~/.config/solana/id.json"
export KEEPER_INTERVAL_MS="5000"

# Start the keeper bot
npx tsx keeper/index.ts
```

### Running on Localnet
```bash
export RPC_URL="http://127.0.0.1:8899"
export KEEPER_KEYPAIR_PATH="~/.config/solana/id.json"
export KEEPER_INTERVAL_MS="2000"

npx tsx keeper/index.ts
```

---

## 4. Error Handling & Robustness

- **`EpochNotYetEnded (6008)`**: Expected condition when a crank tick occurs before `epoch_batch.end_slot`. Logged at `NO_OP` debug level; never causes a crash.
- **`ConstraintSeeds (2006)`**: Indicates the keeper's cached `current_epoch` was superseded by another cranker. The bot immediately re-fetches the market state and retries the instruction once before logging an error.
- **Per-Market Isolation**: Errors occurring on one market are isolated within their own try/catch block. Other markets in the cycle proceed without interruption.
- **Exponential Backoff**: If a market experiences repeated RPC or account errors, backoff doubles with each attempt ($2\text{s} \to 4\text{s} \to 8\text{s} \dots \text{up to } 60\text{s}$). If consecutive failures hit `KEEPER_MAX_RETRIES` (default 5), a visible `[ALERT]` is raised and the market is paused to prevent RPC rate-limit exhaustion.
- **Structured JSON Logging**: Every call attempt is printed to `stdout` with timestamp, market address, instruction, slot, status, and transaction signature for easy log aggregation (`jq`, Datadog, Grafana Loki).
