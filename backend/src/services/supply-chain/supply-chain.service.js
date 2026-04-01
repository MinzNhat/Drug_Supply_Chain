import crypto from "crypto";
import { config } from "../../config/index.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { logger } from "../../utils/logger/logger.js";
import { normalizeRole, toCanonicalMspForRole } from "../../utils/msp/msp.js";
import {
    emitCanonicalAlert,
    emitDecisionAlert,
} from "../alerts/alert-taxonomy.mapper.js";
import {
    aggregateSupplyHeatmap,
    createBatchGeoEvent,
    listBatchSnapshots,
    queryBatchTimelineEvents,
} from "./supply-chain.geo.js";

/**
 * Convert number-like input to a fixed-width hexadecimal string.
 *
 * @param {number | bigint | string} value - Numeric value.
 * @returns {string} 16-char lowercase hex string.
 */
const toHex64 = (value) => {
    const hex = BigInt(value).toString(16);
    return hex.padStart(16, "0").slice(-16);
};

/**
 * Generate a unique batch identifier.
 *
 * @returns {string} Batch identifier.
 */
const generateBatchId = () => {
    const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `BATCH_${Date.now()}_${suffix}`;
};

/**
 * Build deterministic short hash from batch id.
 *
 * @param {string} batchID - Batch identifier.
 * @returns {string} 8-char hash prefix.
 */
const hashBatchId = (batchID) => {
    return crypto
        .createHash("sha256")
        .update(batchID)
        .digest("hex")
        .slice(0, 8);
};

/**
 * Hash protected token to ledger digest format.
 *
 * @param {string} token - Raw protected token.
 * @returns {string} SHA-256 digest.
 */
const hashTokenDigest = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Build public verification actor from configured scan role.
 *
 * @param {string} traceId - Current request trace id.
 * @returns {{ role: string, mspId: string, traceId: string }} Public actor context.
 */
const toPublicScanActor = (traceId) => {
    const normalizedRole =
        normalizeRole(config.fabric.publicScanRole) || "Regulator";
    const normalizedMsp =
        toCanonicalMspForRole(normalizedRole) || "RegulatorMSP";

    return {
        role: normalizedRole,
        mspId: normalizedMsp,
        traceId,
    };
};

/**
 * Supply chain service orchestrating QR integration and ledger logic.
 */
export class SupplyChainService {
    /**
     * @param {import("../../repositories/ledger/ledger.repository.js").LedgerRepository} ledgerRepository
     * @param {import("../qr/qr.service.js").QrService} qrService
     * @param {import("../ai-verifier/ai-verifier.service.js").AiVerifierService | null} aiVerifierService
     * @param {{ save?: (payload: Record<string, unknown> | null) => Promise<Record<string, unknown> | null> } | null} alertArchiveRepository
     * @param {{ dispatchAlert?: (payload: Record<string, unknown> | null) => Promise<Record<string, unknown>> } | null} alertDeliveryService
     */
    constructor(
        ledgerRepository,
        qrService,
        aiVerifierService = null,
        alertArchiveRepository = null,
        alertDeliveryService = null,
    ) {
        this.ledgerRepository = ledgerRepository;
        this.qrService = qrService;
        this.aiVerifierService = aiVerifierService;
        this.alertArchiveRepository = alertArchiveRepository;
        this.alertDeliveryService = alertDeliveryService;
    }

    /**
     * Persist emitted alert payload into archive storage when repository is available.
     *
     * @param {Record<string, unknown> | null} alertPayload - Emitted alert payload.
     */
    async archiveAlert(alertPayload) {
        if (!this.alertArchiveRepository?.save) {
            return;
        }

        try {
            await this.alertArchiveRepository.save(alertPayload);
        } catch (error) {
            logger.warn({
                message: "canonical-alert-archive-failed",
                canonicalKey: alertPayload?.canonicalKey ?? "",
                batchID: alertPayload?.batchID ?? "",
                traceId: alertPayload?.traceId ?? "",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown archive error",
            });
        }
    }

    /**
     * Dispatch alert payload to external sink without blocking core request path.
     *
     * @param {Record<string, unknown> | null} alertPayload - Emitted canonical alert payload.
     */
    dispatchAlertNonBlocking(alertPayload) {
        if (!this.alertDeliveryService?.dispatchAlert) {
            return;
        }

        void this.alertDeliveryService
            .dispatchAlert(alertPayload)
            .catch((error) => {
                logger.error({
                    message: "canonical-alert-dispatch-unhandled-error",
                    canonicalKey: alertPayload?.canonicalKey ?? "",
                    batchID: alertPayload?.batchID ?? "",
                    traceId: alertPayload?.traceId ?? "",
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown dispatch error",
                });
            });
    }

    /**
     * Trigger alert side effects in order: archive first, then non-blocking sink delivery.
     *
     * @param {Record<string, unknown> | null} alertPayload - Emitted canonical alert payload.
     */
    async processAlertSideEffects(alertPayload) {
        await this.archiveAlert(alertPayload);
        this.dispatchAlertNonBlocking(alertPayload);
    }

    /**
     * Create a new batch by minting a QR token and writing to the ledger.
     */
    async createBatch(input, actor) {
        const expiryMs = new Date(input.expiryDate).getTime();
        if (Number.isNaN(expiryMs)) {
            throw new HttpException(400, "Invalid expiryDate format");
        }

        const batchID = generateBatchId();
        const dataHash = hashBatchId(batchID);
        const metadataSeries = crypto.randomBytes(8).toString("hex");
        const metadataIssued = toHex64(Date.now());
        const metadataExpiry = toHex64(expiryMs);

        const qrResult = await this.qrService.generate({
            dataHash,
            metadataSeries,
            metadataIssued,
            metadataExpiry,
        });

        if (!qrResult.token) {
            throw new HttpException(
                502,
                "QR_GENERATE_FAILED",
                "Failed to generate QR token",
            );
        }

        const batchResult = await this.ledgerRepository.createBatch(
            actor,
            batchID,
            input.drugName,
            input.quantity,
            input.expiryDate,
            {
                token: qrResult.token,
                dataHash,
                metadataSeries,
                metadataIssued,
                metadataExpiry,
            },
        );

        return {
            batch: batchResult.batch,
            tokenDigest: batchResult.tokenDigest,
            qrToken: qrResult.token,
            qrImageBase64: qrResult.qrImageBase64,
        };
    }

    /**
     * Read a batch from ledger.
     */
    async readBatch(batchID, actor) {
        return this.ledgerRepository.readBatch(actor, batchID);
    }

    /**
     * Bind protected QR metadata and digest to a batch.
     */
    async bindProtectedQr(batchID, input, actor) {
        const tokenDigest = input.tokenDigest ?? hashTokenDigest(input.token);
        return this.ledgerRepository.bindProtectedQr(actor, batchID, {
            dataHash: input.dataHash.toLowerCase(),
            metadataSeries: input.metadataSeries.toLowerCase(),
            metadataIssued: input.metadataIssued.toLowerCase(),
            metadataExpiry: input.metadataExpiry.toLowerCase(),
            tokenDigest,
            token: input.token ?? "",
        });
    }

    /**
     * Evaluate protected QR digest match.
     */
    async verifyProtectedQr(batchID, tokenDigest, actor) {
        return this.ledgerRepository.verifyProtectedQr(
            actor,
            batchID,
            tokenDigest,
        );
    }

    /**
     * Submit physical verification record to ledger.
     */
    async recordProtectedQrVerification(
        batchID,
        isAuthentic,
        confidenceScore,
        tokenDigest,
        actor,
    ) {
        return this.ledgerRepository.recordProtectedQrVerification(
            actor,
            batchID,
            isAuthentic,
            confidenceScore,
            tokenDigest,
        );
    }

    /**
     * Verify a product by validating the QR image and ledger state.
     */
    async verifyProduct(imageBuffer, traceId = "", options = {}) {
        const packagingImageBuffer = options.packagingImageBuffer ?? null;

        const [verifyResult, aiVerification] = await Promise.all([
            this.qrService.verify(imageBuffer),
            this.aiVerifierService?.verify(packagingImageBuffer, traceId) ??
                Promise.resolve({
                    enabled: false,
                    code: "AI_DISABLED",
                    accepted: true,
                    confidenceScore: null,
                    verdict: "NOT_RUN",
                }),
        ]);

        const dataHash = verifyResult.decodedMeta?.dataHash;
        if (!dataHash) {
            throw new HttpException(
                400,
                "QR_INVALID_PAYLOAD",
                "Invalid QR payload",
            );
        }

        if (!verifyResult.token) {
            throw new HttpException(
                400,
                "QR_TOKEN_MISSING",
                "Protected QR verification did not return token",
            );
        }

        const batch = await this.ledgerRepository.getBatchByDataHash(dataHash);
        const tokenDigest = hashTokenDigest(verifyResult.token);
        const publicActor = toPublicScanActor(traceId);

        const protectedQrCheck = await this.verifyProtectedQr(
            batch.batchID,
            tokenDigest,
            publicActor,
        );

        const protectedQrRecord = await this.recordProtectedQrVerification(
            batch.batchID,
            verifyResult.isAuthentic,
            verifyResult.confidenceScore,
            tokenDigest,
            publicActor,
        );

        const result = await this.ledgerRepository.verifyBatch(
            publicActor,
            batch.batchID,
        );

        const accepted =
            verifyResult.isAuthentic &&
            protectedQrCheck.matched === true &&
            result.safetyStatus.level !== "DANGER" &&
            aiVerification.accepted !== false;

        const decision = {
            accepted,
            code: accepted ? "SCAN_ACCEPTED" : "SCAN_REJECTED",
        };

        const decisionAlert = emitDecisionAlert(decision.code, {
            batchID: batch.batchID,
            traceId,
            details: {
                ledgerMatch: protectedQrCheck.matched,
                isAuthentic: verifyResult.isAuthentic,
                confidenceScore: verifyResult.confidenceScore,
                aiAccepted: aiVerification.accepted,
                safetyLevel: result.safetyStatus.level,
            },
        });
        await this.processAlertSideEffects(decisionAlert);

        if (!accepted) {
            throw new HttpException(
                400,
                "SCAN_REJECTED",
                "Product verification failed",
                {
                    decision,
                    alert: decisionAlert,
                    confidenceScore: verifyResult.confidenceScore,
                    ledgerMatch: protectedQrCheck.matched,
                    safetyStatus: result.safetyStatus,
                    aiVerification,
                },
            );
        }

        return {
            decision,
            alert: decisionAlert,
            isAuthentic: verifyResult.isAuthentic,
            confidenceScore: verifyResult.confidenceScore,
            tokenDigest,
            protectedQrCheck,
            protectedQrRecord,
            aiVerification,
            batchInfo: result.batch,
            safetyStatus: result.safetyStatus,
        };
    }

    /**
     * Start shipping a batch to the target owner.
     */
    async shipBatch(batchID, receiverMSP, actor) {
        return this.ledgerRepository.shipBatch(actor, batchID, receiverMSP);
    }

    /**
     * Receive a batch in transit and finalize ownership transfer.
     */
    async receiveBatch(batchID, actor) {
        return this.ledgerRepository.receiveBatch(actor, batchID);
    }

    /**
     * Update IPFS document metadata for the batch.
     */
    async updateDocument(batchID, docType, newCID, actor) {
        return this.ledgerRepository.updateDocument(
            actor,
            batchID,
            docType,
            newCID,
        );
    }

    /**
     * Recall a batch immediately.
     */
    async emergencyRecall(batchID, actor) {
        const batch = await this.ledgerRepository.emergencyRecall(
            actor,
            batchID,
        );

        const recallAlert = emitCanonicalAlert("RECALL_ALERT", {
            sourceKey: "EmergencyRecall",
            batchID,
            traceId: actor?.traceId ?? "",
            details: {
                requestedByRole: actor?.role ?? "",
                requestedByMsp: actor?.mspId ?? "",
                status: batch?.status ?? "",
            },
        });
        await this.processAlertSideEffects(recallAlert);

        return {
            ...batch,
            recallAlert,
        };
    }

    /**
     * List batches for operational supply-chain FE views.
     */
    async listBatches(filters, actor) {
        return listBatchSnapshots(filters, actor);
    }

    /**
     * Record geospatial events to support timeline and heatmap dashboards.
     */
    async recordBatchGeoEvent(batchID, input, actor) {
        await this.readBatch(batchID, actor);
        return createBatchGeoEvent(batchID, input, actor);
    }

    /**
     * Read a batch event timeline.
     */
    async getBatchTimeline(batchID, query, actor) {
        const batch = await this.readBatch(batchID, actor);
        const events = await queryBatchTimelineEvents(batchID, query);

        return {
            batch,
            events,
        };
    }

    /**
     * Aggregate geo events into heatmap buckets for FE map layers.
     */
    async getSupplyHeatmap(query, actor) {
        return aggregateSupplyHeatmap(query, actor);
    }
}
