// Sprint 2: byte-level Pyth V2 PriceAccount mocks for evaluate_market_mode
// Bankrun tests.
//
// WHY RAW BYTES, NOT A JSON/OBJECT MOCK: the program deserializes this
// account with pyth-sdk-solana's zero-copy `load_price_account`, which
// reinterprets the account's raw byte buffer directly as a
// `GenericPriceAccount` struct (`#[repr(C)]`, no Anchor discriminator, no
// Borsh). A JSON mock can't stand in for that — Bankrun needs an
// AccountInfo whose `data` field is the literal byte layout Pyth writes
// on-chain.
//
// OFFSETS: taken from a third-party crate that reads real Pyth V2 price
// accounts at these fixed byte positions (verified against pyth-sdk-solana
// >= 0.10.4, i.e. AFTER the enum-repr fix that corrected the account's
// BPF-target size from an inflated 3840 bytes to the real 3312 — see
// programs/twilight-book/Cargo.toml comment for that history). Do not
// change the pyth-sdk-solana version pin without re-checking these offsets
// still apply.
//
//   0..4    magic         (u32 LE = 0xa1b2c3d4)
//   4..8    version       (u32 LE = 2)
//   8..12   account type  (u32 LE = 3, "Price")
//   20..24  exponent      (i32 LE)
//   96..104 timestamp     (i64 LE, unix seconds — last aggregate update)
//   208..216 agg.price    (i64 LE)
//   216..224 agg.conf     (u64 LE)
//   224..228 agg.status   (u32 LE — 0=Unknown, 1=Trading, 2=Halted, 3=Auction)
//   232..240 agg.pub_slot (u64 LE)
//
// Only these fields are populated; everything else (product/next Pubkeys,
// EMA fields, the 32-entry component array) is zeroed, since
// evaluate_market_mode's handler never reads them.

export const PYTH_PRICE_ACCOUNT_SIZE = 3312;
export const PRICE_STATUS = {
  Unknown: 0,
  Trading: 1,
  Halted: 2,
  Auction: 3,
} as const;

export interface MockPythFeedParams {
  /** Raw price, already scaled by 10^expo (e.g. 21450000000 with expo -8 for $214.50). */
  price: bigint;
  /** Raw confidence interval, same scale as price. */
  conf: bigint;
  expo: number;
  status: number; // use PRICE_STATUS.*
  /** Unix seconds. Defaults to "now" if omitted by the caller. */
  publishTime: bigint;
}

export function mockPythPriceAccountData(params: MockPythFeedParams): Buffer {
  const buf = Buffer.alloc(PYTH_PRICE_ACCOUNT_SIZE); // zero-filled

  buf.writeUInt32LE(0xa1b2c3d4, 0); // magic
  buf.writeUInt32LE(2, 4); // version
  buf.writeUInt32LE(3, 8); // account type = Price
  buf.writeInt32LE(params.expo, 20);
  buf.writeBigInt64LE(params.publishTime, 96);
  buf.writeBigInt64LE(params.price, 208); // agg.price
  buf.writeBigUInt64LE(params.conf, 216); // agg.conf
  buf.writeUInt32LE(params.status, 224); // agg.status
  buf.writeBigUInt64LE(0n, 232); // agg.pub_slot — not read by the handler, left 0

  return buf;
}

// Convenience presets matching the scenarios evaluate_market_mode.test.ts
// needs, per BRS Rule 1 (200 bps threshold) and SRS 1.3 staleness window.
// All use tTSLA-scale pricing at 6-decimal-equivalent via expo = -6 for
// readability in tests — the handler doesn't care what expo actually is,
// only that price/conf share it.

const now = () => BigInt(Math.floor(Date.now() / 1000));

export function tradingTightConf(): Buffer {
  // $214.50 ± $0.20 -> ~93 bps, under the 200 bps default threshold
  return mockPythPriceAccountData({
    price: 214_500_000n,
    conf: 200_000n,
    expo: -6,
    status: PRICE_STATUS.Trading,
    publishTime: now(),
  });
}

export function tradingWideConf(): Buffer {
  // $214.50 ± $6.00 -> ~2798 bps, over the 200 bps default threshold
  return mockPythPriceAccountData({
    price: 214_500_000n,
    conf: 6_000_000n,
    expo: -6,
    status: PRICE_STATUS.Trading,
    publishTime: now(),
  });
}

export function halted(): Buffer {
  return mockPythPriceAccountData({
    price: 214_500_000n,
    conf: 200_000n,
    expo: -6,
    status: PRICE_STATUS.Halted,
    publishTime: now(),
  });
}

export function stale(): Buffer {
  // Tight confidence, Trading status, but published 5 minutes ago —
  // must still force BatchAuction on staleness alone.
  return mockPythPriceAccountData({
    price: 214_500_000n,
    conf: 200_000n,
    expo: -6,
    status: PRICE_STATUS.Trading,
    publishTime: now() - 300n,
  });
}
