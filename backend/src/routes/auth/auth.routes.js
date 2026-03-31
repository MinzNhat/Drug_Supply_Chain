import { Router } from "express";
import { createAuthController } from "../../controllers/auth/auth.controller.js";

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
    router.post("/register", controller.register);

    /**
     * POST /api/v1/auth/login
     * Authenticate a user and return a JWT.
     */
    router.post("/login", controller.login);

    return router;
};
