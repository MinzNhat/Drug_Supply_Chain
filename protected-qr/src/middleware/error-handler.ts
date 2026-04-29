import { NextFunction, Request, Response } from "express";
import { HttpException } from "../utils/http-exception.js";
import { logger } from "../utils/logger.js";

/**
 * Centralized error handler that normalizes API errors.
 *
 * @param err - Error object thrown in request handling.
 * @param req - Express request.
 * @param res - Express response.
 * @param next - Express next function.
 * @returns JSON error response.
 */
export const errorHandler = (
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    // Keep the 4th argument so Express treats this as error middleware.
    void next;
    const traceId = req.traceId ?? "unknown";
    const traceIdAlias = traceId;

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
                trace_id: traceIdAlias,
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
            trace_id: traceIdAlias,
        },
    });
};
