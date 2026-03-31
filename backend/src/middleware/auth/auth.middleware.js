import jwt from "jsonwebtoken";
import { config } from "../../config/index.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import {
    isMspIdForRole,
    normalizeMspId,
    normalizeRole,
} from "../../utils/msp/msp.js";

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

        req.user = {
            id: payload.userId,
            role,
            mspId,
        };
        next();
    } catch (err) {
        throw new HttpException(403, "Invalid or expired token");
    }
};
