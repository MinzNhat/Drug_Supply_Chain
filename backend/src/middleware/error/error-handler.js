import { HttpException } from "../../utils/http-exception/http-exception.js";
import { logger } from "../../utils/logger/logger.js";

/**
 * Centralized error handler that normalizes API errors.
 *
 * @param {unknown} err - Error object thrown in request handling.
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} res - Express response.
 * @param {import("express").NextFunction} next - Express next function.
 * @returns {import("express").Response} JSON error response.
 */
export const errorHandler = (err, req, res, next) => {
    // Keep the full 4-argument signature so Express recognizes this as error middleware.
    void next;
    const traceId = req.traceId || "unknown";

    if (err instanceof HttpException) {
        logger.warn({
            code: err.code,
            message: err.message,
            details: err.details,
            status: err.status,
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

    const message =
        err instanceof Error ? err.message : "Internal server error";
    logger.error({
        code: "INTERNAL_SERVER_ERROR",
        message,
        err,
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
