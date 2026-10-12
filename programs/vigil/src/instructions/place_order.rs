use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};
use pyth_sdk_solana::state::{load_price_account, SolanaPriceAccount};

use crate::errors::TwilightError;
use crate::math::oracle::{confidence_band, scale_pyth_value};
use crate::state::*;

// REQ-F04
#[derive(Accounts)]
pub struct PlaceBatchOrder<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [BATCH_SEED, market.key().as_ref(), market.current_epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub epoch_batch: Box<Account<'info, EpochBatchState>>,

    /// CHECK: deserialized below via pyth-sdk-solana zero-copy, same as
    /// evaluate_market_mode. `address` constraint ties it to this market.
    #[account(address = market.pyth_feed)]
    pub pyth_feed: UncheckedAccount<'info>,

    #[account(mut, address = market.vault_base)]
    pub vault_base: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = market.vault_quote)]
    pub vault_quote: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user_base_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub user_quote_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = market.base_mint)]
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<PlaceBatchOrder>, side: OrderSide, lot_size: u64, limit_price: u64) -> Result<()> {
    require!(lot_size > 0, TwilightError::InvalidOracleData); // reuse: "malformed input," not a dedicated error code yet

    let market = &ctx.accounts.market;
    require!(market.mode == MarketMode::BatchAuction, TwilightError::NotInBatchMode);

    let epoch_batch = &ctx.accounts.epoch_batch;
    require!(epoch_batch.status == BatchStatus::AcceptingOrders, TwilightError::BatchNotAcceptingOrders);

    let clock = Clock::get()?;
    let current_slot = clock.slot;
    let freeze_start = epoch_batch
        .end_slot
        .checked_sub(FREEZE_WINDOW_SLOTS)
        .ok_or(TwilightError::MathOverflow)?;
    require!(current_slot < freeze_start, TwilightError::BatchFrozen);

    require!((epoch_batch.order_count as usize) < MAX_ORDERS_PER_BATCH, TwilightError::BatchFull);

    // --- Confidence-band validation (SRS 4.2 REQ-F04 steps 5-7) ---
    let (p_ref, sigma) = {
        let data = ctx.accounts.pyth_feed.try_borrow_data()?;
        let price_account: &SolanaPriceAccount =
            load_price_account(&data).map_err(|_| error!(TwilightError::InvalidOracleData))?;
        let publish_time = price_account.timestamp;
        require!(
            clock.unix_timestamp.saturating_sub(publish_time) <= crate::instructions::circuit::STALENESS_THRESHOLD_SECONDS,
            TwilightError::StaleOracle
        );
        let agg = price_account.agg;
        require!(agg.price > 0, TwilightError::InvalidOracleData);
        let p_ref = scale_pyth_value(agg.price, price_account.expo)?;
        let sigma = scale_pyth_value(agg.conf as i64, price_account.expo)?;
        (p_ref, sigma)
    };
    let (p_min, p_max) = confidence_band(p_ref, sigma, market.conf_filter_mult)?;
    require!(
        limit_price >= p_min && limit_price <= p_max,
        TwilightError::OrderPriceExceedsConfidenceBand
    );

    // --- Escrow transfer ---
    match side {
        OrderSide::Bid => {
            let quote_amount = (lot_size as u128)
                .checked_mul(limit_price as u128)
                .ok_or(TwilightError::MathOverflow)?
                .checked_div(PRICE_SCALE)
                .ok_or(TwilightError::MathOverflow)?;
            let quote_amount = u64::try_from(quote_amount).map_err(|_| error!(TwilightError::MathOverflow))?;

            transfer_checked(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.user_quote_ata.to_account_info(),
                        mint: ctx.accounts.quote_mint.to_account_info(),
                        to: ctx.accounts.vault_quote.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                quote_amount,
                ctx.accounts.quote_mint.decimals,
            )?;
        }
        OrderSide::Ask => {
            transfer_checked(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.user_base_ata.to_account_info(),
                        mint: ctx.accounts.base_mint.to_account_info(),
                        to: ctx.accounts.vault_base.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                lot_size,
                ctx.accounts.base_mint.decimals,
            )?;
        }
    }

    // --- Record the order ---
    let index = ctx.accounts.epoch_batch.order_count as usize;
    let epoch_batch = &mut ctx.accounts.epoch_batch;
    epoch_batch.orders[index] = BatchOrder {
        user: ctx.accounts.user.key(),
        side,
        lot_size,
        limit_price,
        filled_lot_size: 0,
        claimed: false,
    };
    epoch_batch.order_count = epoch_batch
        .order_count
        .checked_add(1)
        .ok_or(TwilightError::MathOverflow)?;
    match side {
        OrderSide::Bid => {
            epoch_batch.total_bid_volume = epoch_batch
                .total_bid_volume
                .checked_add(lot_size)
                .ok_or(TwilightError::MathOverflow)?;
        }
        OrderSide::Ask => {
            epoch_batch.total_ask_volume = epoch_batch
                .total_ask_volume
                .checked_add(lot_size)
                .ok_or(TwilightError::MathOverflow)?;
        }
    }

    Ok(())
}

// REQ-F05
#[derive(Accounts)]
pub struct CancelBatchOrder<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [BATCH_SEED, market.key().as_ref(), market.current_epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub epoch_batch: Box<Account<'info, EpochBatchState>>,

    #[account(mut, address = market.vault_base)]
    pub vault_base: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = market.vault_quote)]
    pub vault_quote: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user_base_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub user_quote_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = market.base_mint)]
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = market.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn cancel_handler(ctx: Context<CancelBatchOrder>, order_index: u16) -> Result<()> {
    let epoch_batch = &ctx.accounts.epoch_batch;
    require!(epoch_batch.status == BatchStatus::AcceptingOrders, TwilightError::BatchNotAcceptingOrders);

    let current_slot = Clock::get()?.slot;
    let freeze_start = epoch_batch
        .end_slot
        .checked_sub(FREEZE_WINDOW_SLOTS)
        .ok_or(TwilightError::MathOverflow)?;
    require!(current_slot < freeze_start, TwilightError::BatchFrozen);

    require!((order_index as usize) < (epoch_batch.order_count as usize), TwilightError::InvalidOrderIndex);
    let order = epoch_batch.orders[order_index as usize];
    require!(order.lot_size > 0, TwilightError::InvalidOrderIndex); // already-cancelled slot
    require!(order.user == ctx.accounts.user.key(), TwilightError::OrderOwnerMismatch);

    // Refund is recomputed from the stored order, not a separately-cached
    // escrow amount, so it's guaranteed to match what place_batch_order
    // actually transferred in (same integer-division formula, same inputs).
    let market = &ctx.accounts.market;
    let bump = [market.bump];
    let base_mint_key = ctx.accounts.base_mint.key();
    let quote_mint_key = ctx.accounts.quote_mint.key();
    let market_seeds: &[&[u8]] = &[MARKET_SEED, base_mint_key.as_ref(), quote_mint_key.as_ref(), &bump];
    let signer_seeds: &[&[&[u8]]] = &[market_seeds];

    match order.side {
        OrderSide::Bid => {
            let quote_amount = (order.lot_size as u128)
                .checked_mul(order.limit_price as u128)
                .ok_or(TwilightError::MathOverflow)?
                .checked_div(PRICE_SCALE)
                .ok_or(TwilightError::MathOverflow)?;
            let quote_amount = u64::try_from(quote_amount).map_err(|_| error!(TwilightError::MathOverflow))?;

            transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault_quote.to_account_info(),
                        mint: ctx.accounts.quote_mint.to_account_info(),
                        to: ctx.accounts.user_quote_ata.to_account_info(),
                        authority: ctx.accounts.market.to_account_info(),
                    },
                    signer_seeds,
                ),
                quote_amount,
                ctx.accounts.quote_mint.decimals,
            )?;
        }
        OrderSide::Ask => {
            transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault_base.to_account_info(),
                        mint: ctx.accounts.base_mint.to_account_info(),
                        to: ctx.accounts.user_base_ata.to_account_info(),
                        authority: ctx.accounts.market.to_account_info(),
                    },
                    signer_seeds,
                ),
                order.lot_size,
                ctx.accounts.base_mint.decimals,
            )?;
        }
    }

    let lot_size = order.lot_size;
    let side = order.side;
    let epoch_batch = &mut ctx.accounts.epoch_batch;
    // Zeroed in place, not swap-removed: order_count stays a stable "highest
    // index used" bound, and Sprint 4's clearing scan naturally skips
    // lot_size == 0 entries with no special-case logic needed.
    epoch_batch.orders[order_index as usize] = BatchOrder::default();
    match side {
        OrderSide::Bid => {
            epoch_batch.total_bid_volume = epoch_batch.total_bid_volume.checked_sub(lot_size).ok_or(TwilightError::MathOverflow)?;
        }
        OrderSide::Ask => {
            epoch_batch.total_ask_volume = epoch_batch.total_ask_volume.checked_sub(lot_size).ok_or(TwilightError::MathOverflow)?;
        }
    }

    Ok(())
}
