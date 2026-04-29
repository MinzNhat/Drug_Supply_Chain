import { HttpException } from "../../utils/http-exception/http-exception.js";
import {
    isMspIdForRole,
    normalizeMspId,
    normalizeRole,
} from "../../utils/msp/msp.js";

/**
 * Resolve and validate the authenticated actor context.
 *
 * @param {import("express").Request} req - Current request.
 * @returns {{ id: string, role: string, mspId: string, traceId: string }} Canonical actor context.
 */
export const requireActor = (req) => {
    const user = req.user ?? { userId: "", mspId: "", role: "" };
    const role = normalizeRole(user.role);
    const mspId = normalizeMspId(user.mspId);

    if (!role || !mspId || !isMspIdForRole(role, mspId)) {
        throw new HttpException(401, "Missing or invalid access token");
    }

    return {
        ...user,
        id: user.userId, // Map userId from authMiddleware to id used in services
        role,
        mspId,
        traceId: req.traceId,
    };
};

/**
 * Extract the uploaded image object for a given multipart field.
 *
 * @param {import("express").Request} req - Current request.
 * @param {string} fieldName - Multipart field name.
 * @returns {Express.Multer.File | undefined} Uploaded image file when present.
 */
export const getUploadedImage = (req, fieldName) => {
    if (req.file && req.file.fieldname === fieldName) {
        return req.file;
    }

    const fieldFiles = req.files?.[fieldName];
    if (Array.isArray(fieldFiles) && fieldFiles.length > 0) {
        return fieldFiles[0];
    }

    return undefined;
};
