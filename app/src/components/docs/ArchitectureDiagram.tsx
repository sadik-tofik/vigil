'use client';

import React from 'react';

export const ArchitectureDiagram: React.FC = () => {
  return (
    <div className="my-6 p-6 rounded-lg border border-neutral-200 bg-neutral-100 overflow-x-auto transition-colors">
      <div className="min-w-[640px]">
        <svg viewBox="0 0 760 320" className="w-full h-auto">
          <defs>
            <linearGradient id="gradCont" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--signal-green)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--signal-green)" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="gradTwilight" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--signal-violet)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--signal-violet)" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="gradOracle" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--signal-amber)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--signal-amber)" stopOpacity="0.04" />
            </linearGradient>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="var(--neutral-400)" />
            </marker>
          </defs>

          {/* Top Block: Continuous CLMM Swaps */}
          <rect x="40" y="30" width="280" height="100" rx="8" fill="url(#gradCont)" stroke="var(--signal-green)" strokeWidth="1.5" />
          <text x="60" y="60" fill="var(--signal-green)" fontWeight="bold" fontSize="13" fontFamily="var(--font-sans)">
            Continuous Swaps (CLMM Mode)
          </text>
          <text x="60" y="82" fill="var(--neutral-900)" fontSize="11" fontFamily="var(--font-sans)">
            • High Liquidity, TradFi Market Open
          </text>
          <text x="60" y="102" fill="var(--neutral-500)" fontSize="10" fontFamily="var(--font-mono)">
            Pyth Conf ≤ 200 bps · Status: Trading
          </text>

          {/* Bottom Block: Twilight Batch Auction */}
          <rect x="40" y="180" width="280" height="110" rx="8" fill="url(#gradTwilight)" stroke="var(--signal-violet)" strokeWidth="1.5" />
          <text x="60" y="210" fill="var(--signal-violet)" fontWeight="bold" fontSize="13" fontFamily="var(--font-sans)">
            Twilight Batch Auction (Discrete)
          </text>
          <text x="60" y="232" fill="var(--neutral-900)" fontSize="11" fontFamily="var(--font-sans)">
            • 32-Order Ring Buffer · Uniform Price P*
          </text>
          <text x="60" y="252" fill="var(--neutral-900)" fontSize="11" fontFamily="var(--font-sans)">
            • 10-Slot Anti-Sniping Freeze Window
          </text>
          <text x="60" y="272" fill="var(--neutral-500)" fontSize="10" fontFamily="var(--font-mono)">
            Pyth Conf &gt; 200 bps OR Halted / Stale
          </text>

          {/* Center Box: Pyth Circuit Evaluator */}
          <rect x="400" y="90" width="320" height="130" rx="8" fill="url(#gradOracle)" stroke="var(--signal-amber)" strokeWidth="1.5" />
          <text x="420" y="120" fill="var(--signal-amber)" fontWeight="bold" fontSize="13" fontFamily="var(--font-sans)">
            evaluate_market_mode (Circuit Evaluator)
          </text>
          <text x="420" y="142" fill="var(--neutral-900)" fontSize="11" fontFamily="var(--font-sans)">
            Reads Pyth V2 Price Account binary layout:
          </text>
          <text x="420" y="162" fill="var(--neutral-500)" fontSize="10" fontFamily="var(--font-mono)">
            • Price (i64, expo -6) &amp; Conf Interval (u64)
          </text>
          <text x="420" y="182" fill="var(--neutral-500)" fontSize="10" fontFamily="var(--font-mono)">
            • Status (Trading=1, Halted=2, Auction=3)
          </text>
          <text x="420" y="202" fill="var(--neutral-500)" fontSize="10" fontFamily="var(--font-mono)">
            • Publish Time (staleness &gt;60s check)
          </text>

          {/* Connecting Arrows */}
          <path d="M 400 135 L 330 90" stroke="var(--neutral-400)" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />
          <path d="M 400 175 L 330 220" stroke="var(--neutral-400)" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />
        </svg>
      </div>
    </div>
  );
};
