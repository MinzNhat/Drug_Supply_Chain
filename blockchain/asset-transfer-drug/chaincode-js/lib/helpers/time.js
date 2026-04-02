"use strict";

/**
 * This module provides helper functions for working with timestamps in the context of Hyperledger Fabric chaincode.
 * It includes a function to get the current transaction timestamp in ISO 8601 format, which can be used for consistent time tracking across different operations.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the transaction timestamp.
 * @returns {string} The current transaction timestamp in ISO 8601 format.
 */
function getTimestampISO(ctx) {
    const ts = ctx.stub.getTxTimestamp();

    const secondsRaw =
        typeof ts.getSeconds === "function" ? ts.getSeconds() : ts.seconds;

    const nanosRaw =
        typeof ts.getNanos === "function" ? ts.getNanos() : ts.nanos;

    const seconds =
        typeof secondsRaw === "object" && secondsRaw !== null
            ? Number(secondsRaw.low ?? secondsRaw.toString())
            : Number(secondsRaw);

    const nanos = Number(nanosRaw ?? 0);

    return new Date(seconds * 1000 + Math.floor(nanos / 1000000)).toISOString();
}

module.exports = {
    getTimestampISO,
};
