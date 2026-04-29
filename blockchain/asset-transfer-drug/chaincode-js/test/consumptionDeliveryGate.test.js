"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const batchService = require("../lib/services/batchService");

function createMockContext(mspId, state, events) {
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
            async setEvent(name, payload) {
                events.push({
                    name,
                    payload: JSON.parse(payload.toString("utf8")),
                });
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

function seedBatch(state, overrides = {}) {
    state.set(
        "BATCH_001",
        JSON.stringify({
            docType: "batch",
            batchID: "BATCH_001",
            drugName: "Drug",
            manufacturerMSP: "ManufacturerMSP",
            ownerMSP: "DistributorMSP",
            expiryDate: "2029-12-31T00:00:00.000Z",
            totalSupply: 100,
            scanCount: 0,
            warningThreshold: 105,
            suspiciousThreshold: 110,
            status: "ACTIVE",
            targetOwnerMSP: "",
            transferStatus: "NONE",
            transferHistory: [],
            ownerUnitId: "dist-unit-a",
            targetOwnerUnitId: "",
            consumptionConfirmed: false,
            consumptionConfirmedAt: "",
            consumptionConfirmedByMSP: "",
            protected_qr: {
                data_hash: "",
                metadata_series: "",
                metadata_issued: "",
                metadata_expiry: "",
                token_digest: "",
                history: [],
            },
            ...overrides,
        }),
    );
}

test("chaincode: verify before consumption confirmation proceeds with GovMonitor warning", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state);

    const ctx = createMockContext("RegulatorMSP", state, events);
    const before = JSON.parse(state.get("BATCH_001"));

    const verifyResult = JSON.parse(
        await batchService.verifyBatch(ctx, "BATCH_001"),
    );

    // Gate is now a warning — scan still proceeds.
    assert.equal(verifyResult.verificationResult, "SAFE");
    assert.equal(verifyResult.scanCount, before.scanCount + 1);

    const after = JSON.parse(state.get("BATCH_001"));
    assert.equal(after.scanCount, 1);
    assert.equal(events.some((item) => item.name === "GovMonitor"), true);
    assert.equal(events.some((item) => item.name === "PublicAlert"), false);
});

test("chaincode: distributor owner confirms consumption then verify increments scan", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state);

    const distributorCtx = createMockContext("DistributorMSP", state, events);
    const confirmed = JSON.parse(
        await batchService.confirmDeliveredToConsumption(
            distributorCtx,
            "BATCH_001",
        ),
    );

    assert.equal(confirmed.consumptionConfirmed, true);
    assert.equal(confirmed.consumptionConfirmedByMSP, "DistributorMSP");
    assert.equal(Boolean(confirmed.consumptionConfirmedAt), true);

    const verifierCtx = createMockContext("RegulatorMSP", state, events);
    const verifyResult = JSON.parse(
        await batchService.verifyBatch(verifierCtx, "BATCH_001"),
    );

    assert.equal(verifyResult.verificationResult, "SAFE");
    assert.equal(verifyResult.scanCount, 1);
    assert.equal(
        events.some((item) => item.name === "ConsumptionDeliveryConfirmed"),
        true,
    );
});

test("chaincode: non-distributor cannot confirm consumption delivery", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state);

    const manufacturerCtx = createMockContext("ManufacturerMSP", state, events);

    await assert.rejects(
        () =>
            batchService.confirmDeliveredToConsumption(
                manufacturerCtx,
                "BATCH_001",
            ),
        /Only DistributorMSP can confirm delivery to consumption/,
    );
});
