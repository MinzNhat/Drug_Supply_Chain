import { SystemLog } from "../../models/system/system-log.model.js";
import { logger } from "../logger/logger.js";

/**
 * Audit logger that persists important system events to MongoDB.
 * 
 * @param {Object} params
 * @param {string} params.level - info, warn, error
 * @param {string} params.category - AUTH, NETWORK, BLOCKCHAIN, PRODUCT, SYSTEM
 * @param {string} params.action - Descriptive name of the action (e.g. "RESTART_NODE")
 * @param {string} params.message - Human-readable summary
 * @param {Object} [params.details] - Structured metadata
 * @param {Object} [params.req] - Express request object for extracting user and metadata
 */
export const auditLog = async ({ level = "info", category, action, message, details = {}, req = null }) => {
    try {
        const logData = {
            level,
            category,
            action,
            message,
            details,
        };

        if (req) {
            logData.ip = req.ip || req.headers["x-forwarded-for"] || "";
            logData.userAgent = req.headers["user-agent"] || "";
            if (req.user) {
                logData.userId = req.user.id || req.user.userId;
                logData.username = req.user.username;
            }
        }

        // 1. Console logging (standard)
        if (level === "error") {
            logger.error(message, { action, category, details });
        } else if (level === "warn") {
            logger.warn(message, { action, category, details });
        } else {
            logger.info(message, { action, category, details });
        }

        // 2. Persist to MongoDB for UI log viewing
        await SystemLog.create(logData);
    } catch (err) {
        // Fallback if DB logging fails
        logger.error(`CRITICAL: Audit logging failed: ${err.message}`, { originalMessage: message });
    }
};
