import jwt from "jsonwebtoken";
import { config } from "../../config/index.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import {
    isMspIdForRole,
    normalizeMspId,
    normalizeRole,
} from "../../utils/msp/msp.js";
import { normalizeDistributorUnitId } from "../../utils/distributor/distributor-unit-id.js";

/**
 * Canonical header name containing bearer credentials.
 */
const AUTHORIZATION_HEADER = "authorization";


/**
 * JWT authentication middleware.
 *
 * @param {import("express").Request} req - Express request.
 * @param {import("express").Response} _res - Express response.
 * @param {import("express").NextFunction} next - Express next function.
 */
export const authMiddleware = (req, _res, next) => {
    const header = req.header(AUTHORIZATION_HEADER) ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
        throw new HttpException(401, "Missing authorization token");
    }

    try {
        const payload = jwt.verify(token, config.jwtSecret);
        if (
            !payload ||
            typeof payload !== "object" ||
            typeof payload.userId !== "string" ||
            typeof payload.role !== "string" ||
            typeof payload.mspId !== "string"
        ) {
            throw new HttpException(403, "Invalid or expired token");
        }

        const role = normalizeRole(payload.role);
        const mspId = normalizeMspId(payload.mspId);
        if (!role || !mspId || !isMspIdForRole(role, mspId)) {
            throw new HttpException(403, "Invalid or expired token");
        }

        const distributorUnitId = normalizeDistributorUnitId(
            payload.distributorUnitId,
        );

        req.user = {
            userId: payload.userId,
            username: payload.username || "",
            role,
            mspId,
            distributorUnitId: distributorUnitId || "",
            regulatorLevel: payload.regulatorLevel || "",
            province: payload.province || "",
        };

        next();
    } catch (error) {
        if (error instanceof HttpException) throw error;
        throw new HttpException(403, "Invalid or expired token");
    }
};

/**
 * Optional JWT authentication middleware.
 */
export const optionalAuthMiddleware = (req, _res, next) => {
    const header = req.header(AUTHORIZATION_HEADER) ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
        return next();
    }

    try {
        const payload = jwt.verify(token, config.jwtSecret);
        if (
            payload &&
            typeof payload === "object" &&
            typeof payload.userId === "string"
        ) {
            req.user = payload;
        }
    } catch (error) {
        // Ignore errors for optional auth
    }
    next();
};
