import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
process.env.MONGO_DB = process.env.MONGO_DB ?? "drug_guard_test";
process.env.QR_SERVICE_URL =
    process.env.QR_SERVICE_URL ?? "http://localhost:8080";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";
process.env.FABRIC_ENABLED = process.env.FABRIC_ENABLED ?? "false";

const express = (await import("express")).default;
const jwt = (await import("jsonwebtoken")).default;
const { errorHandler } =
    await import("../../src/middleware/error/error-handler.js");
const { requestContextMiddleware } =
    await import("../../src/middleware/request-context/request-context.middleware.js");
const { createProductRoutes } =
    await import("../../src/routes/product/product.routes.js");
const { config } = await import("../../src/config/index.js");

const signToken = (role, mspId, distributorUnitId = "") => {
    return jwt.sign(
        {
            userId: `user-${role.toLowerCase()}`,
            role,
            mspId,
            distributorUnitId,
        },
        config.jwtSecret,
        { expiresIn: "1h" },
    );
};

const createServer = async () => {
    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.use("/api/v1", createProductRoutes());
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

test("integration: distributor cannot access protected QR bind endpoint", async (t) => {
    const server = await createServer();
    t.after(() => server.close());

    const token = signToken("Distributor", "DistributorMSP", "dist-unit-01");
    const response = await fetch(
        `${server.baseUrl}/api/v1/batches/BATCH_001/protected-qr/bind`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
        },
    );

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "FORBIDDEN");
});

test("integration: manufacturer reaches bind handler authorization stage", async (t) => {
    const server = await createServer();
    t.after(() => server.close());

    const token = signToken("Manufacturer", "ManufacturerMSP");
    const response = await fetch(
        `${server.baseUrl}/api/v1/batches/BATCH_001/protected-qr/bind`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
        },
    );

    assert.notEqual(response.status, 403);
});
