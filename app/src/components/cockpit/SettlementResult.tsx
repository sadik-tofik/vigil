'use client';

import React from 'react';
import { Gavel, CheckCircle, ArrowSquareOut, Gift, Sparkle, ShieldCheck, CurrencyDollar } from '@phosphor-icons/react';
import { BatchOrder } from '@/lib/types';

interface Props {
  epochId: number;
  clearingPrice: number;
  matchedVolume: number;
  orders: BatchOrder[];
  baseSymbol: string;
  quoteSymbol: string;
  isSettled: boolean;
  onClaimAll?: () => void;
}

export const SettlementResult: React.FC<Props> = ({
  epochId,
  clearingPrice,
  matchedVolume,
  orders,
  baseSymbol,
  quoteSymbol,
  isSettled,
  onClaimAll,
}) => {
  if (!isSettled || clearingPrice <= 0) {
    return (
      <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-xl font-mono text-xs flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-signal-amber/10 border border-signal-amber/30 flex items-center justify-center text-signal-amber">
            <Gavel size={18} weight="bold" />
          </div>
          <div>
            <span className="font-bold text-neutral-900 text-sm font-sans block">
              Epoch #{epochId} Auction In Progress
            </span>
            <span className="text-[11px] text-neutral-500/80">
              Keeper bot periodically monitors slots and cranks settlement once end_slot passes.
            </span>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded bg-neutral-150 border border-neutral-200 text-signal-amber font-bold text-[11px]">
          ● Awaiting Crank
        </span>
      </div>
    );
  }

  // Calculate tier fill statistics
  const strictlyBetterOrders = orders.filter((o) => {
    if (o.side === 'bid') return o.limitPrice > clearingPrice;
    return o.limitPrice < clearingPrice;
  });

  const tieOrders = orders.filter((o) => Math.abs(o.limitPrice - clearingPrice) < 0.001);
  const outOfMoneyOrders = orders.filter((o) => {
    if (o.side === 'bid') return o.limitPrice < clearingPrice;
    return o.limitPrice > clearingPrice;
  });

  const totalRefundAmount = orders
    .filter((o) => o.side === 'bid' && o.filledLotSize > 0 && o.limitPrice > clearingPrice)
    .reduce((sum, o) => sum + (o.limitPrice - clearingPrice) * o.filledLotSize, 0);

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-xl font-mono transition-colors">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-signal-green/15 border border-signal-green/30 flex items-center justify-center text-signal-green">
            <CheckCircle size={18} weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-neutral-900 font-sans">
                Epoch #{epochId} Uniform Settlement Resolved
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-signal-green/15 border border-signal-green/30 text-signal-green font-bold">
                Cranked by Keeper
              </span>
            </div>
            <span className="text-[10px] text-neutral-500/80 block">
              Single Market-Clearing Uniform Equilibrium Price
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-neutral-150 border border-neutral-200">
            <span className="text-neutral-500/80 text-[10px] uppercase">Uniform Price:</span>
            <span className="font-bold text-signal-amber text-base tabular-nums">
              ${clearingPrice.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-neutral-150 border border-neutral-200">
            <span className="text-neutral-500/80 text-[10px] uppercase">Matched Q*:</span>
            <span className="font-bold text-signal-green text-base tabular-nums">
              {matchedVolume} {baseSymbol}
            </span>
          </div>
        </div>
      </div>

      {/* 3-Tier Fill Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-xs">
        {/* Tier 1: Strictly Better Orders */}
        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-signal-green font-bold mb-1">
              <span>Tier 1: Strictly In-The-Money</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-signal-green/10 border border-signal-green/30">
                100% Fill
              </span>
            </div>
            <p className="text-[11px] text-neutral-500/80 mb-2 font-sans">
              Bids priced strictly above $P^*$ and asks strictly below $P^*$ execute with 100% deterministic priority.
            </p>
          </div>
          <div className="pt-2 border-t border-neutral-200 flex justify-between text-[11px] text-neutral-500">
            <span>Orders in Tier:</span>
            <span className="font-bold text-neutral-900">{strictlyBetterOrders.length}</span>
          </div>
        </div>

        {/* Tier 2: Marginal Orders at P* */}
        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-signal-amber font-bold mb-1">
              <span>Tier 2: Marginal Tie Price</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-signal-amber/10 border border-signal-amber/30">
                Pro-Rata Fill
              </span>
            </div>
            <p className="text-[11px] text-neutral-500/80 mb-2 font-sans">
              Orders priced exactly at $P^*$ split residual matched volume proportionally by lot size with zero overflow.
            </p>
          </div>
          <div className="pt-2 border-t border-neutral-200 flex justify-between text-[11px] text-neutral-500">
            <span>Orders in Tier:</span>
            <span className="font-bold text-neutral-900">{tieOrders.length}</span>
          </div>
        </div>

        {/* Tier 3: Out-of-the-Money */}
        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-neutral-500 font-bold mb-1">
              <span>Tier 3: Out-of-the-Money</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-150 border border-neutral-200 text-neutral-500/80">
                0% Fill (Refund)
              </span>
            </div>
            <p className="text-[11px] text-neutral-500/80 mb-2 font-sans">
              Bids &lt; $P^*$ and Asks &gt; $P^*$ receive zero fill. 100% of escrowed funds are unlocked and claimable.
            </p>
          </div>
          <div className="pt-2 border-t border-neutral-200 flex justify-between text-[11px] text-neutral-500">
            <span>Orders in Tier:</span>
            <span className="font-bold text-neutral-900">{outOfMoneyOrders.length}</span>
          </div>
        </div>
      </div>

      {/* Buyer Price-Improvement Cash Refund Feature */}
      {totalRefundAmount > 0 && (
        <div className="p-3 rounded-lg bg-neutral-150 border border-signal-amber/30 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CurrencyDollar size={18} className="text-signal-amber" weight="bold" />
            <div>
              <span className="font-bold text-neutral-900 block">
                Buyer Price-Improvement Surplus Distributed: +${totalRefundAmount.toFixed(2)} {quoteSymbol}
              </span>
              <span className="text-[11px] text-neutral-500">
                Bidders escrowed at $P_limit &gt; P^*$ automatically receive cash refund $(P_limit - P^*) \times Q$ upon claim!
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-signal-amber/10 text-signal-amber text-[10px] font-bold uppercase tracking-wider">
            INV-11 Verified
          </span>
        </div>
      )}
    </div>
  );
};
