import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
process.env.MONGO_DB = process.env.MONGO_DB ?? "drug_guard_test";
process.env.QR_SERVICE_URL = process.env.QR_SERVICE_URL ?? "http://localhost:8080";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

const express = (await import("express")).default;
const jwt = (await import("jsonwebtoken")).default;
const { errorHandler } = await import(
    "../../src/middleware/error/error-handler.js"
);
const { createRegulatorRoutes } = await import(
    "../../src/routes/regulator/regulator.routes.js"
);
const { requestContextMiddleware } = await import(
    "../../src/middleware/request-context/request-context.middleware.js"
);
const { config } = await import("../../src/config/index.js");

/**
 * Sign one test JWT for role-scoped API checks.
 *
 * @param {"Manufacturer" | "Distributor" | "Regulator"} role - Actor role.
 * @param {"ManufacturerMSP" | "DistributorMSP" | "RegulatorMSP"} mspId - Actor MSP.
 * @returns {string} Signed token.
 */
const signToken = (role, mspId) => {
    return jwt.sign(
        {
            userId: `user-${role.toLowerCase()}`,
            role,
            mspId,
        },
        config.jwtSecret,
        { expiresIn: "1h" },
    );
};

/**
 * Create ephemeral HTTP app server for route integration tests.
 *
 * @param {Record<string, unknown>} service - Service stub for route wiring.
 * @returns {Promise<{ baseUrl: string, close: () => Promise<void> }>} Running test server.
 */
const createServer = async (service) => {
    const app = express();
    app.use(requestContextMiddleware);
    app.use("/api/v1/regulator", createRegulatorRoutes({ service }));
    app.use(errorHandler);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        close: async () => {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        },
    };
};

test("integration: regulator can list archived alerts", async (t) => {
    let capturedActor = null;
    const service = {
        async listAlerts(query, actor) {
            capturedActor = actor;
            assert.equal(query.page, 1);
            return {
                page: 1,
                pageSize: 20,
                total: 1,
                items: [
                    {
                        id: "a1",
                        canonicalKey: "SCAN_REJECTED",
                    },
                ],
            };
        },
        async getAlertById() {
            return null;
        },
        async exportAlertsReport() {
            return {
                format: "json",
                summary: { total: 0 },
                items: [],
            };
        },
    };

    const server = await createServer(service);
    t.after(() => server.close());

    const token = signToken("Regulator", "RegulatorMSP");
    const response = await fetch(`${server.baseUrl}/api/v1/regulator/alerts?page=1`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.total, 1);
    assert.equal(capturedActor?.role, "Regulator");
});

test("integration: non-regulator role is denied for alert list", async (t) => {
    let called = false;
    const service = {
        async listAlerts() {
            called = true;
            return { page: 1, pageSize: 20, total: 0, items: [] };
        },
        async getAlertById() {
            return null;
        },
        async exportAlertsReport() {
            return {
                format: "json",
                summary: { total: 0 },
                items: [],
            };
        },
    };

    const server = await createServer(service);
    t.after(() => server.close());

    const token = signToken("Manufacturer", "ManufacturerMSP");
    const response = await fetch(`${server.baseUrl}/api/v1/regulator/alerts`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "FORBIDDEN");
    assert.equal(called, false);
});

test("integration: regulator can export CSV report", async (t) => {
    const service = {
        async listAlerts() {
            return { page: 1, pageSize: 20, total: 0, items: [] };
        },
        async getAlertById() {
            return null;
        },
        async exportAlertsReport() {
            return {
                format: "csv",
                fileName: "alert-report.csv",
                content: "id,canonicalKey\na1,SCAN_REJECTED\n",
            };
        },
    };

    const server = await createServer(service);
    t.after(() => server.close());

    const token = signToken("Regulator", "RegulatorMSP");
    const response = await fetch(
        `${server.baseUrl}/api/v1/regulator/reports/export?format=csv`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/csv/i);
    const bodyText = await response.text();
    assert.match(bodyText, /canonicalKey/);
});
