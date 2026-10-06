use anchor_lang::prelude::*;

// PDA seeds (SRS 3.1.1):
//   EpochBatchState: [b"batch", market, epoch_id.to_le_bytes()]
//   UserOrderEscrow: [b"order", epoch_batch, user, order_index.to_le_bytes()]
pub const BATCH_SEED: &[u8] = b"batch";

pub const MAX_ORDERS_PER_BATCH: usize = 32;
pub const FREEZE_WINDOW_SLOTS: u64 = 10; // ~4s at 400ms slots, SRS 7.2.1
pub const PRICE_SCALE: u128 = 1_000_000; // 6-decimal fixed point, TDD §1
pub const BPS_DIVISOR: u128 = 10_000;

#[account]
pub struct EpochBatchState {
    pub market: Pubkey,
    pub epoch_id: u64,
    pub start_slot: u64,
    pub end_slot: u64,
    pub total_bid_volume: u64,
    pub total_ask_volume: u64,
    pub matched_volume: u64,
    pub clearing_price: u64, // 6-decimal fixed point
    pub status: BatchStatus,
    pub order_count: u16,
    pub orders: [BatchOrder; MAX_ORDERS_PER_BATCH],
}

impl EpochBatchState {
    // 8 (disc) + 32 (market) + 8*7 (u64 fields) + 1 (status) + 2 (order_count)
    // + 32 * BatchOrder::SIZE
    pub const SIZE: usize =
        8 + 32 + 8 * 7 + 1 + 2 + MAX_ORDERS_PER_BATCH * BatchOrder::SIZE; // = 1,955 bytes
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BatchStatus {
    AcceptingOrders = 0,
    Frozen = 1,
    Settled = 2,
    Voided = 3,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug)]
pub struct BatchOrder {
    pub user: Pubkey,
    pub side: OrderSide,
    pub lot_size: u64,
    pub limit_price: u64,
    pub filled_lot_size: u64,
    pub claimed: bool,
}

impl BatchOrder {
    // 32 (user) + 1 (side) + 8*3 (u64 fields) + 1 (claimed) = 58 bytes,
    // matches PDR §2's (32 * 58) term
    pub const SIZE: usize = 32 + 1 + 8 * 3 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum OrderSide {
    #[default]
    Bid = 0,
    Ask = 1,
}
