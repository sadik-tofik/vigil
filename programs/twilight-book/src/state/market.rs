use anchor_lang::prelude::*;

// PDA seeds (SRS 3.1.1):
//   Market:      [b"market", base_mint, quote_mint]
//   VaultBase:   [b"vault_base", market]
//   VaultQuote:  [b"vault_quote", market]
pub const MARKET_SEED: &[u8] = b"market";
pub const VAULT_BASE_SEED: &[u8] = b"vault_base";
pub const VAULT_QUOTE_SEED: &[u8] = b"vault_quote";

#[account]
pub struct Market {
    pub authority: Pubkey,
    pub base_mint: Pubkey,         // Tokenized equity, e.g. tTSLA
    pub quote_mint: Pubkey,        // Stablecoin, e.g. USDC
    pub vault_base: Pubkey,
    pub vault_quote: Pubkey,
    pub pyth_feed: Pubkey,
    pub mode: MarketMode,
    pub current_epoch: u64,
    pub epoch_duration_slots: u64, // default 75 (~30s)
    pub epoch_start_slot: u64,
    pub max_conf_bps: u64,         // e.g. 200 = 2.00%
    pub conf_filter_mult: u64,     // k in [P - k*sigma, P + k*sigma], default 2
    pub bump: u8,
}

impl Market {
    // 8 (disc) + 32*6 (pubkeys: authority, base_mint, quote_mint, vault_base,
    // vault_quote, pyth_feed) + 1 (mode) + 8*5 (u64 fields) + 1 (bump)
    pub const SIZE: usize = 8 + 32 * 6 + 1 + 8 * 5 + 1; // = 242 bytes, matches PDR §2
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketMode {
    Continuous = 0,
    BatchAuction = 1,
}
