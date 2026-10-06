use anchor_lang::prelude::*;

use crate::errors::TwilightError;
use crate::state::epoch_batch::{BatchOrder, OrderSide, MAX_ORDERS_PER_BATCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClearingResult {
    Voided,
    Settled { clearing_price: u64, matched_volume: u64 },
}

fn demand_at(orders: &[BatchOrder], order_count: usize, p: u64) -> Result<u64> {
    let sum: u128 = orders[..order_count]
        .iter()
        .filter(|o| o.lot_size > 0 && o.side == OrderSide::Bid && o.limit_price >= p)
        .try_fold(0u128, |acc, o| acc.checked_add(o.lot_size as u128).ok_or(TwilightError::MathOverflow))?;
    u64::try_from(sum).map_err(|_| error!(TwilightError::MathOverflow))
}

fn supply_at(orders: &[BatchOrder], order_count: usize, p: u64) -> Result<u64> {
    let sum: u128 = orders[..order_count]
        .iter()
        .filter(|o| o.lot_size > 0 && o.side == OrderSide::Ask && o.limit_price <= p)
        .try_fold(0u128, |acc, o| acc.checked_add(o.lot_size as u128).ok_or(TwilightError::MathOverflow))?;
    u64::try_from(sum).map_err(|_| error!(TwilightError::MathOverflow))
}

/// TDD §2: scans only the discrete limit prices actually submitted (<=32),
/// not a continuous search — O(candidates * order_count), worst case
/// 32*32 = 1024 comparisons for the sweep, well inside the ~520k CU
/// worst-case budgeted in PDR §5.
///
/// `p_ref` (already scaled to 6-decimal fixed point via
/// `math::oracle::scale_pyth_value`) is used ONLY for tie-breaking between
/// candidate prices that produce identical crossed volume — it never
/// constrains which price can win outright. Confidence-band rejection of
/// out-of-bounds prices already happened at `place_batch_order` time; this
/// function trusts every order it's given is already inside that band.
pub fn solve_uniform_price(orders: &[BatchOrder], order_count: usize, p_ref: u64) -> Result<ClearingResult> {
    require!(order_count <= MAX_ORDERS_PER_BATCH, TwilightError::BatchFull);

    let mut candidates = [0u64; MAX_ORDERS_PER_BATCH];
    let mut candidate_count = 0usize;
    for order in orders[..order_count].iter() {
        if order.lot_size == 0 {
            continue; // zeroed/cancelled slot
        }
        let p = order.limit_price;
        if !candidates[..candidate_count].contains(&p) {
            candidates[candidate_count] = p;
            candidate_count += 1;
        }
    }

    if candidate_count == 0 {
        return Ok(ClearingResult::Voided);
    }

    // In-place bubble sort ascending — matches PDR §5's stated optimization
    // strategy; candidate_count <= 32 so worst case is 496 comparisons.
    for i in 0..candidate_count {
        for j in 0..candidate_count.saturating_sub(1).saturating_sub(i) {
            if candidates[j] > candidates[j + 1] {
                candidates.swap(j, j + 1);
            }
        }
    }

    let mut max_volume: u64 = 0;
    let mut optimal_price: u64 = 0;

    for &p in candidates[..candidate_count].iter() {
        let demand = demand_at(orders, order_count, p)?;
        let supply = supply_at(orders, order_count, p)?;
        let crossed = demand.min(supply);

        if crossed > max_volume {
            max_volume = crossed;
            optimal_price = p;
        } else if crossed == max_volume && max_volume > 0 {
            // TDD §2 tie-break: bias toward the oracle reference price.
            if p.abs_diff(p_ref) < optimal_price.abs_diff(p_ref) {
                optimal_price = p;
            }
        }
    }

    if max_volume == 0 {
        Ok(ClearingResult::Voided)
    } else {
        Ok(ClearingResult::Settled {
            clearing_price: optimal_price,
            matched_volume: max_volume,
        })
    }
}

/// PDR §4 step 5 / SRS 4.2 REQ-F06 step 6: orders strictly better than the
/// clearing price fill 100%; orders sitting exactly at the clearing price
/// split whatever volume is left, pro-rata by lot_size.
///
/// KNOWN SIMPLIFICATION, deliberate for hackathon scope: pro-rata fills use
/// integer division, so up to (number of orders at the tie price - 1) atoms
/// of `matched_volume` can go unallocated as rounding dust per side. Those
/// atoms are never lost from vault accounting — they simply stay as
/// unfilled remainder on whichever order(s) got rounded down, reclaimable
/// like any other unfilled balance. A production version would need a
/// deterministic remainder-distribution rule (e.g. largest-remainder
/// method) to guarantee `sum(filled) == matched_volume` exactly; this
/// implementation does not guarantee that at the individual-order level,
/// only that no order's `filled_lot_size` can ever exceed `matched_volume`
/// in aggregate.
pub fn apply_fills(
    orders: &mut [BatchOrder],
    order_count: usize,
    clearing_price: u64,
    matched_volume: u64,
) -> Result<()> {
    fill_side(orders, order_count, clearing_price, matched_volume, OrderSide::Bid)?;
    fill_side(orders, order_count, clearing_price, matched_volume, OrderSide::Ask)?;
    Ok(())
}

fn fill_side(
    orders: &mut [BatchOrder],
    order_count: usize,
    clearing_price: u64,
    matched_volume: u64,
    side: OrderSide,
) -> Result<()> {
    // "Strictly better" means: bids priced ABOVE clearing_price, asks
    // priced BELOW it — those fill in full before any pro-rata split.
    let mut strict_filled: u128 = 0;
    for order in orders[..order_count].iter_mut() {
        if order.lot_size == 0 || order.side != side {
            continue;
        }
        let strictly_better = match side {
            OrderSide::Bid => order.limit_price > clearing_price,
            OrderSide::Ask => order.limit_price < clearing_price,
        };
        if strictly_better {
            order.filled_lot_size = order.lot_size;
            strict_filled = strict_filled
                .checked_add(order.lot_size as u128)
                .ok_or(TwilightError::MathOverflow)?;
        }
    }

    let remaining = (matched_volume as u128)
        .checked_sub(strict_filled)
        .ok_or(TwilightError::MathOverflow)?;

    let at_price_total: u128 = orders[..order_count]
        .iter()
        .filter(|o| o.lot_size > 0 && o.side == side && o.limit_price == clearing_price)
        .try_fold(0u128, |acc, o| acc.checked_add(o.lot_size as u128).ok_or(TwilightError::MathOverflow))?;

    if at_price_total > 0 {
        for order in orders[..order_count].iter_mut() {
            if order.lot_size == 0 || order.side != side || order.limit_price != clearing_price {
                continue;
            }
            let fill = (order.lot_size as u128)
                .checked_mul(remaining)
                .ok_or(TwilightError::MathOverflow)?
                .checked_div(at_price_total)
                .ok_or(TwilightError::MathOverflow)?;
            order.filled_lot_size = u64::try_from(fill).map_err(|_| error!(TwilightError::MathOverflow))?;
        }
    }

    Ok(())
}
