'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Lock, Timer } from '@phosphor-icons/react';

interface Props {
  startSlot: number;
  endSlot: number;
  currentSlot: number;
  status: string;
  onTimerZero?: () => void;
}

export const CountdownRing: React.FC<Props> = ({
  startSlot,
  endSlot,
  currentSlot,
  status: _status,
  onTimerZero,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    const slots = Math.max(0, endSlot - currentSlot);
    return Math.round(slots * 0.4);
  });

  const onTimerZeroRef = useRef(onTimerZero);
  useEffect(() => {
    onTimerZeroRef.current = onTimerZero;
  }, [onTimerZero]);

  const hasFiredRef = useRef(false);

  useEffect(() => {
    hasFiredRef.current = false;
  }, [startSlot, endSlot]);

  useEffect(() => {
    const slotsRemaining = Math.max(0, endSlot - currentSlot);
    const initialSec = Math.round(slotsRemaining * 0.4);
    setSecondsRemaining(initialSec);

    if (initialSec <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [startSlot, endSlot, currentSlot]);

  // Safely trigger onTimerZero when timer hits 0
  useEffect(() => {
    if (secondsRemaining <= 0 && !hasFiredRef.current) {
      hasFiredRef.current = true;
      onTimerZeroRef.current?.();
    }
  }, [secondsRemaining]);

  const slotsRemaining = Math.max(0, endSlot - currentSlot);
  const totalSlots = Math.max(1, endSlot - startSlot);
  const progressPercent = Math.min(100, Math.max(0, ((totalSlots - slotsRemaining) / totalSlots) * 100));

  // Anti-sniping freeze window is active when slotsRemaining <= 10
  const isFrozenWindow = slotsRemaining <= 10 && slotsRemaining > 0;
  const isEnded = slotsRemaining === 0 || secondsRemaining === 0;

  // SVG Ring dimensions per §8.6
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  // Progress color: green if ready, red if frozen window, amber during normal operation
  const strokeColor = isEnded
    ? 'var(--signal-green)'
    : isFrozenWindow
    ? 'var(--signal-red)'
    : 'var(--signal-amber)';

  return (
    <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4 sm:p-5 flex flex-col items-center justify-between">
      <div className="w-full flex items-center justify-between border-b border-neutral-200 pb-3 mb-2">
        <span className="text-xs uppercase tracking-[0.06em] text-neutral-500 font-semibold flex items-center gap-1.5">
          <Timer size={14} weight="light" className="text-signal-amber" />
          <span>EPOCH AUCTION TIMER</span>
        </span>
        <span className="text-[11px] font-mono text-neutral-500">
          Slot {currentSlot} / {endSlot}
        </span>
      </div>

      <div className="relative flex items-center justify-center my-3">
        <svg className="w-24 h-24 transform -rotate-90">
          {/* Background Track: neutral-200 */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="var(--neutral-200)"
            strokeWidth="6"
            fill="transparent"
          />
          {/* Progress Arc: Amber / Red / Green */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke={strokeColor}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-linear"
          />
        </svg>

        <div className="absolute flex flex-col items-center justify-center text-center">
          {/* Center digits: Martian Mono, text-3xl */}
          <span className="font-martian text-3xl font-bold tabular-nums text-neutral-900 leading-none">
            {secondsRemaining}s
          </span>
          <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider mt-1">
            {isEnded ? 'Ready' : `${slotsRemaining} slots`}
          </span>
        </div>
      </div>

      {/* Freeze Window or Status Banner */}
      <div className="w-full mt-2">
        {isFrozenWindow ? (
          <div className="flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg bg-signal-red/10 border border-signal-red/30 text-signal-red text-[11px] font-mono">
            <Lock size={12} weight="fill" />
            <span>Freeze Window Active (&lt;10 slots)</span>
          </div>
        ) : isEnded ? (
          <div className="flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg bg-signal-green/10 border border-signal-green/30 text-signal-green text-[11px] font-mono">
            <span>Auction Closed · Ready to Settle</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1 text-[11px] text-neutral-500 font-mono">
            <span>Accepting Orders (~400ms / slot)</span>
          </div>
        )}
      </div>
    </div>
  );
};
