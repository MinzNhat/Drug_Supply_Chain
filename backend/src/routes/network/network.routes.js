import { Router } from "express";
import { createNetworkController } from "../../controllers/network/network.controller.js";
import { createNodeManagementController } from "../../controllers/network/node-management.controller.js";
import { authMiddleware } from "../../middleware/auth/auth.middleware.js";

/**
 * Create network topology routes.
 *
 * @returns {import("express").Router} Express router for /api/v1/network.
 */
export const createNetworkRoutes = () => {
    const router = Router();
    const controller = createNetworkController();

    /**
     * GET /api/v1/network/topology
     */
    router.get("/topology", controller.getTopology);

    /**
     * POST /api/v1/network/nodes
     * Create a new node.
     */
    router.post("/nodes", authMiddleware, controller.createNode);

    /**
     * POST /api/v1/network/nodes/restart
     * Restart an existing node.
     */
    const managementController = createNodeManagementController();
    router.post("/nodes/restart", authMiddleware, managementController.restartNode);
    router.delete("/nodes/:nodeId", authMiddleware, managementController.deleteNode);
    router.get("/nodes/:nodeId/owner", authMiddleware, controller.getNodeOwner);

    return router;
}
