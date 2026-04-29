import { Router } from "express";
import { createAuthController } from "../../controllers/auth/auth.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth/auth.middleware.js";
import { requireRoleMiddleware } from "../../middleware/auth/require-role.middleware.js";

/**
 * Create auth routes for the API.
 *
 * @returns {import("express").Router} Express router for /auth.
 */
export const createAuthRoutes = () => {
    const router = Router();
    // Build auth handlers once and bind them to auth endpoints.
    const controller = createAuthController();

    /**
     * POST /api/v1/auth/register
     * Create a new user.
     */
    router.post("/register", optionalAuthMiddleware, controller.register);

    /**
     * POST /api/v1/auth/login
     * Authenticate a user and return a JWT.
     */
    router.post("/login", controller.login);

    /**
     * POST /api/v1/auth/refresh
     * Re-issue a fresh JWT from a valid or recently expired token.
     */
    router.post("/refresh", controller.refresh);

    /**
     * GET /api/v1/auth/users
     * List all users (Admin only).
     */
    router.get("/users", authMiddleware, requireRoleMiddleware(["Admin", "Regulator", "Manufacturer", "Distributor"]), controller.getUsers);

    /**
     * PATCH /api/v1/auth/users/:userId
     * Update user (Admin or Regulator HIGH).
     */
    router.patch("/users/:userId", authMiddleware, controller.updateUser);

    /**
     * DELETE /api/v1/auth/users/:userId
     * Delete user (Admin only).
     */
    router.delete("/users/:userId", authMiddleware, requireRoleMiddleware("Admin"), controller.deleteUser);

    /**
     * POST /api/v1/auth/users/:userId/reset-password
     * Reset user password (Hierarchical).
     */
    router.post("/users/:userId/reset-password", authMiddleware, controller.resetPassword);
    
    /**
     * POST /api/v1/auth/users/:userId/request-node
     * Request a blockchain node for a user (Regulator only).
     */
    router.post("/users/:userId/request-node", authMiddleware, requireRoleMiddleware("Regulator"), controller.requestNode);

    /**
     * POST /api/v1/auth/users/:userId/approve-node
     * Approve and create a blockchain node (Admin only).
     */
    router.post("/users/:userId/approve-node", authMiddleware, requireRoleMiddleware("Admin"), controller.approveNode);

    return router;
};
