import assert from "node:assert/strict";
import test from "node:test";
import {
    buildStandardAlertPayload,
    emitCanonicalAlert,
    resolveCanonicalAlertFromChaincodeEvent,
    resolveCanonicalAlertFromDecision,
} from "../../src/services/alerts/alert-taxonomy.mapper.js";

/**
 * Unit tests for unified alert taxonomy mapper.
 */

test("resolveCanonicalAlertFromDecision maps backend decision keys", () => {
    assert.equal(
        resolveCanonicalAlertFromDecision("SCAN_ACCEPTED"),
        "SCAN_ACCEPTED",
    );
    assert.equal(
        resolveCanonicalAlertFromDecision("SCAN_REJECTED"),
        "SCAN_REJECTED",
    );
    assert.equal(resolveCanonicalAlertFromDecision("UNKNOWN"), "");
});

test("resolveCanonicalAlertFromChaincodeEvent maps ledger event names", () => {
    assert.equal(
        resolveCanonicalAlertFromChaincodeEvent("PublicAlert"),
        "LEDGER_SCAN_SUSPICIOUS",
    );
    assert.equal(
        resolveCanonicalAlertFromChaincodeEvent("RecallAlert"),
        "RECALL_ALERT",
    );
    assert.equal(resolveCanonicalAlertFromChaincodeEvent("NotMapped"), "");
});

test("buildStandardAlertPayload returns sink-ready canonical payload", () => {
    const payload = buildStandardAlertPayload({
        canonicalKey: "SCAN_REJECTED",
        sourceType: "backend_decision",
        sourceKey: "SCAN_REJECTED",
        batchID: "BATCH_123",
        traceId: "trace-123",
        details: {
            confidenceScore: 0.22,
        },
    });

    assert.equal(payload.canonicalKey, "SCAN_REJECTED");
    assert.equal(payload.sinkEventId, "DATN_SCAN_REJECTED");
    assert.equal(payload.severity, "warn");
    assert.equal(payload.source.type, "backend_decision");
    assert.equal(payload.source.key, "SCAN_REJECTED");
    assert.equal(payload.batchID, "BATCH_123");
    assert.equal(payload.traceId, "trace-123");
});

test("emitCanonicalAlert emits payload and returns null for invalid key", () => {
    const valid = emitCanonicalAlert("RECALL_ALERT", {
        sourceKey: "EmergencyRecall",
        batchID: "BATCH_999",
        traceId: "trace-999",
    });

    assert.equal(valid.canonicalKey, "RECALL_ALERT");
    assert.equal(valid.sinkEventId, "DATN_RECALL_ALERT");

    const invalid = emitCanonicalAlert("NOT_A_KEY", {
        batchID: "BATCH_1",
    });
    assert.equal(invalid, null);
});
