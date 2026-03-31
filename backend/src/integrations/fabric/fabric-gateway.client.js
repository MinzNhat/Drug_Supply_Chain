import grpc from "@grpc/grpc-js";
import { connect, hash, signers } from "@hyperledger/fabric-gateway";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { config } from "../../config/index.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { logger } from "../../utils/logger/logger.js";
import {
    isRetriableFabricError,
    translateFabricError,
} from "./fabric-error-translator.js";

/**
 * Sleep helper used by retry backoff.
 *
 * @param {number} ms - Delay in milliseconds.
 * @returns {Promise<void>} Resolves after delay.
 */
const sleep = async (ms) => {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

/**
 * Resolve relative Fabric credential path from current working directory.
 *
 * @param {string} filePath - Relative or absolute file path.
 * @returns {string} Absolute path or empty string when input is missing.
 */
const resolvePath = (filePath) => {
    if (!filePath) {
        return "";
    }
    return path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);
};

/**
 * Read one PEM certificate/key from file path or first entry in directory.
 *
 * @param {string} inputPath - Certificate/key file or directory path.
 * @param {string} fieldName - Config field name used for error context.
 * @returns {Promise<Buffer>} PEM file content.
 */
const readPem = async (inputPath, fieldName) => {
    const absolutePath = resolvePath(inputPath);
    if (!absolutePath) {
        throw new HttpException(
            500,
            "FABRIC_CONFIG_ERROR",
            `Missing Fabric path for ${fieldName}`,
        );
    }

    const stat = await fs.stat(absolutePath);
    if (!stat.isDirectory()) {
        return fs.readFile(absolutePath);
    }

    const entries = await fs.readdir(absolutePath);
    const firstFile = entries.find((entry) => !entry.startsWith("."));
    if (!firstFile) {
        throw new HttpException(
            500,
            "FABRIC_CONFIG_ERROR",
            `No files found in Fabric directory ${absolutePath}`,
        );
    }

    return fs.readFile(path.join(absolutePath, firstFile));
};

/**
 * Validate and normalize actor role accepted by Fabric gateway sessions.
 *
 * @param {{ role?: string }} actor - Actor context attached to request.
 * @returns {"Manufacturer" | "Distributor" | "Regulator"} Canonical role.
 */
const normalizeRole = (actor) => {
    if (!actor?.role) {
        throw new HttpException(401, "UNAUTHORIZED", "Missing actor role");
    }

    if (!["Manufacturer", "Distributor", "Regulator"].includes(actor.role)) {
        throw new HttpException(
            400,
            "INVALID_ACTOR_ROLE",
            "Unsupported actor role",
            {
                role: actor.role,
            },
        );
    }

    return actor.role;
};

/**
 * Execute operation with exponential backoff retry.
 *
 * @param {{ runner: (attempt: number) => Promise<unknown>, maxAttempts: number, baseDelayMs: number, maxDelayMs: number, shouldRetry: (error: unknown) => boolean }} options
 * @returns {Promise<unknown>} Runner result.
 */
const withRetry = async ({
    runner,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    shouldRetry,
}) => {
    let attempt = 0;

    while (attempt < maxAttempts) {
        attempt += 1;
        try {
            return await runner(attempt);
        } catch (error) {
            const canRetry = attempt < maxAttempts && shouldRetry(error);
            if (!canRetry) {
                throw error;
            }

            const delayMs = Math.min(
                maxDelayMs,
                baseDelayMs * 2 ** (attempt - 1),
            );
            await sleep(delayMs);
        }
    }

    throw new Error("unreachable");
};

/**
 * Fabric Gateway wrapper with submit/evaluate split and retry policies.
 */
export class FabricGatewayClient {
    constructor() {
        this.sessions = new Map();
    }

    /**
     * Evaluate a read-only chaincode transaction.
     */
    async evaluate(actor, transactionName, args, traceId) {
        return this.#invoke(actor, "evaluate", transactionName, args, traceId);
    }

    /**
     * Submit a write transaction to chaincode.
     */
    async submit(actor, transactionName, args, traceId) {
        return this.#invoke(actor, "submit", transactionName, args, traceId);
    }

    /**
     * Close all cached Fabric sessions and underlying gRPC resources.
     */
    async close() {
        for (const session of this.sessions.values()) {
            try {
                session.gateway.close();
            } catch (error) {
                logger.warn({
                    message: "Failed closing Fabric gateway",
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }

            try {
                session.client.close();
            } catch (error) {
                logger.warn({
                    message: "Failed closing Fabric gRPC client",
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }

        this.sessions.clear();
    }

    /**
     * Invoke Fabric transaction with mode-specific retry and standardized error translation.
     */
    async #invoke(actor, mode, transactionName, args = [], traceId = "") {
        if (!config.fabric.enabled) {
            throw new HttpException(
                503,
                "FABRIC_DISABLED",
                "Fabric integration is disabled",
            );
        }

        const role = normalizeRole(actor);
        const session = await this.#getSession(role);

        const retryConfig =
            mode === "evaluate"
                ? config.fabric.evaluateRetry
                : config.fabric.submitRetry;

        const executeTransaction = async () => {
            if (mode === "evaluate") {
                return session.contract.evaluateTransaction(
                    transactionName,
                    ...args,
                );
            }
            return session.contract.submitTransaction(transactionName, ...args);
        };

        try {
            return await withRetry({
                runner: executeTransaction,
                maxAttempts: Math.max(1, retryConfig.maxAttempts),
                baseDelayMs: Math.max(10, retryConfig.baseDelayMs),
                maxDelayMs: Math.max(50, retryConfig.maxDelayMs),
                shouldRetry: isRetriableFabricError,
            });
        } catch (error) {
            throw translateFabricError(error, {
                transactionName,
                mode,
                traceId,
            });
        }
    }

    /**
     * Get or lazily create one Fabric gateway session per actor role.
     */
    async #getSession(role) {
        if (this.sessions.has(role)) {
            return this.sessions.get(role);
        }

        const org = config.fabric.organizations[role];
        if (!org) {
            throw new HttpException(
                500,
                "FABRIC_CONFIG_ERROR",
                `Missing Fabric org config for role ${role}`,
            );
        }

        const [tlsCertPem, certPem, keyPem] = await Promise.all([
            readPem(org.tlsCertPath, `${role}.tlsCertPath`),
            readPem(org.certPath, `${role}.certPath`),
            readPem(org.keyPath, `${role}.keyPath`),
        ]);

        const tlsCredentials = grpc.credentials.createSsl(tlsCertPem);
        const client = new grpc.Client(org.peerEndpoint, tlsCredentials, {
            "grpc.ssl_target_name_override": org.peerHostAlias,
        });

        const identity = {
            mspId: org.mspId,
            credentials: certPem,
        };

        const privateKey = crypto.createPrivateKey(keyPem);
        const signer = signers.newPrivateKeySigner(privateKey);

        const gateway = connect({
            client,
            identity,
            signer,
            hash: hash.sha256,
            evaluateOptions: () => ({
                deadline: Date.now() + config.fabric.evaluateTimeoutMs,
            }),
            endorseOptions: () => ({
                deadline: Date.now() + config.fabric.submitTimeoutMs,
            }),
            submitOptions: () => ({
                deadline: Date.now() + config.fabric.submitTimeoutMs,
            }),
            commitStatusOptions: () => ({
                deadline: Date.now() + config.fabric.commitStatusTimeoutMs,
            }),
        });

        const network = gateway.getNetwork(config.fabric.channelName);
        const contract = network.getContract(config.fabric.chaincodeName);

        const session = {
            client,
            gateway,
            contract,
        };

        this.sessions.set(role, session);
        return session;
    }
}
