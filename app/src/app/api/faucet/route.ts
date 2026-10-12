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
const BASE_MINT = new PublicKey('JAcEywGDvp52EUTsco5wJsHtBpHqKKUMwRyC6VZjok9V'); // tTSLA (Market 1)
const QUOTE_MINT = new PublicKey('3f7cLcJJ1G5DYLGBJELGUt8Dx2vgDSSThnGdZyVn1PoJ'); // devnet USDC (Market 1)

function getAuthorityKeypair(): Keypair | null {
  try {
    if (process.env.SOLANA_KEYPAIR_JSON) {
      const raw = JSON.parse(process.env.SOLANA_KEYPAIR_JSON);
      return Keypair.fromSecretKey(new Uint8Array(raw));
    }
    const home = process.env.HOME || '/home/sadik';
    const keyPath = process.env.SOLANA_KEYPAIR_PATH || path.join(home, '.config/solana/id.json');
    if (fs.existsSync(/*turbopackIgnore: true*/ keyPath)) {
      const raw = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ keyPath, 'utf-8'));
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
    const { recipient, baseMint: customBase, quoteMint: customQuote } = body;

    const baseMint = customBase ? new PublicKey(customBase) : BASE_MINT;
    const quoteMint = customQuote ? new PublicKey(customQuote) : QUOTE_MINT;

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

    // 2. Ensure Associated Token Accounts exist for base and quote
    const userBaseAta = getAssociatedTokenAddressSync(baseMint, recipientPubkey);
    const userQuoteAta = getAssociatedTokenAddressSync(quoteMint, recipientPubkey);

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        userBaseAta,
        recipientPubkey,
        baseMint
      )
    );

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        userQuoteAta,
        recipientPubkey,
        quoteMint
      )
    );

    // 3. Mint 10,000 quote tokens and 100 base tokens
    tx.add(
      createMintToInstruction(
        quoteMint,
        userQuoteAta,
        payer.publicKey,
        10_000_000_000
      )
    );

    tx.add(
      createMintToInstruction(
        baseMint,
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
