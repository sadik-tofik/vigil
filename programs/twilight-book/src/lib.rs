use anchor_lang::prelude::*;

pub mod errors;
pub mod state;
pub mod instructions;
pub mod math;

use instructions::*;

declare_id!("HBVEPbKCUemrSTwPQegnKHhA9JfuWJ82DDG8r6VfeQ4h");

#[program]
pub mod twilight_book {
    use super::*;

    // ---- Sprint 1 ----
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        max_conf_bps: u64,
        epoch_duration_slots: u64,
        conf_filter_mult: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, max_conf_bps, epoch_duration_slots, conf_filter_mult)
    }

    // ---- Sprint 2 ----
    pub fn evaluate_market_mode(ctx: Context<EvaluateMarketMode>) -> Result<()> {
        instructions::circuit::handler(ctx)
    }

    // ---- Sprint 3 ----
    pub fn place_batch_order(
        ctx: Context<PlaceBatchOrder>,
        side: state::epoch_batch::OrderSide,
        lot_size: u64,
        limit_price: u64,
    ) -> Result<()> {
        instructions::place_order::handler(ctx, side, lot_size, limit_price)
    }

    pub fn cancel_batch_order(ctx: Context<CancelBatchOrder>, order_index: u16) -> Result<()> {
        instructions::place_order::cancel_handler(ctx, order_index)
    }

    // ---- Sprint 4 ----
    pub fn settle_batch_auction(ctx: Context<SettleBatchAuction>) -> Result<()> {
        instructions::settle::handler(ctx)
    }

    // ---- Sprint 5 ----
    pub fn claim_order_proceeds(ctx: Context<ClaimOrderProceeds>, order_index: u16) -> Result<()> {
        instructions::claim::handler(ctx, order_index)
    }

    // ---- Demo/devnet only — see mock_oracle.rs module doc ----
    pub fn set_mock_oracle(
        ctx: Context<SetMockOracle>,
        price: i64,
        conf: u64,
        expo: i32,
        status: u8,
        publish_time: i64,
    ) -> Result<()> {
        instructions::mock_oracle::handler(ctx, price, conf, expo, status, publish_time)
    }
}

