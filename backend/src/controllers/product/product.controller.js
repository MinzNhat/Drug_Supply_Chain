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
    protectedQrTokenPolicySchema,
    recordBatchEventSchema,
    shipBatchSchema,
    updateDocumentBaseSchema,
    updateDocumentCidSchema,
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
     * Public product verification endpoint using uploaded QR and 1 product packaging image.
     */
    const verifyProduct = asyncHandler(async (req, res) => {
        const qrImage = getUploadedImage(req, "qrImage");
        if (!qrImage) {
            throw new HttpException(400, "QR image file is required");
        }

        const frontImage = getUploadedImage(req, "frontImage");

        // The supply chain service takes the primary packaging image buffer.
        const data = await service.verifyProduct(qrImage.buffer, req.traceId, {
            packagingImageBuffer: frontImage?.buffer ?? null,
            isInternal: false
        });

        return res.status(200).json({ success: true, data });
    });

    /**
     * Submit a counterfeit/suspicious report
     */
    const submitReport = asyncHandler(async (req, res) => {
        const { productName, issues, description, province, lat, lng, severity } = req.body;
        const reporterIP = req.ip || req.headers["x-forwarded-for"] || "";

        const paymentBill = getUploadedImage(req, "paymentBill");
        const qrImage = getUploadedImage(req, "qrImage");
        const drugImage = getUploadedImage(req, "drugImage");
        const additionalImage = getUploadedImage(req, "additionalImage");

        // Using our new Report Model to save to MongoDB
        const { Report } = await import("../../models/report/report.model.js");

        const report = new Report({
            productName: productName || "Unknown",
            issues: issues || "Other",
            description: description || "",
            province: province || "Unknown",
            lat: lat ? Number(lat) : null,
            lng: lng ? Number(lng) : null,
            severity: severity || "warn",
            reporterIP,
            paymentBillMeta: paymentBill ? { fileName: paymentBill.originalname, size: paymentBill.size } : null,
            qrImageMeta: qrImage ? { fileName: qrImage.originalname, size: qrImage.size } : null,
            drugImageMeta: drugImage ? { fileName: drugImage.originalname, size: drugImage.size } : null,
            additionalImageMeta: additionalImage ? { fileName: additionalImage.originalname, size: additionalImage.size } : null,
            status: "PENDING"
        });

        // Derive coordinates from province if not provided (Safety for Heatmap)
        if (!report.lat || !report.lng) {
            // We'll import the coordinates mapping here or assume frontend sends them. 
            // The controller will trust the frontend's mapping if present, 
            // but we ensure something exists.
        }

        // Save files to local storage
        const fs = await import("fs/promises");
        const path = await import("path");
        const reportDir = path.join(process.cwd(), "uploads", "reports", report._id.toString());
        await fs.mkdir(reportDir, { recursive: true });

        const saveFile = async (file, prefix) => {
            if (!file) return;
            await fs.writeFile(path.join(reportDir, `${prefix}_${file.originalname}`), file.buffer);
        };

        await Promise.all([
            saveFile(paymentBill, "paymentBill"),
            saveFile(qrImage, "qrImage"),
            saveFile(drugImage, "drugImage"),
            saveFile(additionalImage, "additionalImage")
        ]);

        await report.save();

        return res.status(201).json({ success: true, message: "Report submitted successfully.", reportId: report._id });
    });

    /**
     * Read anchored protected QR state for a batch.
     */
    const readProtectedQr = asyncHandler(async (req, res) => {
        const actor = requireActor(req);
        const data = await service.readProtectedQr(req.params.batchId, actor);
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
     * Apply protected QR token lifecycle policy action.
     */
    const updateProtectedQrTokenPolicy = asyncHandler(async (req, res) => {
        const parsed = protectedQrTokenPolicySchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.updateProtectedQrTokenPolicy(
            req.params.batchId,
            {
                actionType: parsed.data.actionType,
                tokenDigest: parsed.data.tokenDigest.toLowerCase(),
                reason: parsed.data.reason,
                note: parsed.data.note,
            },
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
        
        // Normalize MSP if provided, otherwise allow empty for service-side auto-resolution
        let targetOwnerMSP = "";
        if (parsed.data.targetOwnerMSP) {
            targetOwnerMSP = normalizeMspId(parsed.data.targetOwnerMSP) || parsed.data.targetOwnerMSP;
            
            // Basic alias mapping if normalization returned empty but we have a value
            if (targetOwnerMSP === "Distributor") targetOwnerMSP = "DistributorMSP";
            if (targetOwnerMSP === "Manufacturer") targetOwnerMSP = "ManufacturerMSP";
            if (targetOwnerMSP === "Regulator") targetOwnerMSP = "RegulatorMSP";
        }

        const data = await service.shipBatch(
            req.params.batchId,
            {
                targetOwnerMSP: targetOwnerMSP,
                targetOwnerId: parsed.data.targetOwnerId ?? "",
                targetDistributorUnitId:
                    parsed.data.targetDistributorUnitId ?? "",
            },
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
     * Confirm that batch is delivered to consumption point.
     */
    const confirmDeliveredToConsumption = asyncHandler(async (req, res) => {
        const actor = requireActor(req);
        const data = await service.confirmDeliveredToConsumption(
            req.params.batchId,
            actor,
        );
        return res.status(200).json({ success: true, data });
    });

    /**
     * Update a batch document by legacy CID mode or direct upload mode.
     */
    const updateDocument = asyncHandler(async (req, res) => {
        const baseParsed = updateDocumentBaseSchema.safeParse(req.body);
        if (!baseParsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: baseParsed.error.flatten(),
            });
        }

        const uploadedDocument = getUploadedImage(req, "document");
        const actor = requireActor(req);

        if (uploadedDocument) {
            const data = await service.updateDocument(
                req.params.batchId,
                {
                    docType: baseParsed.data.docType,
                    file: {
                        buffer: uploadedDocument.buffer,
                        mediaType: uploadedDocument.mimetype,
                        sizeBytes: uploadedDocument.size,
                        fileName: uploadedDocument.originalname,
                    },
                },
                actor,
            );

            return res.status(200).json({ success: true, data });
        }

        const legacyParsed = updateDocumentCidSchema.safeParse(req.body);
        if (!legacyParsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: legacyParsed.error.flatten(),
            });
        }

        const data = await service.updateDocument(
            req.params.batchId,
            {
                docType: legacyParsed.data.docType,
                newCID: legacyParsed.data.newCID,
            },
            actor,
        );

        return res.status(200).json({ success: true, data });
    });

    /**
     * Trigger emergency batch recall or request a recall.
     */
    const recallBatch = asyncHandler(async (req, res) => {
        const actor = requireActor(req);
        let data;
        
        if (actor.role === "Manufacturer") {
            data = await service.requestRecall(
                req.params.batchId, 
                actor, 
                req.body.note
            );
        } else {
            data = await service.emergencyRecall(req.params.batchId, actor, req.body.note);
        }
        
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

    /**
     * Serve a report image from local storage.
     */
    const getReportImage = asyncHandler(async (req, res) => {
        const { reportId, type } = req.params;
        const actor = requireActor(req);

        // Security check: only regulators can view report images
        if (actor.role !== "Regulator") {
            throw new HttpException(403, "Only regulators can view report images");
        }

        const { Report } = await import("../../models/report/report.model.js");
        const report = await Report.findById(reportId);
        if (!report) {
            throw new HttpException(404, "Report not found");
        }

        // Hierarchy check for LOW level regulators
        if (actor.regulatorLevel === "LOW" && report.province !== actor.province) {
            throw new HttpException(403, "Forbidden: Report is outside your province");
        }

        let meta;
        if (type === "paymentBill") meta = report.paymentBillMeta;
        else if (type === "drugImage") meta = report.drugImageMeta;
        else if (type === "qrImage") meta = report.qrImageMeta;
        else meta = report.additionalImageMeta;

        if (!meta || !meta.fileName) {
            throw new HttpException(404, "Image not found for this report");
        }

        const path = await import("path");
        const fs = await import("fs/promises");
        const filePath = path.join(process.cwd(), "uploads", "reports", reportId, `${type}_${meta.fileName}`);

        try {
            await fs.access(filePath);
            return res.sendFile(filePath);
        } catch (err) {
            throw new HttpException(404, "File not found on disk");
        }
    });

    /**
     * Read a batch by data hash (metadata fingerprint).
     */
    const getBatchByHash = asyncHandler(async (req, res) => {
        const actor = requireActor(req);
        const data = await service.getBatchByDataHash(req.params.dataHash, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * QR Verification for staff (Manufacturers/Distributors)
     * Decodes the QR image and returns metadata.
     */
    const verifyQr = asyncHandler(async (req, res) => {
        const qrImage = getUploadedImage(req, "image");
        if (!qrImage) {
            throw new HttpException(400, "QR image file is required");
        }

        // Use supply chain service with internal flag to avoid scanCount increment
        const data = await service.verifyProduct(qrImage, req.traceId, {
            isInternal: true
        });
        return res.status(200).json({ success: true, data });
    });

    return {
        createBatch,
        listBatches,
        readBatch,
        getBatchByHash,
        readProtectedQr,
        verifyProduct,
        verifyQr,
        submitReport,
        getReportImage,
        bindProtectedQr,
        updateProtectedQrTokenPolicy,
        shipBatch,
        receiveBatch,
        confirmDeliveredToConsumption,
        updateDocument,
        recallBatch,
        recordBatchEvent,
        getBatchTimeline,
        getHeatmap,
    };
};
