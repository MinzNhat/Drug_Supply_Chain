import dotenv from "dotenv";
import fs from "fs";
import path from "path";

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

/**
 * Load secret value from file path provided by environment.
 *
 * @param {string} filePath - Absolute or relative secret file path.
 * @param {string} key - Logical env key for error context.
 * @returns {string} Trimmed secret value.
 */
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

/**
 * Resolve secret value from direct env or file-based env.
 *
 * @param {string} key - Direct env key (e.g. JWT_SECRET).
 * @param {string} fileKey - File env key (e.g. JWT_SECRET_FILE).
 * @returns {string} Secret value.
 */
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

/**
 * Read required env only when a runtime feature is enabled.
 *
 * @param {boolean} condition - Feature toggle state.
 * @param {string} key - Environment key.
 * @param {string=} fallback - Optional fallback value.
 * @returns {string} Resolved value or empty string when disabled.
 */
const requiredIf = (condition, key, fallback) => {
    if (!condition) {
        return process.env[key] ?? fallback ?? "";
    }
    return required(key, fallback);
};

/**
 * Parse boolean-like env flags.
 *
 * @param {unknown} value - Raw value from env.
 * @param {boolean} fallback - Default value.
 * @returns {boolean} Parsed boolean value.
 */
const asBoolean = (value, fallback) => {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

/**
 * Parse numeric env values with fallback.
 *
 * @param {unknown} value - Raw value from env.
 * @param {number} fallback - Default numeric value.
 * @returns {number} Parsed number or fallback.
 */
const asNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Parse non-negative integer env values with fallback.
 *
 * @param {unknown} value - Raw value from env.
 * @param {number} fallback - Default integer value.
 * @returns {number} Parsed non-negative integer or fallback.
 */
const asPositiveInt = (value, fallback) => {
    const parsed = asNumber(value, fallback);
    if (!Number.isInteger(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
};

/**
 * Normalize sink adapter type and fallback to logger when unsupported.
 *
 * @param {unknown} value - Raw sink type value.
 * @returns {"logger" | "webhook"} Supported sink type.
 */
const asAlertSinkType = (value) => {
    const normalized = asNonEmptyString(value, "logger").toLowerCase();
    return normalized === "webhook" ? "webhook" : "logger";
};

/**
 * Normalize an optional string value and return fallback when empty.
 *
 * @param {unknown} value - Raw environment value.
 * @param {string} fallback - Fallback text when value is blank.
 * @returns {string} Trimmed non-empty string.
 */
const asNonEmptyString = (value, fallback = "") => {
    if (typeof value !== "string") {
        return fallback;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : fallback;
};

/**
 * Parse comma-separated env values into a normalized unique list.
 *
 * @param {unknown} value - Raw environment value.
 * @param {string[]} fallback - Fallback items when env is blank.
 * @returns {string[]} Normalized unique values.
 */
const asCsvList = (value, fallback = []) => {
    const normalized = asNonEmptyString(value, "");
    if (!normalized) {
        return fallback;
    }

    return [...new Set(normalized.split(",").map((item) => item.trim()))].filter(
        (item) => item.length > 0,
    );
};

/**
 * Parse one JSON object environment value with safe fallback.
 *
 * @param {unknown} value - Raw environment value.
 * @param {Record<string, unknown>} fallback - Fallback object.
 * @param {string} keyName - Environment key name for error context.
 * @returns {Record<string, unknown>} Parsed JSON object.
 */
const asJsonObject = (value, fallback = {}, keyName = "JSON_ENV") => {
    const normalized = asNonEmptyString(value, "");
    if (!normalized) {
        return fallback;
    }

    let parsed;
    try {
        parsed = JSON.parse(normalized);
    } catch (error) {
        throw new Error(`Invalid JSON in ${keyName}`);
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${keyName} must be a JSON object`);
    }

    return parsed;
};

/**
 * Resolve profile file path from cwd when relative path is provided.
 *
 * @param {string} inputPath - Relative or absolute path.
 * @returns {string} Absolute path.
 */
const resolveFilePath = (inputPath) => {
    if (!inputPath) {
        return "";
    }

    return path.isAbsolute(inputPath)
        ? inputPath
        : path.resolve(process.cwd(), inputPath);
};

/** Supported Fabric profile identifiers. */
const FABRIC_PROFILES = ["local", "staging", "prod"];

/**
 * Parse and validate Fabric profile value.
 *
 * @param {string} value - Raw profile value from env or file.
 * @returns {"local" | "staging" | "prod"} Valid profile identifier.
 */
const normalizeFabricProfile = (value) => {
    const normalized = asNonEmptyString(value, "local").toLowerCase();

    if (!FABRIC_PROFILES.includes(normalized)) {
        throw new Error(
            `Invalid FABRIC_PROFILE: ${value}. Allowed: ${FABRIC_PROFILES.join(", ")}`,
        );
    }

    return normalized;
};

/** Supported AI verification profile identifiers. */
const AI_VERIFICATION_PROFILES = ["local", "staging", "prod"];

/**
 * Parse and validate AI verification profile value.
 *
 * @param {string} value - Raw profile value from env or file.
 * @returns {"local" | "staging" | "prod"} Valid profile identifier.
 */
const normalizeAiVerificationProfile = (value) => {
    const normalized = asNonEmptyString(value, "local").toLowerCase();

    if (!AI_VERIFICATION_PROFILES.includes(normalized)) {
        throw new Error(
            `Invalid AI_VERIFICATION_PROFILE: ${value}. Allowed: ${AI_VERIFICATION_PROFILES.join(", ")}`,
        );
    }

    return normalized;
};

/**
 * Check whether one URL points to local-only host aliases.
 *
 * @param {string} inputUrl - Candidate URL.
 * @returns {boolean} True when URL host is local-only.
 */
const isLocalOnlyUrl = (inputUrl) => {
    if (!inputUrl) {
        return false;
    }

    let parsed;
    try {
        parsed = new URL(inputUrl);
    } catch (error) {
        return false;
    }

    const host = asNonEmptyString(parsed.hostname, "").toLowerCase();
    return ["localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal"].includes(host);
};

const fabricEnabled = asBoolean(process.env.FABRIC_ENABLED, false);

const fabricProfile = normalizeFabricProfile(
    process.env.FABRIC_PROFILE ?? "local",
);
const fabricProfileFile = asNonEmptyString(process.env.FABRIC_PROFILE_FILE, "");

const aiVerificationProfile = normalizeAiVerificationProfile(
    process.env.AI_VERIFICATION_PROFILE ?? "local",
);
const aiVerificationProfileFile = asNonEmptyString(
    process.env.AI_VERIFICATION_PROFILE_FILE,
    "",
);

/**
 * Load optional Fabric profile JSON and enforce profile consistency.
 *
 * @returns {Record<string, unknown>} Parsed profile object.
 */
const loadFabricProfileConfig = () => {
    if (!fabricEnabled || !fabricProfileFile) {
        return {};
    }

    const absoluteProfilePath = resolveFilePath(fabricProfileFile);

    let raw = "";
    try {
        raw = fs.readFileSync(absoluteProfilePath, "utf8");
    } catch (error) {
        throw new Error(
            `Cannot read FABRIC_PROFILE_FILE: ${absoluteProfilePath}`,
        );
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(
            `FABRIC_PROFILE_FILE is not valid JSON: ${absoluteProfilePath}`,
        );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
            "FABRIC_PROFILE_FILE must contain a JSON object at root",
        );
    }

    const fileProfile = normalizeFabricProfile(parsed.profile ?? fabricProfile);
    if (fileProfile !== fabricProfile) {
        throw new Error(
            `FABRIC_PROFILE (${fabricProfile}) does not match FABRIC_PROFILE_FILE profile (${fileProfile})`,
        );
    }

    return parsed;
};

const fabricProfileConfig = loadFabricProfileConfig();

/**
 * Load optional AI verification profile JSON and enforce profile consistency.
 *
 * @returns {Record<string, unknown>} Parsed profile object.
 */
const loadAiVerificationProfileConfig = () => {
    if (!aiVerificationProfileFile) {
        return {};
    }

    const absoluteProfilePath = resolveFilePath(aiVerificationProfileFile);

    let raw = "";
    try {
        raw = fs.readFileSync(absoluteProfilePath, "utf8");
    } catch (error) {
        throw new Error(
            `Cannot read AI_VERIFICATION_PROFILE_FILE: ${absoluteProfilePath}`,
        );
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(
            `AI_VERIFICATION_PROFILE_FILE is not valid JSON: ${absoluteProfilePath}`,
        );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
            "AI_VERIFICATION_PROFILE_FILE must contain a JSON object at root",
        );
    }

    const fileProfile = normalizeAiVerificationProfile(
        parsed.profile ?? aiVerificationProfile,
    );
    if (fileProfile !== aiVerificationProfile) {
        throw new Error(
            `AI_VERIFICATION_PROFILE (${aiVerificationProfile}) does not match AI_VERIFICATION_PROFILE_FILE profile (${fileProfile})`,
        );
    }

    return parsed;
};

const aiVerificationProfileConfig = loadAiVerificationProfileConfig();

/**
 * Resolve one Fabric field by precedence: env > profile file > fallback.
 *
 * @param {string} envKey - Environment key.
 * @param {unknown} profileValue - Value from profile JSON.
 * @param {string} fallback - Final fallback.
 * @returns {string} Resolved text value.
 */
const fromEnvOrProfile = (envKey, profileValue, fallback = "") => {
    const envValue = asNonEmptyString(process.env[envKey], "");
    if (envValue) {
        return envValue;
    }

    const profileText = asNonEmptyString(profileValue, "");
    if (profileText) {
        return profileText;
    }

    return fallback;
};

/**
 * Build one role-specific Fabric organization configuration.
 *
 * @param {string} prefix - Role prefix (`MANUFACTURER|DISTRIBUTOR|REGULATOR`).
 * @param {string} defaultMspId - Default MSP fallback.
 * @param {Record<string, string>} profileOrg - Profile JSON role override.
 * @returns {{ mspId: string, peerEndpoint: string, peerHostAlias: string, tlsCertPath: string, certPath: string, keyPath: string }}
 */
const buildFabricOrg = (prefix, defaultMspId, profileOrg = {}) => {
    const envPrefix = `FABRIC_${prefix}`;
    return {
        mspId: fromEnvOrProfile(
            `${envPrefix}_MSP_ID`,
            profileOrg.mspId,
            defaultMspId,
        ),
        peerEndpoint: fromEnvOrProfile(
            `${envPrefix}_PEER_ENDPOINT`,
            profileOrg.peerEndpoint,
            "",
        ),
        peerHostAlias: fromEnvOrProfile(
            `${envPrefix}_PEER_HOST_ALIAS`,
            profileOrg.peerHostAlias,
            "",
        ),
        tlsCertPath: fromEnvOrProfile(
            `${envPrefix}_TLS_CERT_PATH`,
            profileOrg.tlsCertPath,
            "",
        ),
        certPath: fromEnvOrProfile(
            `${envPrefix}_CERT_PATH`,
            profileOrg.certPath,
            "",
        ),
        keyPath: fromEnvOrProfile(
            `${envPrefix}_KEY_PATH`,
            profileOrg.keyPath,
            "",
        ),
    };
};

const fabricOrganizationsFromProfile =
    fabricProfileConfig.organizations &&
    typeof fabricProfileConfig.organizations === "object"
        ? fabricProfileConfig.organizations
        : {};

const distributorIdentityBridgeFromProfile =
    fabricProfileConfig.distributorIdentityBridge &&
    typeof fabricProfileConfig.distributorIdentityBridge === "object" &&
    !Array.isArray(fabricProfileConfig.distributorIdentityBridge)
        ? fabricProfileConfig.distributorIdentityBridge
        : {};

const distributorIdentityBridgeUnitsFromProfile =
    distributorIdentityBridgeFromProfile.units &&
    typeof distributorIdentityBridgeFromProfile.units === "object" &&
    !Array.isArray(distributorIdentityBridgeFromProfile.units)
        ? distributorIdentityBridgeFromProfile.units
        : {};

const distributorIdentityBridgeUnits = asJsonObject(
    process.env.FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_UNITS_JSON,
    distributorIdentityBridgeUnitsFromProfile,
    "FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_UNITS_JSON",
);

const fabricStrictCredentials = asBoolean(
    process.env.FABRIC_STRICT_CREDENTIALS,
    fabricProfile !== "local",
);

const aiVerificationOwnersFromProfile =
    aiVerificationProfileConfig.owners &&
    typeof aiVerificationProfileConfig.owners === "object" &&
    !Array.isArray(aiVerificationProfileConfig.owners)
        ? aiVerificationProfileConfig.owners
        : {};

const aiVerificationRunbookFromProfile =
    aiVerificationProfileConfig.runbook &&
    typeof aiVerificationProfileConfig.runbook === "object" &&
    !Array.isArray(aiVerificationProfileConfig.runbook)
        ? aiVerificationProfileConfig.runbook
        : {};

const aiVerificationEnabled = asBoolean(
    process.env.AI_VERIFICATION_ENABLED,
    asBoolean(aiVerificationProfileConfig.enabled, false),
);
const aiVerificationServiceUrl = requiredIf(
    aiVerificationEnabled,
    "AI_VERIFICATION_URL",
    asNonEmptyString(aiVerificationProfileConfig.serviceUrl, ""),
);
const aiVerificationTimeoutMs = asPositiveInt(
    process.env.AI_VERIFICATION_TIMEOUT_MS,
    asPositiveInt(aiVerificationProfileConfig.timeoutMs, 10000),
);
const aiVerificationFailOpen = asBoolean(
    process.env.AI_VERIFICATION_FAIL_OPEN,
    asBoolean(aiVerificationProfileConfig.failOpen, true),
);
const aiVerificationStrictConfig = asBoolean(
    process.env.AI_VERIFICATION_STRICT_CONFIG,
    aiVerificationProfile !== "local",
);
const aiVerificationOwnerService = asNonEmptyString(
    process.env.AI_VERIFICATION_OWNER_SERVICE,
    asNonEmptyString(aiVerificationOwnersFromProfile.serviceOwner, ""),
);
const aiVerificationOwnerMl = asNonEmptyString(
    process.env.AI_VERIFICATION_OWNER_ML,
    asNonEmptyString(aiVerificationOwnersFromProfile.mlOwner, ""),
);
const aiVerificationOwnerOnCall = asNonEmptyString(
    process.env.AI_VERIFICATION_OWNER_ONCALL,
    asNonEmptyString(aiVerificationOwnersFromProfile.onCall, ""),
);
const aiVerificationRunbookPath = asNonEmptyString(
    process.env.AI_VERIFICATION_RUNBOOK_PATH,
    asNonEmptyString(
        aiVerificationRunbookFromProfile.path,
        "docs/platform/ai-verification-operations.md",
    ),
);
const aiVerificationRunbookEscalation = asNonEmptyString(
    process.env.AI_VERIFICATION_RUNBOOK_ESCALATION,
    asNonEmptyString(aiVerificationRunbookFromProfile.escalation, ""),
);

/**
 * Validate AI verification configuration for staging/prod profiles.
 */
const validateAiVerificationConfig = () => {
    if (!aiVerificationStrictConfig) {
        return;
    }

    if (!aiVerificationEnabled) {
        throw new Error(
            `AI_VERIFICATION_ENABLED must be true when AI_VERIFICATION_STRICT_CONFIG=true (profile=${aiVerificationProfile})`,
        );
    }

    if (!aiVerificationServiceUrl) {
        throw new Error(
            "AI_VERIFICATION_URL must be configured when AI verification is enabled",
        );
    }

    if (
        aiVerificationProfile !== "local" &&
        isLocalOnlyUrl(aiVerificationServiceUrl)
    ) {
        throw new Error(
            `AI_VERIFICATION_URL cannot target local-only host in ${aiVerificationProfile} profile`,
        );
    }

    if (aiVerificationTimeoutMs < 1000 || aiVerificationTimeoutMs > 30000) {
        throw new Error(
            "AI_VERIFICATION_TIMEOUT_MS must be between 1000 and 30000 in strict profile mode",
        );
    }

    const missingOwners = [];
    if (!aiVerificationOwnerService) {
        missingOwners.push("AI_VERIFICATION_OWNER_SERVICE");
    }
    if (!aiVerificationOwnerMl) {
        missingOwners.push("AI_VERIFICATION_OWNER_ML");
    }
    if (!aiVerificationOwnerOnCall) {
        missingOwners.push("AI_VERIFICATION_OWNER_ONCALL");
    }

    if (missingOwners.length > 0) {
        throw new Error(
            `Missing required AI ownership metadata for strict profile mode: ${missingOwners.join(", ")}`,
        );
    }
};

validateAiVerificationConfig();

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
     * Direct document upload integration settings.
     */
    documentUpload: {
        enabled: asBoolean(process.env.DOC_UPLOAD_ENABLED, false),
        provider: asNonEmptyString(process.env.DOC_UPLOAD_PROVIDER, "mock"),
        timeoutMs: asPositiveInt(process.env.DOC_UPLOAD_TIMEOUT_MS, 15000),
        maxUploadBytes: asPositiveInt(
            process.env.DOC_UPLOAD_MAX_BYTES,
            5 * 1024 * 1024,
        ),
        requirePinned: asBoolean(process.env.DOC_UPLOAD_REQUIRE_PINNED, true),
        allowedMediaTypes: {
            packageImage: asCsvList(process.env.DOC_UPLOAD_PACKAGE_IMAGE_MEDIA_TYPES, [
                "image/jpeg",
                "image/png",
                "image/webp",
            ]),
            qualityCert: asCsvList(process.env.DOC_UPLOAD_QUALITY_CERT_MEDIA_TYPES, [
                "application/pdf",
                "image/jpeg",
                "image/png",
            ]),
        },
        kubo: {
            apiUrl: asNonEmptyString(
                process.env.DOC_UPLOAD_KUBO_API_URL,
                "http://127.0.0.1:5001",
            ),
            authToken: asNonEmptyString(
                process.env.DOC_UPLOAD_KUBO_AUTH_TOKEN,
                "",
            ),
        },
        pinata: {
            apiUrl: asNonEmptyString(
                process.env.DOC_UPLOAD_PINATA_API_URL,
                "https://api.pinata.cloud",
            ),
            jwt: asNonEmptyString(process.env.DOC_UPLOAD_PINATA_JWT, ""),
        },
    },

    /**
     * Optional AI physical packaging verification integration.
     */
    aiVerification: {
        enabled: aiVerificationEnabled,
        profile: aiVerificationProfile,
        profileFile: resolveFilePath(aiVerificationProfileFile),
        strictConfig: aiVerificationStrictConfig,
        serviceUrl: aiVerificationServiceUrl,
        timeoutMs: aiVerificationTimeoutMs,
        failOpen: aiVerificationFailOpen,
        ownership: {
            serviceOwner: aiVerificationOwnerService,
            mlOwner: aiVerificationOwnerMl,
            onCall: aiVerificationOwnerOnCall,
        },
        runbook: {
            path: aiVerificationRunbookPath,
            escalation: aiVerificationRunbookEscalation,
        },
    },

    /**
     * External alert sink delivery policy for canonical alert keys.
     */
    alertSink: {
        enabled: asBoolean(process.env.ALERT_SINK_ENABLED, true),
        type: asAlertSinkType(process.env.ALERT_SINK_TYPE),
        retry: {
            maxAttempts: asPositiveInt(
                process.env.ALERT_SINK_RETRY_MAX_ATTEMPTS,
                3,
            ),
            baseDelayMs: asPositiveInt(
                process.env.ALERT_SINK_RETRY_BASE_DELAY_MS,
                200,
            ),
            maxDelayMs: asPositiveInt(
                process.env.ALERT_SINK_RETRY_MAX_DELAY_MS,
                2000,
            ),
        },
        webhook: {
            url: asNonEmptyString(process.env.ALERT_SINK_WEBHOOK_URL, ""),
            timeoutMs: asPositiveInt(
                process.env.ALERT_SINK_WEBHOOK_TIMEOUT_MS,
                5000,
            ),
            authHeader: asNonEmptyString(
                process.env.ALERT_SINK_WEBHOOK_AUTH_HEADER,
                "authorization",
            ),
            authToken: asNonEmptyString(
                process.env.ALERT_SINK_WEBHOOK_AUTH_TOKEN,
                "",
            ),
        },
    },

    /**
     * Fabric Gateway integration configuration.
     */
    fabric: {
        enabled: fabricEnabled,
        profile: fabricProfile,
        profileFile: resolveFilePath(fabricProfileFile),
        strictCredentials: fabricStrictCredentials,
        channelName: fromEnvOrProfile(
            "FABRIC_CHANNEL_NAME",
            fabricProfileConfig.channelName,
            "mychannel",
        ),
        chaincodeName: fromEnvOrProfile(
            "FABRIC_CHAINCODE_NAME",
            fabricProfileConfig.chaincodeName,
            "drugtracker",
        ),
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
        publicScanRole: fromEnvOrProfile(
            "FABRIC_PUBLIC_SCAN_ROLE",
            fabricProfileConfig.publicScanRole,
            "Regulator",
        ),
        organizations: {
            Manufacturer: buildFabricOrg(
                "MANUFACTURER",
                "ManufacturerMSP",
                fabricOrganizationsFromProfile.Manufacturer,
            ),
            Distributor: buildFabricOrg(
                "DISTRIBUTOR",
                "DistributorMSP",
                fabricOrganizationsFromProfile.Distributor,
            ),
            Regulator: buildFabricOrg(
                "REGULATOR",
                "RegulatorMSP",
                fabricOrganizationsFromProfile.Regulator,
            ),
        },
        distributorIdentityBridge: {
            enabled: asBoolean(
                process.env.FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_ENABLED,
                asBoolean(distributorIdentityBridgeFromProfile.enabled, false),
            ),
            requireUnitForDistributor: asBoolean(
                process.env.FABRIC_DISTRIBUTOR_IDENTITY_BRIDGE_REQUIRE_UNIT,
                asBoolean(
                    distributorIdentityBridgeFromProfile.requireUnitForDistributor,
                    true,
                ),
            ),
            units: distributorIdentityBridgeUnits,
        },
    },
};
