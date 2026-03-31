import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { normalizeMspId } from "../../utils/msp/msp.js";
import { getUploadedImage, requireActor } from "./product.helpers.js";
import {
    batchTimelineQuerySchema,
    bindProtectedQrSchema,
    createBatchSchema,
    heatmapQuerySchema,
    listBatchesQuerySchema,
    recordBatchEventSchema,
    shipBatchSchema,
    updateDocumentSchema,
} from "./product.schemas.js";

/**
 * Build the product controller with supply chain services.
 *
 * @param {import("../../services/supply-chain/supply-chain.service.js").SupplyChainService} service
 * @returns Controller with handlers.
 */
export const createProductController = (service) => {
    /**
     * Create a new supply-chain batch.
     */
    const createBatch = asyncHandler(async (req, res) => {
        const parsed = createBatchSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.createBatch(parsed.data, actor);
        return res.status(201).json({ success: true, data });
    });

    /**
     * Read a batch by batch identifier.
     */
    const readBatch = asyncHandler(async (req, res) => {
        const actor = requireActor(req);
        const data = await service.readBatch(req.params.batchId, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * List batches with paging and filter controls.
     */
    const listBatches = asyncHandler(async (req, res) => {
        const parsed = listBatchesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid query", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.listBatches(parsed.data, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Public product verification endpoint using uploaded QR and optional packaging image.
     */
    const verifyProduct = asyncHandler(async (req, res) => {
        const qrImage = getUploadedImage(req, "image");
        if (!qrImage) {
            throw new HttpException(400, "Image file is required");
        }

        const packagingImage = getUploadedImage(req, "packagingImage");

        const data = await service.verifyProduct(qrImage.buffer, req.traceId, {
            packagingImageBuffer: packagingImage?.buffer ?? null,
        });
        return res.status(200).json({ success: true, data });
    });

    /**
     * Rebind protected QR metadata to a batch.
     */
    const bindProtectedQr = asyncHandler(async (req, res) => {
        const parsed = bindProtectedQrSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.bindProtectedQr(
            req.params.batchId,
            parsed.data,
            actor,
        );
        return res.status(200).json({ success: true, data });
    });

    /**
     * Ship batch ownership to another MSP.
     */
    const shipBatch = asyncHandler(async (req, res) => {
        const parsed = shipBatchSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const targetOwnerMSP = normalizeMspId(parsed.data.targetOwnerMSP);
        if (!targetOwnerMSP) {
            throw new HttpException(
                400,
                "INVALID_TARGET_OWNER_MSP",
                "Unsupported targetOwnerMSP alias",
            );
        }

        const data = await service.shipBatch(
            req.params.batchId,
            targetOwnerMSP,
            actor,
        );
        return res.status(200).json({ success: true, data });
    });

    /**
     * Receive a batch that is currently in transit.
     */
    const receiveBatch = asyncHandler(async (req, res) => {
        const actor = requireActor(req);
        const data = await service.receiveBatch(req.params.batchId, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Update a batch document CID.
     */
    const updateDocument = asyncHandler(async (req, res) => {
        const parsed = updateDocumentSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.updateDocument(
            req.params.batchId,
            parsed.data.docType,
            parsed.data.newCID,
            actor,
        );
        return res.status(200).json({ success: true, data });
    });

    /**
     * Trigger emergency batch recall.
     */
    const recallBatch = asyncHandler(async (req, res) => {
        const actor = requireActor(req);
        const data = await service.emergencyRecall(req.params.batchId, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Record a geospatial event for the target batch.
     */
    const recordBatchEvent = asyncHandler(async (req, res) => {
        const parsed = recordBatchEventSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.recordBatchGeoEvent(
            req.params.batchId,
            parsed.data,
            actor,
        );
        return res.status(201).json({ success: true, data });
    });

    /**
     * Return timeline events for one batch.
     */
    const getBatchTimeline = asyncHandler(async (req, res) => {
        const parsed = batchTimelineQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid query", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.getBatchTimeline(
            req.params.batchId,
            parsed.data,
            actor,
        );
        return res.status(200).json({ success: true, data });
    });

    /**
     * Return heatmap aggregation buckets.
     */
    const getHeatmap = asyncHandler(async (req, res) => {
        const parsed = heatmapQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid query", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.getSupplyHeatmap(parsed.data, actor);
        return res.status(200).json({ success: true, data });
    });

    return {
        createBatch,
        listBatches,
        readBatch,
        verifyProduct,
        bindProtectedQr,
        shipBatch,
        receiveBatch,
        updateDocument,
        recallBatch,
        recordBatchEvent,
        getBatchTimeline,
        getHeatmap,
    };
};
