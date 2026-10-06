export type MarketMode = 'continuous' | 'batchAuction';

export type BatchStatus = 'acceptingOrders' | 'frozen' | 'settled' | 'voided';

export type OrderSide = 'bid' | 'ask';

export interface BatchOrder {
  index: number;
  user: string;
  side: OrderSide;
  lotSize: number;        // display shares (e.g. 10)
  lotSizeRaw: bigint;     // 6-decimal fixed point (e.g. 10_000_000)
  limitPrice: number;     // display price in USD (e.g. 214.80)
  limitPriceRaw: bigint;  // 6-decimal fixed point (e.g. 214_800_000)
  filledLotSize: number;  // filled shares
  claimed: boolean;
  timestamp: number;
}

export interface OracleState {
  price: number;          // display USD (e.g. 214.50)
  priceRaw: bigint;       // 214_500_000
  conf: number;           // display USD (e.g. 0.20 or 6.00)
  confRaw: bigint;        // 200_000 or 6_000_000
  confBps: number;        // bps (e.g. 9.3 or 2797.2)
  expo: number;           // -6
  status: number;         // 1: Trading, 2: Halted, 0: Unknown, 3: Auction
  statusName: string;
  publishTime: number;    // unix seconds
  isStale: boolean;
  minPrice: number;       // Pref - k * sigma
  maxPrice: number;       // Pref + k * sigma
}

export interface MarketState {
  address: string;
  baseSymbol: string;     // e.g. TSLAx
  quoteSymbol: string;    // e.g. USDC
  mode: MarketMode;
  currentEpoch: number;
  epochDurationSlots: number; // 75 slots (~30s)
  maxConfBps: number;     // 200 bps (2.00%)
  confFilterMult: number; // 2 (k)
  baseVaultBalance: number;
  quoteVaultBalance: number;
  pythFeed: string;
}

export interface EpochBatchState {
  epochId: number;
  status: BatchStatus;
  startSlot: number;
  endSlot: number;
  currentSlot: number;
  totalBidVolume: number;
  totalAskVolume: number;
  clearingPrice: number;  // P* (0 until settled)
  matchedVolume: number;  // Q*
  orderCount: number;
  orders: BatchOrder[];
}

export interface DocsPage {
  slug: string;
  section: 'start-here' | 'core-concepts' | 'instructions' | 'security';
  sectionTitle: string;
  title: string;
  description: string;
  contentHtml?: string;
  headings: { id: string; title: string; level: number }[];
  prev?: { title: string; href: string };
  next?: { title: string; href: string };
}
