use anchor_lang::prelude::*;
use pyth_sdk_solana::state::{load_price_account, PriceStatus, SolanaPriceAccount};

use crate::errors::TwilightError;
use crate::state::*;

// SRS 4.2 REQ-F02 step 3.
pub const STALENESS_THRESHOLD_SECONDS: i64 = 60;

// SCOPING NOTE — read before touching this file:
// The SRS describes epoch/batch rollover in TWO places: here in
// evaluate_market_mode ("if current epoch has passed end_slot, increment
// epoch_id and initialize new EpochBatchState") AND in settle_batch_auction
// ("Roll market state: initialize epoch_id + 1"). Both instructions can't
// own rollover without a race between whichever gets called first.
//
// Decision made here: this instruction ONLY flips market.mode. It creates
// EpochBatchState exactly once — lazily, via init_if_needed, the first time
// it's called after initialize_market (epoch 0 doesn't exist until then).
// Every later epoch transition (N -> N+1) is settle_batch_auction's job
// (Sprint 4), not this one's. This instruction never increments
// market.current_epoch.
// If that division of responsibility is wrong for how you want the keeper
// bot to actually call these two instructions, say so before Sprint 4 —
// changing it later means touching both instructions' account contexts.
#[derive(Accounts)]
pub struct EvaluateMarketMode<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,

    /// CHECK: must equal market.pyth_feed; deserialized below via
    /// pyth-sdk-solana's zero-copy `load_price_account`, not by Anchor's
    /// account macro (a raw Pyth price account has no Anchor discriminator).
    #[account(address = market.pyth_feed)]
    pub pyth_feed: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = EpochBatchState::SIZE,
        seeds = [BATCH_SEED, market.key().as_ref(), market.current_epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub epoch_batch: Box<Account<'info, EpochBatchState>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<EvaluateMarketMode>) -> Result<()> {
    let clock = Clock::get()?;

    let data = ctx.accounts.pyth_feed.try_borrow_data()?;
    let price_account: &SolanaPriceAccount =
        load_price_account(&data).map_err(|_| error!(TwilightError::InvalidOracleData))?;

    let agg = price_account.agg;
    let publish_time = price_account.timestamp;
    drop(data); // release the borrow before mutating other accounts below

    require!(agg.price > 0, TwilightError::InvalidOracleData); // fail-closed on malformed/negative price, SRS 2.4

    let is_stale = clock.unix_timestamp.saturating_sub(publish_time) > STALENESS_THRESHOLD_SECONDS;
    let is_trading = agg.status == PriceStatus::Trading;

    let uncertainty_bps: u128 = (agg.conf as u128)
        .checked_mul(BPS_DIVISOR)
        .ok_or(TwilightError::MathOverflow)?
        .checked_div(agg.price as u128)
        .ok_or(TwilightError::MathOverflow)?;

    let market = &mut ctx.accounts.market;

    // SRS 4.2 step 5: status != Trading OR uncertainty >= threshold -> BatchAuction.
    // Staleness folds into the same branch — SRS 1.3/2.4 treat a stale feed
    // as unconditionally forcing BatchAuction, same as Halted status.
    market.mode = if is_stale || !is_trading || uncertainty_bps >= market.max_conf_bps as u128 {
        MarketMode::BatchAuction
    } else {
        MarketMode::Continuous
    };

    // Only true on the very first call after initialize_market — a freshly
    // `init_if_needed`-allocated account is zero-filled, so `market ==
    // Pubkey::default()` means "just created," never "epoch 0, already
    // running." Any later call sees a non-zero `market` field here and
    // must NOT touch this account's orders/volumes.
    if ctx.accounts.epoch_batch.market == Pubkey::default() {
        let epoch_batch = &mut ctx.accounts.epoch_batch;
        epoch_batch.market = market.key();
        epoch_batch.epoch_id = market.current_epoch;
        epoch_batch.start_slot = clock.slot;
        epoch_batch.end_slot = clock
            .slot
            .checked_add(market.epoch_duration_slots)
            .ok_or(TwilightError::MathOverflow)?;
        epoch_batch.status = BatchStatus::AcceptingOrders;
        epoch_batch.order_count = 0;
    }

    Ok(())
}
