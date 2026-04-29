"use strict";

const {
    getClientMSP,
    sameMSP,
    toCanonicalMSP,
} = require("../helpers/identity");
const { getTimestampISO } = require("../helpers/time");
const { requireNonEmptyString, requireOptionalString } = require("../helpers/validation");
const {
    getBatchOrThrow,
    putBatch,
} = require("../repositories/batchRepository");

/**
 * Initiate batch shipment to a new owner MSP (current owner only).
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @param {string} receiverMSP - Target owner MSP.
 * @param {string} senderUnitId - Sender distributor unit id (optional).
 * @param {string} receiverUnitId - Receiver distributor unit id (optional).
 * @returns {string} JSON-serialized updated batch.
 */
async function shipBatch(ctx, batchID, receiverMSP, senderUnitId, receiverUnitId, targetOwnerId) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const clientOrgID = getClientMSP(ctx);
    const normalizedReceiverMSP = requireNonEmptyString(
        receiverMSP,
        "receiverMSP",
    );
    const normalizedTargetOwnerId = requireOptionalString(targetOwnerId);
    const normalizedSenderUnitId = requireOptionalString(senderUnitId);
    const normalizedReceiverUnitId = requireOptionalString(receiverUnitId);
    const canonicalClientOrgID = toCanonicalMSP(clientOrgID);
    const canonicalReceiverMSP = toCanonicalMSP(normalizedReceiverMSP);

    const distributorToDistributorTransfer =
        sameMSP(canonicalClientOrgID, "DistributorMSP") &&
        sameMSP(canonicalReceiverMSP, "DistributorMSP");

    if (!sameMSP(clientOrgID, batch.ownerMSP)) {
        throw new Error("Denied: Only current owner can ship the batch.");
    }

    if (batch.status !== "ACTIVE") {
        throw new Error("Denied: Only ACTIVE batches can be shipped.");
    }

    if (batch.transferStatus !== "NONE") {
        throw new Error("Denied: Batch is already in transit.");
    }

    if (distributorToDistributorTransfer) {
        if (!normalizedSenderUnitId) {
            throw new Error(
                "Denied: sender distributor unit identity is required for inter-distributor transfer.",
            );
        }

        if (!normalizedReceiverUnitId) {
            throw new Error(
                "Denied: receiver distributor unit identity is required for inter-distributor transfer.",
            );
        }

        const currentOwnerUnitId = requireOptionalString(batch.ownerUnitId);
        if (
            currentOwnerUnitId &&
            normalizedSenderUnitId !== currentOwnerUnitId
        ) {
            throw new Error(
                "Denied: sender distributor unit does not match current owner unit.",
            );
        }

        if (normalizedSenderUnitId === normalizedReceiverUnitId) {
            throw new Error(
                "Denied: receiver distributor unit must be different from current owner unit.",
            );
        }
    } else if (sameMSP(normalizedReceiverMSP, clientOrgID)) {
        throw new Error(
            "Denied: receiverMSP must be different from current owner.",
        );
    }

    if (!sameMSP(canonicalReceiverMSP, "DistributorMSP") && normalizedReceiverUnitId) {
        throw new Error(
            "Denied: receiver distributor unit is only supported when receiver MSP is DistributorMSP.",
        );
    }

    batch.targetOwnerMSP = canonicalReceiverMSP;
    batch.targetOwnerId = normalizedTargetOwnerId;
    batch.targetOwnerUnitId =
        sameMSP(canonicalReceiverMSP, "DistributorMSP") && normalizedReceiverUnitId
            ? normalizedReceiverUnitId
            : "";
    batch.transferStatus = "IN_TRANSIT";

    await putBatch(ctx, batchID, batch);
    return JSON.stringify(batch);
}

/**
 * Confirm receipt of an in-transit batch (target owner MSP only).
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @param {string} receiverUnitId - Receiver distributor unit id (optional).
 * @param {string} receiverId - ID of the account receiving the batch.
 * @returns {string} JSON-serialized updated batch.
 */
async function receiveBatch(ctx, batchID, receiverUnitId, receiverId) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const clientOrgID = getClientMSP(ctx);
    const normalizedReceiverUnitId = requireOptionalString(receiverUnitId);
    const normalizedReceiverId = requireNonEmptyString(receiverId, "receiverId");

    if (batch.transferStatus !== "IN_TRANSIT") {
        throw new Error("Denied: Batch is not in transit.");
    }

    if (!sameMSP(clientOrgID, batch.targetOwnerMSP)) {
        throw new Error("Denied: Only targetOwnerMSP can receive this batch.");
    }

    const canonicalReceiver = toCanonicalMSP(clientOrgID);
    const targetOwnerUnitId = requireOptionalString(batch.targetOwnerUnitId);
    const receiverIsDistributor = sameMSP(canonicalReceiver, "DistributorMSP");

    if (targetOwnerUnitId) {
        if (!normalizedReceiverUnitId) {
            throw new Error(
                "Denied: receiver distributor unit identity is required for this transfer.",
            );
        }

        if (normalizedReceiverUnitId !== targetOwnerUnitId) {
            throw new Error(
                "Denied: receiver distributor unit does not match transfer target unit.",
            );
        }
    }

    if (!receiverIsDistributor && normalizedReceiverUnitId) {
        throw new Error(
            "Denied: receiver distributor unit is only supported for DistributorMSP receive.",
        );
    }

    const nextOwnerUnitId = receiverIsDistributor
        ? normalizedReceiverUnitId || targetOwnerUnitId || ""
        : "";

    batch.transferHistory.push({
        from: batch.ownerMSP,
        to: canonicalReceiver,
        fromId: batch.ownerId,
        toId: normalizedReceiverId,
        fromUnitId: requireOptionalString(batch.ownerUnitId),
        toUnitId: nextOwnerUnitId,
        timestamp: getTimestampISO(ctx),
    });

    batch.ownerMSP = canonicalReceiver;
    batch.ownerId = normalizedReceiverId;
    batch.ownerUnitId = nextOwnerUnitId;
    batch.targetOwnerMSP = "";
    batch.targetOwnerId = "";
    batch.targetOwnerUnitId = "";
    batch.transferStatus = "NONE";

    await putBatch(ctx, batchID, batch);
    return JSON.stringify(batch);
}

module.exports = {
    shipBatch,
    receiveBatch,
};
