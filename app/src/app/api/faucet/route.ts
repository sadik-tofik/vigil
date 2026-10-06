import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const BASE_MINT = new PublicKey('4iYXDWaHC5A1B5ymiLmqAyPt5K2miKS2yBaqHr98p9Am'); // tTSLA
const QUOTE_MINT = new PublicKey('Ba7J5A5jCViRSKk1UPfZZthz3sEBdEQBydh4a6ibJjA'); // test USDC

function getAuthorityKeypair(): Keypair | null {
  try {
    if (process.env.SOLANA_KEYPAIR_JSON) {
      const raw = JSON.parse(process.env.SOLANA_KEYPAIR_JSON);
      return Keypair.fromSecretKey(new Uint8Array(raw));
    }
    const keyPath = process.env.SOLANA_KEYPAIR_PATH || '/home/sadik/.config/solana/id.json';
    if (fs.existsSync(keyPath)) {
      const raw = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
      return Keypair.fromSecretKey(new Uint8Array(raw));
    }
  } catch (err) {
    console.error('Error loading authority keypair:', err);
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient } = body;

    if (!recipient) {
      return NextResponse.json({ error: 'Recipient public key is required' }, { status: 400 });
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      return NextResponse.json({ error: 'Invalid recipient public key' }, { status: 400 });
    }

    const payer = getAuthorityKeypair();
    if (!payer) {
      return NextResponse.json({ error: 'Authority keypair not configured on server' }, { status: 500 });
    }

    const connection = new Connection(RPC_URL, 'confirmed');

    const tx = new Transaction();

    // 1. If recipient has less than 0.05 SOL, send 0.1 SOL for gas/rent
    const recipientBalance = await connection.getBalance(recipientPubkey);
    if (recipientBalance < 0.05 * LAMPORTS_PER_SOL) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: recipientPubkey,
          lamports: Math.floor(0.1 * LAMPORTS_PER_SOL),
        })
      );
    }

    // 2. Ensure Associated Token Accounts exist for tTSLA (base) and USDC (quote)
    const userBaseAta = getAssociatedTokenAddressSync(BASE_MINT, recipientPubkey);
    const userQuoteAta = getAssociatedTokenAddressSync(QUOTE_MINT, recipientPubkey);

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        userBaseAta,
        recipientPubkey,
        BASE_MINT
      )
    );

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        userQuoteAta,
        recipientPubkey,
        QUOTE_MINT
      )
    );

    // 3. Mint 10,000 USDC (quote) and 100 tTSLA (base)
    // 6 decimals: 10,000 USDC = 10_000_000_000
    // 6 decimals: 100 tTSLA = 100_000_000
    tx.add(
      createMintToInstruction(
        QUOTE_MINT,
        userQuoteAta,
        payer.publicKey,
        10_000_000_000
      )
    );

    tx.add(
      createMintToInstruction(
        BASE_MINT,
        userBaseAta,
        payer.publicKey,
        100_000_000
      )
    );

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      'confirmed'
    );

    return NextResponse.json({
      success: true,
      signature,
      mintedQuoteAmount: 10000,
      mintedBaseAmount: 100,
      userQuoteAta: userQuoteAta.toBase58(),
      userBaseAta: userBaseAta.toBase58(),
    });
  } catch (err: any) {
    console.error('Faucet API error:', err);
    return NextResponse.json({ error: err.message || 'Faucet airdrop failed' }, { status: 500 });
  }
}
