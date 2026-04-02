"use strict";

const { getClientMSP, sameMSP, toCanonicalMSP } = require("../helpers/identity");
const { getTimestampISO } = require("../helpers/time");
const { requireNonEmptyString } = require("../helpers/validation");
const { getBatchOrThrow, putBatch } = require("../repositories/batchRepository");

/**
 * shipBatch is a function that allows the current owner of a batch to initiate the shipping process by specifying the receiver's MSP. It checks if the caller is the current owner, validates the batch status and transfer status, and updates the batch's target owner and transfer status to indicate that it is in transit.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state and client identity.
 * @param {string} batchID - The unique identifier of the batch being shipped.
 * @param {string} receiverMSP - The MSP ID of the intended recipient of the batch.
 * @returns {string} A JSON string representation of the updated batch object after initiating the shipping process.
 * @throws Will throw an error if the caller is not the current owner, if the batch is not in an ACTIVE status, if it is already in transit, or if the receiverMSP is invalid or the same as the current owner.
 */
async function shipBatch(ctx, batchID, receiverMSP) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const clientOrgID = getClientMSP(ctx);
    const normalizedReceiverMSP = requireNonEmptyString(
        receiverMSP,
        "receiverMSP",
    );

    if (!sameMSP(clientOrgID, batch.ownerMSP)) {
        throw new Error("Denied: Only current owner can ship the batch.");
    }

    if (batch.status !== "ACTIVE") {
        throw new Error("Denied: Only ACTIVE batches can be shipped.");
    }

    if (batch.transferStatus !== "NONE") {
        throw new Error("Denied: Batch is already in transit.");
    }

    if (sameMSP(normalizedReceiverMSP, clientOrgID)) {
        throw new Error(
            "Denied: receiverMSP must be different from current owner.",
        );
    }

    batch.targetOwnerMSP = toCanonicalMSP(normalizedReceiverMSP);
    batch.transferStatus = "IN_TRANSIT";

    await putBatch(ctx, batchID, batch);
    return JSON.stringify(batch);
}

/**
 * receiveBatch is a function that allows the target owner of a batch to confirm receipt of the batch. It checks if the caller is the target owner, validates the batch transfer status, and updates the batch's ownership and transfer status.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state and client identity.
 * @param {string} batchID - The unique identifier of the batch being received.
 * @returns {string} A JSON string representation of the updated batch object after confirming receipt.
 * @throws Will throw an error if the caller is not the target owner or if the batch is not in transit.
 */
async function receiveBatch(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const clientOrgID = getClientMSP(ctx);

    if (batch.transferStatus !== "IN_TRANSIT") {
        throw new Error("Denied: Batch is not in transit.");
    }

    if (!sameMSP(clientOrgID, batch.targetOwnerMSP)) {
        throw new Error("Denied: Only targetOwnerMSP can receive this batch.");
    }

    const canonicalReceiver = toCanonicalMSP(clientOrgID);

    batch.transferHistory.push({
        from: batch.ownerMSP,
        to: canonicalReceiver,
        timestamp: getTimestampISO(ctx),
    });

    batch.ownerMSP = canonicalReceiver;
    batch.targetOwnerMSP = "";
    batch.transferStatus = "NONE";

    await putBatch(ctx, batchID, batch);
    return JSON.stringify(batch);
}

module.exports = {
    shipBatch,
    receiveBatch,
};
