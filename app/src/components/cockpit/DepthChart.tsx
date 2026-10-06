'use client';

import React from 'react';
import { ChartBar } from '@phosphor-icons/react';

interface Props {
  totalBidVolume: number;
  totalAskVolume: number;
  clearingPrice?: number;
  matchedVolume?: number;
  baseSymbol: string;
}

export const DepthChart: React.FC<Props> = ({
  totalBidVolume,
  totalAskVolume,
  clearingPrice,
  matchedVolume,
  baseSymbol,
}) => {
  const totalVolume = Math.max(1, totalBidVolume + totalAskVolume);
  const bidPercent = Math.round((totalBidVolume / totalVolume) * 100);
  const askPercent = Math.round((totalAskVolume / totalVolume) * 100);

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4 sm:p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-3">
        <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-semibold flex items-center gap-1.5">
          <ChartBar size={14} className="text-signal-amber" />
          <span>BATCH ORDER DEPTH</span>
        </span>
        <span className="text-[11px] font-mono text-neutral-500">
          Matched (Q*):{' '}
          <strong className="text-signal-green font-bold">
            {matchedVolume && matchedVolume > 0 ? `${matchedVolume} shares` : 'Pending'}
          </strong>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <span className="text-[11px] text-neutral-500 uppercase block mb-0.5">
            Total Bids (Demand)
          </span>
          <div className="font-mono text-xl font-bold text-signal-green tabular-nums">
            {totalBidVolume} <span className="text-xs text-neutral-500 font-normal">{baseSymbol}</span>
          </div>
          <span className="text-[10px] text-neutral-400 font-mono">{bidPercent}% of volume</span>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-neutral-500 uppercase block mb-0.5">
            Total Asks (Supply)
          </span>
          <div className="font-mono text-xl font-bold text-signal-red tabular-nums">
            {totalAskVolume} <span className="text-xs text-neutral-500 font-normal">{baseSymbol}</span>
          </div>
          <span className="text-[10px] text-neutral-400 font-mono">{askPercent}% of volume</span>
        </div>
      </div>

      {/* Visual Volume Bar */}
      <div className="space-y-1.5">
        <div className="h-3 w-full bg-neutral-50 rounded-lg overflow-hidden flex border border-neutral-200">
          <div
            className="h-full bg-signal-green/80 transition-all duration-300"
            style={{ width: `${bidPercent}%` }}
          />
          <div
            className="h-full bg-signal-red/80 transition-all duration-300"
            style={{ width: `${askPercent}%` }}
          />
        </div>

        <div className="flex justify-between items-baseline text-[10px] font-mono text-neutral-500">
          <span>Buyers (Bid)</span>
          {clearingPrice && clearingPrice > 0 ? (
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-neutral-500 uppercase">P* =</span>
              <span className="font-martian text-2xl font-bold text-signal-violet tabular-nums leading-none">
                ${clearingPrice.toFixed(2)}
              </span>
            </div>
          ) : (
            <span>Uniform Equilibrium</span>
          )}
          <span>Sellers (Ask)</span>
        </div>
      </div>
    </div>
  );
};
