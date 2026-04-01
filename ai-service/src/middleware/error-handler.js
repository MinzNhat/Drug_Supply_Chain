import { HttpException } from "../utils/http-exception.js";
import { logger } from "../utils/logger.js";

/**
 * Centralized error handler that normalizes API errors.
 *
 * @param {unknown} err - Error object.
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @param {import("express").NextFunction} next - Express next callback.
 * @returns {import("express").Response} JSON error response.
 */
export const errorHandler = (err, req, res, next) => {
    void next;
    const traceId = req.traceId || "unknown";

    if (err instanceof HttpException) {
        logger.warn({
            message: err.message,
            code: err.code,
            status: err.status,
            details: err.details,
            traceId,
        });

        return res.status(err.status).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                traceId,
                details: err.details,
            },
        });
    }

    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error({
        message,
        code: "INTERNAL_SERVER_ERROR",
        traceId,
    });

    return res.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message,
            traceId,
        },
    });
};
