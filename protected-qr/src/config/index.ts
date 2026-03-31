import dotenv from "dotenv";
import fs from "fs";

// Load environment variables from .env when present.
dotenv.config();

/**
 * Read a required environment variable and throw if missing.
 *
 * @param key - Environment variable name.
 * @param fallback - Optional fallback value.
 * @returns Resolved value.
 */
const required = (key: string, fallback?: string) => {
    const value = process.env[key] ?? fallback;
    if (!value) {
        throw new Error(`Missing required env: ${key}`);
    }
    return value;
};

const readSecretFile = (filePath: string, key: string) => {
    if (!filePath) {
        throw new Error(`Missing required env: ${key}`);
    }

    let raw = "";
    try {
        raw = fs.readFileSync(filePath, "utf8");
    } catch {
        throw new Error(`Cannot read secret file for ${key}: ${filePath}`);
    }

    const value = raw.trim();
    if (!value) {
        throw new Error(`Secret file for ${key} is empty: ${filePath}`);
    }

    return value;
};

const requiredSecret = (key: string, fileKey: string) => {
    const directValue = process.env[key];
    if (directValue) {
        return directValue;
    }

    const filePath = process.env[fileKey];
    if (filePath) {
        return readSecretFile(filePath, key);
    }

    throw new Error(`Missing required env: ${key} or ${fileKey}`);
};

/**
 * Runtime configuration for the API service.
 */
export const config = {
    /**
     * HTTP port for the Node.js API.
     */
    port: Number(process.env.PORT ?? 8080),

    /**
     * MongoDB connection string.
     */
    mongoUri: required("MONGO_URI"),

    /**
     * MongoDB database name.
     */
    mongoDb: required("MONGO_DB", "protected_qr"),

    /**
     * Base URL for the Python core service.
     */
    pythonServiceUrl: required("PYTHON_SERVICE_URL"),

    /**
     * HMAC secret used to sign payloads.
     */
    hmacSecret: requiredSecret("HMAC_SECRET", "HMAC_SECRET_FILE"),

    /**
     * Log level for structured logging.
     */
    logLevel: process.env.LOG_LEVEL ?? "info",

    /**
     * HTTP timeout for inter-service calls.
     */
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 10000),
};
