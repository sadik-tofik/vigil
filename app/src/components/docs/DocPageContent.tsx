'use client';

import React from 'react';
import Link from 'next/link';
import { DocsPage } from '@/lib/types';
import { DocsTOC } from './DocsTOC';
import { FeedbackWidget } from './FeedbackWidget';
import { CodeBlock } from './CodeBlock';
import { ArchitectureDiagram } from './ArchitectureDiagram';
import { ArrowRight } from '@phosphor-icons/react';

interface Props {
  page: DocsPage;
}

export const DocPageContent: React.FC<Props> = ({ page }) => {
  const renderBody = () => {
    switch (`${page.section}/${page.slug}`) {
      case 'start-here/index':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p className="text-base text-neutral-900 leading-normal font-normal">
              <strong>TwilightBook</strong> is an autonomous discrete uniform-price batch auction protocol on Solana for 24/7 tokenized equities. It eliminates toxic MEV and adverse selection during off-market hours by switching continuously between standard AMM trading and discrete batch auctions based on live Pyth oracle signals.
            </p>

            <h2 id="overview" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Why TwilightBook Exists
            </h2>
            <p>
              Traditional equity markets close for roughly 135 hours each week (weekends, nights, bank holidays). When equities are tokenized on Solana, trading continues 24/7, but the underlying asset&apos;s primary price discovery halts or experiences extreme uncertainty.
            </p>
            <p>
              If a continuous AMM pool is left open against a stale or wide-confidence oracle feed, it suffers from catastrophic adverse selection: informed arbitrageurs trade against stale liquidity pools before market makers can adjust. TwilightBook solves this by converting continuous trading into discrete batch auctions whenever market uncertainty exceeds defined thresholds.
            </p>

            <h2 id="problem" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              The TradFi Off-Hours Problem
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
              <div className="p-4 rounded-lg bg-neutral-100 border border-neutral-200">
                <div className="font-bold text-neutral-900 mb-1">Standard AMM Pools</div>
                <div className="text-xs text-neutral-500">
                  Vulnerable to toxic order flow, MEV sandwiching, and latency sniping when off-market news breaks during TradFi closures.
                </div>
              </div>
              <div className="p-4 rounded-lg bg-neutral-100 border border-neutral-200">
                <div className="font-bold text-signal-violet mb-1">TwilightBook Discrete Batches</div>
                <div className="text-xs text-neutral-500">
                  Aggregates all liquidity into periodic epochs, executing all crossed trades at a single uniform equilibrium price (P*).
                </div>
              </div>
            </div>

            <h2 id="solution" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              The Twilight Solution
            </h2>
            <p>
              During normal hours, when Pyth reports status <code>Trading</code> and confidence is tight (e.g. ≤ 200 bps), the market operates in <strong>Continuous Mode</strong>.
            </p>
            <p>
              When a weekend shock occurs, confidence widens beyond the threshold, the feed is halted, or publish time becomes stale, the permissionless circuit evaluator flips the venue into <strong>Twilight Batch Auction Mode</strong>.
            </p>

            <h2 id="key-features" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Key Features
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-neutral-900/90">
              <li><strong>Zero MEV Extraction:</strong> No order in a batch can front-run another because every matched order clears at the exact same uniform price P*.</li>
              <li><strong>Price-Improvement Surplus Refund:</strong> Buyers bidding higher than the clearing price P* automatically receive their surplus back.</li>
              <li><strong>Anti-Sniping Freeze Window:</strong> Cancellations are cryptographically locked inside the final 10 slots before settlement.</li>
              <li><strong>Zero Vault Leakage (INV-01 / INV-02):</strong> Every atom of base and quote token is mathematically accounted for in on-chain vaults.</li>
            </ul>

            <div className="mt-8 p-4 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-neutral-900 text-xs">Ready to inspect the code?</div>
                <div className="text-xs text-neutral-500">Proceed to the quick start guide to build and test locally.</div>
              </div>
              <Link
                href="/docs/start-here/quick-start"
                className="px-3.5 py-2 rounded-lg bg-signal-amber text-neutral-50 text-xs font-semibold flex items-center gap-1.5 hover:opacity-95 transition-opacity"
              >
                <span>Quick Start</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        );

      case 'start-here/quick-start':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p>
              This guide walks through cloning, building, testing, and deploying TwilightBook on Solana localnet or devnet.
            </p>

            <h2 id="prerequisites" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Prerequisites
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Rust 1.79+ &amp; Cargo</li>
              <li>Solana CLI 1.18.17+</li>
              <li>Anchor CLI 0.30.1</li>
              <li>Node.js 18+ and npm</li>
            </ul>

            <h2 id="clone-and-build" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Clone &amp; Build
            </h2>
            <CodeBlock
              language="bash"
              code={`git clone https://github.com/sadik-tofik/twilight-book.git
cd twilight-book

# Install dependencies
npm install

# Build Anchor program (utilizes patches/ for proc-macro2 and anchor-syn)
anchor build`}
            />

            <h2 id="running-bankrun-tests" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Running Bankrun Tests
            </h2>
            <p>
              TwilightBook features 26 exhaustive unit and integration tests powered by <code>solana-bankrun</code> and <code>anchor-bankrun</code>, executing in under 4 seconds without spinning up a full test validator.
            </p>
            <CodeBlock
              language="bash"
              code={`# Run all Bankrun test suites
npm test`}
            />
            <div className="p-3 rounded-lg bg-signal-green/10 border border-signal-green/30 text-signal-green text-xs font-mono">
              ✓ 26 passing tests including zero vault leakage and $6.00 buyer surplus refund verification!
            </div>

            <h2 id="devnet-deployment" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Devnet Deployment
            </h2>
            <CodeBlock
              language="bash"
              code={`# Configure Solana CLI for devnet
solana config set --url https://api.devnet.solana.com

# Deploy the compiled program
anchor deploy --provider.cluster devnet`}
            />
          </div>
        );

      case 'start-here/architecture':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p>
              The TwilightBook architecture is organized around the <strong>Pyth Circuit Evaluator</strong>, which continuously senses oracle reliability and controls the transition between continuous AMM-style execution and discrete batch auctions.
            </p>

            <ArchitectureDiagram />

            <h2 id="circuit-evaluator" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Pyth Circuit Evaluator
            </h2>
            <p>
              The circuit evaluator is executed permissionlessly via <code>evaluate_market_mode</code>. It decodes the raw byte layout of the market&apos;s Pyth price account without external oracles or off-chain dependencies:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Price Status:</strong> Must equal <code>PriceStatus::Trading</code> (1). If <code>Halted</code> (2) or <code>Auction</code> (3), the circuit trips immediately.</li>
              <li><strong>Confidence Spread (BPS):</strong> Checks <code>(conf * 10,000) / price ≤ max_conf_bps</code> (default 200 bps = 2.00%).</li>
              <li><strong>Staleness:</strong> Asserts <code>current_timestamp - publish_time ≤ 60 seconds</code>.</li>
            </ul>

            <h2 id="state-machine" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Market State Machine
            </h2>
            <p>
              When the circuit detects elevated uncertainty, <code>market.mode</code> flips from <code>Continuous</code> to <code>BatchAuction</code>. Orders are escrowed into a 32-slot ring buffer (<code>EpochBatchState</code>).
            </p>

            <h2 id="account-model" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Account Model &amp; PDAs
            </h2>
            <div className="overflow-x-auto my-4">
              <table className="w-full text-left border-collapse border border-neutral-200 text-xs font-mono">
                <thead>
                  <tr className="bg-neutral-150 text-neutral-500 border-b border-neutral-200">
                    <th className="p-2.5">Account</th>
                    <th className="p-2.5">PDA Seeds</th>
                    <th className="p-2.5">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  <tr>
                    <td className="p-2.5 text-signal-amber font-bold">Market</td>
                    <td className="p-2.5 text-neutral-900">[b&quot;market&quot;, base_mint, quote_mint]</td>
                    <td className="p-2.5 text-neutral-500">Global market parameters &amp; mode state</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-signal-violet font-bold">EpochBatchState</td>
                    <td className="p-2.5 text-neutral-900">[b&quot;batch&quot;, market, epoch_id.to_le_bytes()]</td>
                    <td className="p-2.5 text-neutral-500">32-slot order ring buffer &amp; clearing result</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-signal-green font-bold">Vault Base / Quote</td>
                    <td className="p-2.5 text-neutral-900">[b&quot;vault_base&quot; / b&quot;vault_quote&quot;, market]</td>
                    <td className="p-2.5 text-neutral-500">SPL token vaults holding all deposited funds</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-neutral-400 font-bold">MockOracle (Demo)</td>
                    <td className="p-2.5 text-neutral-900">[b&quot;mock_oracle&quot;, base_mint, quote_mint]</td>
                    <td className="p-2.5 text-neutral-500">Hackathon demo injection oracle owned by program</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'core-concepts/continuous-vs-twilight':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <h2 id="the-135-hour-window" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2">
              The 135-Hour Window
            </h2>
            <blockquote className="p-4 rounded-lg bg-neutral-100 border-l-2 border-signal-violet text-neutral-900 italic font-sans my-4">
              &ldquo;Traditional markets close roughly 135 hours a week. Tokenized equities on Solana don&apos;t — but the price feed backing them does effectively &apos;close&apos; too: Pyth&apos;s confidence interval widens or the feed halts. A continuous AMM pool left running against a stale price during that window is exactly the setup for adverse selection — someone with real news trades against a price that hasn&apos;t moved. TwilightBook&apos;s <code>evaluate_market_mode</code> watches Pyth&apos;s own status and confidence width and switches the market into discrete batch auctions the moment the feed stops being trustworthy for continuous pricing, then switches back once it isn&apos;t.&rdquo;
            </blockquote>

            <h2 id="adverse-selection" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Adverse Selection in AMMs
            </h2>
            <p>
              In continuous automated market makers, constant product or concentrated liquidity curves assume symmetric information. When an external market closure occurs (e.g. Friday 4:00 PM EST to Sunday 6:00 PM EST), real-world events still happen: earnings calls, macroeconomic releases, geopolitical events.
            </p>
            <p>
              When an off-market event occurs, the true fundamental valuation moves instantly. But an AMM curve remains anchored to stale liquidity. The first actors to trade against the AMM are not retail buyers — they are latency arbitrageurs extracting liquidity provider surplus.
            </p>

            <h2 id="dynamic-mode-switch" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              The Dynamic Mode Switch
            </h2>
            <p>
              By pooling bids and asks over an epoch duration (e.g. 75 slots, ~30 seconds) into a discrete uniform auction, individual transaction timestamps within the epoch are eliminated. No one can front-run another order inside the batch because all filled orders execute at the identical clearing price P*.
            </p>
          </div>
        );

      case 'core-concepts/uniform-price-clearing':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <h2 id="uniform-pricing-principle" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2">
              The Uniform Price Principle (P*)
            </h2>
            <blockquote className="p-4 rounded-lg bg-neutral-100 border-l-2 border-signal-green text-neutral-900 italic font-sans my-4">
              &ldquo;Every order in a batch clears at ONE price — not the price each trader named, the single price that matches the most volume.&rdquo;
            </blockquote>

            <h2 id="worked-example" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Worked Example (from tests/bankrun/uniform_clearing.test.ts)
            </h2>
            <p>
              Consider a market epoch receiving the following limit orders:
            </p>
            <div className="p-4 rounded-lg bg-neutral-100 border border-neutral-200 font-mono text-xs my-3 space-y-2">
              <div className="text-signal-green font-bold">Bids Placed:</div>
              <div>• Buyer 1: 10 shares @ $214.80</div>
              <div>• Buyer 2: 5 shares @ $214.50</div>
              <div className="text-signal-red font-bold pt-2">Asks Placed:</div>
              <div>• Seller 1: 8 shares @ $214.20</div>
              <div>• Seller 2: 10 shares @ $214.60</div>
            </div>

            <p>
              Evaluating aggregate demand vs aggregate supply at each candidate limit price:
            </p>
            <ul className="list-disc pl-5 space-y-1 font-mono text-xs">
              <li>At $214.20: Demand = 15, Supply = 8 → Matched Volume = 8</li>
              <li>At $214.50: Demand = 15, Supply = 8 → Matched Volume = 8</li>
              <li><strong>At $214.60: Demand = 10, Supply = 18 → Matched Volume = 10 (MAXIMUM Q*)</strong></li>
              <li>At $214.80: Demand = 10, Supply = 18 → Matched Volume = 10</li>
            </ul>

            <h2 id="tie-break-rule" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Oracle Tie-Break Rule
            </h2>
            <p>
              When candidate prices produce identical maximum matched volume, TwilightBook resolves the tie by selecting the price nearest to the Pyth oracle reference price ($P_&#123;ref&#125;$). Given $P_&#123;ref&#125; = $214.50, $214.60 has $|214.60 - 214.50| = 0.10$ vs $|214.80 - 214.50| = 0.30$, establishing:
            </p>
            <div className="p-3 rounded-lg bg-signal-violet/10 border border-signal-violet/30 text-signal-violet font-mono text-sm font-bold">
              Uniform Clearing Price: P* = $214.60, Matched Volume: Q* = 10 shares
            </div>

            <h2 id="price-improvement-refund" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Buyer Surplus Price Improvement
            </h2>
            <p>
              Buyer 1 bid $214.80 but filled at $214.60. Upon calling <code>claim_order_proceeds</code>, Buyer 1 receives 10 shares plus an automatic cash surplus refund of:
            </p>
            <div className="p-3 rounded-lg bg-signal-green/10 border border-signal-green/30 text-signal-green font-mono text-xs">
              Surplus Refund = (214.80 - 214.60) × 10 = $2.00 USDC returned automatically
            </div>
          </div>
        );

      case 'core-concepts/confidence-bands':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <h2 id="formula" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2">
              Confidence Band Bounds
            </h2>
            <p>
              Every limit price submitted to TwilightBook must reside within the confidence envelope derived from the Pyth V2 feed:
            </p>
            <div className="p-4 rounded-lg bg-neutral-100 border border-neutral-200 font-mono text-sm text-center my-4">
              <span className="text-signal-green">P_min = P_ref - k × σ</span>
              <span className="text-neutral-400 mx-4">·</span>
              <span className="text-signal-violet">P_max = P_ref + k × σ</span>
            </div>
            <p>
              Where <code>k = market.conf_filter_mult</code> (default 2). Any limit order outside that band is rejected before it ever reaches the order book — this is what stops someone from placing an order against a price the oracle itself doesn&apos;t trust.
            </p>

            <h2 id="client-validation" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Client &amp; On-Chain Dual Enforcement
            </h2>
            <p>
              The cockpit UI validates orders client-side against the live confidence interval, preventing the user from submitting invalid transactions. If a caller bypasses the UI, the on-chain Anchor program immediately reverts with:
            </p>
            <CodeBlock
              language="rust"
              code={`#[error_code]
pub enum TwilightError {
    #[msg("Order limit price exceeds allowable oracle confidence band")]
    OrderPriceExceedsConfidenceBand = 6003,
}`}
            />
          </div>
        );

      case 'instructions/initialize-market':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p className="text-base text-neutral-900">Initializes a new TwilightBook market for a base/quote token pair, creating vaults and setting circuit parameters.</p>

            <h2 id="accounts" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Accounts</h2>
            <div className="overflow-x-auto my-4">
              <table className="w-full text-left border-collapse border border-neutral-200 text-xs font-mono">
                <thead><tr className="bg-neutral-150 text-neutral-500 border-b border-neutral-200"><th className="p-2">Account</th><th className="p-2">Type</th><th className="p-2">Notes</th></tr></thead>
                <tbody className="divide-y divide-neutral-200">
                  <tr><td className="p-2 text-signal-amber font-bold">authority</td><td className="p-2 text-neutral-900">Signer, Writable</td><td className="p-2 text-neutral-500">Pays rent for Market and vaults</td></tr>
                  <tr><td className="p-2 text-signal-amber font-bold">market</td><td className="p-2 text-neutral-900">PDA, Writable</td><td className="p-2 text-neutral-500">Seeds: [b&quot;market&quot;, base_mint, quote_mint]</td></tr>
                  <tr><td className="p-2 text-signal-amber font-bold">base_mint</td><td className="p-2 text-neutral-900">Account</td><td className="p-2 text-neutral-500">SPL Token mint (e.g. bTSLA)</td></tr>
                  <tr><td className="p-2 text-signal-amber font-bold">quote_mint</td><td className="p-2 text-neutral-900">Account</td><td className="p-2 text-neutral-500">Quote token mint (USDC)</td></tr>
                  <tr><td className="p-2 text-signal-amber font-bold">vault_base</td><td className="p-2 text-neutral-900">PDA, Writable</td><td className="p-2 text-neutral-500">Token account owned by Market PDA</td></tr>
                  <tr><td className="p-2 text-signal-amber font-bold">vault_quote</td><td className="p-2 text-neutral-900">PDA, Writable</td><td className="p-2 text-neutral-500">Token account owned by Market PDA</td></tr>
                  <tr><td className="p-2 text-signal-amber font-bold">pyth_feed</td><td className="p-2 text-neutral-900">Account</td><td className="p-2 text-neutral-500">Pyth V2 Price account feed</td></tr>
                </tbody>
              </table>
            </div>

            <h2 id="arguments" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Arguments</h2>
            <ul className="list-disc pl-5 space-y-1 font-mono text-xs">
              <li><code>max_conf_bps: u64</code> — Threshold in basis points to flip between modes (default 200 = 2.00%).</li>
              <li><code>epoch_duration_slots: u64</code> — Duration of batch auction epochs in slots (default 75).</li>
              <li><code>conf_filter_mult: u64</code> — Confidence multiplier &apos;k&apos; for bands (default 2).</li>
            </ul>

            <h2 id="example" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Example</h2>
            <CodeBlock
              language="typescript"
              code={`await program.methods
  .initializeMarket(new BN(200), new BN(75), new BN(2))
  .accounts({
    authority: wallet.publicKey,
    market: marketPda,
    baseMint,
    quoteMint,
    vaultBase,
    vaultQuote,
    pythFeed,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .rpc();`}
            />
          </div>
        );

      case 'instructions/evaluate-market-mode':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p className="text-base text-neutral-900">Permissionless circuit evaluator instruction that checks Pyth oracle status and flips market mode.</p>

            <h2 id="accounts" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Accounts</h2>
            <div className="overflow-x-auto my-4">
              <table className="w-full text-left border-collapse border border-neutral-200 text-xs font-mono">
                <thead><tr className="bg-neutral-150 text-neutral-500 border-b border-neutral-200"><th className="p-2">Account</th><th className="p-2">Type</th><th className="p-2">Notes</th></tr></thead>
                <tbody className="divide-y divide-neutral-200">
                  <tr><td className="p-2 text-signal-amber font-bold">market</td><td className="p-2 text-neutral-900">PDA, Writable</td><td className="p-2 text-neutral-500">Updates mode to continuous or batchAuction</td></tr>
                  <tr><td className="p-2 text-signal-amber font-bold">pyth_feed</td><td className="p-2 text-neutral-900">Account</td><td className="p-2 text-neutral-500">Pyth V2 price account matching market.pyth_feed</td></tr>
                  <tr><td className="p-2 text-signal-amber font-bold">epoch_batch</td><td className="p-2 text-neutral-900">PDA, Writable</td><td className="p-2 text-neutral-500">Lazily initialized if epoch 0 does not exist</td></tr>
                </tbody>
              </table>
            </div>

            <h2 id="example" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Example</h2>
            <CodeBlock
              language="typescript"
              code={`await program.methods
  .evaluateMarketMode()
  .accounts({
    market: marketPda,
    pythFeed: pythFeedPubkey,
    epochBatch: epochBatchPda,
    payer: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();`}
            />
          </div>
        );

      case 'instructions/place-batch-order':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p className="text-base text-neutral-900">Places a limit bid or ask into the active epoch batch ring buffer, escrowing tokens into the vault.</p>

            <h2 id="arguments" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Arguments</h2>
            <ul className="list-disc pl-5 space-y-1 font-mono text-xs">
              <li><code>side: OrderSide</code> — <code>&#123; bid: &#123;&#125; &#125;</code> or <code>&#123; ask: &#123;&#125; &#125;</code>.</li>
              <li><code>lot_size: u64</code> — Number of shares (6-decimal fixed point, e.g. 10_000_000 for 10 shares).</li>
              <li><code>limit_price: u64</code> — Dollar limit price (6-decimal fixed point, e.g. 214_500_000 for $214.50).</li>
            </ul>

            <h2 id="example" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Example</h2>
            <CodeBlock
              language="typescript"
              code={`// Buy 10 shares at limit price $214.80
const lotSize = new BN(10_000_000);
const limitPrice = new BN(214_800_000);

await program.methods
  .placeBatchOrder({ bid: {} }, lotSize, limitPrice)
  .accounts({
    user: wallet.publicKey,
    market: marketPda,
    epochBatch: epochBatchPda,
    vaultQuote,
    userQuoteAta,
    pythFeed,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();`}
            />
          </div>
        );

      case 'instructions/cancel-batch-order':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p className="text-base text-neutral-900">Cancels an unfilled batch order and returns escrowed tokens, subject to the anti-sniping freeze window.</p>

            <div className="p-3 rounded-lg bg-signal-red/10 border border-signal-red/30 text-signal-red text-xs">
              <strong>Freeze Window Rule:</strong> Reverts with <code>FreezeWindowActive (6008)</code> inside the last 10 slots before <code>epoch_batch.end_slot</code>.
            </div>

            <h2 id="example" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Example</h2>
            <CodeBlock
              language="typescript"
              code={`// Cancel order at index 0
await program.methods
  .cancelBatchOrder(0)
  .accounts({
    user: wallet.publicKey,
    market: marketPda,
    epochBatch: epochBatchPda,
    vaultQuote,
    userQuoteAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();`}
            />
          </div>
        );

      case 'instructions/settle-batch-auction':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p className="text-base text-neutral-900">Permissionless keeper action to clear the batch auction once the epoch ends and advance to the next epoch.</p>

            <h2 id="example" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Example</h2>
            <CodeBlock
              language="typescript"
              code={`await program.methods
  .settleBatchAuction()
  .accounts({
    keeper: wallet.publicKey,
    market: marketPda,
    epochBatch: epochBatchPda,
    nextEpochBatch: nextEpochBatchPda,
    pythFeed,
    systemProgram: SystemProgram.programId,
  })
  .rpc();`}
            />
          </div>
        );

      case 'instructions/claim-order-proceeds':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p className="text-base text-neutral-900">Claims bought tokens, sale proceeds, unfilled returns, and price-improvement refunds for a settled order.</p>

            <h2 id="example" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">Example</h2>
            <CodeBlock
              language="typescript"
              code={`await program.methods
  .claimOrderProceeds(orderIndex)
  .accounts({
    user: wallet.publicKey,
    market: marketPda,
    epochBatch: epochBatchPda,
    vaultBase,
    vaultQuote,
    userBaseAta,
    userQuoteAta,
    baseMint,
    quoteMint,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();`}
            />
          </div>
        );

      case 'security/invariants':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <p className="text-base text-neutral-900">
              The TwilightBook security model is formally defined by 5 core protocol invariants that must hold across all transactions.
            </p>

            <h2 id="core-invariants" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Core Protocol Invariants
            </h2>
            <div className="space-y-3 my-4">
              <div className="p-3.5 rounded-lg bg-neutral-100 border border-neutral-200">
                <div className="font-mono text-xs font-bold text-signal-green">INV-01: Zero Base Token Leakage</div>
                <div className="text-xs text-neutral-500 mt-1 font-mono">
                  <code>Vault_Base_Balance == sum(filled_bid_shares_unclaimed) + sum(unfilled_ask_shares_unclaimed)</code>
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-100 border border-neutral-200">
                <div className="font-mono text-xs font-bold text-signal-green">INV-02: Zero Quote Token Leakage</div>
                <div className="text-xs text-neutral-500 mt-1 font-mono">
                  <code>Vault_Quote_Balance == sum(seller_proceeds_unclaimed) + sum(buyer_surplus_and_unfilled_unclaimed)</code>
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-100 border border-neutral-200">
                <div className="font-mono text-xs font-bold text-signal-violet">INV-03: Single Uniform Execution Price</div>
                <div className="text-xs text-neutral-500 mt-1">
                  Every trade in an epoch batch executes at the identical price P*. No trader receives worse than their limit price.
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-100 border border-neutral-200">
                <div className="font-mono text-xs font-bold text-signal-amber">INV-04: Non-Crossing Solvency</div>
                <div className="text-xs text-neutral-500 mt-1">
                  If bids and asks do not cross, matched volume Q* is 0 and 100% of escrowed funds are returned without fee.
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-neutral-100 border border-neutral-200">
                <div className="font-mono text-xs font-bold text-signal-red">INV-05: Anti-Sniping Freeze Window</div>
                <div className="text-xs text-neutral-500 mt-1 font-mono">
                  Cancellations are rejected once <code>current_slot &gt;= end_slot - 10</code>, preventing last-millisecond spoofing.
                </div>
              </div>
            </div>

            <h2 id="stride-threat-model" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              STRIDE Threat Analysis
            </h2>
            <div className="overflow-x-auto my-4">
              <table className="w-full text-left border-collapse border border-neutral-200 text-xs font-mono">
                <thead>
                  <tr className="bg-neutral-150 text-neutral-500 border-b border-neutral-200">
                    <th className="p-2.5">Threat</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Mitigation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  <tr>
                    <td className="p-2.5 text-neutral-900 font-medium">Stale Price Exploitation</td>
                    <td className="p-2.5 text-signal-red">Tampering</td>
                    <td className="p-2.5 text-neutral-500">Pyth Circuit Evaluator checks publish_time &lt;= 60s and flips mode.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-neutral-900 font-medium">MEV Sandwich Attacks</td>
                    <td className="p-2.5 text-signal-red">Information Disclosure</td>
                    <td className="p-2.5 text-neutral-500">Discrete batch auctions eliminate intra-epoch transaction order advantage.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-neutral-900 font-medium">Last-Slot Order Pulling</td>
                    <td className="p-2.5 text-signal-red">Denial of Service</td>
                    <td className="p-2.5 text-neutral-500">10-slot cancellation freeze window prior to settlement.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-neutral-900 font-medium">Vault Fund Drainage</td>
                    <td className="p-2.5 text-signal-red">Elevation of Privilege</td>
                    <td className="p-2.5 text-neutral-500">Vault authorities are strictly Market PDAs signed via seeds.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'security/known-limitations':
        return (
          <div className="space-y-6 text-sm text-neutral-900/90 leading-relaxed font-sans">
            <h2 id="pro-rata-dust" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2">
              Pro-Rata Rounding Dust
            </h2>
            <blockquote className="p-4 rounded-lg bg-neutral-100 border-l-2 border-signal-violet text-neutral-900 font-sans my-4">
              &ldquo;Pro-rata fills can leave up to (n-1) atoms of rounding dust per side at a tied clearing price, always reclaimable via <code>claim_order_proceeds</code>, never lost.&rdquo;
            </blockquote>
            <p>
              When multiple orders sit at the exact clearing price P* and their combined volume exceeds the matched quantity Q*, shares are allocated pro-rata using integer division. Any fractional integer remainder stays in the user&apos;s unfilled lot size and is returned during claim.
            </p>

            <h2 id="mock-oracle-scope" className="text-xl font-bold text-neutral-900 border-b border-neutral-200 pb-2 mt-8">
              Demo-Only Mock Oracle
            </h2>
            <blockquote className="p-4 rounded-lg bg-neutral-100 border-l-2 border-signal-red text-neutral-900 font-sans my-4">
              &ldquo;<code>set_mock_oracle</code> is a demo-only instruction with no authority gating, never part of a real deployment.&rdquo;
            </blockquote>
            <p>
              In production mainnet deployments, <code>market.pyth_feed</code> points directly to Pyth&apos;s real Price account. The mock oracle instruction exists solely so hackathon evaluators and demo operators can simulate market halts and weekend confidence spikes on demand.
            </p>
          </div>
        );

      default:
        return (
          <div className="text-neutral-500 font-mono text-xs">Documentation content is loading...</div>
        );
    }
  };

  return (
    <div className="flex gap-12">
      <div className="flex-1 min-w-0">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-mono text-neutral-500 mb-4">
          <Link href="/docs" className="hover:text-neutral-900 transition-colors">Docs</Link>
          <span>/</span>
          <span className="capitalize">{page.section.replace('-', ' ')}</span>
          <span>/</span>
          <span className="text-signal-amber font-medium">{page.title}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-2">
          {page.title}
        </h1>
        <p className="text-sm text-neutral-500 mb-8 font-normal">
          {page.description}
        </p>

        {renderBody()}

        <FeedbackWidget
          filePath={`app/src/lib/docsData.ts`}
          prev={page.prev}
          next={page.next}
        />
      </div>

      <DocsTOC headings={page.headings} />
    </div>
  );
};
