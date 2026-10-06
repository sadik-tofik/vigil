'use client';

import React from 'react';
import { OracleState } from '@/lib/types';
import { ShieldWarning, CheckCircle, Clock } from '@phosphor-icons/react';

interface Props {
  oracle: OracleState;
  k: number;
}

export const OracleUncertainty: React.FC<Props> = ({ oracle, k }) => {
  const isHalted = oracle.status === 2;
  const isTrading = oracle.status === 1;

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4 sm:p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-semibold">
            PYTH ORACLE REFERENCE
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-150 text-neutral-500 font-mono border border-neutral-200">
            V2 Feed
          </span>
        </div>

        <div className="flex items-center gap-2">
          {oracle.isStale && (
            <span className="flex items-center gap-1 text-[11px] text-signal-red bg-signal-red/10 px-2 py-0.5 rounded-full border border-signal-red/30 font-mono">
              <Clock size={12} /> Stale (&gt;60s)
            </span>
          )}

          <span
            className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
              isTrading
                ? 'bg-signal-green/10 border-signal-green/30 text-signal-green'
                : isHalted
                ? 'bg-signal-red/10 border-signal-red/30 text-signal-red'
                : 'bg-neutral-200 border-neutral-300 text-neutral-900'
            }`}
          >
            {isTrading ? (
              <CheckCircle size={12} weight="bold" />
            ) : (
              <ShieldWarning size={12} weight="fill" />
            )}
            {oracle.statusName}
          </span>
        </div>
      </div>

      {/* Main Numbers: Price & Confidence */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-[11px] text-neutral-500 uppercase block mb-1">
            Reference Price (P_ref)
          </span>
          <div className="font-mono text-2xl font-bold text-neutral-900 tabular-nums tracking-tight">
            ${oracle.price.toFixed(2)}
          </div>
        </div>

        <div>
          <span className="text-[11px] text-neutral-500 uppercase block mb-1">
            Confidence Interval (±σ)
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${
                oracle.confBps > 200 ? 'text-signal-violet' : 'text-signal-green'
              }`}
            >
              ±${oracle.conf.toFixed(2)}
            </span>
            <span className="font-mono text-xs text-neutral-500 tabular-nums">
              ({oracle.confBps.toFixed(1)} bps)
            </span>
          </div>
        </div>
      </div>

      {/* Visual Bounded Trade Envelope Band */}
      <div className="bg-neutral-150 rounded-lg border border-neutral-200 p-3">
        <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1.5">
          <span className="flex items-center gap-1">
            <span>Filter Band (k={k})</span>
            <span className="text-[10px] text-neutral-400 font-mono">[P_ref ± {k}σ]</span>
          </span>
          <span className="font-mono tabular-nums text-neutral-900 font-medium">
            ${oracle.minPrice.toFixed(2)} — ${oracle.maxPrice.toFixed(2)}
          </span>
        </div>

        {/* Visual progress bar representation of band */}
        <div className="relative h-2 w-full bg-neutral-50 rounded-full overflow-hidden border border-neutral-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              oracle.confBps > 200 ? 'bg-signal-violet' : 'bg-signal-green'
            }`}
            style={{
              width: `${Math.min(100, Math.max(15, (oracle.confBps / 400) * 100))}%`,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          />
        </div>

        <div className="flex justify-between items-center text-[10px] text-neutral-500 font-mono mt-1">
          <span>Min: ${oracle.minPrice.toFixed(2)}</span>
          <span className="text-neutral-900 font-medium">Target: ${oracle.price.toFixed(2)}</span>
          <span>Max: ${oracle.maxPrice.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
