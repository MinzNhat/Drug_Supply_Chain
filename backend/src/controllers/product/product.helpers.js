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
    const actor = req.user ?? { id: "", mspId: "", role: "" };
    const role = normalizeRole(actor.role);
    const mspId = normalizeMspId(actor.mspId);

    if (!role || !mspId || !isMspIdForRole(role, mspId)) {
        throw new HttpException(401, "Missing or invalid access token");
    }

    return {
        ...actor,
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
    if (req.file && fieldName === "image") {
        return req.file;
    }

    const fieldFiles = req.files?.[fieldName];
    if (Array.isArray(fieldFiles) && fieldFiles.length > 0) {
        return fieldFiles[0];
    }

    return undefined;
};
