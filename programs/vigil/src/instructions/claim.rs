use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::errors::TwilightError;
use crate::state::*;

// REQ-F07
#[derive(Accounts)]
pub struct ClaimOrderProceeds<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub market: Box<Account<'info, Market>>,

    #[account(mut)]
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

pub fn handler(ctx: Context<ClaimOrderProceeds>, order_index: u16) -> Result<()> {
    let status = ctx.accounts.epoch_batch.status;
    require!(
        status == BatchStatus::Settled || status == BatchStatus::Voided,
        TwilightError::BatchNotFinalized
    );

    require!(
        (order_index as usize) < (ctx.accounts.epoch_batch.order_count as usize),
        TwilightError::InvalidOrderIndex
    );
    let order = ctx.accounts.epoch_batch.orders[order_index as usize];
    require!(order.lot_size > 0, TwilightError::InvalidOrderIndex); // cancelled (zeroed) slot
    require!(order.user == ctx.accounts.user.key(), TwilightError::OrderOwnerMismatch);
    require!(!order.claimed, TwilightError::OrderAlreadyClaimed);

    // clearing_price is 0 for a Voided batch, and every order's
    // filled_lot_size is 0 too (apply_fills is never called on the Voided
    // path) — so the SAME payout formulas below correctly reduce to "full
    // refund, nothing proceeds" for Voided without a separate branch. Not
    // a coincidence: settle.rs guarantees that pairing.
    let clearing_price = ctx.accounts.epoch_batch.clearing_price;

    // Checks-Effects-Interactions (SRS 7.2.3): mark claimed before any CPI.
    ctx.accounts.epoch_batch.orders[order_index as usize].claimed = true;

    let market = &ctx.accounts.market;
    let bump = [market.bump];
    let base_mint_key = market.base_mint;
    let quote_mint_key = market.quote_mint;
    let market_seeds: &[&[u8]] = &[MARKET_SEED, base_mint_key.as_ref(), quote_mint_key.as_ref(), &bump];
    let signer_seeds: &[&[&[u8]]] = &[market_seeds];

    match order.side {
        OrderSide::Bid => {
            // Proceeds: shares actually bought.
            if order.filled_lot_size > 0 {
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
                    order.filled_lot_size,
                    ctx.accounts.base_mint.decimals,
                )?;
            }

            // Refund = full unfilled escrow (at limit_price) PLUS price
            // improvement on the filled portion: escrowed at limit_price,
            // executed at clearing_price <= limit_price. SRS 6.3 — a buyer
            // never pays more than their own limit, and this is where that
            // guarantee actually gets paid out, not just asserted.
            let escrowed_quote = (order.lot_size as u128)
                .checked_mul(order.limit_price as u128)
                .ok_or(TwilightError::MathOverflow)?
                .checked_div(PRICE_SCALE)
                .ok_or(TwilightError::MathOverflow)?;
            let actual_cost = (order.filled_lot_size as u128)
                .checked_mul(clearing_price as u128)
                .ok_or(TwilightError::MathOverflow)?
                .checked_div(PRICE_SCALE)
                .ok_or(TwilightError::MathOverflow)?;
            let quote_refund = escrowed_quote.checked_sub(actual_cost).ok_or(TwilightError::MathOverflow)?;
            let quote_refund = u64::try_from(quote_refund).map_err(|_| error!(TwilightError::MathOverflow))?;

            if quote_refund > 0 {
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
                    quote_refund,
                    ctx.accounts.quote_mint.decimals,
                )?;
            }
        }
        OrderSide::Ask => {
            // Proceeds: sold at clearing_price, not the (lower) ask limit —
            // same SRS 6.3 guarantee, seller side: never receives less
            // than their own limit, and clearing_price >= limit_price for
            // every filled ask by construction.
            let quote_proceeds = (order.filled_lot_size as u128)
                .checked_mul(clearing_price as u128)
                .ok_or(TwilightError::MathOverflow)?
                .checked_div(PRICE_SCALE)
                .ok_or(TwilightError::MathOverflow)?;
            let quote_proceeds = u64::try_from(quote_proceeds).map_err(|_| error!(TwilightError::MathOverflow))?;

            if quote_proceeds > 0 {
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
                    quote_proceeds,
                    ctx.accounts.quote_mint.decimals,
                )?;
            }

            let base_refund = order
                .lot_size
                .checked_sub(order.filled_lot_size)
                .ok_or(TwilightError::MathOverflow)?;
            if base_refund > 0 {
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
                    base_refund,
                    ctx.accounts.base_mint.decimals,
                )?;
            }
        }
    }

    Ok(())
}
