import { Router } from "express";
import { createRegulatorAlertsController } from "../../controllers/regulator/regulator-alerts.controller.js";
import { authMiddleware } from "../../middleware/auth/auth.middleware.js";
import { requireRoleMiddleware } from "../../middleware/auth/require-role.middleware.js";
import { createAlertArchiveRepository } from "../../repositories/alert/alert-archive.repository.js";
import { createAlertSinkAdapter } from "../../services/alerts/alert-delivery.service.js";
import { RegulatorAlertsService } from "../../services/alerts/regulator-alerts.service.js";

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
    const controller = createRegulatorAlertsController(service);

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

    return router;
};
