"use strict";

const {
    getClientMSP,
    isCanonicalMSP,
    toCanonicalMSP,
} = require("../helpers/identity");
const {
    normalizeExpiryDate,
    requireNonEmptyString,
} = require("../helpers/validation");
const {
    batchExists,
    getBatchOrThrow,
    putBatch,
} = require("../repositories/batchRepository");

/**
 * evaluateRisk is a helper function that determines the risk level of a batch based on its status and scan count. It categorizes batches into "DANGER_RECALLED", "DANGER_FAKE", "WARNING", or "SAFE" based on predefined criteria.
 *
 * @param {Object} batch - The batch object containing the status and scan count information.
 * @returns {string} The risk level of the batch, which can be "DANGER_RECALLED", "DANGER_FAKE", "WARNING", or "SAFE".
 */
function evaluateRisk(batch) {
    if (batch.status === "RECALLED") {
        return "DANGER_RECALLED";
    }

    if (batch.status === "SUSPICIOUS") {
        return "DANGER_FAKE";
    }

    if (
        batch.scanCount >= batch.warningThreshold ||
        batch.status === "WARNING"
    ) {
        return "WARNING";
    }

    return "SAFE";
}

/**
 * buildDefaultBatch is a helper function that constructs a new batch object with default values based on the provided parameters. It initializes the batch with the given batch ID, drug name, owner MSP, quantity, and expiry date, while also setting default values for other fields such as scan count, status, and document information.
 *
 * @param {string} batchID - The unique identifier for the batch.
 * @param {string} drugName - The name of the drug contained in the batch.
 * @param {string} ownerMSP - The MSP ID of the owner of the batch.
 * @param {number} quantity - The total supply quantity of the batch.
 * @param {string} expiryDate - The expiry date of the batch in ISO format.
 * @returns {Object} A new batch object initialized with the provided parameters and default values.
 */
function buildDefaultBatch(batchID, drugName, ownerMSP, quantity, expiryDate) {
    return {
        docType: "batch",
        batchID,
        drugName,
        manufacturerMSP: ownerMSP,
        ownerMSP,
        expiryDate,
        totalSupply: quantity,
        scanCount: 0,
        warningThreshold: Math.ceil(quantity * 1.05),
        suspiciousThreshold: Math.ceil(quantity * 1.1),
        status: "ACTIVE",
        documents: {
            packageImage: {
                currentCID: "",
                lastUpdated: "",
                pinned: false,
                history: [],
            },
            qualityCert: {
                currentCID: "",
                lastUpdated: "",
                pinned: true,
                history: [],
            },
        },
        targetOwnerMSP: "",
        transferStatus: "NONE",
        transferHistory: [],
    };
}

/**
 * createBatch allows a user with the ManufacturerMSP role to create a new batch on the ledger. It validates the input parameters, checks for the existence of a batch with the same ID, and initializes the batch with default values before storing it in the ledger.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state and client identity.
 * @param {string} batchID - The unique identifier for the new batch.
 * @param {string} drugName - The name of the drug contained in the batch.
 * @param {string} quantityStr - The total supply quantity of the batch as a string, which will be parsed into a number.
 * @param {string} expiryDate - The expiry date of the batch in ISO format.
 * @returns {string} A JSON string representation of the newly created batch object.
 * @throws Will throw an error if the client is not authorized, if the input parameters are invalid, or if a batch with the same ID already exists.
 */
async function createBatch(ctx, batchID, drugName, quantityStr, expiryDate) {
    const clientOrgID = getClientMSP(ctx);

    if (!isCanonicalMSP(clientOrgID, "ManufacturerMSP")) {
        throw new Error("Denied: Only ManufacturerMSP can create batches.");
    }

    const normalizedBatchID = requireNonEmptyString(batchID, "batchID");
    const normalizedDrugName = requireNonEmptyString(drugName, "drugName");

    const exists = await batchExists(ctx, normalizedBatchID);

    if (exists) {
        throw new Error(`Denied: Batch ${normalizedBatchID} already exists.`);
    }

    const quantity = parseInt(quantityStr, 10);

    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Denied: quantity must be a positive integer.");
    }

    const normalizedExpiryDate = normalizeExpiryDate(expiryDate);
    const canonicalOwnerMSP = toCanonicalMSP(clientOrgID);
    const batch = buildDefaultBatch(
        normalizedBatchID,
        normalizedDrugName,
        canonicalOwnerMSP,
        quantity,
        normalizedExpiryDate,
    );

    await putBatch(ctx, normalizedBatchID, batch);
    return JSON.stringify(batch);
}

/**
 * readBatch retrieves a batch from the ledger by its ID and returns it as a JSON string. It uses the getBatchOrThrow helper function to fetch the batch and handle the case where the batch does not exist.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state.
 * @param {string} batchID - The unique identifier of the batch to retrieve.
 * @returns {string} A JSON string representation of the batch object retrieved from the ledger.
 * @throws Will throw an error if the batch does not exist in the ledger.
 */
async function readBatch(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);
    return JSON.stringify(batch);
}

/**
 * verifyBatch is a function that processes a batch verification request. It checks the status of the batch and updates its scan count. If the scan count exceeds certain thresholds, it updates the batch status to "WARNING" or "SUSPICIOUS" and emits corresponding events. Finally, it returns the updated batch information as a JSON string.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state.
 * @param {string} batchID - The unique identifier of the batch to verify.
 * @returns {string} A JSON string representation of the updated batch object after verification.
 * @throws Will throw an error if the batch does not exist in the ledger.
 */
async function verifyBatch(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);

    if (batch.status === "RECALLED") {
        return JSON.stringify({
            result: "DANGER_RECALLED",
            batchID,
            status: batch.status,
        });
    }

    if (batch.status === "SUSPICIOUS") {
        return JSON.stringify({
            result: "DANGER_FAKE",
            batchID,
            status: batch.status,
        });
    }

    batch.scanCount += 1;

    if (batch.scanCount >= batch.suspiciousThreshold) {
        if (batch.status !== "SUSPICIOUS") {
            batch.status = "SUSPICIOUS";
            await ctx.stub.setEvent(
                "PublicAlert",
                Buffer.from(
                    JSON.stringify({
                        batchID,
                        msg: "Suspicious scan volume detected",
                        scanCount: batch.scanCount,
                        suspiciousThreshold: batch.suspiciousThreshold,
                    }),
                ),
            );
        }
    } else if (batch.scanCount >= batch.warningThreshold) {
        if (batch.status === "ACTIVE") {
            batch.status = "WARNING";
            await ctx.stub.setEvent(
                "GovMonitor",
                Buffer.from(
                    JSON.stringify({
                        batchID,
                        msg: "Scan anomaly threshold reached",
                        scanCount: batch.scanCount,
                        warningThreshold: batch.warningThreshold,
                    }),
                ),
            );
        }
    }

    await putBatch(ctx, batchID, batch);
    return JSON.stringify(batch);
}

/**
 * evaluateBatchRisk is a function that evaluates the risk level of a batch based on its scan count and thresholds.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state.
 * @param {string} batchID - The unique identifier of the batch to evaluate.
 * @returns {string} A JSON string representation of the batch's risk evaluation.
 * @throws Will throw an error if the batch does not exist in the ledger.
 */
async function evaluateBatchRisk(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);
    return JSON.stringify({
        batchID,
        status: batch.status,
        scanCount: batch.scanCount,
        warningThreshold: batch.warningThreshold,
        suspiciousThreshold: batch.suspiciousThreshold,
        riskLevel: evaluateRisk(batch),
    });
}

module.exports = {
    batchExists,
    readBatch,
    createBatch,
    verifyBatch,
    evaluateBatchRisk,
};
