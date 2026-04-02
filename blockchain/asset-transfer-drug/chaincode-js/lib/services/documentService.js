"use strict";

const { getClientMSP, sameMSP } = require("../helpers/identity");
const { getTimestampISO } = require("../helpers/time");
const { getBatchOrThrow, putBatch } = require("../repositories/batchRepository");

/**
 * updateDocument is a function that allows the current owner of a batch to update the document information associated with that batch. It checks if the caller is the current owner, validates the new CID, updates the document information in the batch, and emits an event for pinning the new document.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state and client identity.
 * @param {string} batchID - The unique identifier of the batch whose document is being updated.
 * @param {string} docType - The type of document being updated (e.g., "certificateOfAnalysis").
 * @param {string} newCID - The new Content Identifier (CID) for the document.
 * @returns {string} A JSON string representation of the updated batch object after the document update.
 * @throws Will throw an error if the caller is not the current owner, if the new CID is invalid, or if the document type is unsupported.
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
