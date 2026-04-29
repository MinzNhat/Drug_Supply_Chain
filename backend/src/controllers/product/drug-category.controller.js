import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { requireActor, getUploadedImage } from "./product.helpers.js";
import {
    registerDrugCategorySchema,
    listDrugCategoriesQuerySchema,
    rejectDrugCategorySchema,
} from "./drug-category.schemas.js";

/**
 * Build drug category controller with supply chain and regulatory services.
 *
 * @param {import("../../services/supply-chain/supply-chain.service.js").SupplyChainService} service
 * @returns Controller with handlers.
 */
export const createDrugCategoryController = (service) => {
    /**
     * Register a new drug category (Manufacturer only).
     */
    const registerCategory = asyncHandler(async (req, res) => {
        console.log("DrugCategoryController: Registering category...", req.body.name);
        const parsed = registerDrugCategorySchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const imageFile = getUploadedImage(req, "image");
        const certFiles = req.files?.["certificates"] || [];
        let certificateNames = [];
        try {
            certificateNames = JSON.parse(req.body.certificateNames || "[]");
        } catch (e) {
            certificateNames = [];
        }

        if (!imageFile || certFiles.length === 0) {
            throw new HttpException(400, "Both image and at least one certificate file are required");
        }

        const actor = requireActor(req);
        if (actor.role !== "Manufacturer") {
            throw new HttpException(403, "Only manufacturers can register drug categories");
        }

        const certificates = certFiles.map((file, idx) => ({
            name: certificateNames[idx] || file.originalname,
            file: {
                buffer: file.buffer,
                fileName: file.originalname,
                mediaType: file.mimetype,
            }
        }));

        const data = await service.registerDrugCategory(
            {
                ...parsed.data,
                imageFile: {
                    buffer: imageFile.buffer,
                    fileName: imageFile.originalname,
                    mediaType: imageFile.mimetype,
                },
                certificates,
            },
            actor
        );

        return res.status(201).json({ success: true, data });
    });

    /**
     * List drug categories with filters.
     */
    const listCategories = asyncHandler(async (req, res) => {
        const parsed = listDrugCategoriesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid query", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.listDrugCategories(parsed.data, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Approve a drug category (Regulator only).
     */
    const approveCategory = asyncHandler(async (req, res) => {
        const { categoryId } = req.params;
        const actor = requireActor(req);

        if (actor.role !== "Regulator") {
            throw new HttpException(403, "Only regulators can approve drug categories");
        }

        const data = await service.approveDrugCategory(categoryId, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Reject a drug category (Regulator only).
     */
    const rejectCategory = asyncHandler(async (req, res) => {
        const { categoryId } = req.params;
        const parsed = rejectDrugCategorySchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        if (actor.role !== "Regulator") {
            throw new HttpException(403, "Only regulators can reject drug categories");
        }

        const data = await service.rejectDrugCategory(categoryId, parsed.data.reason, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Delete a drug category (Regulator only).
     */
    const deleteCategory = asyncHandler(async (req, res) => {
        const { categoryId } = req.params;
        const actor = requireActor(req);
        const data = await service.deleteDrugCategory(categoryId, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Request deletion of a drug category (Manufacturer only).
     */
    const requestDeleteCategory = asyncHandler(async (req, res) => {
        const { categoryId } = req.params;
        const actor = requireActor(req);
        const data = await service.requestDeleteDrugCategory(categoryId, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Create a drug category directly (Regulator only).
     */
    const createCategoryDirectly = asyncHandler(async (req, res) => {
        console.log("DrugCategoryController: Creating category directly...", req.body.name);
        const parsed = registerDrugCategorySchema.safeParse(req.body);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid request body", {
                errors: parsed.error.flatten(),
            });
        }

        const imageFile = getUploadedImage(req, "image");
        const certFiles = req.files?.["certificates"] || [];
        let certificateNames = [];
        try {
            certificateNames = JSON.parse(req.body.certificateNames || "[]");
        } catch (e) {
            certificateNames = [];
        }

        if (!imageFile || certFiles.length === 0) {
            throw new HttpException(400, "Both image and at least one certificate file are required");
        }

        const actor = requireActor(req);
        if (actor.role !== "Regulator") {
            throw new HttpException(403, "Only regulators can create drug categories directly");
        }

        const certificates = certFiles.map((file, idx) => ({
            name: certificateNames[idx] || file.originalname,
            file: {
                buffer: file.buffer,
                fileName: file.originalname,
                mediaType: file.mimetype,
            }
        }));

        console.log("DrugCategoryController: Finalizing payload for direct creation");
        const data = await service.createDrugCategoryDirectly(
            {
                ...parsed.data,
                imageFile: {
                    buffer: imageFile.buffer,
                    fileName: imageFile.originalname,
                    mediaType: imageFile.mimetype,
                },
                certificates,
                manufacturerId: req.body.manufacturerId,
            },
            actor
        );

        return res.status(201).json({ success: true, data });
    });

    return {
        registerCategory,
        listCategories,
        approveCategory,
        rejectCategory,
        deleteCategory,
        requestDeleteCategory,
        createCategoryDirectly,
    };
};
