import crypto from "crypto";
import { BatchIndex } from "../../models/batch/batch-index.model.js";
import { BatchState } from "../../models/batch/batch-state.model.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { logger } from "../../utils/logger/logger.js";
import { toCanonicalMspForRole } from "../../utils/msp/msp.js";

/**
 * Build a permissive actor for public verification lookups.
 *
 * @returns {{ role: string, mspId: string }} Public scan actor.
 */
export const toPublicScanActor = () => {
    return {
        role: "Regulator",
        mspId: toCanonicalMspForRole("Regulator") || "RegulatorMSP",
    };
};

/**
 * Ensure actor identity is complete before ledger calls.
 *
 * @param {{ role?: string, mspId?: string } | null | undefined} actor - Authenticated actor.
 */
export const ensureActor = (actor) => {
    if (!actor?.role || !actor?.mspId) {
        throw new HttpException(
            401,
            "UNAUTHORIZED",
            "Missing or invalid access token",
        );
    }
};

/**
 * Hash one string with SHA-256.
 *
 * @param {string} value - Raw string.
 * @returns {string} Lowercase SHA-256 hex digest.
 */
export const sha256 = (value) => {
    return crypto.createHash("sha256").update(value).digest("hex");
};

/**
 * Validate required string argument.
 *
 * @param {unknown} value - Input value.
 * @param {string} fieldName - Field label for validation errors.
 * @returns {string} Non-empty string.
 */
export const requireString = (value, fieldName) => {
    if (!value || typeof value !== "string") {
        throw new HttpException(
            400,
            "MAPPER_VALIDATION_ERROR",
            `${fieldName} is required`,
        );
    }
    return value;
};

/**
 * Parse one JSON payload from Fabric response bytes.
 *
 * @param {unknown} payload - Raw Fabric response payload.
 * @param {string} fieldName - Response field label for errors.
 * @returns {Record<string, unknown>} Parsed payload object.
 */
const parseJsonPayload = (payload, fieldName) => {
    let raw = "";

    if (typeof payload === "string") {
        raw = payload;
    } else if (Buffer.isBuffer(payload)) {
        raw = payload.toString("utf8");
    } else if (payload instanceof Uint8Array) {
        raw = Buffer.from(payload).toString("utf8");
    } else if (payload !== null && payload !== undefined) {
        raw = String(payload);
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new HttpException(
            502,
            "LEDGER_INVALID_JSON",
            `Failed to parse ${fieldName} from ledger response`,
            {
                reason: error instanceof Error ? error.message : "unknown",
            },
        );
    }
};

/**
 * Parse one batch payload from ledger response.
 *
 * @param {unknown} payload - Raw payload.
 * @returns {Record<string, unknown>} Parsed batch object.
 */
export const parseBatchPayload = (payload) =>
    parseJsonPayload(payload, "batch");

/**
 * Parse one protected QR payload from ledger response.
 *
 * @param {unknown} payload - Raw payload.
 * @returns {Record<string, unknown>} Parsed protected QR object.
 */
export const parseProtectedQrPayload = (payload) =>
    parseJsonPayload(payload, "protectedQr");

/**
 * Parse one verify-batch payload from ledger response.
 *
 * @param {unknown} payload - Raw payload.
 * @returns {Record<string, unknown>} Parsed verify-batch object.
 */
export const parseVerifyBatchPayload = (payload) =>
    parseJsonPayload(payload, "verifyBatch");

/**
 * Convert optional date input to Date instance or null.
 *
 * @param {unknown} value - Raw date value.
 * @returns {Date | null} Parsed date or null when invalid/empty.
 */
const toDateOrNull = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Synchronize batch snapshot for FE pagination and analytics views.
 *
 * @param {Record<string, unknown>} batch - Canonical batch payload.
 * @returns {Promise<void>} Resolves when sync is attempted.
 */
export const syncBatchSnapshot = async (batch) => {
    if (!batch?.batchID) {
        return;
    }

    try {
        await BatchState.updateOne(
            { batchID: batch.batchID },
            {
                $set: {
                    batchID: batch.batchID,
                    drugName: batch.drugName ?? "",
                    manufacturerMSP: batch.manufacturerMSP ?? "",
                    ownerMSP: batch.ownerMSP ?? "",
                    status: batch.status ?? "",
                    transferStatus: batch.transferStatus ?? "",
                    expiryDate: toDateOrNull(batch.expiryDate),
                    scanCount: Number(batch.scanCount ?? 0),
                    totalSupply: Number(batch.totalSupply ?? 0),
                    lastLedgerSyncAt: new Date(),
                    batch,
                },
            },
            { upsert: true },
        );
    } catch (error) {
        logger.warn({
            message: "Failed to sync batch snapshot",
            batchID: batch.batchID,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

/**
 * Upsert protected QR index for reverse lookups by hash/token.
 *
 * @param {string} batchID - Batch identifier.
 * @param {Record<string, string>} bindingInput - Protected QR binding payload.
 * @returns {Promise<void>} Resolves when index write finishes.
 */
export const upsertBatchIndex = async (batchID, bindingInput) => {
    await BatchIndex.updateOne(
        { batchID },
        {
            $set: {
                batchID,
                dataHash: bindingInput.dataHash,
                tokenDigest: bindingInput.tokenDigest,
                metadataSeries: bindingInput.metadataSeries,
                metadataIssued: bindingInput.metadataIssued,
                metadataExpiry: bindingInput.metadataExpiry,
                qrToken: bindingInput.token ?? "",
            },
        },
        { upsert: true },
    );
};

/**
 * Read one batch index by data hash.
 *
 * @param {string} dataHash - Protected QR data hash.
 * @returns {Promise<Record<string, unknown>>} Persisted index entry.
 */
export const requireBatchIndexByDataHash = async (dataHash) => {
    const index = await BatchIndex.findOne({ dataHash }).lean();
    if (!index) {
        throw new HttpException(
            404,
            "BATCH_NOT_FOUND",
            "Batch mapping not found for data hash",
            { dataHash },
        );
    }

    return index;
};
