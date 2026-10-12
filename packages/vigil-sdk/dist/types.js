"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMarketMode = parseMarketMode;
exports.parseBatchStatus = parseBatchStatus;
exports.parseOrderSide = parseOrderSide;
exports.parseAssetClass = parseAssetClass;
exports.toAnchorSide = toAnchorSide;
exports.toAnchorAssetClass = toAnchorAssetClass;
/**
 * Normalize Anchor enum object to string
 */
function parseMarketMode(mode) {
    if (typeof mode === "string")
        return mode;
    if (mode && "continuous" in mode)
        return "Continuous";
    if (mode && "batchAuction" in mode)
        return "BatchAuction";
    return "Continuous";
}
function parseBatchStatus(status) {
    if (typeof status === "string")
        return status;
    if (status && "acceptingOrders" in status)
        return "AcceptingOrders";
    if (status && "frozen" in status)
        return "Frozen";
    if (status && "settled" in status)
        return "Settled";
    if (status && "voided" in status)
        return "Voided";
    return "AcceptingOrders";
}
function parseOrderSide(side) {
    if (typeof side === "string") {
        return side.toLowerCase() === "bid" ? "bid" : "ask";
    }
    if (side && "bid" in side)
        return "bid";
    if (side && "ask" in side)
        return "ask";
    return "bid";
}
function parseAssetClass(assetClass) {
    if (typeof assetClass === "string")
        return assetClass;
    if (typeof assetClass === "number") {
        switch (assetClass) {
            case 0:
                return "TokenizedEquity";
            case 1:
                return "RWA";
            case 2:
                return "EmergingMarketFX";
            case 3:
                return "EventContingent";
        }
    }
    if (assetClass && typeof assetClass === "object") {
        if ("tokenizedEquity" in assetClass || "TokenizedEquity" in assetClass)
            return "TokenizedEquity";
        if ("rwa" in assetClass || "Rwa" in assetClass || "RWA" in assetClass)
            return "RWA";
        if ("emergingMarketFx" in assetClass ||
            "EmergingMarketFx" in assetClass ||
            "emergingMarketFX" in assetClass)
            return "EmergingMarketFX";
        if ("eventContingent" in assetClass || "EventContingent" in assetClass)
            return "EventContingent";
    }
    return "TokenizedEquity";
}
function toAnchorSide(side) {
    if (typeof side === "string") {
        return side.toLowerCase() === "bid" ? { bid: {} } : { ask: {} };
    }
    return side;
}
function toAnchorAssetClass(assetClass) {
    if (typeof assetClass === "string") {
        switch (assetClass) {
            case "TokenizedEquity":
                return { tokenizedEquity: {} };
            case "RWA":
                return { rwa: {} };
            case "EmergingMarketFX":
                return { emergingMarketFx: {} };
            case "EventContingent":
                return { eventContingent: {} };
            default:
                return { tokenizedEquity: {} };
        }
    }
    return assetClass;
}
