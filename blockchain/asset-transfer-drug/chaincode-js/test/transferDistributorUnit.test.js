"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const transferService = require("../lib/services/transferService");

function createMockContext(mspId, state) {
    return {
        clientIdentity: {
            getMSPID: () => mspId,
            getID: () => `x509::/OU=${mspId}/CN=test`,
        },
        stub: {
            async getState(key) {
                const value = state.get(key);
                return value ? Buffer.from(value) : Buffer.alloc(0);
            },
            async putState(key, valueBuffer) {
                state.set(key, valueBuffer.toString("utf8"));
            },
            getTxTimestamp() {
                return {
                    seconds: Math.floor(Date.now() / 1000),
                    nanos: 0,
                };
            },
        },
    };
}

function seedDistributorOwnedBatch(state) {
    state.set(
        "BATCH_001",
        JSON.stringify({
            docType: "batch",
            batchID: "BATCH_001",
            ownerMSP: "DistributorMSP",
            ownerUnitId: "dist-unit-a",
            targetOwnerMSP: "",
            targetOwnerUnitId: "",
            transferStatus: "NONE",
            transferHistory: [],
            status: "ACTIVE",
            protected_qr: {
                data_hash: "",
                metadata_series: "",
                metadata_issued: "",
                metadata_expiry: "",
                token_digest: "",
                history: [],
            },
        }),
    );
}

test("chaincode: distributor cross-unit ship and receive succeeds", async () => {
    const state = new Map();
    seedDistributorOwnedBatch(state);

    const shipCtx = createMockContext("DistributorMSP", state);
    const shipped = JSON.parse(
        await transferService.shipBatch(
            shipCtx,
            "BATCH_001",
            "DistributorMSP",
            "dist-unit-a",
            "dist-unit-b",
        ),
    );

    assert.equal(shipped.transferStatus, "IN_TRANSIT");
    assert.equal(shipped.targetOwnerMSP, "DistributorMSP");
    assert.equal(shipped.targetOwnerUnitId, "dist-unit-b");

    const receiveCtx = createMockContext("DistributorMSP", state);
    const received = JSON.parse(
        await transferService.receiveBatch(receiveCtx, "BATCH_001", "dist-unit-b"),
    );

    assert.equal(received.transferStatus, "NONE");
    assert.equal(received.ownerMSP, "DistributorMSP");
    assert.equal(received.ownerUnitId, "dist-unit-b");
    assert.equal(received.targetOwnerMSP, "");
    assert.equal(received.targetOwnerUnitId, "");
    assert.equal(received.transferHistory.length, 1);
    assert.equal(received.transferHistory[0].fromUnitId, "dist-unit-a");
    assert.equal(received.transferHistory[0].toUnitId, "dist-unit-b");
});

test("chaincode: distributor same-unit transfer is rejected", async () => {
    const state = new Map();
    seedDistributorOwnedBatch(state);

    const ctx = createMockContext("DistributorMSP", state);

    await assert.rejects(
        () =>
            transferService.shipBatch(
                ctx,
                "BATCH_001",
                "DistributorMSP",
                "dist-unit-a",
                "dist-unit-a",
            ),
        /receiver distributor unit must be different from current owner unit/,
    );
});

test("chaincode: distributor transfer requires receiver unit identity", async () => {
    const state = new Map();
    seedDistributorOwnedBatch(state);

    const ctx = createMockContext("DistributorMSP", state);

    await assert.rejects(
        () =>
            transferService.shipBatch(
                ctx,
                "BATCH_001",
                "DistributorMSP",
                "dist-unit-a",
                "",
            ),
        /receiver distributor unit identity is required/,
    );
});

test("chaincode: receive rejects mismatched target distributor unit", async () => {
    const state = new Map();
    seedDistributorOwnedBatch(state);

    const shipCtx = createMockContext("DistributorMSP", state);
    await transferService.shipBatch(
        shipCtx,
        "BATCH_001",
        "DistributorMSP",
        "dist-unit-a",
        "dist-unit-b",
    );

    const receiveCtx = createMockContext("DistributorMSP", state);
    await assert.rejects(
        () => transferService.receiveBatch(receiveCtx, "BATCH_001", "dist-unit-c"),
        /does not match transfer target unit/,
    );
});
