import { asyncHandler } from "../utils/async-handler.js";
import { HttpException } from "../utils/http-exception.js";

/**
 * Build AI controller from service dependency.
 *
 * @param {import("../services/ai-appearance.service.js").AiAppearanceService} service - AI appearance service.
 * @returns {{ verify: import("express").RequestHandler }} Controller handlers.
 */
export const createAiController = (service) => {
    /**
     * POST /api/v1/verify
     * Accepts one multipart image and returns AI decision payload.
     */
    const verify = asyncHandler(async (req, res) => {
        if (!req.file?.buffer) {
            throw new HttpException(
                400,
                "IMAGE_REQUIRED",
                "image field is required",
            );
        }

        const data = await service.verify(req.file.buffer, req.traceId || "");
        return res.status(200).json(data);
    });

    return {
        verify,
    };
};
