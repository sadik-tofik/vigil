'use client';

import React, { useState } from 'react';
import { SunHorizon, Lightning, ShieldWarning, Clock, ArrowClockwise, TerminalWindow, Check } from '@phosphor-icons/react';

interface Props {
  onSimulateMarketOpen: () => void;
  onSimulateWeekendShock: () => void;
  onSimulateMarketHalt: () => void;
  onSimulateStaleFeed: () => void;
  onEvaluateMode: () => void;
}

export const JudgeControls: React.FC<Props> = ({
  onSimulateMarketOpen,
  onSimulateWeekendShock,
  onSimulateMarketHalt,
  onSimulateStaleFeed,
  onEvaluateMode,
}) => {
  const [activePreset, setActivePreset] = useState<string>('open');
  const [evalFeedback, setEvalFeedback] = useState(false);

  const handleTrigger = (name: string, fn: () => void) => {
    setActivePreset(name);
    fn();
  };

  const handleManualEval = () => {
    onEvaluateMode();
    setEvalFeedback(true);
    setTimeout(() => setEvalFeedback(false), 1500);
  };

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-200 pb-3 mb-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-signal-amber/10 border border-signal-amber/30 text-signal-amber">
            <TerminalWindow size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-900 tracking-wide uppercase">
              JUDGE INJECTION CONTROLS
            </span>
            <span className="text-[11px] text-neutral-500 block">
              Demo Controls — calls setMockOracle & evaluates circuit
            </span>
          </div>
        </div>

        <button
          onClick={handleManualEval}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-50 hover:bg-neutral-200/50 border border-neutral-200 text-neutral-900 text-xs font-mono transition-all self-start sm:self-auto cursor-pointer"
        >
          {evalFeedback ? (
            <>
              <Check size={14} weight="bold" className="text-signal-green" /> Evaluated!
            </>
          ) : (
            <>
              <ArrowClockwise size={14} className="text-signal-amber" /> evaluate_market_mode()
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Button 1: Market Open */}
        <button
          onClick={() => handleTrigger('open', onSimulateMarketOpen)}
          className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activePreset === 'open'
              ? 'bg-signal-green/10 border-signal-green/50 ring-1 ring-signal-green/40'
              : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <SunHorizon size={16} weight="bold" className="text-signal-green mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-xs text-neutral-900">Simulate Market Open</div>
            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
              price=$214.50, conf=0.20 (9.3 bps)
            </div>
            <span className="text-[9px] text-signal-green font-semibold block mt-1 uppercase">
              → Continuous Mode
            </span>
          </div>
        </button>

        {/* Button 2: Weekend Shock */}
        <button
          onClick={() => handleTrigger('shock', onSimulateWeekendShock)}
          className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activePreset === 'shock'
              ? 'bg-signal-violet/10 border-signal-violet/50 ring-1 ring-signal-violet/40'
              : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <Lightning size={16} weight="fill" className="text-signal-violet mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-xs text-neutral-900">Simulate Weekend Shock</div>
            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
              price=$214.50, conf=6.00 (~2798 bps)
            </div>
            <span className="text-[9px] text-signal-violet font-semibold block mt-1 uppercase">
              → Batch Auction Mode
            </span>
          </div>
        </button>

        {/* Button 3: Market Halt */}
        <button
          onClick={() => handleTrigger('halt', onSimulateMarketHalt)}
          className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activePreset === 'halt'
              ? 'bg-signal-red/10 border-signal-red/50 ring-1 ring-signal-red/40'
              : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <ShieldWarning size={16} weight="fill" className="text-signal-red mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-xs text-neutral-900">Simulate Market Halt</div>
            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
              status=2 (Halted), conf=0.20
            </div>
            <span className="text-[9px] text-signal-red font-semibold block mt-1 uppercase">
              → Batch Auction Mode
            </span>
          </div>
        </button>

        {/* Button 4: Stale Feed */}
        <button
          onClick={() => handleTrigger('stale', onSimulateStaleFeed)}
          className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
            activePreset === 'stale'
              ? 'bg-signal-amber/10 border-signal-amber/50 ring-1 ring-signal-amber/40'
              : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <Clock size={16} weight="bold" className="text-signal-amber mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-xs text-neutral-900">Simulate Stale Feed</div>
            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
              publishTime &gt; 60s in past
            </div>
            <span className="text-[9px] text-signal-amber font-semibold block mt-1 uppercase">
              → Batch Auction Mode
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
