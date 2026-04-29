"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const recallService = require("../lib/services/recallService");

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

function seedBatch(state, status = "ACTIVE") {
    state.set(
        "BATCH_001",
        JSON.stringify({
            docType: "batch",
            batchID: "BATCH_001",
            ownerMSP: "ManufacturerMSP",
            manufacturerMSP: "ManufacturerMSP",
            status,
            scanCount: 0,
            warningThreshold: 10,
            suspiciousThreshold: 12,
            transferStatus: "NONE",
            transferHistory: [],
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

test("chaincode: regulator can emergency recall batch", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state, "ACTIVE");

    const regulatorCtx = createMockContext("RegulatorMSP", state, events);
    const recalled = JSON.parse(
        await recallService.emergencyRecall(regulatorCtx, "BATCH_001"),
    );

    assert.equal(recalled.status, "RECALLED");

    const persisted = JSON.parse(state.get("BATCH_001"));
    assert.equal(persisted.status, "RECALLED");

    assert.equal(events.length, 1);
    assert.equal(events[0].name, "RecallAlert");
    assert.equal(events[0].payload.batch_id, "BATCH_001");
    assert.equal(events[0].payload.status, "RECALLED");
    assert.equal(events[0].payload.recalled_by, "RegulatorMSP");
});

test("chaincode: non-regulator cannot emergency recall", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state, "ACTIVE");

    const manufacturerCtx = createMockContext("ManufacturerMSP", state, events);

    await assert.rejects(
        () => recallService.emergencyRecall(manufacturerCtx, "BATCH_001"),
        /Only RegulatorMSP can initiate an emergency recall/,
    );

    const persisted = JSON.parse(state.get("BATCH_001"));
    assert.equal(persisted.status, "ACTIVE");
    assert.equal(events.length, 0);
});

test("chaincode: emergency recall is idempotent for recalled batch", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state, "RECALLED");

    const regulatorCtx = createMockContext("RegulatorMSP", state, events);
    const recalled = JSON.parse(
        await recallService.emergencyRecall(regulatorCtx, "BATCH_001"),
    );

    assert.equal(recalled.status, "RECALLED");
    assert.equal(events.length, 1);
    assert.equal(events[0].name, "RecallAlert");
});
