'use client';

import React from 'react';
import { Market, AssetClass, MarketMode } from '@vigil-protocol/sdk';
import { PublicKey } from '@solana/web3.js';
import { Buildings, CurrencyCircleDollar, Lightning, Broadcast, CheckCircle, CaretRight } from '@phosphor-icons/react';

export interface MarketItem {
  pubkey: PublicKey;
  market: Market;
  name: string;
  baseSymbol: string;
  quoteSymbol: string;
}

interface Props {
  markets: MarketItem[];
  selectedMarket: PublicKey | null;
  onSelectMarket: (marketPubkey: PublicKey) => void;
  keeperActive?: boolean;
}

export const MarketPicker: React.FC<Props> = ({
  markets,
  selectedMarket,
  onSelectMarket,
  keeperActive = true,
}) => {
  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-3.5 sm:p-4 shadow-xl transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-bold font-sans">
            On-Chain Multi-Market Registry
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-150 text-signal-cyan border border-neutral-200 font-mono font-bold">
            {markets.length} Live Pairs
          </span>
        </div>

        {/* Live Keeper Status Indicator */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-150 border border-neutral-200">
            <span className={`w-2 h-2 rounded-full ${keeperActive ? 'bg-signal-green animate-pulse' : 'bg-signal-red'}`} />
            <span className="text-neutral-500 text-[10px]">KEEPER ENGINE:</span>
            <span className={`font-bold ${keeperActive ? 'text-signal-green' : 'text-signal-red'}`}>
              {keeperActive ? 'CRANKING DEVNET' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Available Markets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {markets.map((item, idx) => {
          const isSelected = selectedMarket && selectedMarket.equals(item.pubkey);
          const isBatch = item.market.mode === 'BatchAuction';
          const isEquity = item.market.assetClass === 'TokenizedEquity';

          return (
            <button
              key={item.pubkey.toBase58()}
              onClick={() => onSelectMarket(item.pubkey)}
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? 'bg-neutral-150 border-signal-amber shadow-lg shadow-signal-amber/5'
                  : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-100'
              }`}
            >
              {/* Active selection accent bar */}
              {isSelected && (
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-signal-amber" />
              )}

              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                      isEquity
                        ? 'bg-signal-violet/10 border-signal-violet/30 text-signal-violet'
                        : 'bg-signal-cyan/10 border-signal-cyan/30 text-signal-cyan'
                    }`}
                  >
                    {isEquity ? (
                      <Buildings size={16} weight="bold" />
                    ) : (
                      <CurrencyCircleDollar size={16} weight="bold" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-neutral-900 font-sans">
                        {item.name}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${
                          isEquity
                            ? 'bg-signal-violet/15 text-signal-violet border border-signal-violet/30'
                            : 'bg-signal-cyan/15 text-signal-cyan border border-signal-cyan/30'
                        }`}
                      >
                        {item.market.assetClass}
                      </span>
                    </div>

                    <span className="text-[10px] text-neutral-500/80 font-mono block">
                      PDA: {item.pubkey.toBase58().slice(0, 4)}...{item.pubkey.toBase58().slice(-4)}
                    </span>
                  </div>
                </div>

                {/* Mode Pill Badge */}
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isBatch
                        ? 'bg-signal-amber/15 text-signal-amber border border-signal-amber/30'
                        : 'bg-signal-green/15 text-signal-green border border-signal-green/30'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isBatch ? 'bg-signal-amber animate-pulse' : 'bg-signal-green'}`} />
                    {isBatch ? 'BATCH AUCTION' : 'CONTINUOUS'}
                  </span>

                  <span className="text-[10px] font-mono text-neutral-500">
                    Epoch <strong className="text-neutral-900">#{item.market.currentEpoch.toString()}</strong>
                  </span>
                </div>
              </div>

              {/* Bottom metadata footer */}
              <div className="pt-2 border-t border-neutral-200 flex items-center justify-between text-[10px] font-mono text-neutral-500">
                <span>Duration: {item.market.epochDurationSlots.toString()} slots</span>
                <span>Max σ: {item.market.maxConfBps.toString()} bps</span>
                <span className="text-signal-amber flex items-center gap-0.5">
                  {isSelected ? 'Active Market' : 'Select Pair'}
                  <CaretRight size={10} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
