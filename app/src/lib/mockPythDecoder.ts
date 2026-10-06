import { OracleState } from './types';

export const PYTH_V2_OFFSETS = {
  MAGIC: 0,        // u32 (0xa1b2c3d4)
  VERSION: 4,      // u32 (2)
  TYPE: 8,         // u32 (3 for Price account)
  EXPO: 20,        // i32 (-6)
  PUBLISH_TIME: 96,// i64
  PRICE: 208,      // i64
  CONF: 216,       // u64
  STATUS: 224,     // u32 (0: Unknown, 1: Trading, 2: Halted, 3: Auction)
};

export function decodePythBuffer(buffer: Uint8Array, k: number = 2): OracleState {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const expo = view.getInt32(PYTH_V2_OFFSETS.EXPO, true);
  const publishTime = Number(view.getBigInt64(PYTH_V2_OFFSETS.PUBLISH_TIME, true));
  const priceRaw = view.getBigInt64(PYTH_V2_OFFSETS.PRICE, true);
  const confRaw = view.getBigUint64(PYTH_V2_OFFSETS.CONF, true);
  const status = view.getUint32(PYTH_V2_OFFSETS.STATUS, true);

  const factor = Math.pow(10, Math.abs(expo));
  const price = Number(priceRaw) / factor;
  const conf = Number(confRaw) / factor;

  const confBps = price > 0 ? (Number(confRaw) * 10000) / Number(priceRaw) : 0;
  const now = Math.floor(Date.now() / 1000);
  const isStale = (now - publishTime) > 60;

  const statusMap: Record<number, string> = {
    0: 'Unknown',
    1: 'Trading',
    2: 'Halted',
    3: 'Auction',
  };

  const minPrice = Math.max(0, price - k * conf);
  const maxPrice = price + k * conf;

  return {
    price,
    priceRaw,
    conf,
    confRaw,
    confBps,
    expo,
    status,
    statusName: statusMap[status] || 'Unknown',
    publishTime,
    isStale,
    minPrice,
    maxPrice,
  };
}

export function createMockPythState(
  priceUSD: number,
  confUSD: number,
  status: number = 1,
  publishTimeSeconds?: number,
  k: number = 2
): OracleState {
  const now = Math.floor(Date.now() / 1000);
  const publishTime = publishTimeSeconds ?? now;
  const expo = -6;
  const factor = 1_000_000;

  const priceRaw = BigInt(Math.round(priceUSD * factor));
  const confRaw = BigInt(Math.round(confUSD * factor));
  const confBps = priceUSD > 0 ? (confUSD / priceUSD) * 10000 : 0;
  const isStale = (now - publishTime) > 60;

  const statusMap: Record<number, string> = {
    0: 'Unknown',
    1: 'Trading',
    2: 'Halted',
    3: 'Auction',
  };

  const minPrice = Math.max(0, priceUSD - k * confUSD);
  const maxPrice = priceUSD + k * confUSD;

  return {
    price: priceUSD,
    priceRaw,
    conf: confUSD,
    confRaw,
    confBps,
    expo,
    status,
    statusName: statusMap[status] || 'Unknown',
    publishTime,
    isStale,
    minPrice,
    maxPrice,
  };
}
