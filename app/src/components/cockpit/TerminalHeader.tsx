'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MarketMode } from '@/lib/types';
import { MarketStateBadge } from './MarketStateBadge';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  BookOpen,
  Wallet,
  CaretDown,
  ArrowSquareOut,
  Broadcast,
  Lightning,
  Coins,
  X,
} from '@phosphor-icons/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PROGRAM_ID } from '@/lib/solanaConfig';

interface Props {
  mode: MarketMode;
  maxConfBps: number;
  currentConfBps: number;
  baseSymbol: string;
  quoteSymbol: string;
  isLiveDevnet?: boolean;
  onToggleLiveDevnet?: () => void;
  onRequestFaucet?: () => void;
  faucetLoading?: boolean;
  faucetSuccess?: boolean;
  onSelectPair?: (symbol: string) => void;
}

export const TerminalHeader: React.FC<Props> = ({
  mode,
  maxConfBps,
  currentConfBps,
  baseSymbol,
  quoteSymbol,
  isLiveDevnet = false,
  onToggleLiveDevnet,
  onRequestFaucet,
  faucetLoading = false,
  faucetSuccess = false,
}) => {
  const [mounted, setMounted] = useState(false);
  const { publicKey, disconnect, connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  useEffect(() => {
    setMounted(true);
  }, []);

  const truncatedAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <header className="border-b border-neutral-200 bg-neutral-50 sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand & Pair */}
        <div className="flex items-center gap-4 sm:gap-5">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center font-bold text-neutral-900 text-xs tracking-wider">
              TB
            </div>
            <div>
              <span className="font-bold text-base text-neutral-900 tracking-tight block leading-tight group-hover:text-signal-amber transition-colors">
                TwilightBook
              </span>
              <span className="text-[10px] text-neutral-500 font-mono block leading-tight">
                24/7 Tokenized Equities
              </span>
            </div>
          </Link>

          {/* Market Pair Selector */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-100 border border-neutral-200 text-xs font-mono">
            <span className="text-neutral-500">PAIR:</span>
            <span className="text-neutral-900 font-bold">{baseSymbol} / {quoteSymbol}</span>
            <CaretDown size={14} className="text-neutral-500 ml-1" />
          </div>

          {/* Devnet Program ID link */}
          <a
            href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 border border-neutral-200 hover:border-neutral-300 text-[11px] font-mono text-neutral-500 hover:text-neutral-900 transition-colors"
            title="View Deployed Program on Solana Explorer (Devnet)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
            <span>Devnet: {PROGRAM_ID.toBase58().slice(0, 4)}...{PROGRAM_ID.toBase58().slice(-4)}</span>
            <ArrowSquareOut size={12} className="text-neutral-400" />
          </a>
        </div>

        {/* Center: Market State Badge */}
        <div className="hidden md:flex items-center justify-center">
          <MarketStateBadge
            mode={mode}
            maxConfBps={maxConfBps}
            currentConfBps={currentConfBps}
          />
        </div>

        {/* Right: Mode Switcher, Docs Link, Theme Toggle, Wallet Button */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Mode Switcher: Live Devnet vs Instant Sim */}
          {onToggleLiveDevnet && (
            <button
              onClick={onToggleLiveDevnet}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
                isLiveDevnet
                  ? 'bg-signal-green/10 border-signal-green/40 text-signal-green'
                  : 'bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-900'
              }`}
              title="Toggle between Live On-Chain Devnet execution and instant client-side simulation"
            >
              {isLiveDevnet ? (
                <>
                  <Broadcast size={14} className="animate-pulse text-signal-green" />
                  <span className="font-bold">LIVE DEVNET</span>
                </>
              ) : (
                <>
                  <Lightning size={14} className="text-signal-violet" />
                  <span>INSTANT SIM</span>
                </>
              )}
            </button>
          )}

          <Link
            href="/docs"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200/50 border border-neutral-200 text-neutral-900 text-xs font-medium transition-colors"
          >
            <BookOpen size={14} className="text-signal-amber" />
            <span>Docs</span>
          </Link>

          {/* Faucet button hidden for production stability */}
          {false && isLiveDevnet && connected && onRequestFaucet && (
            <button
              onClick={onRequestFaucet}
              disabled={faucetLoading}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-signal-amber/10 border border-signal-amber/30 hover:bg-signal-amber/20 text-signal-amber text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
              title="Airdrop 1,000 Devnet USDC and 50 tTSLA directly from the Mint Authority"
            >
              <Coins size={14} />
              <span>{faucetLoading ? 'Minting...' : faucetSuccess ? '✓ Funded' : 'Airdrop USDC'}</span>
            </button>
          )}

          {/* Theme Toggle Button per §8.7 */}
          <ThemeToggle />

          {/* Real Solana Wallet Adapter Button */}
          {mounted && (
            connected && publicKey ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setVisible(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200/50 border border-signal-green/40 text-xs font-mono text-neutral-900 transition-colors cursor-pointer"
                  title="Click to change wallet"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-ping" />
                  <Wallet size={14} className="text-signal-green" />
                  <span className="font-bold text-signal-green">{truncatedAddress}</span>
                </button>
                <button
                  onClick={() => disconnect()}
                  className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200/50 border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-signal-red transition-colors cursor-pointer"
                  title="Disconnect Wallet"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setVisible(true)}
                disabled={connecting}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-signal-amber text-neutral-50 hover:opacity-95 font-medium text-xs font-mono transition-opacity cursor-pointer disabled:opacity-50"
              >
                <Wallet size={14} />
                <span>{connecting ? 'Connecting...' : 'Connect Wallet'}</span>
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
};
