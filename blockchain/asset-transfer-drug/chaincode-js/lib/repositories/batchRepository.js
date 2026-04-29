"use strict";

const {
    PROTECTED_QR_VERIFICATION_POLICY,
} = require("../drugTracker.constants");

const {
    normalizeProtectedQrPolicy,
    requireOptionalString,
} = require("../helpers/validation");

/**
 * Build normalized protected QR sub-document with all required fields and defaults.
 *
 * @param {Object} protectedQrState - Raw protected QR state from ledger.
 * @returns {Object} Normalized protected QR object.
 */
function buildProtectedQrDefaults(protectedQrState) {
    // Ledger schema remains snake_case for backward compatibility across existing states and events.
    const tokenPolicy = protectedQrState.token_policy || {};

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
        token_policy: {
            status: requireOptionalString(tokenPolicy.status) || "ACTIVE",
            token_digest: requireOptionalString(tokenPolicy.token_digest),
            reason: requireOptionalString(tokenPolicy.reason),
            note: requireOptionalString(tokenPolicy.note),
            action_type: requireOptionalString(tokenPolicy.action_type) || "NONE",
            action_at: requireOptionalString(tokenPolicy.action_at),
            action_by: requireOptionalString(tokenPolicy.action_by),
            action_by_msp: requireOptionalString(tokenPolicy.action_by_msp),
            history: Array.isArray(tokenPolicy.history) ? tokenPolicy.history : [],
        },
    };
}

/**
 * Apply field defaults and normalize legacy keys on a batch object.
 *
 * @param {Object} batch - Raw batch object from ledger.
 * @returns {Object} Batch with defaults and normalized fields applied.
 */
function ensureBatchDefaults(batch) {
    const protectedQr = buildProtectedQrDefaults(
        batch.protected_qr || batch.protectedQR || {},
    );

    batch.protected_qr = protectedQr;
    batch.ownerUnitId = requireOptionalString(batch.ownerUnitId);
    batch.targetOwnerUnitId = requireOptionalString(batch.targetOwnerUnitId);
    batch.consumptionConfirmed = Boolean(batch.consumptionConfirmed);
    batch.consumptionConfirmedAt = requireOptionalString(
        batch.consumptionConfirmedAt,
    );
    batch.consumptionConfirmedByMSP = requireOptionalString(
        batch.consumptionConfirmedByMSP,
    );

    if (!Array.isArray(batch.transferHistory)) {
        batch.transferHistory = [];
    } else {
        batch.transferHistory = batch.transferHistory.map((entry) => {
            return {
                ...entry,
                fromUnitId: requireOptionalString(entry?.fromUnitId),
                toUnitId: requireOptionalString(entry?.toUnitId),
            };
        });
    }

    if (batch.protectedQR) {
        delete batch.protectedQR;
    }

    return batch;
}

/**
 * Retrieve one batch from ledger by ID or throw if not found.
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @returns {Object} Batch object with defaults applied.
 */
async function getBatchOrThrow(ctx, batchID) {
    const buffer = await ctx.stub.getState(batchID);

    if (!buffer || buffer.length === 0) {
        throw new Error(`Denied: Batch ${batchID} does not exist.`);
    }

    return ensureBatchDefaults(JSON.parse(buffer.toString()));
}

/**
 * Serialize and store a batch object on the ledger.
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @param {Object} batch - Batch object to persist.
 * @returns {Promise<void>}
 */
async function putBatch(ctx, batchID, batch) {
    await ctx.stub.putState(
        batchID,
        Buffer.from(JSON.stringify(ensureBatchDefaults(batch))),
    );
}

/**
 * Check whether a batch with the given ID exists on the ledger.
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @returns {Promise<boolean>} True if the batch exists.
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
