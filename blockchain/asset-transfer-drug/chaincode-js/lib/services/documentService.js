"use strict";

const { getClientMSP, sameMSP } = require("../helpers/identity");
const { getTimestampISO } = require("../helpers/time");
const {
    getBatchOrThrow,
    putBatch,
} = require("../repositories/batchRepository");

/**
 * Update a batch document CID (current owner only).
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @param {string} docType - Document type key (e.g. "packageImage", "qualityCert").
 * @param {string} newCID - New IPFS content identifier.
 * @returns {string} JSON-serialized updated batch.
 */
async function updateDocument(ctx, batchID, docType, newCID) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const clientOrgID = getClientMSP(ctx);

    if (!sameMSP(clientOrgID, batch.ownerMSP)) {
        throw new Error("Denied: Only current owner can update documents.");
    }

    if (!newCID || !newCID.trim()) {
        throw new Error("Denied: newCID must be provided.");
    }

    if (!batch.documents || !batch.documents[docType]) {
        throw new Error(`Denied: Unsupported document type ${docType}.`);
    }

    const ts = getTimestampISO(ctx);
    const document = batch.documents[docType];
    const oldCID = document.currentCID;

    if (oldCID) {
        document.history.push({
            cid: oldCID,
            updatedAt: document.lastUpdated || ts,
            updatedBy: ctx.clientIdentity.getID(),
        });
    }

    document.currentCID = newCID;
    document.lastUpdated = ts;
    document.pinned = false;

    await putBatch(ctx, batchID, batch);
    await ctx.stub.setEvent(
        "PinningRequest",
        Buffer.from(
            JSON.stringify({
                batchID,
                docType,
                newCID,
                oldCID: oldCID || "",
            }),
        ),
    );

    return JSON.stringify(batch);
}

module.exports = {
    updateDocument,
};
