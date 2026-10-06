use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, CreateAccount};
use anchor_spl::token_interface::{initialize_account3, InitializeAccount3, Mint, TokenInterface};

use crate::errors::TwilightError;
use crate::state::*;

// SPL Token account layout size (PDR §2 account table). Token-2022 mints
// with extensions would need more space — out of scope for this hackathon
// build (plain SPL Token mints only). If that changes, this must become
// `spl_token_2022::extension::ExtensionType::try_calculate_account_len(...)`.
const TOKEN_ACCOUNT_LEN: usize = 165;

// REQ-F01: initializes Market PDA, binds Pyth feed, creates + initializes
// both vault escrow token accounts.
//
// vault_base/vault_quote are UncheckedAccount, not Anchor `init` token
// accounts: Anchor's `token::mint = ..., token::authority = ...` constraint
// inlines a full CPI context into the account-validation step for every
// `init` token account, and four of those together blew the 4KB BPF stack
// frame. Creating them by hand in the handler (system_program::create_account
// + initialize_account3, both invoked one at a time) keeps each CPI's stack
// footprint separate instead of stacking all four at once.
#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Market::SIZE,
        seeds = [MARKET_SEED, base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,

    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: allocated + initialized by hand in `handler`, not by Anchor's
    /// `#[account(init, ...)]` — see module doc comment above for why.
    /// `seeds`/`bump` still gets Anchor to validate this is the canonical
    /// PDA before the handler runs.
    #[account(mut, seeds = [VAULT_BASE_SEED, market.key().as_ref()], bump)]
    pub vault_base: UncheckedAccount<'info>,

    /// CHECK: see vault_base.
    #[account(mut, seeds = [VAULT_QUOTE_SEED, market.key().as_ref()], bump)]
    pub vault_quote: UncheckedAccount<'info>,

    /// CHECK: validated in a later sprint via pyth-sdk-solana's zero-copy
    /// PriceFeed deserialization (Sprint 2), not by Anchor's account macro.
    pub pyth_feed: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeMarket>,
    max_conf_bps: u64,
    epoch_duration_slots: u64,
    conf_filter_mult: u64,
) -> Result<()> {
    require!(epoch_duration_slots > 0, TwilightError::InvalidOracleData);
    require!(conf_filter_mult > 0, TwilightError::InvalidOracleData);
    require!(max_conf_bps > 0, TwilightError::InvalidOracleData);

    let market_key = ctx.accounts.market.key();

    create_vault(
        &ctx.accounts.authority,
        &ctx.accounts.vault_base.to_account_info(),
        &ctx.accounts.base_mint.to_account_info(),
        &ctx.accounts.market.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.rent,
        VAULT_BASE_SEED,
        market_key,
        ctx.bumps.vault_base,
    )?;

    create_vault(
        &ctx.accounts.authority,
        &ctx.accounts.vault_quote.to_account_info(),
        &ctx.accounts.quote_mint.to_account_info(),
        &ctx.accounts.market.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.rent,
        VAULT_QUOTE_SEED,
        market_key,
        ctx.bumps.vault_quote,
    )?;

    let market = &mut ctx.accounts.market;
    market.authority = ctx.accounts.authority.key();
    market.base_mint = ctx.accounts.base_mint.key();
    market.quote_mint = ctx.accounts.quote_mint.key();
    market.vault_base = ctx.accounts.vault_base.key();
    market.vault_quote = ctx.accounts.vault_quote.key();
    market.pyth_feed = ctx.accounts.pyth_feed.key();
    market.mode = MarketMode::Continuous;
    market.current_epoch = 0;
    market.epoch_duration_slots = epoch_duration_slots;
    market.epoch_start_slot = Clock::get()?.slot;
    market.max_conf_bps = max_conf_bps;
    market.conf_filter_mult = conf_filter_mult;
    market.bump = ctx.bumps.market;

    Ok(())
}

/// Allocates a PDA-owned account sized for an SPL token account, then
/// initializes it with the Market PDA — not the payer — as its authority.
/// That authority choice matters: only a later instruction that signs with
/// the Market PDA's own seeds (e.g. `settle_batch_auction`,
/// `claim_order_proceeds`) can move funds out. The user's wallet, including
/// `authority` here, never gets spend rights over vault contents.
#[allow(clippy::too_many_arguments)]
fn create_vault<'info>(
    payer: &Signer<'info>,
    vault_ai: &AccountInfo<'info>,
    mint_ai: &AccountInfo<'info>,
    market_ai: &AccountInfo<'info>,
    token_program_ai: &AccountInfo<'info>,
    system_program_ai: &AccountInfo<'info>,
    rent: &Rent,
    seed_prefix: &[u8],
    market_key: Pubkey,
    bump: u8,
) -> Result<()> {
    let bump_bytes = [bump];
    let vault_seeds: &[&[u8]] = &[seed_prefix, market_key.as_ref(), &bump_bytes];
    let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

    // 1. Allocate the account at the PDA, owned by the token program.
    //    Must be invoke_signed: the PDA has no private key, so the program
    //    proves ownership of this address by re-deriving it from seeds.
    system_program::create_account(
        CpiContext::new_with_signer(
            system_program_ai.clone(),
            CreateAccount {
                from: payer.to_account_info(),
                to: vault_ai.clone(),
            },
            signer_seeds,
        ),
        rent.minimum_balance(TOKEN_ACCOUNT_LEN),
        TOKEN_ACCOUNT_LEN as u64,
        token_program_ai.key,
    )?;

    // 2. Initialize it as a token account. No signer_seeds needed here —
    //    initializing a token account requires the token program's
    //    signature over its own instruction, not proof of PDA ownership.
    initialize_account3(CpiContext::new(
        token_program_ai.clone(),
        InitializeAccount3 {
            account: vault_ai.clone(),
            mint: mint_ai.clone(),
            authority: market_ai.clone(),
        },
    ))?;

    Ok(())
}
