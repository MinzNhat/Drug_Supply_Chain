"use strict";

const {
    getClientMSP,
    isCanonicalMSP,
    sameMSP,
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
 * Determine the risk classification of a batch based on its status and scan count.
 *
 * @param {Object} batch - Ledger batch object.
 * @returns {string} Risk level: "DANGER_RECALLED" | "DANGER_FAKE" | "WARNING" | "SAFE".
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
 * Construct a default batch object for ledger initialization.
 *
 * @param {string} batchID - Unique batch identifier.
 * @param {string} drugName - Drug name.
 * @param {string} ownerMSP - Manufacturing org MSP.
 * @param {number} quantity - Total supply quantity.
 * @param {string} expiryDate - ISO expiry date.
 * @returns {Object} Initialized batch object.
 */
function buildDefaultBatch(batchID, drugName, ownerMSP, quantity, expiryDate, ownerId) {
    return {
        docType: "batch",
        batchID,
        drugName,
        manufacturerMSP: ownerMSP,
        manufacturerId: ownerId, // Creator is the first owner
        ownerMSP,
        ownerId,
        expiryDate,
        totalSupply: quantity,
        scanCount: 0,
        warningThreshold: Math.max(50, Math.ceil(quantity * 1.05)),
        suspiciousThreshold: Math.max(100, Math.ceil(quantity * 1.1)),
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
        targetOwnerId: "",
        ownerUnitId: "",
        targetOwnerUnitId: "",
        consumptionConfirmed: false,
        consumptionConfirmedAt: "",
        consumptionConfirmedByMSP: "",
        transferStatus: "NONE",
        transferHistory: [],
    };
}

/**
 * Create a new batch on the ledger (ManufacturerMSP only).
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Unique batch identifier.
 * @param {string} drugName - Drug name.
 * @param {string} quantityStr - Total supply as string.
 * @param {string} expiryDate - ISO expiry date.
 * @param {string} ownerId - ID of the creating user.
 * @returns {string} JSON-serialized batch object.
 */
async function createBatch(ctx, batchID, drugName, quantityStr, expiryDate, ownerId) {
    const clientOrgID = getClientMSP(ctx);

    if (!isCanonicalMSP(clientOrgID, "ManufacturerMSP")) {
        throw new Error("Denied: Only ManufacturerMSP can create batches.");
    }

    const normalizedBatchID = requireNonEmptyString(batchID, "batchID");
    const normalizedDrugName = requireNonEmptyString(drugName, "drugName");
    const normalizedOwnerId = requireNonEmptyString(ownerId, "ownerId");

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
        normalizedOwnerId,
    );

    await putBatch(ctx, normalizedBatchID, batch);
    return JSON.stringify(batch);
}

/**
 * Read one batch from the ledger.
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @returns {string} JSON-serialized batch object.
 */
async function readBatch(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);
    return JSON.stringify(batch);
}

/**
 * Register one scan attempt against a batch and update risk status.
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @returns {string} JSON-serialized updated batch with verificationResult.
 */
async function verifyBatch(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);

    if (batch.status === "RECALLED") {
        return JSON.stringify({
            ...batch,
            verificationResult: "DANGER_RECALLED",
        });
    }

    if (batch.status === "SUSPICIOUS") {
        return JSON.stringify({
            ...batch,
            verificationResult: "DANGER_FAKE",
        });
    }

    if (!batch.consumptionConfirmed) {
        await ctx.stub.setEvent(
            "GovMonitor",
            Buffer.from(
                JSON.stringify({
                    batchID,
                    msg: "Scan before consumption delivery confirmation (warning)",
                    code: "WARN_UNCONFIRMED_CONSUMPTION",
                }),
            ),
        );
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
    return JSON.stringify({
        ...batch,
        verificationResult: evaluateRisk(batch),
    });
}

/**
 * confirmDeliveredToConsumption marks one batch as delivered to consumption point.
 *
 * @param {Context} ctx - The transaction context.
 * @param {string} batchID - Target batch id.
 * @returns {string} Updated batch state.
 */
async function confirmDeliveredToConsumption(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const clientOrgID = getClientMSP(ctx);

    if (!isCanonicalMSP(clientOrgID, "DistributorMSP")) {
        throw new Error(
            "Denied: Only DistributorMSP can confirm delivery to consumption.",
        );
    }

    if (!sameMSP(clientOrgID, batch.ownerMSP)) {
        throw new Error(
            "Denied: Only current owner can confirm delivery to consumption.",
        );
    }

    if (batch.transferStatus !== "NONE") {
        throw new Error(
            "Denied: Cannot confirm consumption delivery while batch is in transit.",
        );
    }

    if (batch.consumptionConfirmed) {
        return JSON.stringify(batch);
    }

    batch.consumptionConfirmed = true;
    batch.consumptionConfirmedAt = new Date().toISOString();
    batch.consumptionConfirmedByMSP = toCanonicalMSP(clientOrgID);

    await putBatch(ctx, batchID, batch);

    await ctx.stub.setEvent(
        "ConsumptionDeliveryConfirmed",
        Buffer.from(
            JSON.stringify({
                batchID,
                ownerMSP: batch.ownerMSP,
                confirmedByMSP: batch.consumptionConfirmedByMSP,
                confirmedAt: batch.consumptionConfirmedAt,
            }),
        ),
    );

    return JSON.stringify(batch);
}

/**
 * Read-only risk evaluation for a batch without mutating ledger state.
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @returns {string} JSON-serialized risk evaluation payload.
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
    confirmDeliveredToConsumption,
    evaluateBatchRisk,
};
