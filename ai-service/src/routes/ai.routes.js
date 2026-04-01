import { Router } from "express";
import multer from "multer";
import { createAiController } from "../controllers/ai.controller.js";
import { AiAppearanceService } from "../services/ai-appearance.service.js";

/**
 * Create versioned AI routes for packaging verification.
 *
 * @returns {import("express").Router} Express router for /api/v1.
 */
export const createAiRoutes = () => {
    const router = Router();
    const upload = multer();
    const service = new AiAppearanceService();
    const controller = createAiController(service);

    /**
     * POST /api/v1/verify
     * Multipart form-data with one `image` field.
     */
    router.post("/verify", upload.single("image"), controller.verify);

    return router;
};
