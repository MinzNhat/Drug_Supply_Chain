"use strict";

const { PROTECTED_QR_VERIFICATION_POLICY } = require("../drugTracker.constants");
const {
    normalizeProtectedQrPolicy,
    requireOptionalString,
} = require("../helpers/validation");

/**
 * This module provides functions to interact with the batch state in the ledger, including retrieving, updating, and checking the existence of batches. It also ensures that batch data conforms to expected defaults and formats.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state and transaction information.
 * @param {string} batchID - The unique identifier of the batch to retrieve or update.
 * @param {Object} batch - The batch object containing the data to be stored in the ledger.
 * @returns {Object} The batch object retrieved from the ledger, with defaults applied.
 * @throws Will throw an error if the batch does not exist when attempting to retrieve it.
 * @throws Will throw an error if there is an issue with storing the batch in the ledger.
 */
function buildProtectedQrDefaults(protectedQrState) {
    // Ledger schema remains snake_case for backward compatibility across existing states and events.
    return {
        data_hash: requireOptionalString(
            protectedQrState.data_hash || protectedQrState.dataHash,
        ),
        metadata_series: requireOptionalString(
            protectedQrState.metadata_series || protectedQrState.metadataSeries,
        ),
        metadata_issued: requireOptionalString(
            protectedQrState.metadata_issued || protectedQrState.metadataIssued,
        ),
        metadata_expiry: requireOptionalString(
            protectedQrState.metadata_expiry || protectedQrState.metadataExpiry,
        ),
        token_digest: requireOptionalString(
            protectedQrState.token_digest || protectedQrState.tokenDigest,
        ),
        last_bound_at: requireOptionalString(
            protectedQrState.last_bound_at || protectedQrState.lastBoundAt,
        ),
        bound_by: requireOptionalString(
            protectedQrState.bound_by || protectedQrState.boundBy,
        ),
        history: Array.isArray(protectedQrState.history)
            ? protectedQrState.history
            : [],
        verification_policy: normalizeProtectedQrPolicy(
            protectedQrState.verification_policy,
            PROTECTED_QR_VERIFICATION_POLICY,
        ),
        verification_history: Array.isArray(
            protectedQrState.verification_history,
        )
            ? protectedQrState.verification_history
            : [],
    };
}

/**
 * ensureBatchDefaults takes a batch object and applies default values and normalization to ensure it conforms to the expected structure. This includes normalizing the protected QR code information and ensuring that any legacy field names are handled appropriately.
 *
 * @param {Object} batch - The batch object to normalize and apply defaults to.
 * @returns {Object} The batch object with defaults applied.
 */
function ensureBatchDefaults(batch) {
    const protectedQr = buildProtectedQrDefaults(
        batch.protected_qr || batch.protectedQR || {},
    );

    batch.protected_qr = protectedQr;

    if (batch.protectedQR) {
        delete batch.protectedQR;
    }

    return batch;
}

/**
 * getBatchOrThrow retrieves a batch from the ledger by its ID. If the batch does not exist, it throws an error. It also applies default values to ensure the batch object conforms to the expected structure.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state.
 * @param {string} batchID - The unique identifier of the batch to retrieve.
 * @returns {Object} The batch object retrieved from the ledger, with defaults applied.
 * @throws Will throw an error if the batch does not exist in the ledger.
 */
async function getBatchOrThrow(ctx, batchID) {
    const buffer = await ctx.stub.getState(batchID);

    if (!buffer || buffer.length === 0) {
        throw new Error(`Denied: Batch ${batchID} does not exist.`);
    }

    return ensureBatchDefaults(JSON.parse(buffer.toString()));
}

/**
 * putBatch stores a batch object in the ledger under the specified batch ID. It applies default values to the batch object before storing it to ensure it conforms to the expected structure.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state.
 * @param {string} batchID - The unique identifier of the batch to store.
 * @param {Object} batch - The batch object containing the data to be stored in the ledger.
 * @returns {Promise<void>} A promise that resolves when the batch has been successfully stored in the ledger.
 * @throws Will throw an error if there is an issue with storing the batch in the ledger.
 */
async function putBatch(ctx, batchID, batch) {
    await ctx.stub.putState(
        batchID,
        Buffer.from(JSON.stringify(ensureBatchDefaults(batch))),
    );
}

/**
 * batchExists checks if a batch with the specified ID exists in the ledger.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state.
 * @param {string} batchID - The unique identifier of the batch to check for existence.
 * @returns {Promise<boolean>} A promise that resolves to true if the batch exists, or false if it does not exist.
 */
async function batchExists(ctx, batchID) {
    const buffer = await ctx.stub.getState(batchID);
    return Boolean(buffer && buffer.length > 0);
}

module.exports = {
    getBatchOrThrow,
    putBatch,
    batchExists,
    ensureBatchDefaults,
};
