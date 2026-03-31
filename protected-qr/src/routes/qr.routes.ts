import { Router } from "express";
import { Db } from "mongodb";
import multer from "multer";
import { createQrController } from "../controllers/qr.controller.js";

/**
 * Create versioned QR routes for the API.
 *
 * @param db - MongoDB database instance.
 * @returns Express router for /api/v1/qr.
 */
export const createQrRoutes = (db: Db) => {
    const router = Router();
    const upload = multer();
    const controller = createQrController(db);

    /**
     * POST /api/v1/qr/generate
     * Request body: strict hex strings.
     */
    router.post("/generate", controller.generate);

    /**
     * POST /api/v1/qr/verify
     * Multipart form-data: image file only.
     */
    router.post("/verify", upload.single("image"), controller.verify);

    return router;
};
