import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
process.env.MONGO_DB = process.env.MONGO_DB ?? "drug_guard_test";
process.env.QR_SERVICE_URL =
    process.env.QR_SERVICE_URL ?? "http://localhost:8080";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

const { RegulatorAlertsService } =
    await import("../../src/services/alerts/regulator-alerts.service.js");

test("integration: export json report publishes sink metadata", async () => {
    const calls = [];
    const repository = {
        async list() {
            return { page: 1, pageSize: 20, total: 0, items: [] };
        },
        async findById() {
            return null;
        },
        async listForExport() {
            return [
                {
                    id: "1",
                    canonicalKey: "SCAN_REJECTED",
                    sinkEventId: "DATN_SCAN_REJECTED",
                    severity: "warn",
                    source: { type: "backend_decision", key: "SCAN_REJECTED" },
                    batchID: "BATCH_001",
                    traceId: "trace-1",
                    occurredAt: "2026-03-31T09:00:00.000Z",
                    details: { ledgerMatch: false },
                },
            ];
        },
    };
    const sinkAdapter = {
        async publishReport(payload) {
            calls.push(payload);
            return {
                channel: "logger",
                delivered: true,
                deliveredAt: "2026-03-31T09:00:00.000Z",
            };
        },
    };

    const service = new RegulatorAlertsService(repository, sinkAdapter);
    const report = await service.exportAlertsReport(
        {
            format: "json",
            limit: 50,
        },
        {
            id: "reg-1",
            role: "Regulator",
            mspId: "RegulatorMSP",
        },
    );

    assert.equal(report.format, "json");
    assert.equal(report.summary.total, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].actor.role, "Regulator");
});

test("integration: non-regulator cannot read alerts", async () => {
    const repository = {
        async list() {
            return { page: 1, pageSize: 20, total: 0, items: [] };
        },
        async findById() {
            return null;
        },
        async listForExport() {
            return [];
        },
    };
    const sinkAdapter = {
        async publishReport() {
            return { channel: "logger", delivered: true };
        },
    };

    const service = new RegulatorAlertsService(repository, sinkAdapter);

    await assert.rejects(
        () =>
            service.listAlerts(
                {},
                {
                    role: "Manufacturer",
                    mspId: "ManufacturerMSP",
                },
            ),
        (error) => {
            assert.equal(error?.status, 403);
            assert.equal(error?.code, "FORBIDDEN");
            return true;
        },
    );
});

test("integration: get alert by id returns 404 for unknown id", async () => {
    const repository = {
        async list() {
            return { page: 1, pageSize: 20, total: 0, items: [] };
        },
        async findById() {
            return null;
        },
        async listForExport() {
            return [];
        },
    };
    const sinkAdapter = {
        async publishReport() {
            return { channel: "logger", delivered: true };
        },
    };

    const service = new RegulatorAlertsService(repository, sinkAdapter);

    await assert.rejects(
        () =>
            service.getAlertById("65f0a84de9c0aa49309d9999", {
                role: "Regulator",
            }),
        (error) => {
            assert.equal(error?.status, 404);
            assert.equal(error?.code, "ALERT_NOT_FOUND");
            return true;
        },
    );
});
