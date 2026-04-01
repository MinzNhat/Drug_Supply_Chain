import crypto from "crypto";

/**
 * Attach request-scoped trace identifier used in logs and error payloads.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} _res - Express response.
 * @param {import("express").NextFunction} next - Express next callback.
 */
export const requestContextMiddleware = (req, _res, next) => {
    const headerTraceId = String(req.headers["x-trace-id"] || "").trim();
    req.traceId = headerTraceId || crypto.randomUUID();
    next();
};
