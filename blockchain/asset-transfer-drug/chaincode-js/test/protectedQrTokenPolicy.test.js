"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const protectedQrService = require("../lib/services/protectedQrService");

function createMockContext(mspId, identityId, state, events) {
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
            async setEvent(name, payload) {
                events.push({ name, payload: payload.toString("utf8") });
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
    const batch = {
        docType: "batch",
        batchID: "BATCH_001",
        ownerMSP: "ManufacturerMSP",
        manufacturerMSP: "ManufacturerMSP",
        status: "ACTIVE",
        scanCount: 0,
        warningThreshold: 10,
        suspiciousThreshold: 12,
        protected_qr: {
            data_hash: "a1b2c3d4",
            metadata_series: "1234567890abcdef",
            metadata_issued: "0011223344556677",
            metadata_expiry: "8899aabbccddeeff",
            token_digest: "a".repeat(64),
            verification_policy: {
                authentic_threshold: 0.7,
                fake_threshold: 0.55,
            },
            verification_history: [],
            token_policy: {
                status: "ACTIVE",
                token_digest: "a".repeat(64),
                reason: "",
                note: "",
                action_type: "NONE",
                action_at: "",
                action_by: "",
                action_by_msp: "",
                history: [],
            },
        },
        ...overrides,
    };

    state.set("BATCH_001", JSON.stringify(batch));
}

test("chaincode: revoke marks token blocked and verify returns policy-blocked", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state);

    const regulatorCtx = createMockContext(
        "RegulatorMSP",
        "x509::/OU=regulator/CN=admin",
        state,
        events,
    );

    const revoked = JSON.parse(
        await protectedQrService.updateProtectedQRTokenPolicy(
            regulatorCtx,
            "BATCH_001",
            "REVOKE",
            "a".repeat(64),
            "counterfeit confirmed",
            "incident-42",
        ),
    );

    assert.equal(revoked.policyStatus, "REVOKED");
    assert.equal(revoked.batchStatus, "SUSPICIOUS");

    const verifyResult = JSON.parse(
        await protectedQrService.verifyProtectedQR(
            regulatorCtx,
            "BATCH_001",
            "a".repeat(64),
        ),
    );

    assert.equal(verifyResult.digest_matched, true);
    assert.equal(verifyResult.policy_blocked, true);
    assert.equal(verifyResult.matched, false);
    assert.equal(verifyResult.policy_status, "REVOKED");

    assert.equal(events.some((item) => item.name === "ProtectedQRTokenPolicyUpdated"), true);
});

test("chaincode: blocklist then restore transitions back to ACTIVE", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state);

    const regulatorCtx = createMockContext(
        "RegulatorMSP",
        "x509::/OU=regulator/CN=org1-admin",
        state,
        events,
    );

    const blocked = JSON.parse(
        await protectedQrService.updateProtectedQRTokenPolicy(
            regulatorCtx,
            "BATCH_001",
            "BLOCKLIST",
            "a".repeat(64),
            "manual investigation",
            "ticket-abc",
        ),
    );
    assert.equal(blocked.policyStatus, "BLOCKLISTED");

    const restored = JSON.parse(
        await protectedQrService.updateProtectedQRTokenPolicy(
            regulatorCtx,
            "BATCH_001",
            "RESTORE",
            "a".repeat(64),
            "",
            "investigation closed",
        ),
    );
    assert.equal(restored.policyStatus, "ACTIVE");
});

test("chaincode: blocked token cannot be recorded in verification history", async () => {
    const state = new Map();
    const events = [];
    seedBatch(state);

    const regulatorCtx = createMockContext(
        "RegulatorMSP",
        "x509::/OU=regulator/CN=admin",
        state,
        events,
    );
    await protectedQrService.updateProtectedQRTokenPolicy(
        regulatorCtx,
        "BATCH_001",
        "BLOCKLIST",
        "a".repeat(64),
        "suspected counterfeit",
        "",
    );

    const ownerCtx = createMockContext(
        "ManufacturerMSP",
        "x509::/OU=manufacturer/CN=owner",
        state,
        events,
    );

    await assert.rejects(
        () =>
            protectedQrService.recordProtectedQrVerification(
                ownerCtx,
                "BATCH_001",
                "true",
                "0.9",
                "a".repeat(64),
            ),
        /BLOCKLISTED/,
    );
});
