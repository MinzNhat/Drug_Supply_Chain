import dotenv from "dotenv";
import fs from "fs";

// Load environment variables from .env when present.
dotenv.config();

/**
 * Read a required environment variable and throw if missing.
 *
 * @param {string} key - Environment variable name.
 * @param {string=} fallback - Optional fallback value.
 * @returns {string} Resolved value.
 */
const required = (key, fallback) => {
    const value = process.env[key] ?? fallback;
    if (!value) {
        throw new Error(`Missing required env: ${key}`);
    }
    return value;
};

const readSecretFile = (filePath, key) => {
    if (!filePath) {
        throw new Error(`Missing required env: ${key}`);
    }

    let raw = "";
    try {
        raw = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        throw new Error(`Cannot read secret file for ${key}: ${filePath}`);
    }

    const value = raw.trim();
    if (!value) {
        throw new Error(`Secret file for ${key} is empty: ${filePath}`);
    }

    return value;
};

const requiredSecret = (key, fileKey) => {
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

const requiredIf = (condition, key, fallback) => {
    if (!condition) {
        return process.env[key] ?? fallback ?? "";
    }
    return required(key, fallback);
};

const asBoolean = (value, fallback) => {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const asNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const asPositiveInt = (value, fallback) => {
    const parsed = asNumber(value, fallback);
    if (!Number.isInteger(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
};

const fabricEnabled = asBoolean(process.env.FABRIC_ENABLED, false);
const aiVerificationEnabled = asBoolean(
    process.env.AI_VERIFICATION_ENABLED,
    false,
);

const buildFabricOrg = (prefix, defaultMspId) => {
    const envPrefix = `FABRIC_${prefix}`;
    return {
        mspId: requiredIf(fabricEnabled, `${envPrefix}_MSP_ID`, defaultMspId),
        peerEndpoint: requiredIf(fabricEnabled, `${envPrefix}_PEER_ENDPOINT`),
        peerHostAlias: requiredIf(
            fabricEnabled,
            `${envPrefix}_PEER_HOST_ALIAS`,
        ),
        tlsCertPath: requiredIf(fabricEnabled, `${envPrefix}_TLS_CERT_PATH`),
        certPath: requiredIf(fabricEnabled, `${envPrefix}_CERT_PATH`),
        keyPath: requiredIf(fabricEnabled, `${envPrefix}_KEY_PATH`),
    };
};

/**
 * Runtime configuration for the API service.
 */
export const config = {
    /**
     * HTTP port for the Node.js API.
     */
    port: Number(process.env.PORT ?? 8090),

    /**
     * MongoDB connection string.
     */
    mongoUri: required("MONGO_URI"),

    /**
     * MongoDB database name.
     */
    mongoDb: required("MONGO_DB", "drug_guard"),

    /**
     * Base URL for the protected-QR service.
     */
    qrServiceUrl: required("QR_SERVICE_URL"),

    /**
     * Secret key for JWT signing.
     */
    jwtSecret: requiredSecret("JWT_SECRET", "JWT_SECRET_FILE"),

    /**
     * JWT expiration duration.
     */
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",

    /**
     * Log level for structured logging.
     */
    logLevel: process.env.LOG_LEVEL ?? "info",

    /**
     * HTTP timeout for inter-service calls.
     */
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 10000),

    /**
     * Optional AI physical packaging verification integration.
     */
    aiVerification: {
        enabled: aiVerificationEnabled,
        serviceUrl: requiredIf(
            aiVerificationEnabled,
            "AI_VERIFICATION_URL",
            "",
        ),
        timeoutMs: asPositiveInt(process.env.AI_VERIFICATION_TIMEOUT_MS, 10000),
        failOpen: asBoolean(process.env.AI_VERIFICATION_FAIL_OPEN, true),
    },

    /**
     * Fabric Gateway integration configuration.
     */
    fabric: {
        enabled: fabricEnabled,
        channelName: process.env.FABRIC_CHANNEL_NAME ?? "mychannel",
        chaincodeName: process.env.FABRIC_CHAINCODE_NAME ?? "drugtracker",
        evaluateTimeoutMs: asPositiveInt(
            process.env.FABRIC_EVALUATE_TIMEOUT_MS,
            5000,
        ),
        submitTimeoutMs: asPositiveInt(
            process.env.FABRIC_SUBMIT_TIMEOUT_MS,
            15000,
        ),
        commitStatusTimeoutMs: asPositiveInt(
            process.env.FABRIC_COMMIT_STATUS_TIMEOUT_MS,
            20000,
        ),
        evaluateRetry: {
            maxAttempts: asPositiveInt(
                process.env.FABRIC_EVALUATE_RETRY_MAX_ATTEMPTS,
                3,
            ),
            baseDelayMs: asPositiveInt(
                process.env.FABRIC_EVALUATE_RETRY_BASE_DELAY_MS,
                200,
            ),
            maxDelayMs: asPositiveInt(
                process.env.FABRIC_EVALUATE_RETRY_MAX_DELAY_MS,
                1000,
            ),
        },
        submitRetry: {
            maxAttempts: asPositiveInt(
                process.env.FABRIC_SUBMIT_RETRY_MAX_ATTEMPTS,
                1,
            ),
            baseDelayMs: asPositiveInt(
                process.env.FABRIC_SUBMIT_RETRY_BASE_DELAY_MS,
                250,
            ),
            maxDelayMs: asPositiveInt(
                process.env.FABRIC_SUBMIT_RETRY_MAX_DELAY_MS,
                1200,
            ),
        },
        publicScanRole: process.env.FABRIC_PUBLIC_SCAN_ROLE ?? "Regulator",
        organizations: {
            Manufacturer: buildFabricOrg("MANUFACTURER", "ManufacturerMSP"),
            Distributor: buildFabricOrg("DISTRIBUTOR", "DistributorMSP"),
            Regulator: buildFabricOrg("REGULATOR", "RegulatorMSP"),
        },
    },
};
