import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { TwilightBook } from "../target/types/twilight_book";
import {
  fetchRegistryMarkets,
  fetchMarket,
  fetchEpochBatch,
  findEpochBatchPda,
  isAcceptingOrders,
  MarketAccountData,
  EpochBatchAccountData,
} from "./registry";

/**
 * Keeper configuration
 */
export interface KeeperConfig {
  rpcUrl: string;
  keypairPath?: string;
  intervalMs: number;
  registryRefreshCycles: number;
  maxRetries: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

/**
 * Per-market tracking state for retries, backoff, and health checks
 */
export interface MarketTracker {
  pubkey: PublicKey;
  consecutiveFailures: number;
  backoffUntil: number;
  lastSettledSlot: number | null;
  lastSettledTimestamp: number | null;
  lastEvaluatedSlot: number | null;
}

/**
 * Global keeper loop state
 */
export interface KeeperState {
  cycleCount: number;
  trackedMarkets: Map<string, MarketTracker>;
  registryMarkets: PublicKey[];
}

/**
 * Structured log entry for keeper actions
 */
export interface StructuredLogEntry {
  timestamp: string;
  market?: string;
  instruction: string;
  slot?: number;
  status: "SUCCESS" | "NO_OP" | "RETRY" | "WARNING" | "ALERT" | "ERROR";
  txSignature?: string;
  errorCode?: number | null;
  errorName?: string | null;
  reason?: string;
  message?: string;
  [key: string]: any;
}

/**
 * Emit structured JSON log to stdout
 */
export function logStructured(entry: StructuredLogEntry): void {
  console.log(JSON.stringify(entry));
}

/**
 * Parses Anchor error codes, numbers, and names
 */
export function parseAnchorError(err: any): {
  code: number | null;
  name: string | null;
  message: string;
} {
  if (!err) return { code: null, name: null, message: "Unknown error" };

  if (err.error?.errorCode) {
    return {
      code:
        typeof err.error.errorCode.number === "number"
          ? err.error.errorCode.number
          : null,
      name: err.error.errorCode.code || null,
      message: err.error.errorMessage || err.message,
    };
  }

  const msg = err.message || "";
  const matchNum = msg.match(/Error Number: (\d+)/);
  const matchCode = msg.match(/Error Code: ([A-Za-z0-9_]+)/);
  const hexMatch = msg.match(/custom program error: 0x([0-9a-fA-F]+)/);

  let code: number | null = matchNum ? parseInt(matchNum[1], 10) : null;
  if (!code && hexMatch) {
    code = parseInt(hexMatch[1], 16);
  }

  let name = matchCode ? matchCode[1] : null;
  if (code === 6008) name = "EpochNotYetEnded";
  if (code === 2006) name = "ConstraintSeeds";

  return {
    code,
    name,
    message: msg,
  };
}

/**
 * Load keypair from file
 */
export function loadKeypair(keypairPath: string): Keypair {
  const expanded = keypairPath.startsWith("~")
    ? path.join(process.env.HOME || "", keypairPath.slice(1))
    : path.resolve(keypairPath);

  if (!fs.existsSync(expanded)) {
    throw new Error(`Keypair file not found at ${expanded}`);
  }

  const raw = JSON.parse(fs.readFileSync(expanded, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(raw));
}

/**
 * Load default IDL from target directory
 */
export function loadIdl(): any {
  const possiblePaths = [
    path.resolve(__dirname, "../target/idl/twilight_book.json"),
    path.resolve(__dirname, "../target/idl/vigil.json"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  }

  throw new Error("Could not find program IDL in target/idl/");
}

/**
 * Initializes a new KeeperState instance
 */
export function createKeeperState(): KeeperState {
  return {
    cycleCount: 0,
    trackedMarkets: new Map<string, MarketTracker>(),
    registryMarkets: [],
  };
}

/**
 * Resolves config from environment variables
 */
export function getKeeperConfigFromEnv(): KeeperConfig {
  const keypairPath =
    process.env.KEEPER_KEYPAIR_PATH ||
    process.env.ANCHOR_WALLET ||
    path.resolve(process.env.HOME || "~", ".config/solana/id.json");

  return {
    rpcUrl:
      process.env.RPC_URL ||
      process.env.ANCHOR_PROVIDER_URL ||
      "https://api.devnet.solana.com",
    keypairPath,
    intervalMs: parseInt(process.env.KEEPER_INTERVAL_MS || "5000", 10),
    registryRefreshCycles: parseInt(
      process.env.KEEPER_REGISTRY_REFRESH_CYCLES || "12",
      10
    ),
    maxRetries: parseInt(process.env.KEEPER_MAX_RETRIES || "5", 10),
    baseBackoffMs: 2000,
    maxBackoffMs: 60000,
  };
}

/**
 * Result of a single market's crank step
 */
export interface MarketCrankResult {
  market: string;
  evaluated: boolean;
  evaluateTx?: string;
  settled: boolean;
  settleTx?: string;
  skippedBackoff?: boolean;
  healthWarning?: boolean;
  error?: string;
}

/**
 * Result of one crank cycle across all markets
 */
export interface CycleResult {
  cycle: number;
  slot: number;
  marketsServiced: number;
  results: MarketCrankResult[];
}

/**
 * Executes a single keeper crank cycle.
 * Exported so bankrun and integration test suites can run it deterministically.
 */
/**
 * Helper to get the current slot across standard web3 Connections and Bankrun test environments.
 */
export async function getCurrentSlot(
  program: Program<TwilightBook>,
  slotOverride?: number
): Promise<number> {
  if (slotOverride !== undefined) return slotOverride;

  const conn = program.provider.connection as any;
  if (typeof conn?.getSlot === "function") {
    try {
      return await conn.getSlot("confirmed");
    } catch {}
  }

  const provider = program.provider as any;
  if (provider?.context?.banksClient?.getSlot) {
    try {
      const s = await provider.context.banksClient.getSlot();
      return Number(s);
    } catch {}
  }
  if (provider?.banksClient?.getSlot) {
    try {
      const s = await provider.banksClient.getSlot();
      return Number(s);
    } catch {}
  }

  // Sysvar Clock fallback
  try {
    const clockPubkey = new PublicKey("SysvarC1ock11111111111111111111111111111111");
    const accountInfo = await conn.getAccountInfo(clockPubkey);
    if (accountInfo?.data) {
      return Number(accountInfo.data.readBigUInt64LE(0));
    }
  } catch {}

  return 0;
}

/**
 * Executes a single keeper crank cycle.
 * Exported so bankrun and integration test suites can run it deterministically.
 */
export async function runKeeperCycle(
  program: Program<TwilightBook>,
  state: KeeperState,
  config: KeeperConfig,
  slotOverride?: number
): Promise<CycleResult> {
  const currentSlot = await getCurrentSlot(program, slotOverride);

  // Step 1: Refresh registry markets if startup or scheduled refresh cycle
  const shouldRefreshRegistry =
    state.cycleCount === 0 ||
    state.cycleCount % config.registryRefreshCycles === 0;

  if (shouldRefreshRegistry) {
    try {
      const markets = await fetchRegistryMarkets(program);
      state.registryMarkets = markets;

      for (const m of markets) {
        const key = m.toBase58();
        if (!state.trackedMarkets.has(key)) {
          state.trackedMarkets.set(key, {
            pubkey: m,
            consecutiveFailures: 0,
            backoffUntil: 0,
            lastSettledSlot: null,
            lastSettledTimestamp: null,
            lastEvaluatedSlot: null,
          });
        }
      }
    } catch (err: any) {
      logStructured({
        timestamp: new Date().toISOString(),
        instruction: "refresh_registry",
        slot: currentSlot,
        status: "ERROR",
        message: `Failed to refresh registry: ${err?.message || err}`,
      });
    }
  }

  const results: MarketCrankResult[] = [];
  const now = Date.now();

  // Step 2: Iterate over every tracked market independently
  for (const [marketKey, tracker] of state.trackedMarkets.entries()) {
    const marketPubkey = tracker.pubkey;

    // Check backoff: skip if in backoff window to avoid hammering dead endpoints
    if (now < tracker.backoffUntil) {
      logStructured({
        timestamp: new Date().toISOString(),
        market: marketKey,
        instruction: "cycle_skip",
        slot: currentSlot,
        status: "NO_OP",
        reason: "MARKET_BACKOFF",
        message: `Skipping market ${marketKey} (in backoff until ${new Date(
          tracker.backoffUntil
        ).toISOString()}, ${tracker.consecutiveFailures} consecutive failures)`,
      });
      results.push({
        market: marketKey,
        evaluated: false,
        settled: false,
        skippedBackoff: true,
      });
      continue;
    }

    const marketResult: MarketCrankResult = {
      market: marketKey,
      evaluated: false,
      settled: false,
    };

    try {
      // 2a. Fetch fresh market account
      let marketData: MarketAccountData | null = await fetchMarket(
        program,
        marketPubkey
      );
      if (!marketData) {
        throw new Error(`Market account ${marketKey} could not be fetched.`);
      }

      // Derive epoch_batch PDA for current_epoch
      let [epochBatchPda] = findEpochBatchPda(
        marketPubkey,
        marketData.currentEpoch,
        program.programId
      );

      // 2b. Call evaluate_market_mode on every tick
      try {
        const evalTx = await program.methods
          .evaluateMarketMode()
          .accounts({
            market: marketPubkey,
            pythFeed: marketData.pythFeed,
            epochBatch: epochBatchPda,
            payer: (program.provider as any).wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        marketResult.evaluated = true;
        marketResult.evaluateTx = evalTx;
        tracker.lastEvaluatedSlot = currentSlot;

        logStructured({
          timestamp: new Date().toISOString(),
          market: marketKey,
          instruction: "evaluate_market_mode",
          slot: currentSlot,
          status: "SUCCESS",
          txSignature: evalTx,
        });
      } catch (evalErr: any) {
        const parsed = parseAnchorError(evalErr);

        if (parsed.code === 2006 || parsed.name === "ConstraintSeeds") {
          // Stale current_epoch detected: another crank beat us to rollover.
          // Re-fetch Market.current_epoch fresh and retry once before logging error.
          logStructured({
            timestamp: new Date().toISOString(),
            market: marketKey,
            instruction: "evaluate_market_mode",
            slot: currentSlot,
            status: "RETRY",
            reason:
              "ConstraintSeeds (2006) - Stale current_epoch detected, re-fetching and retrying once",
          });

          marketData = await fetchMarket(program, marketPubkey);
          if (!marketData) throw evalErr;

          [epochBatchPda] = findEpochBatchPda(
            marketPubkey,
            marketData.currentEpoch,
            program.programId
          );

          const retryEvalTx = await program.methods
            .evaluateMarketMode()
            .accounts({
              market: marketPubkey,
              pythFeed: marketData.pythFeed,
              epochBatch: epochBatchPda,
              payer: (program.provider as any).wallet.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .rpc();

          marketResult.evaluated = true;
          marketResult.evaluateTx = retryEvalTx;
          tracker.lastEvaluatedSlot = currentSlot;

          logStructured({
            timestamp: new Date().toISOString(),
            market: marketKey,
            instruction: "evaluate_market_mode",
            slot: currentSlot,
            status: "SUCCESS",
            txSignature: retryEvalTx,
            note: "Succeeded on retry after ConstraintSeeds",
          });
        } else {
          logStructured({
            timestamp: new Date().toISOString(),
            market: marketKey,
            instruction: "evaluate_market_mode",
            slot: currentSlot,
            status: "ERROR",
            errorCode: parsed.code,
            errorName: parsed.name,
            message: parsed.message,
          });
          throw evalErr;
        }
      }

      // 2c. Re-fetch Market and EpochBatchState accounts
      marketData = await fetchMarket(program, marketPubkey);
      if (!marketData) {
        throw new Error(`Market ${marketKey} not found after evaluate`);
      }

      [epochBatchPda] = findEpochBatchPda(
        marketPubkey,
        marketData.currentEpoch,
        program.programId
      );

      const epochBatchData: EpochBatchAccountData | null =
        await fetchEpochBatch(program, epochBatchPda);

      // 2d. If current_slot >= epoch_batch.end_slot and status == AcceptingOrders, call settle_batch_auction
      if (epochBatchData) {
        const endSlot = epochBatchData.endSlot.toNumber();
        const isAccepting = isAcceptingOrders(epochBatchData.status);

        if (currentSlot >= endSlot && isAccepting) {
          const nextEpochId = marketData.currentEpoch.addn(1);
          let [nextEpochBatchPda] = findEpochBatchPda(
            marketPubkey,
            nextEpochId,
            program.programId
          );

          try {
            const settleTx = await program.methods
              .settleBatchAuction()
              .accounts({
                keeper: (program.provider as any).wallet.publicKey,
                market: marketPubkey,
                epochBatch: epochBatchPda,
                nextEpochBatch: nextEpochBatchPda,
                pythFeed: marketData.pythFeed,
                systemProgram: SystemProgram.programId,
              })
              .rpc();

            marketResult.settled = true;
            marketResult.settleTx = settleTx;
            tracker.lastSettledSlot = currentSlot;
            tracker.lastSettledTimestamp = Date.now();
            tracker.consecutiveFailures = 0; // Reset failures on successful settlement

            logStructured({
              timestamp: new Date().toISOString(),
              market: marketKey,
              instruction: "settle_batch_auction",
              slot: currentSlot,
              status: "SUCCESS",
              txSignature: settleTx,
              epochSettled: epochBatchData.epochId.toNumber(),
              nextEpoch: nextEpochId.toNumber(),
            });
          } catch (settleErr: any) {
            const parsed = parseAnchorError(settleErr);

            if (parsed.code === 6008 || parsed.name === "EpochNotYetEnded") {
              // Expected condition: log at debug level, treat as no-op this cycle
              logStructured({
                timestamp: new Date().toISOString(),
                market: marketKey,
                instruction: "settle_batch_auction",
                slot: currentSlot,
                status: "NO_OP",
                reason: "EpochNotYetEnded (6008)",
                message: "Current slot has not reached batch end_slot yet",
              });
            } else if (
              parsed.code === 2006 ||
              parsed.name === "ConstraintSeeds"
            ) {
              // Stale current_epoch: retry once
              logStructured({
                timestamp: new Date().toISOString(),
                market: marketKey,
                instruction: "settle_batch_auction",
                slot: currentSlot,
                status: "RETRY",
                reason:
                  "ConstraintSeeds (2006) - Stale current_epoch detected, re-fetching and retrying once",
              });

              marketData = await fetchMarket(program, marketPubkey);
              if (!marketData) throw settleErr;

              [epochBatchPda] = findEpochBatchPda(
                marketPubkey,
                marketData.currentEpoch,
                program.programId
              );
              const retryNextId = marketData.currentEpoch.addn(1);
              [nextEpochBatchPda] = findEpochBatchPda(
                marketPubkey,
                retryNextId,
                program.programId
              );

              const retrySettleTx = await program.methods
                .settleBatchAuction()
                .accounts({
                  keeper: (program.provider as any).wallet.publicKey,
                  market: marketPubkey,
                  epochBatch: epochBatchPda,
                  nextEpochBatch: nextEpochBatchPda,
                  pythFeed: marketData.pythFeed,
                  systemProgram: SystemProgram.programId,
                })
                .rpc();

              marketResult.settled = true;
              marketResult.settleTx = retrySettleTx;
              tracker.lastSettledSlot = currentSlot;
              tracker.lastSettledTimestamp = Date.now();
              tracker.consecutiveFailures = 0;

              logStructured({
                timestamp: new Date().toISOString(),
                market: marketKey,
                instruction: "settle_batch_auction",
                slot: currentSlot,
                status: "SUCCESS",
                txSignature: retrySettleTx,
                note: "Succeeded on retry after ConstraintSeeds",
              });
            } else {
              logStructured({
                timestamp: new Date().toISOString(),
                market: marketKey,
                instruction: "settle_batch_auction",
                slot: currentSlot,
                status: "ERROR",
                errorCode: parsed.code,
                errorName: parsed.name,
                message: parsed.message,
              });
              throw settleErr;
            }
          }
        }
      }

      // 2e. Health-Check: check if market has not settled within 2x expected epoch duration
      if (epochBatchData && isAcceptingOrders(epochBatchData.status)) {
        const expectedDuration = marketData.epochDurationSlots.toNumber();
        const startSlot = epochBatchData.startSlot.toNumber();
        const elapsedSlots = currentSlot - startSlot;

        if (elapsedSlots >= 2 * expectedDuration) {
          marketResult.healthWarning = true;
          console.warn(
            `⚠️  [HEALTH WARNING] Market ${marketKey}: Epoch ${epochBatchData.epochId.toString()} has not been settled within 2x expected duration! (Elapsed: ${elapsedSlots} slots, Expected duration: ${expectedDuration} slots)`
          );
          logStructured({
            timestamp: new Date().toISOString(),
            market: marketKey,
            instruction: "health_check",
            slot: currentSlot,
            status: "WARNING",
            message: `Unsettled after 2x epoch duration (${elapsedSlots} >= 2 * ${expectedDuration} slots)`,
            epochId: epochBatchData.epochId.toNumber(),
          });
        }
      }

      // Reset consecutive failures on successful servicing
      tracker.consecutiveFailures = 0;
    } catch (err: any) {
      marketResult.error = err?.message || String(err);
      tracker.consecutiveFailures++;

      // Exponential backoff per market, capped at maxBackoffMs
      const backoffMs = Math.min(
        config.maxBackoffMs,
        config.baseBackoffMs * Math.pow(2, tracker.consecutiveFailures - 1)
      );
      tracker.backoffUntil = Date.now() + backoffMs;

      if (tracker.consecutiveFailures >= config.maxRetries) {
        console.error(
          `🚨 [ALERT] Market ${marketKey} has reached ${tracker.consecutiveFailures} consecutive failures! Backing off for ${
            backoffMs / 1000
          }s rather than spinning on dead RPC endpoint or failing account.`
        );
        logStructured({
          timestamp: new Date().toISOString(),
          market: marketKey,
          instruction: "failure_alert",
          slot: currentSlot,
          status: "ALERT",
          consecutiveFailures: tracker.consecutiveFailures,
          backoffMs,
          message: err?.message || String(err),
        });
      } else {
        console.warn(
          `⚠️  [WARN] Market ${marketKey} failure count: ${
            tracker.consecutiveFailures
          }. Backing off for ${backoffMs / 1000}s. Error: ${
            err?.message || err
          }`
        );
      }
    }

    results.push(marketResult);
  }

  state.cycleCount++;

  return {
    cycle: state.cycleCount,
    slot: currentSlot,
    marketsServiced: results.length,
    results,
  };
}

/**
 * Main long-running loop for the Keeper service
 */
export async function startKeeper(
  program: Program<TwilightBook>,
  config: KeeperConfig
): Promise<void> {
  const state = createKeeperState();
  let isRunning = true;

  const shutdown = () => {
    console.log("\n[KEEPER] Received shutdown signal. Terminating cleanly...");
    isRunning = false;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`[KEEPER] Starting Vigil Crank Bot...`);
  console.log(`[KEEPER] RPC URL:          ${config.rpcUrl}`);
  console.log(`[KEEPER] Program ID:       ${program.programId.toBase58()}`);
  console.log(
    `[KEEPER] Fee Payer:        ${(program.provider as any).wallet.publicKey.toBase58()}`
  );
  console.log(`[KEEPER] Interval:         ${config.intervalMs}ms`);
  console.log(
    `[KEEPER] Registry Refresh: Every ${config.registryRefreshCycles} cycles`
  );
  console.log(`[KEEPER] Max Retries:      ${config.maxRetries}`);

  while (isRunning) {
    try {
      await runKeeperCycle(program, state, config);
    } catch (cycleErr: any) {
      console.error(
        `[KEEPER] Uncaught error in crank cycle:`,
        cycleErr?.message || cycleErr
      );
    }

    if (isRunning) {
      await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
    }
  }

  console.log("[KEEPER] Stopped.");
}

/**
 * Entrypoint when executed directly via Node / tsx
 */
async function main() {
  const config = getKeeperConfigFromEnv();

  if (!config.keypairPath) {
    throw new Error(
      "KEEPER_KEYPAIR_PATH or ANCHOR_WALLET environment variable must be specified."
    );
  }

  const keypair = loadKeypair(config.keypairPath);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = loadIdl();
  const programId = new PublicKey(
    idl.address || "J67mmCdpb4NiMRPEF59JupqHpo3BLbk5Cr82qvGff8iX"
  );
  const program = new Program<TwilightBook>(idl as anchor.Idl, provider);

  await startKeeper(program, config);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal Keeper Crash:", err);
    process.exit(1);
  });
}
