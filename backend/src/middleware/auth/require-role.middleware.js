import { HttpException } from "../../utils/http-exception/http-exception.js";
import { normalizeRole } from "../../utils/msp/msp.js";

/**
 * Build a middleware that enforces one canonical role.
 *
 * @param {"Manufacturer" | "Distributor" | "Regulator"} expectedRole - Required role.
 * @returns {import("express").RequestHandler} Express middleware.
 */
export const requireRoleMiddleware = (expectedRole) => {
    const normalizedExpectedRole = normalizeRole(expectedRole);

    return (req, _res, next) => {
        const actorRole = normalizeRole(req.user?.role);
        if (!normalizedExpectedRole || actorRole !== normalizedExpectedRole) {
            throw new HttpException(403, "FORBIDDEN", "Insufficient role");
        }

        next();
    };
};
