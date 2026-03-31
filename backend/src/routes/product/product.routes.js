import { Router } from "express";
import multer from "multer";
import { createProductController } from "../../controllers/product/product.controller.js";
import { authMiddleware } from "../../middleware/auth/auth.middleware.js";
import { createLedgerRepository } from "../../repositories/ledger/create-ledger-repository.js";
import { AiVerifierService } from "../../services/ai-verifier/ai-verifier.service.js";
import { QrService } from "../../services/qr/qr.service.js";
import { SupplyChainService } from "../../services/supply-chain/supply-chain.service.js";

/**
 * Create versioned product routes for the API.
 *
 * @returns {import("express").Router} Express router for /api/v1.
 */
export const createProductRoutes = () => {
    const router = Router();
    // Use in-memory multipart parsing for uploaded verification images.
    const upload = multer();

    // Wire service dependencies once per router instance.
    const ledgerRepository = createLedgerRepository();
    const qrService = new QrService();
    const aiVerifierService = new AiVerifierService();
    const supplyChainService = new SupplyChainService(
        ledgerRepository,
        qrService,
        aiVerifierService,
    );
    const controller = createProductController(supplyChainService);

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
            { name: "image", maxCount: 1 },
            { name: "packagingImage", maxCount: 1 },
        ]),
        controller.verifyProduct,
    );

    /**
     * POST /api/v1/batches/:batchId/protected-qr/bind
     * Re-bind protected QR metadata for the batch.
     */
    router.post(
        "/batches/:batchId/protected-qr/bind",
        authMiddleware,
        controller.bindProtectedQr,
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
     * POST /api/v1/batches/:batchId/documents
     * Update IPFS document metadata.
     */
    router.post(
        "/batches/:batchId/documents",
        authMiddleware,
        controller.updateDocument,
    );

    /**
     * POST /api/v1/batches/:batchId/recall
     * Emergency recall for regulator.
     */
    router.post(
        "/batches/:batchId/recall",
        authMiddleware,
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
