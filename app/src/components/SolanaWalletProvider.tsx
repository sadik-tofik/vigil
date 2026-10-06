'use client';

import React, { useMemo, useCallback, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletError } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { DEFAULT_RPC_URL } from '@/lib/solanaConfig';

// Import wallet adapter UI default styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Silence non-fatal RPC 429 rate-limiting retries and network hiccup logs from triggering Turbopack dev error overlay
if (typeof window !== 'undefined') {
  const origError = console.error;
  console.error = (...args: any[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : (args[0]?.message || '');
    if (
      msg.includes('429') ||
      msg.includes('Retrying after') ||
      msg.includes('Failed to load resource') ||
      msg.includes('ERR_NAME_NOT_RESOLVED') ||
      msg.includes('net::ERR_')
    ) {
      console.warn(...args);
      return;
    }
    origError.apply(console, args);
  };
}

interface Props {
  children: ReactNode;
}

export const SolanaWalletProvider: React.FC<Props> = ({ children }) => {
  const endpoint = useMemo(() => DEFAULT_RPC_URL, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  const handleError = useCallback((error: WalletError) => {
    // Expected user rejection or cancellation shouldn't trigger Next.js dev overlay
    if (
      error.name === 'WalletSignTransactionError' ||
      error.message?.includes('User rejected') ||
      error.message?.includes('User cancelled')
    ) {
      console.warn('Wallet transaction rejected by user:', error.message);
      return;
    }
    console.error('Wallet error:', error);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={handleError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
