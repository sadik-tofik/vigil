import { MarketState, EpochBatchState, OracleState, BatchOrder } from './types';
import { createMockPythState } from './mockPythDecoder';

// Initial default state
export const INITIAL_ORACLE: OracleState = createMockPythState(
  214.50, // P_ref = $214.50
  0.20,   // sigma = $0.20 (~9.3 bps < 200 bps threshold)
  1,      // Status = Trading
  undefined,
  2       // k = 2
);

export const INITIAL_MARKET: MarketState = {
  address: "MktTSLAxUSDC1111111111111111111111111111111",
  baseSymbol: "TSLAx",
  quoteSymbol: "USDC",
  mode: "continuous",
  currentEpoch: 0,
  epochDurationSlots: 75,
  maxConfBps: 200, // 2.00%
  confFilterMult: 2,
  baseVaultBalance: 18.0,
  quoteVaultBalance: 3862.80,
  pythFeed: "PythTSLAx111111111111111111111111111111111",
};

export const INITIAL_ORDERS: BatchOrder[] = [
  {
    index: 0,
    user: "Buyer1...8F2q",
    side: "bid",
    lotSize: 10,
    lotSizeRaw: BigInt(10_000_000),
    limitPrice: 214.80,
    limitPriceRaw: BigInt(214_800_000),
    filledLotSize: 0,
    claimed: false,
    timestamp: Date.now() - 15000,
  },
  {
    index: 1,
    user: "Buyer2...9Kp1",
    side: "bid",
    lotSize: 5,
    lotSizeRaw: BigInt(5_000_000),
    limitPrice: 214.50,
    limitPriceRaw: BigInt(214_500_000),
    filledLotSize: 0,
    claimed: false,
    timestamp: Date.now() - 12000,
  },
  {
    index: 2,
    user: "Seller1...3Lx4",
    side: "ask",
    lotSize: 8,
    lotSizeRaw: BigInt(8_000_000),
    limitPrice: 214.20,
    limitPriceRaw: BigInt(214_200_000),
    filledLotSize: 0,
    claimed: false,
    timestamp: Date.now() - 8000,
  },
  {
    index: 3,
    user: "Seller2...7Nm9",
    side: "ask",
    lotSize: 10,
    lotSizeRaw: BigInt(10_000_000),
    limitPrice: 214.60,
    limitPriceRaw: BigInt(214_600_000),
    filledLotSize: 0,
    claimed: false,
    timestamp: Date.now() - 4000,
  },
];


export const INITIAL_BATCH: EpochBatchState = {
  epochId: 0,
  status: "acceptingOrders",
  startSlot: 1000,
  endSlot: 1075,
  currentSlot: 1032,
  totalBidVolume: 15,
  totalAskVolume: 18,
  clearingPrice: 0,
  matchedVolume: 0,
  orderCount: 4,
  orders: INITIAL_ORDERS,
};

// Pure solver function implementing uniform price clearing matching programs/twilight-book/src/math/clearing.rs
export function solveUniformPrice(
  orders: BatchOrder[],
  pRef: number
): { clearingPrice: number; matchedVolume: number; filledOrders: BatchOrder[] } {
  const activeOrders = orders.filter((o) => o.lotSize > 0);
  if (activeOrders.length === 0) {
    return { clearingPrice: 0, matchedVolume: 0, filledOrders: orders };
  }

  // 1. Extract unique candidate prices
  const candidatesSet = new Set<number>();
  for (const o of activeOrders) {
    candidatesSet.add(o.limitPrice);
  }
  const candidates = Array.from(candidatesSet).sort((a, b) => a - b);

  let bestPrice = 0;
  let maxMatched = 0;

  for (const price of candidates) {
    let cumBid = 0;
    let cumAsk = 0;
    for (const o of activeOrders) {
      if (o.side === 'bid' && o.limitPrice >= price) {
        cumBid += o.lotSize;
      } else if (o.side === 'ask' && o.limitPrice <= price) {
        cumAsk += o.lotSize;
      }
    }
    const matched = Math.min(cumBid, cumAsk);

    if (matched > maxMatched) {
      maxMatched = matched;
      bestPrice = price;
    } else if (matched === maxMatched && matched > 0) {
      // Tie-break: pick price closest to oracle reference price P_ref
      const distCurrent = Math.abs(price - pRef);
      const distBest = Math.abs(bestPrice - pRef);
      if (distCurrent < distBest) {
        bestPrice = price;
      } else if (distCurrent === distBest && price < bestPrice) {
        bestPrice = price;
      }
    }
  }

  if (maxMatched === 0) {
    return { clearingPrice: 0, matchedVolume: 0, filledOrders: orders };
  }

  const pStar = bestPrice;
  const qStar = maxMatched;

  // Compute fills
  const eligibleBids = activeOrders.filter((o) => o.side === 'bid' && o.limitPrice >= pStar);
  const eligibleAsks = activeOrders.filter((o) => o.side === 'ask' && o.limitPrice <= pStar);

  const totalEligibleBidVol = eligibleBids.reduce((sum, o) => sum + o.lotSize, 0);
  const totalEligibleAskVol = eligibleAsks.reduce((sum, o) => sum + o.lotSize, 0);

  const filledOrders = orders.map((order) => {
    if (order.lotSize === 0) return { ...order, filledLotSize: 0 };

    if (order.side === 'bid') {
      if (order.limitPrice < pStar) {
        return { ...order, filledLotSize: 0 };
      }
      if (totalEligibleBidVol <= qStar) {
        return { ...order, filledLotSize: order.lotSize };
      } else {
        // Pro-rata fill
        const fill = Math.min(order.lotSize, Math.floor((order.lotSize * qStar) / totalEligibleBidVol));
        return { ...order, filledLotSize: fill };
      }
    } else {
      if (order.limitPrice > pStar) {
        return { ...order, filledLotSize: 0 };
      }
      if (totalEligibleAskVol <= qStar) {
        return { ...order, filledLotSize: order.lotSize };
      } else {
        const fill = Math.min(order.lotSize, Math.floor((order.lotSize * qStar) / totalEligibleAskVol));
        return { ...order, filledLotSize: fill };
      }
    }
  });

  return { clearingPrice: pStar, matchedVolume: qStar, filledOrders };
}
