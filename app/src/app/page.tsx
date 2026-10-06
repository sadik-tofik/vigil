'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MarketStateBadge } from '@/components/cockpit/MarketStateBadge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PROGRAM_ID } from '@/lib/solanaConfig';
import { ArrowRight, ArrowSquareOut, ShieldCheck, Cpu } from '@phosphor-icons/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function MarketingPage() {
  // Mode-Switch Explainer active state (§3.2)
  const [activeMode, setActiveMode] = useState<'continuous' | 'batchAuction'>('continuous');

  // Count-up numbers state for proof section (§3.3)
  const [counts, setCounts] = useState({
    tests: 0,
    cu: 0,
    invariants: 0,
    bps: 0,
  });

  useEffect(() => {
    let triggeredCount = false;
    const startCountUp = () => {
      if (triggeredCount) return;
      triggeredCount = true;
      const duration = 800; // 800ms ease-out per LANDING_PAGE.md §5
      const steps = 30;
      const intervalTime = duration / steps;
      let step = 0;

      const timer = setInterval(() => {
        step++;
        const progress = Math.min(1, step / steps);
        const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic

        setCounts({
          tests: Math.round(26 * ease),
          cu: Math.round(78229 * ease),
          invariants: Math.round(15 * ease),
          bps: Math.round(200 * ease),
        });

        if (step >= steps) {
          clearInterval(timer);
        }
      }, intervalTime);
    };

    if (typeof window === 'undefined') return;

    const ctx = gsap.context(() => {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        startCountUp();
        return;
      }

      // Restrained scroll-triggered reveals: power2.out, 20-24px fade-up per LANDING_PAGE.md §5
      const revealItems = document.querySelectorAll('.gsap-reveal');
      revealItems.forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 22 },
          {
            opacity: 1,
            y: 0,
            duration: 0.65,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
          }
        );
      });

      // Proof card numbers count-up triggered on scroll into view
      ScrollTrigger.create({
        trigger: '#proof',
        start: 'top 80%',
        onEnter: () => startCountUp(),
      });

      // Mode-switch explainer state transition as user scrolls into the section (§3.2)
      ScrollTrigger.create({
        trigger: '#mode-explainer',
        start: 'top 60%',
        end: 'bottom 40%',
        onEnter: () => setActiveMode('batchAuction'),
        onLeaveBack: () => setActiveMode('continuous'),
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col font-sans transition-colors duration-150 selection:bg-signal-amber/20">
      {/* ========================================================================= */}
      {/* 1. TOP NAVIGATION                                                         */}
      {/* ========================================================================= */}
      <header className="border-b border-neutral-200 bg-neutral-50 sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center font-bold text-neutral-900 text-xs tracking-wider">
                TB
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-neutral-900 tracking-tight group-hover:text-signal-amber transition-colors">
                  TwilightBook
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-neutral-150 border border-neutral-200 text-neutral-500">
                  SOLANA
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm text-neutral-500 font-sans">
              <a href="#mode-explainer" className="hover:text-neutral-900 transition-colors">
                Mechanism
              </a>
              <a href="#proof" className="hover:text-neutral-900 transition-colors">
                Proof
              </a>
              <a href="#how-it-works" className="hover:text-neutral-900 transition-colors">
                How It Works
              </a>
              <a href="#security" className="hover:text-neutral-900 transition-colors">
                Security
              </a>
              <Link href="/docs" className="hover:text-neutral-900 transition-colors">
                Docs
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/app"
              className="h-10 px-4 rounded-lg bg-signal-amber text-neutral-50 hover:opacity-95 font-medium text-xs font-mono tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <span>Launch App</span>
              <ArrowRight size={14} weight="bold" />
            </Link>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. HERO SECTION (§3.1)                                                    */}
      {/* ========================================================================= */}
      <section className="relative min-h-[calc(100dvh-4rem)] flex items-center justify-center px-6 py-20 overflow-hidden bg-neutral-50">
        {/* Subtle Ambient Glow (8-10% opacity, Solana Echo tones per §2.2 point 3) */}
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[350px] rounded-full blur-3xl pointer-events-none opacity-[0.08] dark:opacity-[0.10]"
          style={{
            background: 'radial-gradient(ellipse at center, #6B4FE0 0%, #2DBF8C 60%, transparent 80%)',
          }}
        />

        <div className="max-w-[1000px] mx-auto text-center relative z-10 flex flex-col items-center">
          {/* Provenance Badge with 2px Solana Echo gradient rule per §2.2 point 1 */}
          <div className="inline-flex flex-col items-center mb-8">
            <div className="px-3.5 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-xs font-mono text-neutral-500 mb-1.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
              <span>Built for the Stocklana Hackathon</span>
            </div>
            {/* 2px Gradient Rule */}
            <div
              className="w-full h-[2px] rounded-full"
              style={{
                background: 'linear-gradient(90deg, #6B4FE0 0%, #2DBF8C 100%)',
              }}
            />
          </div>

          {/* Display Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-[4rem] lg:leading-[4.25rem] font-bold text-neutral-900 tracking-[-0.02em] max-w-[900px] mb-6">
            Tokenized stocks that trade 24/7 — even when the market they&apos;re tracking is closed.
          </h1>

          {/* Plain Mechanism Subtitle */}
          <p className="text-lg sm:text-xl text-neutral-500 max-w-[760px] mb-10 leading-relaxed font-normal">
            TwilightBook replaces vulnerable continuous AMMs with discrete, Pyth-anchored batch auctions
            the instant off-hours volatility or market halts occur on-chain.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/app"
              className="w-full sm:w-auto h-11 px-6 rounded-lg bg-signal-amber text-neutral-50 hover:opacity-95 font-semibold text-sm font-mono tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <span>Launch App</span>
              <ArrowRight size={16} weight="bold" />
            </Link>

            <Link
              href="/docs"
              className="w-full sm:w-auto h-11 px-6 rounded-lg border border-neutral-200 bg-neutral-100 hover:bg-neutral-200/50 text-neutral-900 font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>Read the docs</span>
            </Link>
          </div>

          {/* Verification Bar Under Hero */}
          <div className="mt-16 pt-8 border-t border-neutral-200/70 w-full max-w-[640px] flex items-center justify-around text-xs font-mono text-neutral-500">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
              <span>Devnet Deployed</span>
            </div>
            <span className="text-neutral-300">•</span>
            <div>26 Bankrun Invariants</div>
            <span className="text-neutral-300">•</span>
            <div>Pyth V2 Circuit Evaluator</div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. THE MODE-SWITCH EXPLAINER (§3.2)                                       */}
      {/* ========================================================================= */}
      <section id="mode-explainer" className="py-24 px-6 border-y border-neutral-200 bg-neutral-100 transition-colors">
        <div className="max-w-[1280px] mx-auto gsap-reveal">
          <div className="text-center max-w-[720px] mx-auto mb-14">
            <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-semibold block mb-2 font-mono">
              THE ADAPTIVE STATE MACHINE
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-[-0.01em]">
              Continuous when calm. Discrete when volatile.
            </h2>
          </div>

          {/* Interactive State Demonstration Card */}
          <div className="max-w-[960px] mx-auto bg-neutral-50 border border-neutral-200 rounded-lg p-6 sm:p-10">
            {/* Interactive Toggle for Judges */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <button
                type="button"
                onClick={() => setActiveMode('continuous')}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  activeMode === 'continuous'
                    ? 'bg-signal-green/10 border border-signal-green/40 text-signal-green shadow-sm'
                    : 'bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-neutral-900'
                }`}
              >
                1. Continuous Mode (Normal)
              </button>

              <button
                type="button"
                onClick={() => setActiveMode('batchAuction')}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  activeMode === 'batchAuction'
                    ? 'bg-signal-violet/10 border border-signal-violet/40 text-signal-violet shadow-sm'
                    : 'bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-neutral-900'
                }`}
              >
                2. Twilight Mode (Weekend / Shock)
              </button>
            </div>

            {/* Reused Live MarketStateBadge Component */}
            <div className="flex justify-center mb-8">
              <MarketStateBadge
                mode={activeMode}
                maxConfBps={200}
                currentConfBps={activeMode === 'continuous' ? 9.3 : 2797.7}
                size="large"
              />
            </div>

            {/* Explanatory Content from docs/core-concepts/continuous-vs-twilight.mdx */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-neutral-200">
              <div
                className={`p-5 rounded-lg border transition-all ${
                  activeMode === 'continuous'
                    ? 'bg-neutral-100 border-signal-green/30'
                    : 'bg-neutral-50 border-neutral-200 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 mb-2 font-mono text-xs font-bold text-signal-green">
                  <span className="w-2 h-2 rounded-full bg-signal-green" />
                  <span>CONTINUOUS TRADING</span>
                </div>
                <h3 className="font-bold text-base text-neutral-900 mb-2">Liquid Market Baseline</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  During standard trading hours when Pyth confidence is narrow (≤ 200 bps) and the feed is
                  active, trades clear instantly via continuous automated liquidity, maximizing capital velocity.
                </p>
              </div>

              <div
                className={`p-5 rounded-lg border transition-all ${
                  activeMode === 'batchAuction'
                    ? 'bg-neutral-100 border-signal-violet/30'
                    : 'bg-neutral-50 border-neutral-200 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 mb-2 font-mono text-xs font-bold text-signal-violet">
                  <span className="w-2 h-2 rounded-full bg-signal-violet" />
                  <span>TWILIGHT BATCH AUCTION</span>
                </div>
                <h3 className="font-bold text-base text-neutral-900 mb-2">Discrete Protective Shield</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Traditional markets close ~135 hours a week. When confidence blows out or a stock halts,
                  continuous order books suffer toxic flow. TwilightBook trips into batch auctions: eliminating
                  latency arbitrage and clearing all orders at one uniform equilibrium price.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. PROOF SECTION — REAL NUMBERS, HONESTLY SCOPED (§3.3)                    */}
      {/* ========================================================================= */}
      <section id="proof" className="py-24 px-6 max-w-[1280px] mx-auto w-full">
        <div className="text-center max-w-[720px] mx-auto mb-14 gsap-reveal">
          <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-semibold block mb-2 font-mono">
            TECHNICAL SOUNDNESS & PROOF
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-[-0.01em]">
            Real on-chain verification, not invented metrics.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 gsap-reveal">
          {/* Card 1: Verified on Solana Devnet (Gradient Border per §2.2 point 2) */}
          <div className="relative p-[1px] rounded-lg overflow-hidden flex flex-col" style={{
            background: 'linear-gradient(135deg, #6B4FE0 0%, #2DBF8C 100%)',
          }}>
            <div className="bg-neutral-100 p-6 rounded-[7px] flex-1 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-signal-green font-bold block mb-1">
                  LIVE DEPLOYMENT
                </span>
                <div className="font-mono text-2xl font-bold text-neutral-900 mb-2">
                  Solana Devnet
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Program binary deployed, executable, and confirmed on Devnet at slot 501,035,203.
                </p>
              </div>
              <a
                href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 pt-3 border-t border-neutral-200 text-xs font-mono font-medium text-neutral-900 hover:text-signal-amber flex items-center justify-between"
              >
                <span>View Program</span>
                <ArrowSquareOut size={14} />
              </a>
            </div>
          </div>

          {/* Card 2: Zero-Leakage Invariants */}
          <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-6 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-bold block mb-1">
                INVARIANT TESTING
              </span>
              <div className="font-mono text-3xl font-bold text-neutral-900 tabular-nums mb-2">
                {counts.tests} / 26
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Bankrun unit tests proving {counts.invariants} protocol invariants, including exact 0-leakage
                vault math and single-claim guarantees.
              </p>
            </div>
            <Link
              href="/docs/security/invariants"
              className="mt-4 pt-3 border-t border-neutral-200 text-xs font-mono font-medium text-neutral-900 hover:text-signal-amber flex items-center justify-between"
            >
              <span>Read IVM Matrix</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Card 3: Built on Pyth Core */}
          <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-6 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-signal-amber font-bold block mb-1">
                PYTH CORE
              </span>
              <div className="font-mono text-3xl font-bold text-neutral-900 tabular-nums mb-2">
                {counts.bps} bps
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Pyth confidence interval serves as the autonomous on-chain circuit breaker with bounded
                order envelopes: [P_ref ± 2σ].
              </p>
            </div>
            <Link
              href="/docs/core-concepts/confidence-bands"
              className="mt-4 pt-3 border-t border-neutral-200 text-xs font-mono font-medium text-neutral-900 hover:text-signal-amber flex items-center justify-between"
            >
              <span>Confidence Bands</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Card 4: Bootstrapped via Meteora DBC */}
          <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-6 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-signal-violet font-bold block mb-1">
                ECOSYSTEM COMPOSABILITY
              </span>
              <div className="font-mono text-2xl font-bold text-neutral-900 mb-2">
                Meteora DBC
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Pre-market stock token bTSLA launched via dynamic bonding curve with 100% supply
                conservation verified on-chain.
              </p>
            </div>
            <a
              href="https://explorer.solana.com/address/oV46RdoFrSLSipxi9FEUVFbnQiY39Zc4s4dXsE2Lrue?cluster=devnet"
              target="_blank"
              rel="noreferrer"
              className="mt-4 pt-3 border-t border-neutral-200 text-xs font-mono font-medium text-neutral-900 hover:text-signal-amber flex items-center justify-between"
            >
              <span>bTSLA Mint</span>
              <ArrowSquareOut size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. HOW IT WORKS — THREE REAL STEPS (§3.4)                                  */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="py-24 px-6 border-t border-neutral-200 bg-neutral-100 transition-colors">
        <div className="max-w-[1000px] mx-auto gsap-reveal">
          <div className="text-center max-w-[720px] mx-auto mb-16">
            <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-semibold block mb-2 font-mono">
              SEQUENTIAL LIFECYCLE
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-[-0.01em]">
              How TwilightBook protects a trade
            </h2>
          </div>

          <div className="space-y-12">
            {/* Step 1 */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="max-w-[500px]">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-signal-amber mb-2">
                  <span>STEP 01</span>
                  <span>•</span>
                  <span>ORACLE MONITORING</span>
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">Oracle watches</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Pyth&apos;s price ($P_{'{ref}'}$) and confidence ($\sigma$) stream in continuously. All order
                  submissions in the batch auction are strictly bounded to $[P_{'{ref}'} - k\sigma, P_{'{ref}'} + k\sigma]$,
                  preventing off-market frontrunning and fat-finger errors before they reach the book.
                </p>
              </div>
              <div className="w-full md:w-auto p-4 bg-neutral-100 border border-neutral-200 rounded-lg font-mono text-xs text-neutral-500 space-y-1 shrink-0 min-w-[240px]">
                <div className="text-[10px] uppercase text-neutral-400 font-bold">Live Envelope Guard</div>
                <div className="text-neutral-900 font-bold">$214.10 — $214.90</div>
                <div className="text-[11px] text-signal-green">Within confidence bounds</div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="max-w-[500px]">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-signal-violet mb-2">
                  <span>STEP 02</span>
                  <span>•</span>
                  <span>CIRCUIT TRANSITION</span>
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">Market adapts</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  When Pyth confidence expands beyond 200 bps or a traditional market halt is detected,
                  TwilightBook&apos;s permissionless circuit immediately halts continuous execution. A discrete
                  batch auction opens, and an anti-sniping freeze window activates in the final slots.
                </p>
              </div>
              <div className="w-full md:w-auto p-4 bg-neutral-100 border border-neutral-200 rounded-lg font-mono text-xs text-neutral-500 space-y-1 shrink-0 min-w-[240px]">
                <div className="text-[10px] uppercase text-neutral-400 font-bold">Anti-Sniping Freeze</div>
                <div className="text-signal-red font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-signal-red" />
                  <span>&lt;10 Slots Remaining</span>
                </div>
                <div className="text-[11px] text-neutral-400">Cancellations locked</div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="max-w-[500px]">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-signal-green mb-2">
                  <span>STEP 03</span>
                  <span>•</span>
                  <span>UNIFORM CLEARING</span>
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">Trades clear fairly</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  At epoch expiry, a permissionless keeper invokes the on-chain clearing engine. Every order
                  clears at a single uniform equilibrium price ($P^*$) maximizing matched volume ($Q^*$).
                  Bidders who placed higher limits receive automatic cash surplus refunds.
                </p>
              </div>
              <div className="w-full md:w-auto p-4 bg-neutral-100 border border-neutral-200 rounded-lg font-mono text-xs text-neutral-500 space-y-1 shrink-0 min-w-[240px]">
                <div className="text-[10px] uppercase text-neutral-400 font-bold">Clearing Outcome</div>
                <div className="text-neutral-900 font-bold">P* = $214.60 (Q* = 10)</div>
                <div className="text-[11px] text-signal-green">Buyer 1: +$2.00 surplus refund</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. SECURITY & AUDIT SECTION (§3.5)                                        */}
      {/* ========================================================================= */}
      <section id="security" className="py-24 px-6 max-w-[1000px] mx-auto w-full">
        <div className="text-center max-w-[720px] mx-auto mb-14 gsap-reveal">
          <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-semibold block mb-2 font-mono">
            SECURITY AUDIT & BOUNDS
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-[-0.01em]">
            Honest engineering, transparent limitations
          </h2>
        </div>

        <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-6 sm:p-8 space-y-6 gsap-reveal">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-neutral-200">
            <div>
              <h3 className="font-bold text-base text-neutral-900 mb-1 flex items-center gap-2">
                <Cpu size={18} className="text-signal-amber" />
                <span>Bounded Compute Units</span>
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                A saturated 32-order batch settles in <strong>78,229 CU</strong> on Solana L1 — leaving
                <strong> 60.9% safety margin</strong> under Solana&apos;s 200,000 baseline budget.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-base text-neutral-900 mb-1 flex items-center gap-2">
                <ShieldCheck size={18} className="text-signal-green" />
                <span>Double-Settlement Defense</span>
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Historical epochs are immutable by PDA seed derivation, double settlement reverts, and duplicate
                claims fail with <code className="text-xs font-mono">OrderAlreadyClaimed</code>.
              </p>
            </div>
          </div>

          {/* Transparent Limitations Callout per §3.5 */}
          <div className="pt-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-500 font-bold mb-2">
              Transparent Limitations
            </h4>
            <ul className="text-sm text-neutral-500 space-y-2 list-disc list-inside leading-relaxed">
              <li>
                <strong>Pro-Rata Rounding Dust:</strong> Integer division on marginal pro-rata fills can leave up to
                (n - 1) atoms of dust per side, always reclaimable by users via order claims and never retained by the protocol.
              </li>
              <li>
                <strong>Demo Oracle Scope:</strong> The <code className="text-xs font-mono">set_mock_oracle</code> instruction
                is an ungated simulation utility for hackathon evaluators to test circuit trips, omitted in production deployments.
              </li>
            </ul>

            <div className="mt-6 flex items-center gap-4">
              <a
                href="https://github.com/sadik-tofik/twilight-book/blob/main/AUDIT.md"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono font-bold text-signal-amber hover:underline flex items-center gap-1"
              >
                <span>Read Full AUDIT.md on GitHub</span>
                <ArrowSquareOut size={13} />
              </a>
              <span className="text-neutral-300">•</span>
              <Link
                href="/docs/security/known-limitations"
                className="text-xs font-mono text-neutral-500 hover:text-neutral-900"
              >
                Known Limitations Doc
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. BUILD / DOCS CTA LIST (§3.6)                                           */}
      {/* ========================================================================= */}
      <section className="py-20 px-6 border-t border-neutral-200 bg-neutral-100 transition-colors">
        <div className="max-w-[720px] mx-auto text-left gsap-reveal">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 tracking-tight">
            Build and verify alongside TwilightBook
          </h2>

          <div className="divide-y divide-neutral-200 border-y border-neutral-200">
            <Link
              href="/docs"
              className="py-4 flex items-center justify-between text-sm text-neutral-900 hover:text-signal-amber transition-colors group"
            >
              <div>
                <strong className="font-semibold block text-base">Read the docs</strong>
                <span className="text-neutral-500 text-xs">
                  Architecture diagrams, mathematical proofs, and Anchor method references.
                </span>
              </div>
              <ArrowRight size={16} className="text-neutral-400 group-hover:text-signal-amber group-hover:translate-x-1 transition-all" />
            </Link>

            <a
              href="https://github.com/sadik-tofik/twilight-book"
              target="_blank"
              rel="noreferrer"
              className="py-4 flex items-center justify-between text-sm text-neutral-900 hover:text-signal-amber transition-colors group"
            >
              <div>
                <strong className="font-semibold block text-base">View the source</strong>
                <span className="text-neutral-500 text-xs">
                  Audited Anchor program, 26 Bankrun tests, and autonomous verification scripts.
                </span>
              </div>
              <ArrowSquareOut size={16} className="text-neutral-400 group-hover:text-signal-amber group-hover:translate-x-1 transition-all" />
            </a>

            <Link
              href="/app"
              className="py-4 flex items-center justify-between text-sm text-neutral-900 hover:text-signal-amber transition-colors group"
            >
              <div>
                <strong className="font-semibold block text-base">Try the cockpit</strong>
                <span className="text-neutral-500 text-xs">
                  Interact with the live Solana Devnet deployment or simulate circuit trips locally.
                </span>
              </div>
              <ArrowRight size={16} className="text-neutral-400 group-hover:text-signal-amber group-hover:translate-x-1 transition-all" />
            </Link>

            <a
              href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="py-4 flex items-center justify-between text-sm text-neutral-900 hover:text-signal-amber transition-colors group"
            >
              <div>
                <strong className="font-semibold block text-base">Check the Explorer</strong>
                <span className="text-neutral-500 text-xs">
                  Review on-chain bytecode, accounts, and verified transactions on Solana Devnet.
                </span>
              </div>
              <ArrowSquareOut size={16} className="text-neutral-400 group-hover:text-signal-amber group-hover:translate-x-1 transition-all" />
            </a>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 8. FOOTER (§3.7)                                                          */}
      {/* ========================================================================= */}
      <footer className="border-t border-neutral-200 bg-neutral-50 py-12 px-6">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-base text-neutral-900 tracking-tight">TwilightBook</span>
              <span className="text-xs text-neutral-400 font-mono">v1.0.0-devnet</span>
            </div>
            <p className="text-xs text-neutral-500 max-w-sm">
              Discrete uniform-price batch auction protocol for tokenized equities on Solana.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-neutral-500 font-mono">
            <Link href="/app" className="hover:text-neutral-900 transition-colors">
              Cockpit
            </Link>
            <Link href="/docs" className="hover:text-neutral-900 transition-colors">
              Docs
            </Link>
            <a
              href="https://github.com/sadik-tofik/twilight-book/blob/main/EVIDENCE.md"
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-900 transition-colors"
            >
              Evidence
            </a>
            <a
              href="https://github.com/sadik-tofik/twilight-book/blob/main/AUDIT.md"
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-900 transition-colors"
            >
              Audit
            </a>
            <a
              href="https://github.com/sadik-tofik/twilight-book"
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-900 transition-colors"
            >
              GitHub
            </a>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
            <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
            <span>Devnet Operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
