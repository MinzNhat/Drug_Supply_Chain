import grpc from "@grpc/grpc-js";
import { connect, hash, signers } from "@hyperledger/fabric-gateway";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { config } from "../../config/index.js";
import { recordFabricIdentityLink } from "../../repositories/fabric/fabric-identity-link.repository.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { logger } from "../../utils/logger/logger.js";
import { resolveFabricIdentityReference } from "./fabric-identity-resolver.js";
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

        const identityRef = resolveFabricIdentityReference(actor, config.fabric);
        const session = await this.#getSession(identityRef);

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
            const result = await withRetry({
                runner: executeTransaction,
                maxAttempts: Math.max(1, retryConfig.maxAttempts),
                baseDelayMs: Math.max(10, retryConfig.baseDelayMs),
                maxDelayMs: Math.max(50, retryConfig.maxDelayMs),
                shouldRetry: isRetriableFabricError,
            });

            await recordFabricIdentityLink({
                traceId,
                actor: {
                    userId: actor?.id || actor?.userId || "",
                    role: actor?.role || "",
                    mspId: actor?.mspId || "",
                    distributorUnitId: actor?.distributorUnitId || "",
                },
                fabricIdentity: {
                    sessionKey: identityRef.sessionKey,
                    label: identityRef.identityLabel,
                    source: identityRef.source,
                    role: identityRef.role,
                    mspId: identityRef.mspId,
                    peerEndpoint: identityRef.peerEndpoint,
                    peerHostAlias: identityRef.peerHostAlias,
                    certPath: identityRef.certPath,
                    keyPath: identityRef.keyPath,
                },
                network: {
                    channelName: config.fabric.channelName,
                    chaincodeName: config.fabric.chaincodeName,
                },
                transaction: {
                    name: transactionName,
                    mode,
                    status: "SUCCESS",
                    errorCode: "",
                    errorMessage: "",
                },
                occurredAt: new Date(),
            });

            return result;
        } catch (error) {
            const translated = translateFabricError(error, {
                transactionName,
                mode,
                traceId,
            });

            await recordFabricIdentityLink({
                traceId,
                actor: {
                    userId: actor?.id || actor?.userId || "",
                    role: actor?.role || "",
                    mspId: actor?.mspId || "",
                    distributorUnitId: actor?.distributorUnitId || "",
                },
                fabricIdentity: {
                    sessionKey: identityRef.sessionKey,
                    label: identityRef.identityLabel,
                    source: identityRef.source,
                    role: identityRef.role,
                    mspId: identityRef.mspId,
                    peerEndpoint: identityRef.peerEndpoint,
                    peerHostAlias: identityRef.peerHostAlias,
                    certPath: identityRef.certPath,
                    keyPath: identityRef.keyPath,
                },
                network: {
                    channelName: config.fabric.channelName,
                    chaincodeName: config.fabric.chaincodeName,
                },
                transaction: {
                    name: transactionName,
                    mode,
                    status: "FAILED",
                    errorCode: translated.code || "",
                    errorMessage: translated.message || "",
                },
                occurredAt: new Date(),
            });

            throw translated;
        }
    }

    /**
     * Get or lazily create one Fabric gateway session per resolved identity reference.
     */
    async #getSession(identityRef) {
        if (this.sessions.has(identityRef.sessionKey)) {
            return this.sessions.get(identityRef.sessionKey);
        }

        if (!identityRef?.certPath || !identityRef?.keyPath) {
            throw new HttpException(
                500,
                "FABRIC_CONFIG_ERROR",
                `Missing Fabric identity credentials for ${identityRef?.identityLabel || "unknown identity"}`,
            );
        }

        const [tlsCertPem, certPem, keyPem] = await Promise.all([
            readPem(
                identityRef.tlsCertPath,
                `${identityRef.identityLabel}.tlsCertPath`,
            ),
            readPem(identityRef.certPath, `${identityRef.identityLabel}.certPath`),
            readPem(identityRef.keyPath, `${identityRef.identityLabel}.keyPath`),
        ]);

        const tlsCredentials = grpc.credentials.createSsl(tlsCertPem);
        const client = new grpc.Client(identityRef.peerEndpoint, tlsCredentials, {
            "grpc.ssl_target_name_override": identityRef.peerHostAlias,
        });

        const identity = {
            mspId: identityRef.mspId,
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

        this.sessions.set(identityRef.sessionKey, session);
        return session;
    }
}
