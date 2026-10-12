use anchor_lang::prelude::*;

pub const REGISTRY_SEED: &[u8] = b"registry";

#[account]
pub struct Registry {
    pub bump: u8,
    pub markets: Vec<Pubkey>,
}

impl Registry {
    pub const MAX_MARKETS: usize = 256;

    // 8 (anchor discriminator) + 1 (bump: u8) + 4 (borsh Vec<Pubkey> length prefix: u32)
    // + 32 * MAX_MARKETS (256 * 32 bytes for pubkeys)
    // = 8 + 1 + 4 + 8192 = 8,205 bytes
    pub const SIZE: usize = 8 + 1 + 4 + 32 * Self::MAX_MARKETS;
}
