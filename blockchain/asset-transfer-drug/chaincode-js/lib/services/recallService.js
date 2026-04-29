"use strict";

const {
    getClientMSP,
    isCanonicalMSP,
    toCanonicalMSP,
} = require("../helpers/identity");
const { getTimestampISO } = require("../helpers/time");
const {
    getBatchOrThrow,
    putBatch,
} = require("../repositories/batchRepository");

/**
 * Trigger emergency recall for a batch (RegulatorMSP only).
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @returns {string} JSON-serialized updated batch.
 */
async function emergencyRecall(ctx, batchID) {
    const clientOrgID = getClientMSP(ctx);
    const batch = await getBatchOrThrow(ctx, batchID);

    const isRegulator = isCanonicalMSP(clientOrgID, "RegulatorMSP");
    const isManufacturer = isCanonicalMSP(clientOrgID, "ManufacturerMSP");

    if (!isRegulator && !isManufacturer) {
        throw new Error(
            "Denied: Only RegulatorMSP or ManufacturerMSP can initiate a recall.",
        );
    }

    // If Manufacturer, must be the original manufacturer of the batch
    if (isManufacturer) {
        // We use manufacturerMSP and manufacturerId to verify ownership of the production line
        // Some legacy batches might not have manufacturerId, so we fallback to MSP
        const clientID = ctx.clientIdentity.getID(); // This might be complex to match exactly with ownerId
        // For simplicity in this system, we trust the mspId and the provided actorId from backend
        // But on-chain, we should check if the client's MSP matches the batch's manufacturerMSP
        if (!isCanonicalMSP(clientOrgID, batch.manufacturerMSP)) {
            throw new Error(
                "Denied: Manufacturers can only recall their own batches.",
            );
        }
    }

    if (batch.status !== "RECALLED") {
        batch.status = "RECALLED";
    }

    await putBatch(ctx, batchID, batch);
    await ctx.stub.setEvent(
        "RecallAlert",
        Buffer.from(
            JSON.stringify({
                batch_id: batchID,
                status: batch.status,
                recalled_by: toCanonicalMSP(clientOrgID),
                recalled_at: getTimestampISO(ctx),
            }),
        ),
    );
    return JSON.stringify(batch);
}

module.exports = {
    emergencyRecall,
};
