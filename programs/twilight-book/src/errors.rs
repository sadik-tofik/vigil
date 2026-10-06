use anchor_lang::prelude::*;

#[error_code]
pub enum TwilightError {
    #[msg("Continuous swaps are halted while the market is in BatchAuction mode")]
    ContinuousTradingHalted, // AC-01

    #[msg("Pyth price feed is stale beyond the allowed staleness window")]
    StaleOracle,

    #[msg("Pyth feed status or account data is malformed")]
    InvalidOracleData,

    #[msg("Order limit price falls outside the dynamic confidence band [P_ref - k*sigma, P_ref + k*sigma]")]
    OrderPriceExceedsConfidenceBand, // AC-02

    #[msg("Order action rejected: inside the terminal anti-sniping freeze window")]
    BatchFrozen, // AC-03

    #[msg("Batch order array is full (max 32 orders per epoch)")]
    BatchFull,

    #[msg("Market is not currently in BatchAuction mode")]
    NotInBatchMode,

    #[msg("Epoch batch is not in AcceptingOrders status")]
    BatchNotAcceptingOrders,

    #[msg("Epoch has not yet reached its end slot")]
    EpochNotYetEnded,

    #[msg("Epoch batch has already been settled")]
    BatchAlreadySettled,

    #[msg("Order index out of range for this batch")]
    InvalidOrderIndex,

    #[msg("Order has already been claimed")]
    OrderAlreadyClaimed,

    #[msg("Order does not belong to the calling user")]
    OrderOwnerMismatch,

    #[msg("Epoch batch must be Settled or Voided before proceeds can be claimed")]
    BatchNotFinalized,

    #[msg("Arithmetic overflow or underflow in a checked operation")]
    MathOverflow,
}

