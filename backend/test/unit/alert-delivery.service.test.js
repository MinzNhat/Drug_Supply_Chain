import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
process.env.MONGO_DB = process.env.MONGO_DB ?? "drug_guard_test";
process.env.QR_SERVICE_URL =
    process.env.QR_SERVICE_URL ?? "http://localhost:8080";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";
process.env.ALERT_SINK_ENABLED = "true";

const { AlertDeliveryService } =
    await import("../../src/services/alerts/alert-delivery.service.js");

/**
 * Create in-memory repositories for alert delivery tests.
 *
 * @returns {{ deliveryRepository: Record<string, unknown>, deadLetterRepository: Record<string, unknown>, state: Map<string, Record<string, unknown>>, deadLetters: Array<Record<string, unknown>> }} Repository set.
 */
const createInMemoryRepositories = () => {
    const state = new Map();
    const deadLetters = [];

    return {
        state,
        deadLetters,
        deliveryRepository: {
            async findByIdempotencyKey(idempotencyKey) {
                return state.get(idempotencyKey) ?? null;
            },
            async ensurePending(input) {
                const existing = state.get(input.idempotencyKey);
                if (existing) {
                    return existing;
                }

                const row = {
                    idempotencyKey: input.idempotencyKey,
                    status: "PENDING",
                    attemptsCount: 0,
                    payload: input.alertPayload,
                    sinkChannel: input.sinkChannel,
                    attempts: [],
                };
                state.set(input.idempotencyKey, row);
                return row;
            },
            async markAttemptFailure(input) {
                const row = state.get(input.idempotencyKey);
                row.status = "RETRYING";
                row.attemptsCount += 1;
                row.lastErrorMessage = input.errorMessage;
                row.attempts.push({
                    attempt: input.attempt,
                    succeeded: false,
                    statusCode: input.statusCode,
                });
            },
            async markDelivered(input) {
                const row = state.get(input.idempotencyKey);
                row.status = "DELIVERED";
                row.attemptsCount += 1;
                row.attempts.push({
                    attempt: input.attempt,
                    succeeded: true,
                    statusCode: input.statusCode,
                });
            },
            async markDeadLetter(input) {
                const row = state.get(input.idempotencyKey);
                row.status = "DEAD_LETTER";
                row.lastErrorMessage = input.errorMessage;
            },
        },
        deadLetterRepository: {
            async upsert(input) {
                const row = {
                    ...input,
                    _id: `dlq-${deadLetters.length + 1}`,
                };
                deadLetters.push(row);
                return row;
            },
        },
    };
};

/**
 * Build canonical alert payload fixture for sink delivery tests.
 *
 * @param {string} canonicalKey - Canonical alert key.
 * @returns {Record<string, unknown>} Canonical alert payload.
 */
const createAlertPayload = (canonicalKey) => ({
    canonicalKey,
    sinkEventId: `DATN_${canonicalKey}`,
    severity: canonicalKey === "RECALL_ALERT" ? "critical" : "warn",
    source: {
        type: "backend_decision",
        key: canonicalKey,
    },
    batchID: "BATCH_001",
    traceId: "trace-1",
    occurredAt: "2026-04-01T09:00:00.000Z",
    details: {},
});

test("dispatchAlert delivers SCAN_REJECTED and marks state as delivered", async () => {
    const repos = createInMemoryRepositories();
    let publishCalls = 0;

    const service = new AlertDeliveryService({
        sinkAdapter: {
            async publishAlert() {
                publishCalls += 1;
                return {
                    channel: "logger",
                    delivered: true,
                    statusCode: 200,
                };
            },
        },
        deliveryRepository: repos.deliveryRepository,
        deadLetterRepository: repos.deadLetterRepository,
        retry: {
            maxAttempts: 3,
            baseDelayMs: 1,
            maxDelayMs: 1,
        },
    });

    const result = await service.dispatchAlert(
        createAlertPayload("SCAN_REJECTED"),
    );

    assert.equal(result.status, "delivered");
    assert.equal(publishCalls, 1);

    const row = repos.state.get(result.idempotencyKey);
    assert.equal(row.status, "DELIVERED");
    assert.equal(row.attemptsCount, 1);
});

test("dispatchAlert skips non-deliverable canonical key", async () => {
    const repos = createInMemoryRepositories();
    let publishCalls = 0;

    const service = new AlertDeliveryService({
        sinkAdapter: {
            async publishAlert() {
                publishCalls += 1;
                return { channel: "logger", delivered: true };
            },
        },
        deliveryRepository: repos.deliveryRepository,
        deadLetterRepository: repos.deadLetterRepository,
        retry: {
            maxAttempts: 2,
            baseDelayMs: 1,
            maxDelayMs: 1,
        },
    });

    const result = await service.dispatchAlert(
        createAlertPayload("SCAN_ACCEPTED"),
    );

    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "not_deliverable");
    assert.equal(publishCalls, 0);
});

test("dispatchAlert retries and writes dead-letter after max attempts", async () => {
    const repos = createInMemoryRepositories();
    let publishCalls = 0;

    const service = new AlertDeliveryService({
        sinkAdapter: {
            async publishAlert() {
                publishCalls += 1;
                const error = new Error("sink unavailable");
                error.response = { status: 503 };
                throw error;
            },
        },
        deliveryRepository: repos.deliveryRepository,
        deadLetterRepository: repos.deadLetterRepository,
        retry: {
            maxAttempts: 2,
            baseDelayMs: 1,
            maxDelayMs: 1,
        },
    });

    const result = await service.dispatchAlert(
        createAlertPayload("RECALL_ALERT"),
    );

    assert.equal(result.status, "dead_letter");
    assert.equal(publishCalls, 2);
    assert.equal(repos.deadLetters.length, 1);

    const row = repos.state.get(result.idempotencyKey);
    assert.equal(row.status, "DEAD_LETTER");
    assert.equal(row.attemptsCount, 2);
});

test("dispatchAlert skips duplicate key when already delivered", async () => {
    const repos = createInMemoryRepositories();
    let publishCalls = 0;

    const service = new AlertDeliveryService({
        sinkAdapter: {
            async publishAlert() {
                publishCalls += 1;
                return { channel: "logger", delivered: true };
            },
        },
        deliveryRepository: repos.deliveryRepository,
        deadLetterRepository: repos.deadLetterRepository,
        retry: {
            maxAttempts: 2,
            baseDelayMs: 1,
            maxDelayMs: 1,
        },
    });

    const payload = createAlertPayload("SCAN_REJECTED");
    const first = await service.dispatchAlert(payload);
    const second = await service.dispatchAlert(payload);

    assert.equal(first.status, "delivered");
    assert.equal(second.status, "duplicate");
    assert.equal(publishCalls, 1);
});
