'use client';

import React, { useState } from 'react';
import { Gavel, CheckCircle, TrendUp, Sparkle } from '@phosphor-icons/react';

interface Props {
  isAuctionEnded: boolean;
  clearingPrice: number;
  matchedVolume: number;
  currentEpoch: number;
  onSettle: () => void;
}

export const SettleBar: React.FC<Props> = ({
  isAuctionEnded,
  clearingPrice,
  matchedVolume,
  currentEpoch,
  onSettle,
}) => {
  const [settling, setSettling] = useState(false);

  const handleSettle = () => {
    setSettling(true);
    setTimeout(() => {
      onSettle();
      setSettling(false);
    }, 400);
  };

  const isSettled = clearingPrice > 0;

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div
          className={`p-2.5 rounded-lg border ${
            isSettled
              ? 'bg-signal-green/10 border-signal-green/30 text-signal-green'
              : 'bg-signal-violet/10 border-signal-violet/30 text-signal-violet'
          }`}
        >
          {isSettled ? (
            <CheckCircle size={22} weight="bold" />
          ) : (
            <Gavel size={22} weight="bold" />
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-neutral-900">
              {isSettled ? `Epoch #${currentEpoch} Settled` : `Epoch #${currentEpoch} Clearing Engine`}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-150 border border-neutral-200 text-neutral-500 font-mono">
              Keeper Action
            </span>
          </div>
          <div className="text-xs text-neutral-500 font-mono mt-0.5">
            {isSettled ? (
              <span className="text-neutral-900">
                Single uniform equilibrium: All trades execute at{' '}
                <strong className="font-martian text-signal-green font-bold">
                  P* = ${clearingPrice.toFixed(2)}
                </strong>
                , matching{' '}
                <strong className="text-neutral-900 font-bold">{matchedVolume} shares</strong>.
              </span>
            ) : (
              <span>
                Calculates maximum volume P* with tie-break nearest oracle reference price.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
        {isSettled ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-signal-green/10 border border-signal-green/30 text-signal-green text-xs font-mono font-medium">
            <Sparkle size={14} weight="fill" />
            <span>Auction Settled &amp; Rollover Complete</span>
          </div>
        ) : (
          <button
            onClick={handleSettle}
            disabled={settling}
            className={`w-full md:w-auto h-10 px-5 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isAuctionEnded
                ? 'bg-signal-amber text-neutral-50 hover:opacity-95'
                : 'bg-neutral-50 text-signal-amber border border-signal-amber/40 hover:bg-signal-amber/10'
            }`}
          >
            <TrendUp size={15} weight="bold" />
            {settling
              ? 'Computing Uniform P* / Q*...'
              : isAuctionEnded
              ? 'Settle Auction Now'
              : 'Trigger Early Keeper Settlement'}
          </button>
        )}
      </div>
    </div>
  );
};
