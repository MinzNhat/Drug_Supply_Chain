"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const protectedQrService = require("../lib/services/protectedQrService");

function createMockContext(mspId, identityId, state) {
    return {
        clientIdentity: {
            getMSPID: () => mspId,
            getID: () => identityId,
        },
        stub: {
            async getState(key) {
                const value = state.get(key);
                return value ? Buffer.from(value) : Buffer.alloc(0);
            },
            async putState(key, valueBuffer) {
                state.set(key, valueBuffer.toString("utf8"));
            },
            async setEvent() {
                return undefined;
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

function seedBatch(state, ownerMSP) {
    state.set(
        "BATCH_001",
        JSON.stringify({
            docType: "batch",
            batchID: "BATCH_001",
            ownerMSP,
            manufacturerMSP: "ManufacturerMSP",
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

test("chaincode: distributor owner cannot bind protected QR", async () => {
    const state = new Map();
    seedBatch(state, "DistributorMSP");

    const distributorCtx = createMockContext(
        "DistributorMSP",
        "x509::/OU=distributor/CN=unit-01",
        state,
    );

    await assert.rejects(
        () =>
            protectedQrService.bindProtectedQR(
                distributorCtx,
                "BATCH_001",
                "a1b2c3d4",
                "0011223344556677",
                "8899aabbccddeeff",
                "1021324354657687",
                "a".repeat(64),
            ),
        /Only ManufacturerMSP can bind protected QR metadata/,
    );
});

test("chaincode: manufacturer owner can bind protected QR", async () => {
    const state = new Map();
    seedBatch(state, "ManufacturerMSP");

    const manufacturerCtx = createMockContext(
        "ManufacturerMSP",
        "x509::/OU=manufacturer/CN=admin",
        state,
    );

    const updated = JSON.parse(
        await protectedQrService.bindProtectedQR(
            manufacturerCtx,
            "BATCH_001",
            "a1b2c3d4",
            "0011223344556677",
            "8899aabbccddeeff",
            "1021324354657687",
            "a".repeat(64),
        ),
    );

    assert.equal(updated.token_digest, "a".repeat(64));
    assert.equal(typeof updated.last_bound_at, "string");
});
