"use strict";

const {
    getClientMSP,
    isCanonicalMSP,
    toCanonicalMSP,
} = require("../helpers/identity");
const { getTimestampISO } = require("../helpers/time");
const { getBatchOrThrow, putBatch } = require("../repositories/batchRepository");

/**
 * emergencyRecall is a function that allows the regulatory authority (RegulatorMSP) to initiate an emergency recall of a batch. It checks if the caller belongs to the RegulatorMSP, retrieves the batch, updates its status to "RECALLED" if it is not already recalled, and emits a "RecallAlert" event with details about the recall.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state and client identity.
 * @param {string} batchID - The unique identifier of the batch to be recalled.
 * @returns {string} A JSON string representation of the updated batch object after the recall action has been performed.
 * @throws Will throw an error if the caller does not belong to RegulatorMSP or if there is an issue retrieving or updating the batch in the ledger.
 */
async function emergencyRecall(ctx, batchID) {
    const clientOrgID = getClientMSP(ctx);

    if (!isCanonicalMSP(clientOrgID, "RegulatorMSP")) {
        throw new Error(
            "Denied: Only RegulatorMSP can initiate an emergency recall.",
        );
    }

    const batch = await getBatchOrThrow(ctx, batchID);

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
