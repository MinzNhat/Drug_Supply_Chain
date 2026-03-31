import fs from "fs";
import path from "path";
import { config } from "../../config/index.js";
import { FabricGatewayClient } from "../../integrations/fabric/fabric-gateway.client.js";
import { logger } from "../../utils/logger/logger.js";
import { DisabledLedgerRepository } from "./disabled-ledger.repository.js";
import { FabricLedgerRepository } from "./fabric-ledger.repository.js";

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
        if (!config.fabric.enabled || !hasAllFabricCredentials()) {
            repositoryInstance = new DisabledLedgerRepository();
            return repositoryInstance;
        }

        const gatewayClient = new FabricGatewayClient();
        repositoryInstance = new FabricLedgerRepository(gatewayClient);
    }

    return repositoryInstance;
};
