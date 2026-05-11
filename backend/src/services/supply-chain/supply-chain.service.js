import crypto from "crypto";
import { config } from "../../config/index.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { logger } from "../../utils/logger/logger.js";
import { normalizeMspId, normalizeRole, toCanonicalMspForRole } from "../../utils/msp/msp.js";
import { normalizeDistributorUnitId } from "../../integrations/fabric/fabric-identity-resolver.js";
import { BatchIndex } from "../../models/batch/batch-index.model.js";
import { BatchState } from "../../models/batch/batch-state.model.js";
import { User } from "../../models/user/user.model.js";
import { Province } from "../../models/location/province.model.js";
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
import { toBatchDetail, toBatchGeoEventDto } from "./supply-chain.mappers.js";
import { DrugCategory } from "../../models/product/drug-category.model.js";
import { BatchGeoEvent } from "../../models/batch/batch-geo-event.model.js";

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
     * @param {{ uploadDocument?: (fileBuffer: Buffer, options: { fileName?: string, mediaType?: string, docType: string }) => Promise<Record<string, unknown>> } | null} documentStorageAdapter
     * @param {{ save?: (payload: Record<string, unknown>) => Promise<Record<string, unknown>> } | null} documentArtifactRepository
     */
    constructor(
        ledgerRepository,
        qrService,
        aiVerifierService = null,
        alertArchiveRepository = null,
        alertDeliveryService = null,
        documentStorageAdapter = null,
        documentArtifactRepository = null,
    ) {
        this.ledgerRepository = ledgerRepository;
        this.qrService = qrService;
        this.aiVerifierService = aiVerifierService;
        this.alertArchiveRepository = alertArchiveRepository;
        this.alertDeliveryService = alertDeliveryService;
        this.documentStorageAdapter = documentStorageAdapter;
        this.documentArtifactRepository = documentArtifactRepository;
        logger.info("SupplyChainService initialized with QR regeneration and fallback support (v2)");
    }

    /**
     * Ensure actor has full profile details (businessName, province, coordinates).
     * Fetches from DB if fields are missing from the session/token object.
     */
    async _ensureFullActor(actor) {
        if (!actor || !actor.id) return actor;

        // If we already have the critical fields, return as is
        if (actor.businessName && actor.province && actor.lat && actor.lng) {
            return actor;
        }

        try {
            const fullUser = await User.findById(actor.id).lean();
            if (fullUser) {
                return {
                    ...actor,
                    businessName: fullUser.businessName || actor.businessName,
                    province: fullUser.province || actor.province,
                    lat: fullUser.lat || actor.lat,
                    lng: fullUser.lng || actor.lng,
                    address: fullUser.address || actor.address
                };
            }
        } catch (err) {
            logger.warn(`Failed to fetch full actor profile for ${actor.id}: ${err.message}`);
        }
        return actor;
    }

    /**
     * Resolve actor coordinates from their profile or fallback to province.
     */
    async _resolveActorCoords(actor) {
        const fullActor = await this._ensureFullActor(actor);

        if (fullActor.lat && fullActor.lng) {
            return { lat: Number(fullActor.lat), lng: Number(fullActor.lng) };
        }

        // Fallback to province coordinates
        if (fullActor.province) {
            // Use regex for robust matching (e.g. handle "Hà Nội" vs "Ha Noi" if needed, though here we match exact but trimmed)
            const provinceName = String(fullActor.province).trim();
            const province = await Province.findOne({
                name: { $regex: new RegExp(`^${provinceName}$`, "i") }
            }).lean();

            if (province && province.lat && province.lng) {
                return { lat: province.lat, lng: province.lng };
            }
        }

        // Final fallback: TP.HCM
        return { lat: 10.762622, lng: 106.660172 };
    }

    /**
     * Persist one document artifact record in off-chain storage.
     *
     * @param {Record<string, unknown>} payload - Artifact payload.
     */
    async saveDocumentArtifact(payload) {
        if (!this.documentArtifactRepository?.save) {
            return;
        }

        try {
            await this.documentArtifactRepository.save(payload);
        } catch (error) {
            logger.warn({
                message: "document-artifact-save-failed",
                batchID: payload.batchID ?? "",
                docType: payload.docType ?? "",
                traceId: payload.traceId ?? "",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown artifact persistence error",
            });
        }
    }

    /**
     * Validate direct-upload payload policy.
     *
     * @param {string} docType - Document type.
     * @param {{ buffer: Buffer, mediaType?: string, sizeBytes?: number }} file - Uploaded file payload.
     */
    validateUploadDocument(docType, file) {
        if (!config.documentUpload.enabled) {
            throw new HttpException(
                503,
                "DOC_UPLOAD_DISABLED",
                "Direct document upload is disabled",
            );
        }

        if (!this.documentStorageAdapter?.uploadDocument) {
            throw new HttpException(
                500,
                "DOC_STORAGE_NOT_READY",
                "Document storage adapter is not configured",
            );
        }

        const sizeBytes =
            typeof file.sizeBytes === "number" && file.sizeBytes > 0
                ? file.sizeBytes
                : file.buffer.length;

        if (sizeBytes > config.documentUpload.maxUploadBytes) {
            throw new HttpException(
                400,
                "DOCUMENT_TOO_LARGE",
                "Uploaded document exceeds size limit",
                {
                    maxUploadBytes: config.documentUpload.maxUploadBytes,
                    actualBytes: sizeBytes,
                },
            );
        }

        const mediaType = (file.mediaType || "").trim().toLowerCase();
        const allowedMediaTypes =
            config.documentUpload.allowedMediaTypes[docType] ?? [];

        if (
            mediaType &&
            allowedMediaTypes.length > 0 &&
            !allowedMediaTypes.includes(mediaType)
        ) {
            throw new HttpException(
                400,
                "UNSUPPORTED_DOCUMENT_MEDIA_TYPE",
                "Uploaded document media type is not allowed",
                {
                    docType,
                    mediaType,
                    allowedMediaTypes,
                },
            );
        }
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
     * Enrich batch with organization details (businessName, address, etc.)
     */
    async enrichBatchWithOrgDetails(batch) {
        if (!batch) return batch;

        const manufacturerMSP = batch.manufacturerMSP || batch.batch?.manufacturerMSP || batch.manufacturer;
        const ownerMSP = batch.ownerMSP || batch.batch?.ownerMSP || batch.owner || batch.batch?.owner;
        const drugName = batch.drugName || batch.batch?.drugName;

        // Find organizations, drug details, QR index, and the ORIGINAL CREATE event
        const targetBatchId = batch.batchID || batch.batch?.batchID || batch.id;
        const dataHash = batch.protected_qr?.data_hash || batch.batch?.protected_qr?.data_hash || (batch.qrMetadata?.dataHash);

        const manufacturerId = batch.manufacturerId || batch.batch?.manufacturerId;
        const ownerId = batch.ownerId || batch.batch?.ownerId;

        let [manufacturer, owner, drugCategory, index, createEvent] = await Promise.all([
            manufacturerId 
                ? User.findById(manufacturerId).lean()
                : User.findOne({ mspId: manufacturerMSP, role: "Manufacturer" }).lean(),
            ownerId
                ? User.findById(ownerId).lean()
                : User.findOne({ mspId: ownerMSP }).lean(),
            DrugCategory.findOne({ name: drugName, manufacturerMSP }).lean(),
            // Try finding by batchID first, then by dataHash as fallback
            BatchIndex.findOne({
                $or: [
                    { batchID: targetBatchId },
                    { dataHash: dataHash }
                ]
            }).lean(),
            BatchGeoEvent.findOne({ batchID: targetBatchId, eventType: "CREATE" }).lean()
        ]);

        // [SUPER FALLBACK] If still no QR/Metadata, fetch directly from Ledger
        if (!index && !createEvent?.metadata?.qrImage) {
            try {
                console.log(`SupplyChainService: Index not found for ${targetBatchId}, fetching direct from Ledger...`);
                const ledgerData = await this.ledgerRepository.readBatch(this.toPublicScanActor(batch.traceId || ""), targetBatchId);
                if (ledgerData && ledgerData.metadata) {
                    // Create a virtual index object for the return logic
                    index = {
                        qrImageBase64: ledgerData.metadata.qrImage,
                        qrMetadata: ledgerData.metadata
                    };
                }
            } catch (err) {
                console.error(`SupplyChainService: Ledger fallback failed for ${targetBatchId}:`, err.message);
            }
        }

        // [SYNC LOGIC] If Ledger has a different transferStatus/owner, update local index/state
        const ledgerTransferStatus = batch.transferStatus || batch.batch?.transferStatus || "NONE";
        const ledgerOwner = batch.ownerMSP || batch.batch?.ownerMSP || batch.owner || batch.batch?.owner;
        const ledgerOwnerId = batch.ownerId || batch.batch?.ownerId;
        const ledgerManufacturerId = batch.manufacturerId || batch.batch?.manufacturerId;
        const ledgerTargetOwnerId = batch.targetOwnerId || batch.batch?.targetOwnerId || "";
        const ledgerTargetOwnerMSP = batch.targetOwnerMSP || batch.batch?.targetOwnerMSP || "";

        if (index && (
            index.transferStatus !== ledgerTransferStatus ||
            index.ownerMSP !== ledgerOwner ||
            (ledgerOwnerId && index.ownerId !== ledgerOwnerId) ||
            index.targetOwnerId !== ledgerTargetOwnerId
        )) {
            console.log(`SupplyChainService: Syncing status for ${targetBatchId} (DB: ${index.transferStatus} -> Ledger: ${ledgerTransferStatus})`);

            const updatePayload = {
                transferStatus: ledgerTransferStatus,
                ownerMSP: ledgerOwner,
                ownerId: ledgerOwnerId || index.ownerId,
                manufacturerId: ledgerManufacturerId || index.manufacturerId,
                targetOwnerId: ledgerTargetOwnerId,
                receiverMSP: ledgerTargetOwnerMSP,
                updatedAt: new Date()
            };

            // Non-blocking background sync
            Promise.all([
                BatchIndex.updateOne({ batchID: targetBatchId }, updatePayload),
                BatchState.updateOne({ batchID: targetBatchId }, updatePayload)
            ]).catch(err => console.error(`Sync error for ${targetBatchId}:`, err));
        }

        const enriched = {
            ...batch,
            manufacturerDetails: manufacturer ? {
                businessName: manufacturer.businessName,
                province: manufacturer.province,
            } : (batch.manufacturerDetails || null),
            ownerDetails: owner ? {
                businessName: owner.businessName,
                province: owner.province,
            } : (batch.ownerDetails || null),
            drugDetails: drugCategory ? {
                id: drugCategory._id,
                name: drugCategory.name,
                registrationNumber: drugCategory.registrationNumber,
                description: drugCategory.description,
                imageCID: drugCategory.imageCID,
                status: drugCategory.status,
                certificates: drugCategory.certificates || [],
            } : null,
            qrImageBase64: batch.qrImageBase64 || index?.qrImageBase64 || (createEvent?.metadata?.qrImage ? (createEvent.metadata.qrImage.startsWith('data:') || createEvent.metadata.qrImage.startsWith('http') ? createEvent.metadata.qrImage : `data:image/png;base64,${createEvent.metadata.qrImage}`) : null),
            transferStatus: ledgerTransferStatus, // Ensure return object has latest status
            ownerMSP: ledgerOwner,
            metadata: {
                ...(index?.qrMetadata || {}),
                ...(index?.metadata || {}),
                ...(createEvent?.metadata || {}),
                ...(batch.metadata || {}),
                plannedRoute: batch.metadata?.plannedRoute || createEvent?.metadata?.plannedRoute || index?.metadata?.plannedRoute || [],
                certificates: batch.metadata?.certificates || index?.qrMetadata?.certificates || index?.metadata?.certificates || createEvent?.metadata?.certificates || drugCategory?.certificates || [],
            },
        };

        // [FINAL QR RECONSTRUCTION] If still no QR image, reconstruct from protected metadata
        if (!enriched.qrImageBase64) {
            const pqr = batch.protected_qr || batch.batch?.protected_qr;
            if (pqr && (pqr.data_hash || pqr.token_digest)) {
                try {
                    if (!this.qrService) {
                        console.error(`SupplyChainService: QR Service is not initialized!`);
                    } else {
                        console.log(`SupplyChainService: Attempting QR reconstruction for ${targetBatchId} using hash ${pqr.data_hash}...`);

                        const recon = await this.qrService.generate({
                            dataHash: String(pqr.data_hash || ""),
                            metadataSeries: String(pqr.metadata_series || ""),
                            metadataIssued: String(pqr.metadata_issued || ""),
                            metadataExpiry: String(pqr.metadata_expiry || ""),
                        });

                        if (recon && recon.qrImageBase64) {
                            console.log(`SupplyChainService: QR reconstructed successfully for ${targetBatchId}. Length: ${recon.qrImageBase64.length}`);
                            let finalQr = recon.qrImageBase64;
                            if (!finalQr.startsWith('data:image') && !finalQr.startsWith('http')) {
                                finalQr = `data:image/png;base64,${finalQr}`;
                            }
                            enriched.qrImageBase64 = finalQr;
                        } else {
                            console.warn(`SupplyChainService: QR reconstruction returned empty image for ${targetBatchId}`);
                        }
                    }
                } catch (err) {
                    console.error(`SupplyChainService: QR Reconstruction failed for ${targetBatchId}. Error: ${err.message}`);
                }
            } else {
                console.warn(`SupplyChainService: No protected_qr found to reconstruct for ${targetBatchId}`);
            }
        }

        return enriched;
    }

    /**
     * Create a new batch by minting a QR token and writing to the ledger.
     */
    async createBatch(input, actor) {
        // Validate that drug category is approved
        const drugCategory = await DrugCategory.findOne({
            name: input.drugName,
            manufacturerMSP: actor.mspId,
            status: "APPROVED"
        }).lean();

        if (!drugCategory) {
            throw new HttpException(403, "DRUG_CATEGORY_NOT_APPROVED", "This drug category is not approved or does not exist for your organization");
        }

        const batchID = generateBatchId();
        const dataHash = hashBatchId(batchID);
        const metadataSeries = crypto.randomBytes(8).toString("hex");
        const metadataIssued = toHex64(Date.now());
        const expiryMs = new Date(input.expiryDate).getTime();
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

        // Sync to MongoDB Index & State for rich search and Dashboard visibility
        try {
            const commonFields = {
                batchID,
                drugName: input.drugName,
                manufacturerMSP: actor.mspId,
                manufacturerId: actor.id,
                ownerMSP: actor.mspId,
                ownerId: actor.id,
                province: actor.province || "", // Save province for hierarchy
                updatedAt: new Date()
            };

            const indexPayload = {
                ...commonFields,
                quantity: input.quantity,
                expiryDate: input.expiryDate,
                status: "ACTIVE",
                qrMetadata: {
                    dataHash,
                    metadataSeries,
                    metadataIssued,
                    metadataExpiry,
                },
                qrImageBase64: qrResult.qrImageBase64,
                metadata: input.metadata || {},
            };

            const statePayload = {
                ...commonFields,
                status: "ACTIVE",
                transferStatus: "NONE",
                expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
                batch: batchResult.batch,
                lastLedgerSyncAt: new Date(),
                metadata: input.metadata || {},
            };

            // [LOG] Debugging metadata sync
            logger.info(`SupplyChainService: Syncing batch ${batchID} with metadata: ${JSON.stringify(input.metadata || {})}`);

            // Use upsert to avoid E11000 duplicate key errors if a retry or parallel sync occurred
            await Promise.all([
                BatchIndex.findOneAndUpdate({ batchID }, indexPayload, { upsert: true, new: true }),
                BatchState.findOneAndUpdate({ batchID }, statePayload, { upsert: true, new: true })
            ]);

            logger.info(`Successfully synced batch ${batchID} to MongoDB index & state (UPSERT)`);

            // Create a Geo Event for Trace visibility
            try {
                const fullActor = await this._ensureFullActor(actor);
                const coords = await this._resolveActorCoords(fullActor);
                await createBatchGeoEvent(batchID, {
                    eventType: "CREATE",
                    source: "SYSTEM",
                    lat: coords.lat,
                    lng: coords.lng,
                    province: fullActor.province || "",
                    address: fullActor.address || "",
                    note: `Lô hàng được khởi tạo bởi ${fullActor.businessName || fullActor.username || fullActor.mspId}`,
                    metadata: {
                        plannedRoute: input.metadata?.plannedRoute || [],
                        certificates: input.metadata?.certificates || []
                    }
                }, fullActor);
            } catch (err) {
                logger.error(`Failed to create CREATE geo event for ${batchID}: ${err.message}`);
            }
        } catch (err) {
            logger.error(`Failed to sync batch ${batchID} to MongoDB: ${err.message}`);
        }

        return {
            batch: batchResult.batch,
            tokenDigest: batchResult.tokenDigest,
            qrToken: qrResult.token,
            qrImageBase64: qrResult.qrImageBase64,
        };
    }

    /**
     * Read a single batch by data hash (metadata fingerprint).
     * Used for QR-based identification where ID is unknown but metadata is verified.
     */
    async getBatchByDataHash(dataHash, actor) {
        logger.info({
            message: "Retrieving batch by data hash",
            dataHash,
            org: actor.mspId
        });

        // 1. Try local index first for speed
        const { BatchIndex } = await import("../../models/batch/batch-index.model.js");

        // Search in both root and nested qrMetadata
        let indexed = await BatchIndex.findOne({
            $or: [
                { dataHash: dataHash },
                { "qrMetadata.dataHash": dataHash }
            ]
        });

        let batch;
        if (indexed) {
            batch = indexed.toObject();
        } else {
            // 2. Fallback: Search in Blockchain events if index is lagging
            const history = await this.ledgerRepository.getBatchHistoryByHash?.(dataHash);
            if (history && history.length > 0) {
                batch = history[0];
            }
        }

        if (!batch) {
            throw new HttpException(404, "BATCH_NOT_FOUND", "Hệ thống không tìm thấy lô hàng nào khớp với chữ ký QR này. Vui lòng kiểm tra lại ảnh chụp hoặc liên hệ quản trị viên.");
        }

        // [ENRICHMENT] Important: The index might be old/incomplete. 
        // Use readBatch to get the full, latest state from Ledger (including ownership)
        const batchID = batch.batchID || batch.id;
        const fullBatch = await this.readBatch(batchID, actor);

        // --- OWNERSHIP & RECEIVER CHECK (BY ID) ---
        const ownerId = fullBatch.ownerId;
        const targetOwnerId = fullBatch.targetOwnerId;
        const actorId = actor.id;

        logger.info({
            message: "Ownership & Receiver verification details (BY ID)",
            batchID,
            ownerId,
            targetOwnerId,
            actorId,
        });

        const isOwner = ownerId === actorId;
        const isReceiver = targetOwnerId === actorId && fullBatch.transferStatus === "IN_TRANSIT";

        if (!isOwner && !isReceiver) {
            logger.warn({
                message: "unauthorized-batch-access-attempt",
                batchID,
                attemptedBy: actorId,
                actualOwner: ownerId,
                actualReceiver: targetOwnerId
            });
            throw new HttpException(403, "ACCESS_DENIED", `Bạn không có quyền truy cập lô hàng này. Quyền xử lý thuộc về tài khoản ID: ${ownerId}${fullBatch.transferStatus === "IN_TRANSIT" ? ' (Đang chuyển cho ID: ' + targetOwnerId + ')' : ''}.`);
        }

        return fullBatch;
    }

    async readBatch(batchID, actor) {
        // Parallel read from ledger and local index for metadata fallback
        const [batch, qrFromLedger, localIndex] = await Promise.all([
            this.ledgerRepository.readBatch(actor, batchID),
            this.ledgerRepository.readProtectedQr(actor, batchID).catch(() => null),
            BatchIndex.findOne({ batchID }).lean().catch(() => null)
        ]);

        // Merge MongoDB index data (like QR image) into batch object before enriching
        const batchWithExtras = {
            ...batch,
            qrImageBase64: localIndex?.qrImageBase64 || batch.qrImageBase64,
            safetyStatus: batch.safetyStatus || localIndex?.safetyStatus,
            metadata: localIndex?.metadata || batch.metadata,
        };

        const enriched = await this.enrichBatchWithOrgDetails(batchWithExtras);
        const mapped = toBatchDetail(enriched);

        // Prioritize Metadata Source for QR Regeneration: Fabric > Local Index
        let meta = qrFromLedger;
        if (!meta && localIndex) {
            // LocalIndex stores metadata in qrMetadata field
            meta = localIndex.qrMetadata || localIndex;
        }
        if (!meta) {
            meta = batch.batch?.qrMetadata || batch.qrMetadata;
        }

        // Regenerate QR image if metadata is found
        if (meta && (meta.dataHash || meta.qrMetadata?.dataHash)) {
            const finalMeta = meta.qrMetadata || meta;
            try {
                const qrResult = await this.qrService.generate({
                    dataHash: finalMeta.dataHash,
                    metadataSeries: finalMeta.metadataSeries,
                    metadataIssued: finalMeta.metadataIssued,
                    metadataExpiry: finalMeta.metadataExpiry,
                });
                mapped.qrImageBase64 = qrResult.qrImageBase64;
                logger.info(`Successfully regenerated QR for batch ${batchID}`);
            } catch (err) {
                logger.warn(`Failed to regenerate QR for batch ${batchID}: ${err.message}`);
            }
        } else if (localIndex?.qrImageBase64) {
            // Fallback to cached image in MongoDB if regeneration is not possible
            mapped.qrImageBase64 = localIndex.qrImageBase64;
            logger.info(`Using cached QR image from MongoDB for batch ${batchID}`);
        } else {
            logger.warn(`No QR metadata or cached image found for batch ${batchID}`);
        }

        return mapped;
    }

    /**
     * Read anchored protected QR state for a batch.
     */
    async readProtectedQr(batchID, actor) {
        return this.ledgerRepository.readProtectedQr(actor, batchID);
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
     * Apply protected QR token lifecycle policy action.
     */
    async updateProtectedQrTokenPolicy(batchID, input, actor) {
        return this.ledgerRepository.updateProtectedQrTokenPolicy(
            actor,
            batchID,
            {
                actionType: input.actionType,
                tokenDigest: input.tokenDigest,
                reason: input.reason,
                note: input.note ?? "",
            },
        );
    }

    async verifyProduct(file, traceId = "", options = {}, actor = null) {
        const imageBuffer = file?.buffer || file;
        const mimetype = file?.mimetype || "image/png";
        const filename = file?.originalname || "scan.png";

        const packagingImageBuffer = options.packagingImageBuffer ?? null;
        const isInternal = Boolean(options.isInternal);

        if (!imageBuffer || imageBuffer.length === 0) {
            throw new HttpException(400, "INVALID_IMAGE_DATA", "Dữ liệu hình ảnh trống hoặc không hợp lệ.");
        }

        let verifyResult;
        try {
            verifyResult = await this.qrService.verify(imageBuffer, { mimetype, filename, traceId });
        } catch (err) {
            logger.error(`SupplyChainService: QR Service call failed for ${traceId}: ${err.message}`);
            throw err;
        }

        let aiVerification = { accepted: true, code: "SKIPPED" };
        if (packagingImageBuffer) {
            try {
                aiVerification = await (this.aiVerifierService?.verify(packagingImageBuffer, traceId) ?? Promise.resolve({ accepted: true }));
            } catch (err) {
                logger.warn(`SupplyChainService: AI Verification failed but continuing (fail-open): ${err.message}`);
            }
        }

        // [LOG] QR Service result
        logger.info(`SupplyChainService: QR Service result: ${JSON.stringify(verifyResult)}`);

        const dataHash = verifyResult.decodedMeta?.dataHash;

        // If we have a token but missing dataHash (due to decoding issues), 
        // try to reconstruct dataHash from token if signature is valid
        if (!dataHash && verifyResult.token) {
            logger.info(`SupplyChainService: Attempting to reconstruct metadata from token...`);
            try {
                // The token is a protected identifier that maps to the dataHash in the ledger
                // In a real implementation, we would decrypt or decode the token here
                // For now, if the QR service found a valid token but failed to OCR the plaintext metadata,
                // we treat the token as the primary identifier if matched later in ledger check.
                logger.info(`SupplyChainService: Token found: ${verifyResult.token.substring(0, 10)}...`);
            } catch (err) {
                logger.warn(`SupplyChainService: Metadata reconstruction failed: ${err.message}`);
            }
        }

        if (!verifyResult.token) {
            throw new HttpException(
                400,
                "QR_TOKEN_MISSING",
                "Mã QR không hợp lệ hoặc chữ ký bảo mật không khớp. Vui lòng kiểm tra lại ảnh quét.",
                { verifyResult }
            );
        }

        if (!dataHash) {
            throw new HttpException(
                400,
                "QR_INVALID_PAYLOAD",
                "Dữ liệu định danh lô hàng (Data Hash) không tìm thấy trong mã QR.",
                { verifyResult }
            );
        }

        const batch = await this.ledgerRepository.getBatchByDataHash(dataHash);
        const tokenDigest = hashTokenDigest(verifyResult.token);
        const ledgerActor = actor || toPublicScanActor(traceId);

        const protectedQrCheck = await this.verifyProtectedQr(
            batch.batchID,
            tokenDigest,
            ledgerActor,
        );

        const protectedQrRecord = await this.recordProtectedQrVerification(
            batch.batchID,
            verifyResult.isAuthentic,
            verifyResult.confidenceScore,
            tokenDigest,
            ledgerActor,
        );

        const result = await this.ledgerRepository.verifyBatch(
            ledgerActor,
            batch.batchID,
            isInternal
        );

        const accepted =
            verifyResult.isAuthentic &&
            protectedQrCheck.matched === true &&
            aiVerification.accepted !== false &&
            (isInternal || result.safetyStatus.level === "OK");

        const decision = {
            accepted,
            code: accepted ? "SCAN_ACCEPTED" : "SCAN_REJECTED",
        };

        // NEW: Emit explicit warning to Regulator if an external scan occurs before consumption is confirmed
        if (!isInternal && !batch.consumptionConfirmed) {
            const unconfirmedAlert = emitCanonicalAlert("LEDGER_SCAN_WARNING", {
                sourceKey: "UnconfirmedConsumptionScan",
                batchID: batch.batchID,
                traceId,
                details: {
                    msg: "Phát hiện lượt quét công khai trước khi đơn vị phân phối xác nhận đưa vào tiêu thụ",
                    severity: "warn",
                    province: batch.province || "Unknown"
                }
            });
            await this.processAlertSideEffects(unconfirmedAlert);
        }

        // NEW: If verifyResult is NOT authentic OR protectedQrCheck didn't match, 
        // emit a Critical Public Alert to Regulator immediately
        if (!isInternal && (!verifyResult.isAuthentic || !protectedQrCheck.matched || result.safetyStatus.level === "DANGER")) {
            let detailMsg = "PHÁT HIỆN LÔ HÀNG NGHI GIẢ MẠO HOẶC SAI LỆCH CHỮ KÝ BẢO MẬT";
            if (result.safetyStatus.code === "DANGER_RECALLED") detailMsg = "PHÁT HIỆN LƯỢT QUÉT TRÊN LÔ HÀNG ĐÃ BỊ THU HỒI KHẨN CẤP";
            else if (!protectedQrCheck.matched) detailMsg = "CẢNH BÁO: CHỮ KÝ SỐ TRÊN QR KHÔNG KHỚP VỚI DỮ LIỆU GỐC (CÓ DẤU HIỆU TRÁO ĐỔI)";
            else if (!verifyResult.isAuthentic) detailMsg = "CẢNH BÁO: NGOẠI QUAN SẢN PHẨM KHÔNG KHỚP VỚI NHẬN DIỆN AI (NGHI VẤN ĐÁNH TRÁO BAO BÌ)";

            const counterfeitAlert = emitCanonicalAlert("LEDGER_SCAN_SUSPICIOUS", {
                sourceKey: "CounterfeitDetection",
                batchID: batch.batchID,
                traceId,
                details: {
                    msg: detailMsg,
                    severity: "critical",
                    isAuthentic: verifyResult.isAuthentic,
                    ledgerMatch: protectedQrCheck.matched,
                    safetyLevel: result.safetyStatus.level,
                    safetyCode: result.safetyStatus.code,
                    province: batch.province || "Unknown",
                    aiScore: verifyResult.confidenceScore
                }
            });
            await this.processAlertSideEffects(counterfeitAlert);
        }

        let decisionMsg = accepted ? "Xác thực thành công" : "Xác thực thất bại";
        if (!accepted) {
            if (result.safetyStatus.code === "DANGER_RECALLED") decisionMsg = "Lô hàng đã bị thu hồi";
            else if (!protectedQrCheck.matched) decisionMsg = "QR Code không hợp lệ hoặc đã bị tráo đổi";
            else if (!verifyResult.isAuthentic) decisionMsg = "Ngoại quan bao bì không khớp (AI Reject)";
        }

        const decisionAlert = emitDecisionAlert(decision.code, {
            batchID: batch.batchID,
            traceId,
            details: {
                msg: decisionMsg,
                ledgerMatch: protectedQrCheck.matched,
                isAuthentic: verifyResult.isAuthentic,
                confidenceScore: verifyResult.confidenceScore,
                aiAccepted: aiVerification.accepted,
                safetyLevel: result.safetyStatus.level,
                safetyCode: result.safetyStatus.code,
                consumptionConfirmed: batch.consumptionConfirmed
            },
        });
        await this.processAlertSideEffects(decisionAlert);

        const enrichedBatch = await this.enrichBatchWithOrgDetails(result.batch || batch);
        const mappedBatchInfo = toBatchDetail(enrichedBatch);

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
                    batchInfo: mappedBatchInfo,
                },
            );
        }

        const rawTimeline = await queryBatchTimelineEvents(batch.batchID, {});
        const enrichedTimeline = await this.enrichTimelineEvents(rawTimeline);

        return {
            decision,
            alert: decisionAlert,
            isAuthentic: verifyResult.isAuthentic,
            confidenceScore: verifyResult.confidenceScore,
            tokenDigest,
            protectedQrCheck,
            protectedQrRecord,
            aiVerification,
            batchInfo: mappedBatchInfo,
            safetyStatus: result.safetyStatus,
            timeline: enrichedTimeline.map(toBatchGeoEventDto),
        };
    }

    /**
     * Enrich timeline events with actor organization details.
     */
    async enrichTimelineEvents(events) {
        if (!events || events.length === 0) return events;

        return Promise.all(events.map(async (event) => {
            const actorId = event.actorUserId;
            const actorMSP = event.actorMSP;

            let actorDetails = null;
            if (actorId) {
                actorDetails = await User.findById(actorId).lean();
            } else if (actorMSP) {
                actorDetails = await User.findOne({ mspId: actorMSP }).lean();
            }

            return {
                ...event,
                actorDetails
            };
        }));
    }

    /**
     * Start shipping a batch to the target owner.
     */
    async shipBatch(batchID, transferTarget, actor) {
        // 0. Safety Check: Block shipping if batch is RECALLED
        const currentBatch = await BatchState.findOne({ batchID }).lean();
        if (currentBatch && currentBatch.status === "RECALLED") {
            throw new HttpException(
                403,
                "BATCH_RECALLED",
                "Lô thuốc này đã bị thu hồi khẩn cấp và không thể tiếp tục vận chuyển.",
                { batchID }
            );
        }

        // 1. Resolve Automatic Route Logic
        let receiverMSP = transferTarget?.targetOwnerMSP || "";
        let targetOwnerId = transferTarget?.targetOwnerId || "";
        let targetDistributorUnitId = "";

        // If no target provided, look into plannedRoute
        if (!receiverMSP || !targetOwnerId) {
            const batchDetail = await this.readBatch(batchID, actor);
            const route = batchDetail.metadata?.plannedRoute || [];

            // Find current actor position in route by ID
            const currentIndex = route.findIndex(r => r.id === (actor.id || actor.userId));

            // If actor is Manufacturer, first stop is index 0
            const nextIndex = actor.role === "Manufacturer" ? 0 : currentIndex + 1;

            if (nextIndex >= 0 && nextIndex < route.length) {
                const nextStop = route[nextIndex];
                receiverMSP = nextStop.mspId || "";
                targetOwnerId = nextStop.id || "";

                // Map aliases
                if (receiverMSP === "Distributor") receiverMSP = "DistributorMSP";
                if (receiverMSP === "Manufacturer") receiverMSP = "ManufacturerMSP";
                if (receiverMSP === "Regulator") receiverMSP = "RegulatorMSP";

                logger.info(`SupplyChainService: Auto-resolved next destination: ${targetOwnerId} on MSP ${receiverMSP}`);
            }
        }

        // Use the MongoDB ID as the Unit ID directly for Distributors
        if (receiverMSP === "DistributorMSP" && targetOwnerId) {
            targetDistributorUnitId = targetOwnerId;
        }

        // Final validation
        if (!receiverMSP || !targetOwnerId) {
            throw new HttpException(400, "DESTINATION_REQUIRED", "Không thể xác định đơn vị nhận tiếp theo.");
        }

        const actorDistributorUnitId = actor.role === "Distributor" ? (actor.id || actor.userId) : "";

        if (receiverMSP !== "DistributorMSP" && targetDistributorUnitId) {
            throw new HttpException(
                400,
                "TARGET_DISTRIBUTOR_UNIT_UNSUPPORTED",
                "targetDistributorUnitId is only supported when targetOwnerMSP is DistributorMSP",
            );
        }

        const isDistributorToDistributorTransfer =
            (actor?.role === "Distributor" || actor?.mspId === "DistributorMSP") &&
            receiverMSP === "DistributorMSP";

        if (isDistributorToDistributorTransfer && !targetDistributorUnitId) {
            throw new HttpException(
                400,
                "TARGET_DISTRIBUTOR_UNIT_REQUIRED",
                "targetDistributorUnitId is required for inter-distributor transfers. Please check target user configuration.",
                { targetOwnerId, receiverMSP }
            );
        }

        if (isDistributorToDistributorTransfer && !actorDistributorUnitId) {
            throw new HttpException(
                403,
                "DISTRIBUTOR_UNIT_REQUIRED",
                "Authenticated distributor unit identity is required",
            );
        }

        if (
            isDistributorToDistributorTransfer &&
            actorDistributorUnitId === targetDistributorUnitId
        ) {
            throw new HttpException(
                409,
                "SAME_DISTRIBUTOR_UNIT_TRANSFER_NOT_ALLOWED",
                "Transfer to the same distributor unit is not allowed",
                {
                    distributorUnitId: actorDistributorUnitId,
                },
            );
        }

        const result = await this.ledgerRepository.shipBatch(
            actor,
            batchID,
            receiverMSP,
            targetDistributorUnitId,
            targetOwnerId,
        );

        // [LOG] Debugging result
        logger.info(`SupplyChainService: Ledger ship result: ${JSON.stringify(result)}`);

        // SYNC: Update MongoDB index/state immediately after ledger success
        try {
            const { BatchIndex } = await import("../../models/batch/batch-index.model.js");
            const { BatchState } = await import("../../models/batch/batch-state.model.js");

            const updatePayload = {
                transferStatus: "IN_TRANSIT",
                receiverMSP: receiverMSP,
                targetDistributorUnitId: targetDistributorUnitId,
                targetOwnerId: targetOwnerId,
                updatedAt: new Date()
            };

            await Promise.all([
                BatchIndex.updateOne({ batchID }, { $set: updatePayload }),
                BatchState.updateOne({ batchID }, { $set: updatePayload })
            ]);
            console.log(`SupplyChainService: Successfully synced SHIP state for ${batchID} to MongoDB (IN_TRANSIT)`);

            // Create a Geo Event for Trace visibility
            try {
                const fullActor = await this._ensureFullActor(actor);
                const coords = await this._resolveActorCoords(fullActor);
                // Strictly resolve receiver business name if possible
                let receiverName = receiverMSP;
                if (targetOwnerId) {
                    const receiver = await User.findById(targetOwnerId).select("businessName").lean();
                    if (receiver?.businessName) {
                        receiverName = receiver.businessName;
                    }
                }

                await createBatchGeoEvent(batchID, {
                    eventType: "SHIP",
                    source: "SYSTEM",
                    lat: coords.lat,
                    lng: coords.lng,
                    province: fullActor.province || "",
                    address: fullActor.address || "",
                    note: `Lô hàng đang được chuyển từ ${fullActor.businessName || fullActor.mspId} đến ${receiverName}`,
                    metadata: {
                        receiverMSP,
                        receiverName,
                        targetOwnerId,
                        targetDistributorUnitId
                    }
                }, fullActor);
            } catch (err) {
                console.error(`SupplyChainService: Failed to create SHIP geo event for ${batchID}:`, err.message);
            }
        } catch (err) {
            console.error(`SupplyChainService: Post-ship sync failed for ${batchID}:`, err.message);
        }

        return result;
    }

    /**
     * Receive a batch in transit and finalize ownership transfer.
     */
    async receiveBatch(batchID, actor) {
        // 0. Safety Check: Block receiving if batch is RECALLED
        const currentBatch = await BatchState.findOne({ batchID }).lean();
        if (currentBatch && currentBatch.status === "RECALLED") {
            throw new HttpException(
                403,
                "BATCH_RECALLED",
                "Lô thuốc này đã bị thu hồi khẩn cấp. Vui lòng niêm phong và liên hệ cơ quan quản lý.",
                { batchID }
            );
        }

        const result = await this.ledgerRepository.receiveBatch(actor, batchID);

        // SYNC: Finalize ownership in MongoDB (BY ID)
        try {
            const updatePayload = {
                transferStatus: "NONE",
                ownerMSP: actor.mspId,
                ownerId: actor.id,
                targetOwnerId: "", // Clear receiver as it's now owned
                receiverMSP: "",
                updatedAt: new Date()
            };

            await Promise.all([
                BatchIndex.updateOne({ batchID }, { $set: updatePayload }),
                BatchState.updateOne({ batchID }, { $set: updatePayload })
            ]);
            console.log(`SupplyChainService: Successfully synced RECEIVE state (BY ID: ${actor.id}) for ${batchID}`);

            // Create a Geo Event for Trace visibility
            try {
                const fullActor = await this._ensureFullActor(actor);
                const coords = await this._resolveActorCoords(fullActor);
                await createBatchGeoEvent(batchID, {
                    eventType: "RECEIVE",
                    source: "SYSTEM",
                    lat: coords.lat,
                    lng: coords.lng,
                    province: fullActor.province || "",
                    address: fullActor.address || "",
                    note: `Lô hàng đã được tiếp nhận bởi ${fullActor.businessName || fullActor.username || fullActor.mspId}`
                }, fullActor);
            } catch (err) {
                console.error(`SupplyChainService: Failed to create RECEIVE geo event for ${batchID}:`, err.message);
            }
        } catch (err) {
            console.error(`SupplyChainService: Post-receive sync failed for ${batchID}:`, err.message);
        }

        return result;
    }

    /**
     * Confirm delivery to consumption point before public verification scan count can grow.
     */
    async confirmDeliveredToConsumption(batchID, actor) {
        const result = await this.ledgerRepository.confirmDeliveredToConsumption(actor, batchID);

        // SYNC: Finalize consumption state in MongoDB
        try {
            // result is the full batch from ledger
            const updatePayload = {
                consumptionConfirmed: true,
                updatedAt: new Date(),
                batch: result // Sync full ledger state
            };

            await Promise.all([
                BatchIndex.updateOne({ batchID }, { $set: { consumptionConfirmed: true, updatedAt: new Date() } }),
                BatchState.updateOne({ batchID }, { $set: updatePayload })
            ]);
            console.log(`SupplyChainService: Successfully synced CONSUME state for ${batchID}`);

            // Create a Geo Event for Trace visibility
            try {
                const fullActor = await this._ensureFullActor(actor);
                const coords = await this._resolveActorCoords(fullActor);
                await createBatchGeoEvent(batchID, {
                    eventType: "CONSUME",
                    source: "SYSTEM",
                    lat: coords.lat,
                    lng: coords.lng,
                    province: fullActor.province || "",
                    address: fullActor.address || "",
                    note: `Sản phẩm đã được đưa vào tiêu thụ tại ${fullActor.businessName || fullActor.username || fullActor.mspId}`
                }, fullActor);
            } catch (err) {
                console.error(`SupplyChainService: Failed to create CONSUME geo event for ${batchID}:`, err.message);
            }
        } catch (err) {
            console.error(`SupplyChainService: Failed to sync CONSUME state for ${batchID}:`, err.message);
        }

        return result;
    }

    /**
     * Update IPFS document metadata for the batch.
     */
    async updateDocument(batchID, input, actor) {
        const docType = input?.docType;
        if (!docType) {
            throw new HttpException(400, "Invalid request body");
        }

        if (input?.file) {
            this.validateUploadDocument(docType, input.file);

            const uploadResult = await this.documentStorageAdapter.uploadDocument(
                input.file.buffer,
                {
                    docType,
                    fileName: input.file.fileName,
                    mediaType: input.file.mediaType,
                },
            );

            const cid = String(uploadResult.cid || "");
            if (!cid) {
                throw new HttpException(
                    502,
                    "DOC_UPLOAD_FAILED",
                    "Document upload did not return CID",
                );
            }

            if (
                config.documentUpload.requirePinned &&
                String(uploadResult.pinStatus || "") !== "pinned"
            ) {
                throw new HttpException(
                    502,
                    "DOC_PIN_REQUIRED",
                    "Uploaded document was not pinned by provider",
                    {
                        provider: String(uploadResult.provider || ""),
                        pinStatus: String(uploadResult.pinStatus || ""),
                    },
                );
            }

            const artifactBase = {
                batchID,
                docType,
                cid,
                source: "direct-upload",
                provider: String(uploadResult.provider || "mock"),
                pinStatus: String(uploadResult.pinStatus || "uploaded"),
                digestSha256: String(uploadResult.digestSha256 || ""),
                sizeBytes: Number(uploadResult.sizeBytes || 0),
                mediaType: String(uploadResult.mediaType || ""),
                uploadedBy: {
                    id: actor?.id ?? "",
                    role: actor?.role ?? "",
                    mspId: actor?.mspId ?? "",
                },
                traceId: actor?.traceId ?? "",
            };

            let updatedBatch;
            try {
                updatedBatch = await this.ledgerRepository.updateDocument(
                    actor,
                    batchID,
                    docType,
                    cid,
                );
            } catch (error) {
                await this.saveDocumentArtifact({
                    ...artifactBase,
                    pinStatus: "orphaned",
                    ledgerUpdated: false,
                    ledgerError:
                        error instanceof Error
                            ? error.message
                            : "Unknown ledger update error",
                });
                throw error;
            }

            await this.saveDocumentArtifact({
                ...artifactBase,
                ledgerUpdated: true,
                ledgerError: "",
            });

            return {
                ...updatedBatch,
                upload: {
                    source: "direct-upload",
                    docType,
                    cid,
                    provider: artifactBase.provider,
                    pinStatus: artifactBase.pinStatus,
                    digestSha256: artifactBase.digestSha256,
                    sizeBytes: artifactBase.sizeBytes,
                    mediaType: artifactBase.mediaType,
                    ledgerUpdated: true,
                },
            };
        }

        const cid = String(input?.newCID || "");
        if (!cid) {
            throw new HttpException(400, "Invalid request body");
        }

        const updatedBatch = await this.ledgerRepository.updateDocument(
            actor,
            batchID,
            docType,
            cid,
        );

        await this.saveDocumentArtifact({
            batchID,
            docType,
            cid,
            source: "manual-cid",
            provider: "manual",
            pinStatus: "unknown",
            digestSha256: "",
            sizeBytes: 0,
            mediaType: "",
            ledgerUpdated: true,
            ledgerError: "",
            uploadedBy: {
                id: actor?.id ?? "",
                role: actor?.role ?? "",
                mspId: actor?.mspId ?? "",
            },
            traceId: actor?.traceId ?? "",
        });

        return {
            ...updatedBatch,
            upload: {
                source: "manual-cid",
                docType,
                cid,
                provider: "manual",
                pinStatus: "unknown",
                ledgerUpdated: true,
            },
        };
    }

    /**
     * Recall a batch immediately.
     */
    /**
     * Request a recall (Manufacturer only).
     */
    async requestRecall(batchID, actor, note) {
        if (actor?.role !== "Manufacturer") {
            throw new HttpException(
                403,
                "Only Manufacturers can request a recall",
            );
        }

        const batchState = await BatchState.findOne({ batchID });
        if (!batchState) {
            throw new HttpException(404, "Batch not found in local state");
        }

        if (batchState.manufacturerMSP !== actor.mspId) {
            throw new HttpException(
                403,
                "You can only request recall for your own batches",
            );
        }

        // Update local state with request (Both State and Index)
        await Promise.all([
            BatchState.updateOne(
                { batchID },
                {
                    recallStatus: "REQUESTED",
                    recallRequestedById: actor.id,
                    recallRequestedAt: new Date(),
                    recallNote: note || "",
                },
            ),
            BatchIndex.updateOne(
                { batchID },
                {
                    recallStatus: "REQUESTED",
                    recallNote: note || "",
                    updatedAt: new Date()
                }
            )
        ]);

        // Create a Geo Event for Recall visibility on maps/trace
        try {
            const fullActor = await this._ensureFullActor(actor);
            const coords = await this._resolveActorCoords(fullActor);
            await createBatchGeoEvent(batchID, {
                eventType: "RECALL_ALERT",
                source: "SYSTEM",
                lat: coords.lat,
                lng: coords.lng,
                province: fullActor.province || batchState.province || "",
                address: fullActor.address || batchState.address || "",
                note: note || `Yêu cầu thu hồi được gửi bởi ${fullActor.businessName || fullActor.username}`,
                metadata: {
                    actorId: fullActor.id,
                    recallNote: note || ""
                }
            }, fullActor);
        } catch (err) {
            console.error("Failed to create RECALL_ALERT geo event:", err.message);
        }

        // Emit alert for regulator visibility
        const alert = emitCanonicalAlert("RECALL_REQUESTED", {
            sourceKey: "RequestRecall",
            batchID,
            traceId: actor?.traceId ?? "",
            details: {
                requestedBy: actor.username,
                mspId: actor.mspId,
                note,
                province: actor.province || batchState.province,
            },
        });
        await this.processAlertSideEffects(alert);

        return { success: true, batchID, status: "REQUESTED" };
    }

    /**
     * Approve or trigger emergency recall (Regulator only).
     */
    async emergencyRecall(batchID, actor, note = "") {
        if (actor?.role !== "Regulator") {
            throw new HttpException(
                403,
                "Only Regulators can approve or trigger an emergency recall",
            );
        }

        // Hierarchy check for Regulator (Level LOW can only recall batches in their province)
        if (actor.regulatorLevel === "LOW") {
            const batchState = await BatchState.findOne({ batchID });
            if (!batchState) {
                throw new HttpException(404, "Batch not found in local state");
            }
            if (batchState.province !== actor.province) {
                throw new HttpException(
                    403,
                    "Forbidden: You can only recall batches within your assigned province",
                );
            }
        }

        const batch = await this.ledgerRepository.emergencyRecall(
            actor,
            batchID,
        );

        // Update local state to APPROVED / RECALLED (Both Index and State for visibility)
        const updatePayload = {
            recallStatus: "APPROVED",
            status: "RECALLED", // Sync with ledger status
            recallNote: note || "Emergency recall by regulator",
            recallApprovedById: actor.id,
            recallApprovedAt: new Date(),
            "safetyStatus.level": "DANGER",
            "safetyStatus.reason": "RECALLED_BY_AUTHORITY",
            "safetyStatus.updatedAt": new Date()
        };

        const [updatedState] = await Promise.all([
            BatchState.findOneAndUpdate({ batchID }, { $set: updatePayload }, { new: true }),
            BatchIndex.findOneAndUpdate({ batchID }, {
                $set: {
                    recallStatus: "APPROVED",
                    recallNote: note || "Emergency recall by regulator",
                    updatedAt: new Date()
                }
            }, { new: true })
        ]);

        // Create a Geo Event for Recall visibility on maps/trace
        try {
            const fullActor = await this._ensureFullActor(actor);
            const coords = await this._resolveActorCoords(fullActor);

            const { createBatchGeoEvent } = await import("./supply-chain.geo.js");
            await createBatchGeoEvent(batchID, {
                eventType: "RECALL",
                source: "SYSTEM",
                lat: coords.lat,
                lng: coords.lng,
                address: fullActor.address || "Hệ thống ghi nhận thu hồi",
                note: note || `Lệnh thu hồi khẩn cấp được phê duyệt bởi ${fullActor.businessName || fullActor.username}`,
                province: fullActor.province || "Cả nước",
                metadata: {
                    actorId: fullActor.id,
                    recallNote: note || ""
                }
            }, fullActor);
        } catch (err) {
            console.error("Failed to create RECALL geo event:", err.message);
        }

        const recallAlert = emitCanonicalAlert("RECALL_ALERT", {
            sourceKey: "EmergencyRecall",
            batchID,
            traceId: actor?.traceId ?? "",
            details: {
                requestedByRole: actor?.role ?? "",
                requestedByMsp: actor?.mspId ?? "",
                status: batch?.status ?? "",
                approvedBy: actor.username,
                note: note || "Thu hồi khẩn cấp bởi Cơ quan quản lý",
                province: actor.province || "Cả nước"
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
        console.log(`[DIAGNOSTIC] listBatches called for actor=${actor.id}, role=${actor.role}. Original filters=`, JSON.stringify(filters));

        const effectiveFilters = { ...filters };

        // Safety: If Manufacturer is calling, and NO status is provided, 
        // we explicitly set status to undefined (to see all) or handle it.
        // Actually, let's allow seeing everything for Manufacturer by default.
        if (actor.role === "Manufacturer" && !effectiveFilters.status) {
            // Do nothing, let it be all
        } else if (!effectiveFilters.status && actor.role === "Distributor") {
            // Allow Distributor to see RECALLED batches too, so they know NOT to receive them
            // effectiveFilters.status = "ACTIVE"; 
        }

        const result = await listBatchSnapshots(effectiveFilters, actor);
        const enrichedItems = await Promise.all(
            result.items.map((item) => this.enrichBatchWithOrgDetails(item)),
        );
        return {
            ...result,
            items: enrichedItems,
        };
    }

    /**
     * Record geospatial events to support timeline and heatmap dashboards.
     */
    async recordBatchGeoEvent(batchID, input, actor) {
        const cached = await BatchState.findOne({ batchID }).lean();
        if (!cached) {
            throw new HttpException(404, "BATCH_NOT_FOUND", "Batch not found", { batchID });
        }
        return createBatchGeoEvent(batchID, input, actor);
    }

    /**
     * Read a batch event timeline.
     */
    async getBatchTimeline(batchID, query, actor) {
        const cached = await BatchState.findOne({ batchID }).lean();
        if (!cached) {
            throw new HttpException(404, "BATCH_NOT_FOUND", "Batch not found", { batchID });
        }
        const events = await queryBatchTimelineEvents(batchID, query);
        const enrichedEvents = await this.enrichTimelineEvents(events);

        return {
            batch: cached.batch,
            events: enrichedEvents.map(toBatchGeoEventDto),
        };
    }

    /**
     * Aggregate geo events into heatmap buckets for FE map layers.
     */
    async getSupplyHeatmap(query, actor) {
        return aggregateSupplyHeatmap(query, actor);
    }

    /**
     * Register a new drug category with image and certificate CID.
     */
    async registerDrugCategory(input, actor) {
        // 1. Upload image and certificates to IPFS/Storage
        const imageUpload = await this.documentStorageAdapter.uploadDocument(input.imageFile.buffer, {
            docType: "packageImage",
            fileName: input.imageFile.fileName,
            mediaType: input.imageFile.mediaType,
        });

        const certificates = await Promise.all(
            (input.certificates || []).map(async (cert) => {
                const upload = await this.documentStorageAdapter.uploadDocument(cert.file.buffer, {
                    docType: "qualityCert",
                    fileName: cert.file.fileName,
                    mediaType: cert.file.mediaType,
                });
                return { name: cert.name, cid: upload.cid };
            })
        );

        // 2. Save DrugCategory to DB
        const category = await DrugCategory.create({
            name: input.name,
            registrationNumber: input.registrationNumber,
            description: input.description || "",
            manufacturerMSP: actor.mspId,
            manufacturerId: actor.id,
            createdBy: actor.id,
            province: actor.province,
            imageCID: imageUpload.cid,
            certificates,
            status: "PENDING",
        });

        return category;
    }

    /**
     * List drug categories with regional filtering for regulators.
     */
    async listDrugCategories(filters, actor) {
        const query = {};
        if (filters.status) query.status = filters.status;

        // Visibility logic
        if (actor.role === "Manufacturer") {
            // Manu only sees what they created OR drugs assigned to them
            query.manufacturerId = actor.id;
        } else if (actor.role === "Regulator") {
            if (actor.regulatorLevel === "LOW") {
                // Reg LOW only sees manu in their province
                query.province = actor.province;
            }
            // Reg HIGH sees all (query.province not set)
            if (filters.manufacturerId) query.manufacturerId = filters.manufacturerId;
            if (filters.province && actor.regulatorLevel === "HIGH") query.province = filters.province;
        }

        return DrugCategory.find(query)
            .populate("manufacturerId", "username businessName province")
            .populate("createdBy", "username role businessName")
            .sort({ createdAt: -1 })
            .lean();
    }

    /**
     * Approve a drug category.
     */
    async approveDrugCategory(categoryId, actor) {
        const category = await DrugCategory.findById(categoryId);
        if (!category) {
            throw new HttpException(404, "Drug category not found");
        }

        // Low level regulator can only approve in their province
        if (actor.regulatorLevel === "LOW" && category.province !== actor.province) {
            throw new HttpException(403, "You can only approve categories in your province");
        }

        // Record approval
        category.approvals.push({
            regulatorId: actor.id,
            regulatorLevel: actor.regulatorLevel,
            approvedAt: new Date(),
        });

        // For now, any one regulator approval makes it APPROVED (or you can add more complex logic)
        category.status = "APPROVED";
        category.rejectionReason = "";

        await category.save();
        return category;
    }

    /**
     * Reject a drug category.
     */
    async rejectDrugCategory(categoryId, reason, actor) {
        const category = await DrugCategory.findById(categoryId);
        if (!category) {
            throw new HttpException(404, "Drug category not found");
        }

        if (actor.regulatorLevel === "LOW" && category.province !== actor.province) {
            throw new HttpException(403, "You can only reject categories in your province");
        }

        category.status = "REJECTED";
        category.rejectionReason = reason;

        await category.save();
        return category;
    }

    /**
     * Delete a drug category (Regulator only).
     */
    async deleteDrugCategory(categoryId, actor) {
        const category = await DrugCategory.findById(categoryId);
        if (!category) {
            throw new HttpException(404, "Drug category not found");
        }

        // Low level regulator can only delete in their province
        if (actor.regulatorLevel === "LOW" && category.province !== actor.province) {
            throw new HttpException(403, "You can only delete categories in your province");
        }

        await DrugCategory.findByIdAndDelete(categoryId);
        return { success: true };
    }

    /**
     * Request deletion of a drug category (Manufacturer only).
     */
    async requestDeleteDrugCategory(categoryId, actor) {
        const category = await DrugCategory.findById(categoryId);
        if (!category) {
            throw new HttpException(404, "Drug category not found");
        }

        if (category.manufacturerId.toString() !== actor.id) {
            throw new HttpException(403, "You can only request deletion for your own categories");
        }

        category.status = "PENDING_DELETE";
        await category.save();
        return category;
    }

    /**
     * Create a drug category directly (Regulator only).
     */
    async createDrugCategoryDirectly(input, actor) {
        // 1. Validate target manufacturer
        const targetManu = await User.findById(input.manufacturerId);
        if (!targetManu || targetManu.role !== "Manufacturer") {
            throw new HttpException(400, "Invalid manufacturer selected");
        }

        // Reg LOW can only assign to Manu in their province
        if (actor.regulatorLevel === "LOW" && targetManu.province !== actor.province) {
            throw new HttpException(403, "You can only assign drugs to manufacturers in your province");
        }

        console.log("SupplyChainService: Starting direct creation for", input.name);
        // 2. Upload files
        console.log("SupplyChainService: Uploading image...");
        const imageUpload = await this.documentStorageAdapter.uploadDocument(input.imageFile.buffer, {
            docType: "packageImage",
            fileName: input.imageFile.fileName,
            mediaType: input.imageFile.mediaType,
        });

        console.log("SupplyChainService: Image uploaded, now certificates...");
        const certificates = await Promise.all(
            (input.certificates || []).map(async (cert, idx) => {
                console.log(`SupplyChainService: Uploading certificate ${idx + 1}/${input.certificates.length}: ${cert.name}`);
                const upload = await this.documentStorageAdapter.uploadDocument(cert.file.buffer, {
                    docType: "qualityCert",
                    fileName: cert.file.fileName,
                    mediaType: cert.file.mediaType,
                });
                return { name: cert.name, cid: upload.cid };
            })
        );

        console.log("SupplyChainService: All files uploaded. Creating DB record...");
        // 3. Create APPROVED category
        const category = await DrugCategory.create({
            name: input.name,
            registrationNumber: input.registrationNumber,
            description: input.description || "",
            manufacturerMSP: targetManu.mspId,
            manufacturerId: targetManu.id,
            createdBy: actor.id,
            province: targetManu.province,
            imageCID: imageUpload.cid,
            certificates,
            status: "APPROVED",
            approvals: [{
                regulatorId: actor.id,
                regulatorLevel: actor.regulatorLevel,
                approvedAt: new Date(),
            }]
        });

        return category;
    }
}
