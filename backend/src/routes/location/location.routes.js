import { Router } from "express";
import { createLocationController } from "../../controllers/location/location.controller.js";

/**
 * Create location-related routes.
 * 
 * @returns {import("express").Router}
 */
export const createLocationRoutes = () => {
    const router = Router();
    const controller = createLocationController();

    /**
     * GET /api/v1/location/provinces
     * Fetch all provinces.
     */
    router.get("/provinces", controller.getProvinces);

    return router;
};
