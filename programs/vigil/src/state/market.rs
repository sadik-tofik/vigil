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
    pub base_mint: Pubkey,         // Base asset token mint (e.g. tTSLA, real estate, gold, foreign currency)
    pub quote_mint: Pubkey,        // Quote asset token mint (e.g. USDC, EURC, USDY)
    pub vault_base: Pubkey,
    pub vault_quote: Pubkey,
    pub pyth_feed: Pubkey,
    pub mode: MarketMode,
    pub current_epoch: u64,
    pub epoch_duration_slots: u64, // default 75 (~30s)
    pub epoch_start_slot: u64,
    pub max_conf_bps: u64,         // e.g. 200 = 2.00%
    pub conf_filter_mult: u64,     // k in [P - k*sigma, P + k*sigma], default 2
    pub asset_class: AssetClass,   // DISPLAY/CLASSIFICATION field only (1 byte)
    pub bump: u8,
}

impl Market {
    // 8 (disc) + 32*6 (pubkeys: authority, base_mint, quote_mint, vault_base,
    // vault_quote, pyth_feed) + 1 (mode) + 8*5 (u64 fields: current_epoch,
    // epoch_duration_slots, epoch_start_slot, max_conf_bps, conf_filter_mult)
    // + 1 (asset_class) + 1 (bump)
    pub const SIZE: usize = 8 + 32 * 6 + 1 + 8 * 5 + 1 + 1; // = 243 bytes (242 original + 1 for asset_class)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketMode {
    Continuous = 0,
    BatchAuction = 1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum AssetClass {
    TokenizedEquity = 0,
    RWA = 1,
    EmergingMarketFX = 2,
    EventContingent = 3,
}
