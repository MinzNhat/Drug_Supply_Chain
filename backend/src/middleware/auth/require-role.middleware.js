import { HttpException } from "../../utils/http-exception/http-exception.js";
import { normalizeRole } from "../../utils/msp/msp.js";

/**
 * Build a middleware that enforces one or more canonical roles.
 *
 * @param {string | string[]} expectedRoles - Required role(s).
 * @returns {import("express").RequestHandler} Express middleware.
 */
export const requireRoleMiddleware = (expectedRoles) => {
    const roles = Array.isArray(expectedRoles) ? expectedRoles : [expectedRoles];
    const normalizedExpectedRoles = roles.map(normalizeRole).filter(Boolean);

    return (req, _res, next) => {
        const actorRole = normalizeRole(req.user?.role);
        
        if (!actorRole || !normalizedExpectedRoles.includes(actorRole)) {
            throw new HttpException(403, "FORBIDDEN", "Insufficient role");
        }

        next();
    };
};
