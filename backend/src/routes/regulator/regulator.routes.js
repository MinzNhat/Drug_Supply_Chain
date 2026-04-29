import { Router } from "express";
import multer from "multer";
import { createRegulatorAlertsController } from "../../controllers/regulator/regulator-alerts.controller.js";
import { createRegulatorHistoryController } from "../../controllers/regulator/regulator-history.controller.js";
import { createDrugCategoryController } from "../../controllers/product/drug-category.controller.js";
import { authMiddleware } from "../../middleware/auth/auth.middleware.js";
import { requireRoleMiddleware } from "../../middleware/auth/require-role.middleware.js";
import { createAlertArchiveRepository } from "../../repositories/alert/alert-archive.repository.js";
import { createAlertSinkAdapter } from "../../services/alerts/alert-delivery.service.js";
import { RegulatorAlertsService } from "../../services/alerts/regulator-alerts.service.js";
import { createLedgerRepository } from "../../repositories/ledger/create-ledger-repository.js";
import { createBatchDocumentArtifactRepository } from "../../repositories/document/batch-document-artifact.repository.js";
import { DocumentStorageAdapter } from "../../integrations/document-storage/document-storage.adapter.js";
import { QrService } from "../../services/qr/qr.service.js";
import { AiVerifierService } from "../../services/ai-verifier/ai-verifier.service.js";
import { SupplyChainService } from "../../services/supply-chain/supply-chain.service.js";

/**
 * Create regulator-only routes for alert retrieval and report export.
 *
 * @param {{ service?: RegulatorAlertsService }=} options - Optional dependency override for testing.
 * @returns {import("express").Router} Express router for /api/v1/regulator.
 */
export const createRegulatorRoutes = (options = {}) => {
    const router = Router();

    const service =
        options.service ??
        new RegulatorAlertsService(
            createAlertArchiveRepository(),
            createAlertSinkAdapter(),
        );
    
    // Drug Category approval needs SupplyChainService
    const supplyChainService = new SupplyChainService(
        createLedgerRepository(),
        new QrService(),
        new AiVerifierService(),
        createAlertArchiveRepository(),
        null, // No alert delivery for basic approvals
        new DocumentStorageAdapter(),
        createBatchDocumentArtifactRepository()
    );

    const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

    const controller = createRegulatorAlertsController(service);
    const drugCategoryController = createDrugCategoryController(supplyChainService);
    const historyController = createRegulatorHistoryController(supplyChainService);

    /**
     * GET /api/v1/regulator/alerts
     * List archived alerts with filters and pagination.
     */
    router.get(
        "/alerts",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.listAlerts,
    );

    /**
     * GET /api/v1/regulator/alerts/:alertId
     * Read one archived alert.
     */
    router.get(
        "/alerts/:alertId",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.getAlertById,
    );

    /**
     * GET /api/v1/regulator/reports/export
     * Export alert reports in json or csv format.
     */
    router.get(
        "/reports/export",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.exportReport,
    );

    /**
     * GET /api/v1/regulator/user-reports
     * List user reports.
     */
    router.get(
        "/user-reports",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.listReports,
    );

    /**
     * PATCH /api/v1/regulator/user-reports/:reportId
     * Update report status.
     */
    router.patch(
        "/user-reports/:reportId",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.updateReportStatus,
    );

    /**
     * PATCH /api/v1/regulator/drug-categories/:categoryId/approve
     * Approve a drug category.
     */
    router.patch(
        "/drug-categories/:categoryId/approve",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        drugCategoryController.approveCategory,
    );

    /**
     * PATCH /api/v1/regulator/drug-categories/:categoryId/reject
     * Reject a drug category.
     */
    router.patch(
        "/drug-categories/:categoryId/reject",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        drugCategoryController.rejectCategory,
    );

    /**
     * GET /api/v1/regulator/blockchain-history
     * List blockchain transactions with regional filtering.
     */
    router.get(
        "/blockchain-history",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        historyController.getBlockchainHistory,
    );

    /**
     * GET /api/v1/regulator/surveillance
     * Unified surveillance view (Alerts + User Reports).
     */
    router.get(
        "/surveillance",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.listSurveillance,
    );

    /**
     * PATCH /api/v1/regulator/surveillance/:reportId/status
     * Update report status from surveillance view.
     */
    router.patch(
        "/surveillance/:reportId/status",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        controller.updateReportStatus,
    );

    /**
     * POST /api/v1/regulator/trace-by-qr
     * Search by scanning QR image.
     */
    router.post(
        "/trace-by-qr",
        authMiddleware,
        requireRoleMiddleware("Regulator"),
        upload.single("image"),
        historyController.traceByQr,
    );

    return router;
};
