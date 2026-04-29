import { Router } from "express";
import { createSystemController } from "../../controllers/system/system.controller.js";
import { authMiddleware } from "../../middleware/auth/auth.middleware.js";
import { requireRoleMiddleware } from "../../middleware/auth/require-role.middleware.js";

/**
 * Create system-related routes.
 * 
 * @returns {import("express").Router}
 */
export const createSystemRoutes = () => {
    const router = Router();
    const controller = createSystemController();

    /**
     * GET /api/v1/system/logs
     * Fetch system logs (Admin only).
     */
    router.get("/logs", authMiddleware, requireRoleMiddleware("Admin"), controller.getLogs);

    return router;
};
