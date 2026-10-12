use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, CreateAccount};

// DEMO / DEVNET ONLY. This is not part of the protocol's real oracle path —
// it exists solely so a frontend "simulate market halt" / "simulate
// confidence blowout" button (PDR §8's Hackathon Injection Controls) has
// something real to call. It deliberately has NO authority gating beyond
// "some signer paid for it": the account it writes is a mock, tied only to
// a (base_mint, quote_mint) pair, and nothing of real value is ever
// escrowed against a mock oracle in a real deployment. Never use this
// instruction's existence as a reason to skip real Pyth integration for
// anything beyond this hackathon submission.
//
// Byte layout matches tests/fixtures/pyth_mocks.ts exactly — same offsets,
// same magic/version/account-type header — so a mainnet swap-out later
// just means pointing `market.pyth_feed` at a real feed; nothing that
// reads it (circuit.rs, place_order.rs, settle.rs) needs to change.
pub const MOCK_ORACLE_SEED: &[u8] = b"mock_oracle";
pub const MOCK_ORACLE_SIZE: usize = 3312; // real Pyth V2 price account size

#[derive(Accounts)]
pub struct SetMockOracle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: identity-only, used for PDA seed derivation to match
    /// whatever (base_mint, quote_mint) pair a market will be initialized
    /// with. No data is read from this account.
    pub base_mint: UncheckedAccount<'info>,
    /// CHECK: see base_mint.
    pub quote_mint: UncheckedAccount<'info>,

    /// CHECK: raw Pyth-V2-byte-layout mock, owned by this program, not a
    /// real Pyth account. Created lazily on first call (see handler), not
    /// via Anchor's `init` constraint — `init` requires an
    /// AccountSerialize/AccountDeserialize type, which a raw byte buffer
    /// deliberately is not.
    #[account(mut, seeds = [MOCK_ORACLE_SEED, base_mint.key().as_ref(), quote_mint.key().as_ref()], bump)]
    pub mock_oracle: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// `status`: 0 Unknown, 1 Trading, 2 Halted, 3 Auction — matches Pyth's
/// PriceStatus encoding used everywhere else in this program.
pub fn handler(
    ctx: Context<SetMockOracle>,
    price: i64,
    conf: u64,
    expo: i32,
    status: u8,
    publish_time: i64,
) -> Result<()> {
    require!(price > 0, crate::errors::TwilightError::InvalidOracleData);

    if ctx.accounts.mock_oracle.lamports() == 0 {
        let base_key = ctx.accounts.base_mint.key();
        let quote_key = ctx.accounts.quote_mint.key();
        let bump = ctx.bumps.mock_oracle;
        let seeds: &[&[u8]] = &[MOCK_ORACLE_SEED, base_key.as_ref(), quote_key.as_ref(), &[bump]];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let rent = Rent::get()?;

        system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.mock_oracle.to_account_info(),
                },
                signer_seeds,
            ),
            rent.minimum_balance(MOCK_ORACLE_SIZE),
            MOCK_ORACLE_SIZE as u64,
            &crate::ID,
        )?;
    }

    let mut data = ctx.accounts.mock_oracle.try_borrow_mut_data()?;
    data[0..4].copy_from_slice(&0xa1b2c3d4u32.to_le_bytes());
    data[4..8].copy_from_slice(&2u32.to_le_bytes());
    data[8..12].copy_from_slice(&3u32.to_le_bytes()); // account type = Price
    data[20..24].copy_from_slice(&expo.to_le_bytes());
    data[96..104].copy_from_slice(&publish_time.to_le_bytes());
    data[208..216].copy_from_slice(&price.to_le_bytes());
    data[216..224].copy_from_slice(&conf.to_le_bytes());
    data[224..228].copy_from_slice(&(status as u32).to_le_bytes());

    Ok(())
}
