use anchor_lang::prelude::*;
use pyth_sdk_solana::state::{load_price_account, SolanaPriceAccount};

use crate::errors::TwilightError;
use crate::math::clearing::{apply_fills, solve_uniform_price, ClearingResult};
use crate::math::oracle::scale_pyth_value;
use crate::state::*;

// REQ-F06: permissionless keeper/crank instruction. Owns epoch rollover
// (creates epoch N+1's EpochBatchState) — see circuit.rs's SCOPING NOTE for
// why evaluate_market_mode does NOT also do this.
#[derive(Accounts)]
pub struct SettleBatchAuction<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(mut)]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [BATCH_SEED, market.key().as_ref(), market.current_epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub epoch_batch: Box<Account<'info, EpochBatchState>>,

    #[account(
        init_if_needed,
        payer = keeper,
        space = EpochBatchState::SIZE,
        seeds = [BATCH_SEED, market.key().as_ref(), (market.current_epoch + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub next_epoch_batch: Box<Account<'info, EpochBatchState>>,

    /// CHECK: read-only reference for tie-break midpoint biasing, TDD §2.
    /// A malformed/stale feed here doesn't need to hard-fail the whole
    /// settlement the way it does in evaluate_market_mode/place_batch_order
    /// — worst case a bad tie-break still resolves to a price that was
    /// already validated inside the confidence band at order-placement
    /// time. Still requires a positive price to scale, same as elsewhere.
    #[account(address = market.pyth_feed)]
    pub pyth_feed: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettleBatchAuction>) -> Result<()> {
    let current_slot = Clock::get()?.slot;
    require!(current_slot >= ctx.accounts.epoch_batch.end_slot, TwilightError::EpochNotYetEnded);
    require!(
        ctx.accounts.epoch_batch.status == BatchStatus::AcceptingOrders,
        TwilightError::BatchAlreadySettled
    );

    let p_ref = {
        let data = ctx.accounts.pyth_feed.try_borrow_data()?;
        let price_account: &SolanaPriceAccount =
            load_price_account(&data).map_err(|_| error!(TwilightError::InvalidOracleData))?;
        require!(price_account.agg.price > 0, TwilightError::InvalidOracleData);
        scale_pyth_value(price_account.agg.price, price_account.expo)?
    };

    let order_count = ctx.accounts.epoch_batch.order_count as usize;
    let result = {
        let epoch_batch = &ctx.accounts.epoch_batch;
        solve_uniform_price(&epoch_batch.orders, order_count, p_ref)?
    };

    {
        let epoch_batch = &mut ctx.accounts.epoch_batch;
        match result {
            ClearingResult::Voided => {
                epoch_batch.status = BatchStatus::Voided;
                epoch_batch.clearing_price = 0;
                epoch_batch.matched_volume = 0;
            }
            ClearingResult::Settled { clearing_price, matched_volume } => {
                apply_fills(&mut epoch_batch.orders, order_count, clearing_price, matched_volume)?;
                epoch_batch.clearing_price = clearing_price;
                epoch_batch.matched_volume = matched_volume;
                epoch_batch.status = BatchStatus::Settled;
            }
        }
    }

    // --- Roll to the next epoch ---
    let market = &mut ctx.accounts.market;
    let next_epoch_id = market.current_epoch.checked_add(1).ok_or(TwilightError::MathOverflow)?;

    // Guard mirrors evaluate_market_mode's: only true if this account was
    // JUST allocated by init_if_needed above (zero-filled), never true for
    // an already-running epoch. settle_batch_auction should not normally
    // be called twice for the same epoch (blocked by the
    // BatchAlreadySettled check above), so this is defense-in-depth, not
    // the primary guard against double-init.
    if ctx.accounts.next_epoch_batch.market == Pubkey::default() {
        let next_epoch_batch = &mut ctx.accounts.next_epoch_batch;
        next_epoch_batch.market = market.key();
        next_epoch_batch.epoch_id = next_epoch_id;
        next_epoch_batch.start_slot = current_slot;
        next_epoch_batch.end_slot = current_slot
            .checked_add(market.epoch_duration_slots)
            .ok_or(TwilightError::MathOverflow)?;
        next_epoch_batch.status = BatchStatus::AcceptingOrders;
        next_epoch_batch.order_count = 0;
    }
    market.current_epoch = next_epoch_id;

    Ok(())
}
