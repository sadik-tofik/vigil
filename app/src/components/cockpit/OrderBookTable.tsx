'use client';

import React from 'react';
import { BatchOrder, BatchStatus } from '@/lib/types';
import { Lock, CheckCircle, Clock, XCircle, ArrowUpRight, ArrowDownLeft, Gift } from '@phosphor-icons/react';

interface Props {
  orders: BatchOrder[];
  status: BatchStatus;
  currentSlot: number;
  endSlot: number;
  clearingPrice: number;
  onCancelOrder: (index: number) => { success: boolean; error?: string } | Promise<{ success: boolean; error?: string } | void>;
  onClaimProceeds: (index: number) => { success: boolean; error?: string } | Promise<{ success: boolean; error?: string } | void>;
}

export const OrderBookTable: React.FC<Props> = ({
  orders,
  status,
  currentSlot,
  endSlot,
  clearingPrice,
  onCancelOrder,
  onClaimProceeds,
}) => {
  const isSettled = status === 'settled';
  const slotsRemaining = Math.max(0, endSlot - currentSlot);
  const isFrozen = slotsRemaining <= 10 && slotsRemaining > 0;

  // Filter out non-existent or cancelled orders
  const activeOrders = orders.filter((o) => o.lotSize > 0);

  // Max lot size for visual depth bars per §8.5
  const maxLotSize = Math.max(1, ...activeOrders.map((o) => o.lotSize));

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-xl transition-colors">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-bold font-sans">
            ACTIVE EPOCH ORDERS
          </span>
          <span className="text-[11px] font-mono text-signal-cyan bg-signal-cyan/10 px-2 py-0.5 rounded border border-signal-cyan/30">
            {activeOrders.length} / 32 Ring Buffer
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          {isSettled ? (
            <span className="text-signal-green flex items-center gap-1 font-bold">
              <CheckCircle size={14} weight="bold" /> Batch Cleared at P* = ${clearingPrice.toFixed(2)}
            </span>
          ) : isFrozen ? (
            <span className="text-signal-red flex items-center gap-1 font-bold animate-pulse">
              <Lock size={14} weight="fill" /> Cancellations Locked (Freeze Window)
            </span>
          ) : (
            <span className="text-neutral-500 flex items-center gap-1">
              <Clock size={14} /> Cancellation Window Open
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 text-[11px] text-neutral-500 font-mono uppercase tracking-wider">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Trader</th>
              <th className="py-2.5 px-3">Side</th>
              <th className="py-2.5 px-3 text-right">Shares</th>
              <th className="py-2.5 px-3 text-right">Limit Price</th>
              <th className="py-2.5 px-3 text-right">Filled</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 font-mono text-xs tabular-nums">
            {activeOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-neutral-500 font-mono text-xs">
                  No batch orders placed in this epoch yet. Use the Order Entry form to submit.
                </td>
              </tr>
            ) : (
              activeOrders.map((order) => {
                const isBid = order.side === 'bid';
                const hasSurplusRefund =
                  isSettled &&
                  isBid &&
                  order.filledLotSize > 0 &&
                  order.limitPrice > clearingPrice;
                const surplusAmount = hasSurplusRefund
                  ? (order.limitPrice - clearingPrice) * order.filledLotSize
                  : 0;

                const barWidth = Math.min(100, Math.round((order.lotSize / maxLotSize) * 100));

                return (
                  <tr key={order.index} className="h-9 hover:bg-neutral-150 transition-colors">
                    <td className="py-1 px-3 text-neutral-500/80">{order.index}</td>
                    <td className="py-1 px-3 text-neutral-900 font-medium">{order.user}</td>
                    <td className="py-1 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isBid
                            ? 'bg-signal-green/15 text-signal-green border border-signal-green/30'
                            : 'bg-signal-red/15 text-signal-red border border-signal-red/30'
                        }`}
                      >
                        {isBid ? (
                          <ArrowUpRight size={12} weight="bold" />
                        ) : (
                          <ArrowDownLeft size={12} weight="bold" />
                        )}
                        {order.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1 px-3 text-right font-medium text-neutral-900 relative overflow-hidden">
                      <div
                        aria-hidden="true"
                        className={`absolute top-0 bottom-0 pointer-events-none transition-all duration-150 ${
                          isBid ? 'right-0 bg-signal-green/10' : 'left-0 bg-signal-red/10'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                      <span className="relative z-10">{order.lotSize}</span>
                    </td>
                    <td className="py-1 px-3 text-right text-neutral-900">
                      ${order.limitPrice.toFixed(2)}
                    </td>
                    <td className="py-1 px-3 text-right">
                      {isSettled ? (
                        <span
                          className={
                            order.filledLotSize > 0
                              ? 'text-signal-green font-bold'
                              : 'text-neutral-500/80'
                          }
                        >
                          {order.filledLotSize} / {order.lotSize}
                        </span>
                      ) : (
                        <span className="text-neutral-500/80">Pending</span>
                      )}
                    </td>
                    <td className="py-1 px-3 text-right">
                      {isSettled ? (
                        order.claimed ? (
                          <span className="text-[11px] text-neutral-500/80 px-2 py-1">Claimed</span>
                        ) : (
                          <button
                            onClick={() => onClaimProceeds(order.index)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded bg-signal-amber text-neutral-50 text-[11px] font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                          >
                            <Gift size={13} weight="bold" />
                            <span>Claim</span>
                            {hasSurplusRefund && (
                              <span className="text-[9px] bg-neutral-900/20 px-1 rounded">
                                +${surplusAmount.toFixed(2)}
                              </span>
                            )}
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => onCancelOrder(order.index)}
                          disabled={isFrozen}
                          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded border text-[11px] transition-colors cursor-pointer ${
                            isFrozen
                              ? 'border-neutral-200 text-neutral-500/60 cursor-not-allowed opacity-50'
                              : 'border-neutral-200 text-neutral-500 hover:text-signal-red hover:border-signal-red/50 hover:bg-signal-red/10'
                          }`}
                        >
                          {isFrozen ? <Lock size={12} weight="fill" /> : <XCircle size={12} />}
                          <span>Cancel</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
