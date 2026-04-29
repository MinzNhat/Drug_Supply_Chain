import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
process.env.MONGO_DB = process.env.MONGO_DB ?? "drug_guard_test";
process.env.QR_SERVICE_URL =
    process.env.QR_SERVICE_URL ?? "http://localhost:8080";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";
process.env.DOC_UPLOAD_ENABLED = process.env.DOC_UPLOAD_ENABLED ?? "true";

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
        async updateProtectedQrTokenPolicy(actor, batchID, input) {
            calls.push([
                "updateProtectedQrTokenPolicy",
                actor.role,
                batchID,
                input.actionType,
                input.tokenDigest,
                input.reason || "",
                input.note || "",
            ]);

            return {
                batchID,
                tokenDigest: input.tokenDigest,
                actionType: input.actionType,
                policyStatus:
                    input.actionType === "RESTORE"
                        ? "ACTIVE"
                        : input.actionType === "BLOCKLIST"
                          ? "BLOCKLISTED"
                          : "REVOKED",
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
        async shipBatch(actor, batchID, receiverMSP, receiverUnitId = "") {
            calls.push([
                "shipBatch",
                actor.role,
                batchID,
                receiverMSP,
                actor.distributorUnitId || "",
                receiverUnitId,
            ]);
            return {
                batchID,
                transferStatus: "IN_TRANSIT",
                targetOwnerMSP: receiverMSP,
                targetOwnerUnitId: receiverUnitId,
            };
        },
        async receiveBatch(actor, batchID) {
            calls.push([
                "receiveBatch",
                actor.role,
                batchID,
                actor.distributorUnitId || "",
            ]);
            return {
                batchID,
                transferStatus: "NONE",
                ownerMSP: actor.mspId,
                ownerUnitId: actor.distributorUnitId || "",
            };
        },
        async confirmDeliveredToConsumption(actor, batchID) {
            calls.push([
                "confirmDeliveredToConsumption",
                actor.role,
                batchID,
                actor.mspId,
            ]);
            return {
                batchID,
                consumptionConfirmed: true,
                consumptionConfirmedByMSP: actor.mspId,
            };
        },
        async updateDocument(actor, batchID, docType, newCID) {
            calls.push(["updateDocument", actor.role, batchID, docType, newCID]);
            return {
                batchID,
                docType,
                cid: newCID,
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

test("integration: regulator can apply protected QR token policy", async () => {
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

    const result = await service.updateProtectedQrTokenPolicy(
        "BATCH_001",
        {
            actionType: "REVOKE",
            tokenDigest: "a".repeat(64),
            reason: "counterfeit signal confirmed",
            note: "escalated by regulator review",
        },
        {
            role: "Regulator",
            mspId: "RegulatorMSP",
            traceId: "trace-policy",
        },
    );

    assert.equal(result.actionType, "REVOKE");
    assert.equal(result.policyStatus, "REVOKED");

    assert.deepEqual(repository.calls[0], [
        "updateProtectedQrTokenPolicy",
        "Regulator",
        "BATCH_001",
        "REVOKE",
        "a".repeat(64),
        "counterfeit signal confirmed",
        "escalated by regulator review",
    ]);
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

    const shipResult = await service.shipBatch(
        "BATCH_001",
        {
            receiverMSP: "DistributorMSP",
            targetDistributorUnitId: "",
        },
        {
            role: "Manufacturer",
            mspId: "ManufacturerMSP",
            traceId: "trace-ship",
        },
    );

    assert.equal(shipResult.transferStatus, "IN_TRANSIT");

    const receiveResult = await service.receiveBatch("BATCH_001", {
        role: "Distributor",
        mspId: "DistributorMSP",
        traceId: "trace-receive",
    });

    assert.equal(receiveResult.transferStatus, "NONE");
    assert.equal(receiveResult.ownerMSP, "DistributorMSP");
});

test("integration: alert side effects are non-blocking when archive/sink fails", async () => {
    const repository = createMockLedgerRepository();
    const qrService = {
        async verify() {
            return {
                token: "protected-token",
                isAuthentic: true,
                confidenceScore: 0.93,
                decodedMeta: {
                    dataHash: "a1b2c3d4",
                },
            };
        },
    };

    const archiveRepository = {
        async save() {
            throw new Error("archive unavailable");
        },
    };

    const deliveryService = {
        async dispatchAlert() {
            throw new Error("sink unavailable");
        },
    };

    const service = new SupplyChainService(
        repository,
        qrService,
        null,
        archiveRepository,
        deliveryService,
    );

    const result = await service.verifyProduct(
        Buffer.from("img"),
        "trace-non-blocking",
    );

    assert.equal(result.decision.accepted, true);
    assert.equal(result.decision.code, "SCAN_ACCEPTED");
});

test("integration: verify rejects before consumption delivery confirmation", async () => {
    const repository = createMockLedgerRepository();
    repository.verifyBatch = async (actor, batchID) => {
        repository.calls.push(["verifyBatch", actor.role, batchID]);
        return {
            batch: {
                batchID,
                status: "ACTIVE",
                consumptionConfirmed: false,
            },
            safetyStatus: {
                level: "DANGER",
                code: "DANGER_UNCONFIRMED_CONSUMPTION",
                message:
                    "Batch has not been confirmed as delivered to consumption point",
            },
        };
    };

    const qrService = {
        async verify() {
            return {
                token: "protected-token",
                isAuthentic: true,
                confidenceScore: 0.93,
                decodedMeta: {
                    dataHash: "a1b2c3d4",
                },
            };
        },
    };

    const service = new SupplyChainService(repository, qrService);

    await assert.rejects(
        () => service.verifyProduct(Buffer.from("img"), "trace-unconfirmed"),
        (error) => {
            assert.equal(error?.code, "SCAN_REJECTED");
            assert.equal(
                error?.details?.safetyStatus?.code,
                "DANGER_UNCONFIRMED_CONSUMPTION",
            );
            return true;
        },
    );
});

test("integration: distributor can confirm delivery to consumption", async () => {
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
    const result = await service.confirmDeliveredToConsumption("BATCH_001", {
        role: "Distributor",
        mspId: "DistributorMSP",
        traceId: "trace-consumption-confirm",
    });

    assert.equal(result.batchID, "BATCH_001");
    assert.equal(result.consumptionConfirmed, true);
    assert.deepEqual(repository.calls[0], [
        "confirmDeliveredToConsumption",
        "Distributor",
        "BATCH_001",
        "DistributorMSP",
    ]);
});

test("integration: distributor transfer requires target unit and rejects same-unit", async () => {
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

    await assert.rejects(
        () =>
            service.shipBatch(
                "BATCH_001",
                {
                    receiverMSP: "DistributorMSP",
                },
                {
                    role: "Distributor",
                    mspId: "DistributorMSP",
                    distributorUnitId: "dist-unit-a",
                    traceId: "trace-dist-missing-target",
                },
            ),
        (error) => {
            assert.equal(error?.status, 400);
            assert.equal(error?.code, "TARGET_DISTRIBUTOR_UNIT_REQUIRED");
            return true;
        },
    );

    await assert.rejects(
        () =>
            service.shipBatch(
                "BATCH_001",
                {
                    receiverMSP: "DistributorMSP",
                    targetDistributorUnitId: "dist-unit-a",
                },
                {
                    role: "Distributor",
                    mspId: "DistributorMSP",
                    distributorUnitId: "dist-unit-a",
                    traceId: "trace-dist-same-unit",
                },
            ),
        (error) => {
            assert.equal(error?.status, 409);
            assert.equal(
                error?.code,
                "SAME_DISTRIBUTOR_UNIT_TRANSFER_NOT_ALLOWED",
            );
            return true;
        },
    );
});

test("integration: distributor cross-unit transfer propagates unit identities", async () => {
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

    const shipResult = await service.shipBatch(
        "BATCH_001",
        {
            receiverMSP: "DistributorMSP",
            targetDistributorUnitId: "dist-unit-b",
        },
        {
            role: "Distributor",
            mspId: "DistributorMSP",
            distributorUnitId: "dist-unit-a",
            traceId: "trace-dist-cross-ship",
        },
    );

    assert.equal(shipResult.transferStatus, "IN_TRANSIT");
    assert.equal(shipResult.targetOwnerUnitId, "dist-unit-b");

    const receiveResult = await service.receiveBatch("BATCH_001", {
        role: "Distributor",
        mspId: "DistributorMSP",
        distributorUnitId: "dist-unit-b",
        traceId: "trace-dist-cross-receive",
    });

    assert.equal(receiveResult.transferStatus, "NONE");
    assert.equal(receiveResult.ownerUnitId, "dist-unit-b");

    assert.deepEqual(repository.calls[0], [
        "shipBatch",
        "Distributor",
        "BATCH_001",
        "DistributorMSP",
        "dist-unit-a",
        "dist-unit-b",
    ]);
    assert.deepEqual(repository.calls[1], [
        "receiveBatch",
        "Distributor",
        "BATCH_001",
        "dist-unit-b",
    ]);
});

test("integration: update document keeps legacy CID mode", async () => {
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

    const artifacts = [];
    const artifactRepository = {
        async save(payload) {
            artifacts.push(payload);
            return payload;
        },
    };

    const service = new SupplyChainService(
        repository,
        qrService,
        null,
        null,
        null,
        null,
        artifactRepository,
    );

    const result = await service.updateDocument(
        "BATCH_001",
        {
            docType: "qualityCert",
            newCID: "QmLegacyCid987654321",
        },
        {
            id: "u-1",
            role: "Manufacturer",
            mspId: "ManufacturerMSP",
            traceId: "trace-legacy-cid",
        },
    );

    assert.equal(result.cid, "QmLegacyCid987654321");
    assert.equal(result.upload.source, "manual-cid");
    assert.equal(result.upload.provider, "manual");
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].ledgerUpdated, true);
    assert.equal(artifacts[0].source, "manual-cid");
});

test("integration: update document supports direct upload mode", async () => {
    process.env.DOC_UPLOAD_ENABLED = "true";

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

    const artifacts = [];
    const artifactRepository = {
        async save(payload) {
            artifacts.push(payload);
            return payload;
        },
    };

    const documentStorageAdapter = {
        async uploadDocument() {
            return {
                cid: "bafybeigdyrzt5mockupload1234567890",
                provider: "mock",
                pinStatus: "pinned",
                digestSha256: "a".repeat(64),
                sizeBytes: 6,
                mediaType: "application/pdf",
            };
        },
    };

    const service = new SupplyChainService(
        repository,
        qrService,
        null,
        null,
        null,
        documentStorageAdapter,
        artifactRepository,
    );

    const result = await service.updateDocument(
        "BATCH_002",
        {
            docType: "qualityCert",
            file: {
                buffer: Buffer.from("sample"),
                mediaType: "application/pdf",
                sizeBytes: 6,
                fileName: "quality-cert.pdf",
            },
        },
        {
            id: "u-2",
            role: "Manufacturer",
            mspId: "ManufacturerMSP",
            traceId: "trace-upload-mode",
        },
    );

    assert.equal(result.cid, "bafybeigdyrzt5mockupload1234567890");
    assert.equal(result.upload.source, "direct-upload");
    assert.equal(result.upload.provider, "mock");
    assert.equal(result.upload.pinStatus, "pinned");
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].ledgerUpdated, true);
    assert.equal(artifacts[0].digestSha256.length, 64);
});
