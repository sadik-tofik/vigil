use anchor_lang::prelude::*;

use crate::errors::TwilightError;
use crate::state::PRICE_SCALE;

/// Converts a raw Pyth price/conf value (arbitrary exponent) into the
/// protocol's 6-decimal fixed point (TDD §1, PRICE_SCALE = 1_000_000).
///
/// NOT used by evaluate_market_mode's UncertaintyBps calculation — that's
/// (conf / price) * 10_000, and the exponent cancels out of that ratio
/// entirely, so no scaling was needed there. It IS needed here and in
/// settle_batch_auction (Sprint 4), because both compare a Pyth-derived
/// price directly against a user-supplied limit_price, which is already
/// denominated in 6-decimal fixed point.
pub fn scale_pyth_value(raw: i64, expo: i32) -> Result<u64> {
    require!(raw > 0, TwilightError::InvalidOracleData);

    // shift needed to land on 6 decimals: e.g. expo = -8 -> shift = -2
    // (divide by 100); expo = -4 -> shift = 2 (multiply by 100).
    let shift = 6i32.checked_add(expo).ok_or(TwilightError::MathOverflow)?;

    let value: u128 = if shift >= 0 {
        let factor = 10u128
            .checked_pow(shift as u32)
            .ok_or(TwilightError::MathOverflow)?;
        (raw as u128).checked_mul(factor).ok_or(TwilightError::MathOverflow)?
    } else {
        let factor = 10u128
            .checked_pow((-shift) as u32)
            .ok_or(TwilightError::MathOverflow)?;
        (raw as u128).checked_div(factor).ok_or(TwilightError::MathOverflow)?
    };

    u64::try_from(value).map_err(|_| error!(TwilightError::MathOverflow))
}

/// SRS 5.2: P_min = P_ref - k*sigma, P_max = P_ref + k*sigma, all in
/// already-scaled 6-decimal fixed point.
pub fn confidence_band(p_ref: u64, sigma: u64, k: u64) -> Result<(u64, u64)> {
    let width = sigma.checked_mul(k).ok_or(TwilightError::MathOverflow)?;
    let p_min = p_ref.checked_sub(width).ok_or(TwilightError::MathOverflow)?;
    let p_max = p_ref.checked_add(width).ok_or(TwilightError::MathOverflow)?;
    Ok((p_min, p_max))
}

#[allow(dead_code)]
pub const _PRICE_SCALE_SANITY: u128 = PRICE_SCALE; // keeps the PRICE_SCALE import honest if unused elsewhere
