"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOCK_ORACLE_SEED = exports.ORDER_SEED = exports.BATCH_SEED = exports.VAULT_QUOTE_SEED = exports.VAULT_BASE_SEED = exports.MARKET_SEED = exports.REGISTRY_SEED = void 0;
exports.findRegistryPda = findRegistryPda;
exports.findMarketPda = findMarketPda;
exports.findVaultBasePda = findVaultBasePda;
exports.findVaultQuotePda = findVaultQuotePda;
exports.findEpochBatchPda = findEpochBatchPda;
exports.findUserOrderEscrowPda = findUserOrderEscrowPda;
exports.findMockOraclePda = findMockOraclePda;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
/**
 * Program PDA Seed Constants (mirroring programs/vigil/src/state/*.rs)
 */
exports.REGISTRY_SEED = Buffer.from("registry");
exports.MARKET_SEED = Buffer.from("market");
exports.VAULT_BASE_SEED = Buffer.from("vault_base");
exports.VAULT_QUOTE_SEED = Buffer.from("vault_quote");
exports.BATCH_SEED = Buffer.from("batch");
exports.ORDER_SEED = Buffer.from("order");
exports.MOCK_ORACLE_SEED = Buffer.from("mock_oracle");
/**
 * Derives the canonical Registry PDA
 */
function findRegistryPda(programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([exports.REGISTRY_SEED], programId);
}
/**
 * Derives the canonical Market PDA for a base/quote mint pair
 */
function findMarketPda(baseMint, quoteMint, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([exports.MARKET_SEED, baseMint.toBuffer(), quoteMint.toBuffer()], programId);
}
/**
 * Derives the base token vault PDA for a market
 */
function findVaultBasePda(market, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([exports.VAULT_BASE_SEED, market.toBuffer()], programId);
}
/**
 * Derives the quote token vault PDA for a market
 */
function findVaultQuotePda(market, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([exports.VAULT_QUOTE_SEED, market.toBuffer()], programId);
}
/**
 * Derives the EpochBatchState PDA for a market and epoch index
 */
function findEpochBatchPda(market, epochId, programId) {
    const epochBn = new anchor_1.BN(epochId.toString());
    return web3_js_1.PublicKey.findProgramAddressSync([exports.BATCH_SEED, market.toBuffer(), epochBn.toArrayLike(Buffer, "le", 8)], programId);
}
/**
 * Derives the UserOrderEscrow PDA for a user order
 */
function findUserOrderEscrowPda(epochBatch, user, orderIndex, programId) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(orderIndex, 0);
    return web3_js_1.PublicKey.findProgramAddressSync([exports.ORDER_SEED, epochBatch.toBuffer(), user.toBuffer(), buf], programId);
}
/**
 * Derives the Mock Oracle PDA (Devnet / Test harness only)
 */
function findMockOraclePda(baseMint, quoteMint, programId) {
    return web3_js_1.PublicKey.findProgramAddressSync([exports.MOCK_ORACLE_SEED, baseMint.toBuffer(), quoteMint.toBuffer()], programId);
}
