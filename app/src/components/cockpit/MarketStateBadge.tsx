'use client';

import React from 'react';
import { MarketMode } from '@/lib/types';
import { ChartLineUp, Moon } from '@phosphor-icons/react';

interface Props {
  mode: MarketMode;
  maxConfBps: number;
  currentConfBps: number;
  size?: 'default' | 'large';
}

export const MarketStateBadge: React.FC<Props> = ({
  mode,
  maxConfBps,
  currentConfBps,
  size = 'default',
}) => {
  const isContinuous = mode === 'continuous';

  return (
    <div
      className={`relative inline-flex items-center gap-2.5 rounded-full border transition-all duration-200 ${
        size === 'large' ? 'h-10 px-5' : 'h-8 px-3.5'
      } ${
        isContinuous
          ? 'bg-signal-green/10 border-signal-green/30 text-signal-green'
          : 'bg-signal-violet/10 border-signal-violet/30 text-signal-violet'
      }`}
    >
      <div className="relative flex items-center justify-center">
        <span
          className={`w-2 h-2 rounded-full ${
            isContinuous ? 'bg-signal-green' : 'bg-signal-violet'
          }`}
        />
      </div>

      <div className="flex items-center gap-1.5">
        {isContinuous ? (
          <ChartLineUp size={size === 'large' ? 18 : 15} weight="bold" />
        ) : (
          <Moon size={size === 'large' ? 18 : 15} weight="fill" />
        )}
        <span className={`font-semibold tracking-wider uppercase ${size === 'large' ? 'text-sm' : 'text-xs'}`}>
          {isContinuous ? 'Continuous Trading (CLMM)' : 'Twilight Batch Auction'}
        </span>
      </div>

      <span className="hidden sm:inline-block text-[11px] text-neutral-500 border-l border-neutral-200 pl-2">
        {isContinuous
          ? `Conf: ${currentConfBps.toFixed(1)} bps (≤ ${maxConfBps} bps)`
          : `Uncertainty Triggered: ${currentConfBps.toFixed(1)} bps (> ${maxConfBps} bps)`}
      </span>
    </div>
  );
};
