import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
process.env.MONGO_DB = process.env.MONGO_DB ?? "drug_guard_test";
process.env.QR_SERVICE_URL =
    process.env.QR_SERVICE_URL ?? "http://localhost:8080";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

const { SupplyChainService } =
    await import("../../src/services/supply-chain/supply-chain.service.js");

/**
 * Integration tests for supply-chain service orchestration logic.
 */

/**
 * Create in-memory ledger repository stub with call tracking.
 *
 * @returns {Record<string, unknown>} Mock repository.
 */
const createMockLedgerRepository = () => {
    const calls = [];

    return {
        calls,
        async getBatchByDataHash(dataHash) {
            calls.push(["getBatchByDataHash", dataHash]);
            return {
                batchID: "BATCH_001",
            };
        },
        async verifyProtectedQr(actor, batchID, tokenDigest) {
            calls.push(["verifyProtectedQr", actor.role, batchID, tokenDigest]);
            return {
                matched: true,
            };
        },
        async recordProtectedQrVerification(
            actor,
            batchID,
            isAuthentic,
            confidenceScore,
            tokenDigest,
        ) {
            calls.push([
                "recordProtectedQrVerification",
                actor.role,
                batchID,
                isAuthentic,
                confidenceScore,
                tokenDigest,
            ]);
            return {
                verdict: "AUTHENTIC",
            };
        },
        async verifyBatch(actor, batchID) {
            calls.push(["verifyBatch", actor.role, batchID]);
            return {
                batch: {
                    batchID,
                    status: "ACTIVE",
                },
                safetyStatus: {
                    level: "OK",
                    code: "OK",
                    message: "Batch is active",
                },
            };
        },
        async shipBatch(actor, batchID, receiverMSP) {
            calls.push(["shipBatch", actor.role, batchID, receiverMSP]);
            return {
                batchID,
                transferStatus: "IN_TRANSIT",
                targetOwnerMSP: receiverMSP,
            };
        },
        async receiveBatch(actor, batchID) {
            calls.push(["receiveBatch", actor.role, batchID]);
            return {
                batchID,
                transferStatus: "NONE",
                ownerMSP: actor.mspId,
            };
        },
    };
};

test("integration: verify public scan flow", async () => {
    const repository = createMockLedgerRepository();
    const qrService = {
        async verify() {
            return {
                token: "protected-token",
                isAuthentic: true,
                confidenceScore: 0.93,
                decodedMeta: {
                    dataHash: "a1b2c3d4",
                    metadataSeries: "1234567890abcdef",
                    metadataIssued: "0011223344556677",
                    metadataExpiry: "8899aabbccddeeff",
                },
            };
        },
    };
    const aiVerifierService = {
        async verify() {
            return {
                enabled: true,
                code: "AI_ACCEPTED",
                accepted: true,
                confidenceScore: 0.88,
                verdict: "AUTHENTIC",
            };
        },
    };

    const service = new SupplyChainService(
        repository,
        qrService,
        aiVerifierService,
    );
    const result = await service.verifyProduct(Buffer.from("img"), "trace-1");

    assert.equal(result.decision.accepted, true);
    assert.equal(result.decision.code, "SCAN_ACCEPTED");
    assert.equal(result.aiVerification.code, "AI_ACCEPTED");

    const operationNames = repository.calls.map((item) => item[0]);
    assert.deepEqual(operationNames, [
        "getBatchByDataHash",
        "verifyProtectedQr",
        "recordProtectedQrVerification",
        "verifyBatch",
    ]);
});

test("integration: verify flow rejects when AI rejects packaging", async () => {
    const repository = createMockLedgerRepository();
    const qrService = {
        async verify() {
            return {
                token: "protected-token",
                isAuthentic: true,
                confidenceScore: 0.91,
                decodedMeta: {
                    dataHash: "a1b2c3d4",
                },
            };
        },
    };
    const aiVerifierService = {
        async verify() {
            return {
                enabled: true,
                code: "AI_REJECTED",
                accepted: false,
                confidenceScore: 0.23,
                verdict: "SUSPICIOUS",
            };
        },
    };

    const service = new SupplyChainService(
        repository,
        qrService,
        aiVerifierService,
    );

    await assert.rejects(
        () =>
            service.verifyProduct(Buffer.from("img"), "trace-2", {
                packagingImageBuffer: Buffer.from("packaging"),
            }),
        (error) => {
            assert.equal(error?.code, "SCAN_REJECTED");
            assert.equal(error?.details?.aiVerification?.code, "AI_REJECTED");
            return true;
        },
    );
});

test("integration: ownership transfer ship then receive", async () => {
    const repository = createMockLedgerRepository();
    const qrService = {
        async verify() {
            return {
                token: "ignored",
                isAuthentic: true,
                confidenceScore: 0.9,
                decodedMeta: {
                    dataHash: "a1b2c3d4",
                },
            };
        },
    };

    const service = new SupplyChainService(repository, qrService);

    const shipResult = await service.shipBatch("BATCH_001", "DistributorMSP", {
        role: "Manufacturer",
        mspId: "ManufacturerMSP",
        traceId: "trace-ship",
    });

    assert.equal(shipResult.transferStatus, "IN_TRANSIT");

    const receiveResult = await service.receiveBatch("BATCH_001", {
        role: "Distributor",
        mspId: "DistributorMSP",
        traceId: "trace-receive",
    });

    assert.equal(receiveResult.transferStatus, "NONE");
    assert.equal(receiveResult.ownerMSP, "DistributorMSP");
});
