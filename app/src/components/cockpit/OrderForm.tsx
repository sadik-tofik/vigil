'use client';

import React, { useState } from 'react';
import { MarketMode, OrderSide, OracleState } from '@/lib/types';
import { WarningCircle, ArrowUpRight, ArrowDownLeft, ShieldCheck, Check } from '@phosphor-icons/react';

interface Props {
  mode: MarketMode;
  oracle: OracleState;
  baseSymbol: string;
  quoteSymbol: string;
  onPlaceOrder: (side: OrderSide, lotSize: number, limitPrice: number) => { success: boolean; error?: string } | Promise<{ success: boolean; error?: string }>;
}

export const OrderForm: React.FC<Props> = ({
  mode,
  oracle,
  baseSymbol,
  quoteSymbol,
  onPlaceOrder,
}) => {
  const [side, setSide] = useState<OrderSide>('bid');
  const [lotSizeInput, setLotSizeInput] = useState('10');
  const [priceInput, setPriceInput] = useState(oracle.price.toFixed(2));
  const [placedFeedback, setPlacedFeedback] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isBatchMode = mode === 'batchAuction';
  const lotSizeNum = parseFloat(lotSizeInput) || 0;
  const priceNum = parseFloat(priceInput) || 0;
  const totalValue = lotSizeNum * priceNum;

  // Client-side validation against confidence band
  const isOutOfBand = priceNum > 0 && (priceNum < oracle.minPrice || priceNum > oracle.maxPrice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isBatchMode) {
      setErrorMsg('Continuous mode active. Batch orders are only permitted in Twilight Batch Auction mode.');
      return;
    }

    if (lotSizeNum <= 0) {
      setErrorMsg('Lot size must be greater than zero.');
      return;
    }

    if (priceNum <= 0) {
      setErrorMsg('Limit price must be positive.');
      return;
    }

    if (isOutOfBand) {
      setErrorMsg(`Limit price $${priceNum.toFixed(2)} exceeds Pyth confidence band [$${oracle.minPrice.toFixed(2)}, $${oracle.maxPrice.toFixed(2)}]. Rejecting client-side before failed transaction.`);
      return;
    }

    const res = await onPlaceOrder(side, lotSizeNum, priceNum);
    if (res.success) {
      setPlacedFeedback(true);
      setTimeout(() => setPlacedFeedback(false), 2000);
    } else {
      setErrorMsg(res.error || 'Failed to place order.');
    }
  };

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-4">
          <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-semibold">
            SUBMIT LIMIT ORDER
          </span>
          <span className="text-[11px] font-mono text-neutral-500">
            Escrowed Vault CPI
          </span>
        </div>

        {/* Side Toggle: Buy vs Sell */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-50 rounded-lg mb-4 border border-neutral-200">
          <button
            type="button"
            onClick={() => setSide('bid')}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              side === 'bid'
                ? 'bg-signal-green text-neutral-50'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <ArrowUpRight size={14} weight="bold" /> Buy ({baseSymbol})
          </button>
          <button
            type="button"
            onClick={() => setSide('ask')}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              side === 'ask'
                ? 'bg-signal-red text-neutral-50'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <ArrowDownLeft size={14} weight="bold" /> Sell ({baseSymbol})
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lot Size Input */}
          <div>
            <div className="flex justify-between text-xs text-neutral-500 mb-1 font-mono">
              <span>Lot Size (Shares)</span>
              <span>Units: {baseSymbol}</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="1"
                value={lotSizeInput}
                onChange={(e) => setLotSizeInput(e.target.value)}
                className="w-full h-10 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 font-mono text-sm focus:outline-none focus:border-signal-amber focus:ring-2 focus:ring-signal-amber/20"
                placeholder="10"
              />
              <span className="absolute right-3 top-2.5 text-xs text-neutral-400 font-mono">
                {baseSymbol}
              </span>
            </div>
          </div>

          {/* Limit Price Input with Confidence Band Guard */}
          <div>
            <div className="flex justify-between text-xs text-neutral-500 mb-1 font-mono">
              <span>Limit Price</span>
              <span>Envelope: ${oracle.minPrice.toFixed(2)} - ${oracle.maxPrice.toFixed(2)}</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className={`w-full h-10 px-3 py-2 bg-neutral-50 border rounded-lg text-neutral-900 font-mono text-sm focus:outline-none ${
                  isOutOfBand
                    ? 'border-signal-red focus:border-signal-red focus:ring-2 focus:ring-signal-red/20'
                    : 'border-neutral-200 focus:border-signal-amber focus:ring-2 focus:ring-signal-amber/20'
                }`}
                placeholder={oracle.price.toFixed(2)}
              />
              <span className="absolute right-3 top-2.5 text-xs text-neutral-400 font-mono">
                {quoteSymbol}
              </span>
            </div>

            {isOutOfBand && (
              <p className="text-signal-red text-xs mt-1.5 flex items-center gap-1 font-mono">
                <WarningCircle size={13} weight="fill" />
                <span>Price exceeds Pyth confidence band [${oracle.minPrice.toFixed(2)} - ${oracle.maxPrice.toFixed(2)}]</span>
              </p>
            )}
          </div>

          {/* Escrow Value Estimate */}
          <div className="p-3 bg-neutral-150 border border-neutral-200 rounded-lg text-xs space-y-1 font-mono">
            <div className="flex justify-between text-neutral-500">
              <span>Required Escrow:</span>
              <span className="text-neutral-900 font-bold tabular-nums">
                {side === 'bid'
                  ? `$${totalValue.toFixed(2)} ${quoteSymbol}`
                  : `${lotSizeNum} ${baseSymbol}`}
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-neutral-400">
              <span>Pricing Guarantee:</span>
              <span className="text-signal-green">Uniform Clearing (P*)</span>
            </div>
          </div>

          {/* Error Notice */}
          {errorMsg && (
            <div className="p-2.5 bg-signal-red/10 border border-signal-red/30 rounded-lg text-signal-red text-xs flex items-start gap-2">
              <WarningCircle size={15} weight="fill" className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={!isBatchMode || isOutOfBand}
            className={`w-full h-10 px-4 rounded-lg font-bold text-xs font-mono tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
              placedFeedback
                ? 'bg-signal-green text-neutral-50'
                : !isBatchMode
                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300'
                : isOutOfBand
                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300'
                : 'bg-signal-amber text-neutral-50 hover:opacity-95'
            }`}
          >
            {placedFeedback ? (
              <>
                <Check size={16} weight="bold" />
                <span>Order Escrowed & Recorded!</span>
              </>
            ) : !isBatchMode ? (
              <>
                <ShieldCheck size={16} />
                <span>Continuous Mode (Batch Order Gated)</span>
              </>
            ) : (
              <>
                <span>Deposit & Escrow {side.toUpperCase()} Order</span>
              </>
            )}
          </button>
        </form>
      </div>

      <div className="mt-4 pt-3 border-t border-neutral-200 text-[11px] text-neutral-400 text-center font-mono">
        All clearing prices are uniform. Unfilled limits and price improvement surpluses are 100% refundable.
      </div>
    </div>
  );
};
