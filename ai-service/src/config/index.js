import dotenv from "dotenv";

dotenv.config();

/**
 * Read required environment value.
 *
 * @param {string} key - Environment key.
 * @param {string=} fallback - Optional fallback value.
 * @returns {string} Resolved non-empty value.
 */
const required = (key, fallback) => {
    const value = process.env[key] ?? fallback;
    if (!value) {
        throw new Error(`Missing required env: ${key}`);
    }
    return value;
};

/**
 * Parse number-like environment value.
 *
 * @param {unknown} value - Raw value.
 * @param {number} fallback - Fallback number.
 * @returns {number} Parsed finite number or fallback.
 */
const asNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Runtime configuration for AI gateway API.
 */
export const config = {
    /**
     * HTTP port for Node API service.
     */
    port: asNumber(process.env.PORT, 8701),

    /**
     * Base URL of Python inference core.
     */
    pythonServiceUrl: required("PYTHON_SERVICE_URL"),

    /**
     * Logging level for structured logs.
     */
    logLevel: process.env.LOG_LEVEL ?? "info",

    /**
     * Outbound HTTP timeout in milliseconds.
     */
    requestTimeoutMs: asNumber(process.env.REQUEST_TIMEOUT_MS, 10000),
};
