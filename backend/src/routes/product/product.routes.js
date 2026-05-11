import { Router } from "express";
import multer from "multer";
import { createProductController } from "../../controllers/product/product.controller.js";
import { createDrugCategoryController } from "../../controllers/product/drug-category.controller.js";
import { createFileController } from "../../controllers/system/file.controller.js";
import { DocumentStorageAdapter } from "../../integrations/document-storage/document-storage.adapter.js";
import { authMiddleware } from "../../middleware/auth/auth.middleware.js";
import { requireRoleMiddleware } from "../../middleware/auth/require-role.middleware.js";
import { createAlertArchiveRepository } from "../../repositories/alert/alert-archive.repository.js";
import { createBatchDocumentArtifactRepository } from "../../repositories/document/batch-document-artifact.repository.js";
import { createLedgerRepository } from "../../repositories/ledger/create-ledger-repository.js";
import { AiVerifierService } from "../../services/ai-verifier/ai-verifier.service.js";
import { createAlertDeliveryService } from "../../services/alerts/alert-delivery.service.js";
import { QrService } from "../../services/qr/qr.service.js";
import { SupplyChainService } from "../../services/supply-chain/supply-chain.service.js";

/**
 * Create versioned product routes for the API.
 *
 * @returns {import("express").Router} Express router for /api/v1.
 */
export const createProductRoutes = () => {
    const router = Router();
    // In-memory multipart parsing with 10 MB per-file cap for the public verify endpoint.
    const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

    // Wire service dependencies once per router instance.
    const ledgerRepository = createLedgerRepository();
    const alertArchiveRepository = createAlertArchiveRepository();
    const documentArtifactRepository = createBatchDocumentArtifactRepository();
    const alertDeliveryService = createAlertDeliveryService();
    const documentStorageAdapter = new DocumentStorageAdapter();
    const qrService = new QrService();
    const aiVerifierService = new AiVerifierService();
    const supplyChainService = new SupplyChainService(
        ledgerRepository,
        qrService,
        aiVerifierService,
        alertArchiveRepository,
        alertDeliveryService,
        documentStorageAdapter,
        documentArtifactRepository,
    );
    const controller = createProductController(supplyChainService);
    const drugCategoryController = createDrugCategoryController(supplyChainService);
    const fileController = createFileController();

    /**
     * GET /api/v1/files/:cid
     * Serve stored file by CID.
     */
    router.get("/files/:cid", fileController.getFile);

    /**
     * POST /api/v1/drug-categories
     * Register a new drug category (Manufacturer only).
     */
    router.post(
        "/drug-categories",
        authMiddleware,
        requireRoleMiddleware("Manufacturer"),
        upload.fields([
            { name: "image", maxCount: 1 },
            { name: "certificates", maxCount: 10 },
        ]),
        drugCategoryController.registerCategory,
    );

    /**
     * GET /api/v1/drug-categories
     */
    router.get(
        "/drug-categories",
        authMiddleware,
        drugCategoryController.listCategories,
    );

    /**
     * POST /api/v1/drug-categories/direct
     * Create a drug category directly (Regulator only).
     */
    router.post(
        "/drug-categories/direct",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        upload.fields([
            { name: "image", maxCount: 1 },
            { name: "certificates", maxCount: 10 },
        ]),
        drugCategoryController.createCategoryDirectly,
    );

    /**
     * POST /api/v1/drug-categories/:categoryId/approve
     */
    router.post(
        "/drug-categories/:categoryId/approve",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        drugCategoryController.approveCategory,
    );

    /**
     * POST /api/v1/drug-categories/:categoryId/reject
     */
    router.post(
        "/drug-categories/:categoryId/reject",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        drugCategoryController.rejectCategory,
    );

    /**
     * DELETE /api/v1/drug-categories/:categoryId
     */
    router.delete(
        "/drug-categories/:categoryId",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        drugCategoryController.deleteCategory,
    );

    /**
     * POST /api/v1/drug-categories/:categoryId/request-delete
     */
    router.post(
        "/drug-categories/:categoryId/request-delete",
        authMiddleware,
        requireRoleMiddleware("Manufacturer"),
        drugCategoryController.requestDeleteCategory,
    );

    /**
     * POST /api/v1/batches
     * Create a new batch (Manufacturer only).
     */
    router.post("/batches", authMiddleware, controller.createBatch);

    /**
     * GET /api/v1/batches
     * List batches for FE supply-chain screens.
     */
    router.get("/batches", authMiddleware, controller.listBatches);

    /**
     * GET /api/v1/batches/by-hash/:dataHash
     */
    router.get("/batches/by-hash/:dataHash", authMiddleware, controller.getBatchByHash);

    /**
     * GET /api/v1/batches/:batchId
     * Read a batch from ledger.
     */
    router.get("/batches/:batchId", authMiddleware, controller.readBatch);

    /**
     * POST /api/v1/verify
     * Public verification endpoint.
     */
    router.post(
        "/verify",
        upload.fields([
            { name: "qrImage", maxCount: 1 },
            { name: "frontImage", maxCount: 1 },
        ]),
        controller.verifyProduct,
    );

    /**
     * POST /api/v1/qr-scanner-verify
     * Staff-only QR decryption.
     */
    router.post(
        "/qr-scanner-verify",
        authMiddleware,
        upload.single("image"),
        controller.verifyQr,
    );

    /**
     * POST /api/v1/reports
     * Public endpoint to report suspicious/counterfeit products.
     */
    router.post(
        "/reports",
        upload.fields([
            { name: "paymentBill", maxCount: 1 },
            { name: "qrImage", maxCount: 1 },
            { name: "drugImage", maxCount: 1 },
            { name: "additionalImage", maxCount: 1 },
        ]),
        controller.submitReport,
    );

    /**
     * GET /api/v1/reports/:reportId/images/:type
     * Serve a report image from local storage (Regulator only).
     */
    router.get(
        "/reports/:reportId/images/:type",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.getReportImage,
    );

    /**
     * GET /api/v1/batches/:batchId/protected-qr
     * Read anchored protected QR state for a batch.
     */
    router.get(
        "/batches/:batchId/protected-qr",
        authMiddleware,
        controller.readProtectedQr,
    );

    /**
     * POST /api/v1/batches/:batchId/protected-qr/bind
     * Re-bind protected QR metadata for the batch.
     */
    router.post(
        "/batches/:batchId/protected-qr/bind",
        authMiddleware,
        requireRoleMiddleware("Manufacturer"),
        controller.bindProtectedQr,
    );

    /**
     * POST /api/v1/batches/:batchId/protected-qr/token-policy
     * Regulator token policy actions: BLOCKLIST, REVOKE, RESTORE.
     */
    router.post(
        "/batches/:batchId/protected-qr/token-policy",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.updateProtectedQrTokenPolicy,
    );

    /**
     * POST /api/v1/batches/:batchId/ship
     * Ship a batch to a new owner.
     */
    router.post("/batches/:batchId/ship", authMiddleware, controller.shipBatch);

    /**
     * POST /api/v1/batches/:batchId/receive
     * Receive a batch in transit.
     */
    router.post(
        "/batches/:batchId/receive",
        authMiddleware,
        controller.receiveBatch,
    );

    /**
     * POST /api/v1/batches/:batchId/confirm-delivered-to-consumption
     * Confirm that batch has reached consumption point (Distributor owner only).
     */
    router.post(
        "/batches/:batchId/confirm-delivered-to-consumption",
        authMiddleware,
        requireRoleMiddleware("Distributor"),
        controller.confirmDeliveredToConsumption,
    );

    /**
     * POST /api/v1/batches/:batchId/documents
     * Update IPFS document metadata.
     */
    router.post(
        "/batches/:batchId/documents",
        authMiddleware,
        upload.single("document"),
        controller.updateDocument,
    );

    /**
     * POST /api/v1/batches/:batchId/recall
     * Emergency recall for regulator.
     */
    router.post(
        "/batches/:batchId/recall",
        authMiddleware,
        requireRoleMiddleware(["Regulator", "Manufacturer"]),
        controller.recallBatch,
    );

    /**
     * POST /api/v1/batches/:batchId/events
     * Record supply-chain geospatial event.
     */
    router.post(
        "/batches/:batchId/events",
        authMiddleware,
        controller.recordBatchEvent,
    );

    /**
     * GET /api/v1/batches/:batchId/events
     * Read batch event timeline.
     */
    router.get(
        "/batches/:batchId/events",
        authMiddleware,
        controller.getBatchTimeline,
    );

    /**
     * GET /api/v1/analytics/heatmap
     * Heatmap buckets for FE map visualization.
     */
    router.get("/analytics/heatmap", authMiddleware, controller.getHeatmap);

    return router;
};
