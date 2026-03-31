import fs from "fs";
import path from "path";
import { config } from "../../config/index.js";
import { FabricGatewayClient } from "../../integrations/fabric/fabric-gateway.client.js";
import { logger } from "../../utils/logger/logger.js";
import { DisabledLedgerRepository } from "./disabled-ledger.repository.js";
import { FabricLedgerRepository } from "./fabric-ledger.repository.js";

// Keep one repository instance for process lifetime to avoid duplicate gateway setup.
let repositoryInstance;

/**
 * Resolve configured Fabric credential path to absolute path.
 *
 * @param {string | undefined} inputPath - Relative or absolute credential path.
 * @returns {string} Absolute path or empty string.
 */
const resolvePath = (inputPath) => {
    if (!inputPath) {
        return "";
    }
    return path.isAbsolute(inputPath)
        ? inputPath
        : path.resolve(process.cwd(), inputPath);
};

/**
 * Check whether configured credential path points to readable PEM file content.
 *
 * Supports direct file path or directory path containing at least one file.
 *
 * @param {string | undefined} inputPath - Configured credential location.
 * @returns {boolean} True when credential content can be read.
 */
const isReadablePemPath = (inputPath) => {
    const absolutePath = resolvePath(inputPath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
        return false;
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
        return true;
    }

    const files = fs
        .readdirSync(absolutePath)
        .filter((entry) => !entry.startsWith("."));
    return files.length > 0;
};

/**
 * Check whether a config value is a non-empty string.
 *
 * @param {unknown} value - Candidate value.
 * @returns {boolean} True for non-empty strings.
 */
const hasText = (value) => {
    return typeof value === "string" && value.trim().length > 0;
};

/**
 * Detect local test-network path assumptions in credential fields.
 *
 * @param {string} value - Path value.
 * @returns {boolean} True when path points to test-network artifacts.
 */
const hasLocalTestNetworkPath = (value) => {
    if (!hasText(value)) {
        return false;
    }

    const normalized = value.replace(/\\/g, "/");
    return normalized.includes("test-network/organizations");
};

/**
 * Detect local docker host alias assumptions in endpoint values.
 *
 * @param {string} value - Peer endpoint value.
 * @returns {boolean} True when endpoint relies on host.docker.internal.
 */
const usesHostDockerInternal = (value) => {
    if (!hasText(value)) {
        return false;
    }

    return value.includes("host.docker.internal");
};

/**
 * Validate Fabric runtime config completeness and profile-specific constraints.
 *
 * In strict mode this throws to fail fast at startup.
 * In non-strict mode this logs and allows graceful fallback.
 *
 * @returns {boolean} True when Fabric runtime config is acceptable.
 */
const validateFabricRuntimeConfig = () => {
    const missingFields = [];
    const missingPaths = [];
    const localAssumptions = [];

    for (const [role, org] of Object.entries(config.fabric.organizations)) {
        if (!hasText(org.mspId)) {
            missingFields.push(`${role}.mspId`);
        }
        if (!hasText(org.peerEndpoint)) {
            missingFields.push(`${role}.peerEndpoint`);
        }
        if (!hasText(org.peerHostAlias)) {
            missingFields.push(`${role}.peerHostAlias`);
        }

        const pathFields = [
            ["tlsCertPath", org.tlsCertPath],
            ["certPath", org.certPath],
            ["keyPath", org.keyPath],
        ];

        for (const [field, inputPath] of pathFields) {
            if (!hasText(inputPath) || !isReadablePemPath(inputPath)) {
                missingPaths.push(`${role}.${field}`);
            }
        }

        if (config.fabric.profile !== "local") {
            if (usesHostDockerInternal(org.peerEndpoint)) {
                localAssumptions.push(`${role}.peerEndpoint`);
            }

            if (hasLocalTestNetworkPath(org.tlsCertPath)) {
                localAssumptions.push(`${role}.tlsCertPath`);
            }
            if (hasLocalTestNetworkPath(org.certPath)) {
                localAssumptions.push(`${role}.certPath`);
            }
            if (hasLocalTestNetworkPath(org.keyPath)) {
                localAssumptions.push(`${role}.keyPath`);
            }
        }
    }

    if (
        missingFields.length === 0 &&
        missingPaths.length === 0 &&
        localAssumptions.length === 0
    ) {
        return true;
    }

    const summary = {
        profile: config.fabric.profile,
        strictCredentials: config.fabric.strictCredentials,
        missingFields,
        missingPaths,
        localAssumptions,
    };

    if (config.fabric.strictCredentials) {
        throw new Error(
            `Invalid Fabric configuration for profile '${config.fabric.profile}'. Missing fields: ${missingFields.join(", ") || "none"}; missing paths: ${missingPaths.join(", ") || "none"}; local assumptions: ${localAssumptions.join(", ") || "none"}`,
        );
    }

    logger.warn({
        message:
            "Fabric is enabled but runtime configuration is incomplete; falling back to disabled ledger repository",
        ...summary,
    });
    return false;
};

/**
 * Validate that all Fabric organization credential paths are available.
 *
 * @returns {boolean} True when every required credential path is accessible.
 */
const hasAllFabricCredentials = () => {
    const requiredPaths = [];

    for (const [role, org] of Object.entries(config.fabric.organizations)) {
        requiredPaths.push([`${role}.tlsCertPath`, org.tlsCertPath]);
        requiredPaths.push([`${role}.certPath`, org.certPath]);
        requiredPaths.push([`${role}.keyPath`, org.keyPath]);
    }

    const missing = requiredPaths.filter(([, inputPath]) => {
        return !isReadablePemPath(inputPath);
    });

    if (missing.length === 0) {
        return true;
    }

    logger.warn({
        message:
            "Fabric is enabled but credential paths are unavailable; falling back to disabled ledger repository",
        missingPaths: missing.map(([field]) => field),
    });
    return false;
};

/**
 * Build and cache the ledger repository for application lifetime.
 */
export const createLedgerRepository = () => {
    if (!repositoryInstance) {
        if (!config.fabric.enabled) {
            repositoryInstance = new DisabledLedgerRepository();
            return repositoryInstance;
        }

        if (!validateFabricRuntimeConfig() || !hasAllFabricCredentials()) {
            repositoryInstance = new DisabledLedgerRepository();
            return repositoryInstance;
        }

        const gatewayClient = new FabricGatewayClient();
        repositoryInstance = new FabricLedgerRepository(gatewayClient);
    }

    return repositoryInstance;
};
