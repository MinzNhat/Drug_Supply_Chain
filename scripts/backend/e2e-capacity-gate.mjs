import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { performance } from "perf_hooks";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8090";
const API_BASE = `${BASE_URL}/api/v1`;
const PERF_TIMEOUT_MS = Number(process.env.PERF_TIMEOUT_MS ?? 15000);
const OUTPUT_DIR =
    process.env.PERF_OUTPUT_DIR ??
    path.resolve(process.cwd(), "test-output", "performance");
const RELEASE_ID = process.env.PERF_RELEASE_ID ?? process.env.GITHUB_SHA ?? null;

const PERF_PASSWORD = process.env.PERF_E2E_PASSWORD ?? "StrongPass123";

const settings = {
    health: {
        requests: Number(process.env.PERF_HEALTH_REQUESTS ?? 180),
        concurrency: Number(process.env.PERF_HEALTH_CONCURRENCY ?? 20),
        maxP95Ms: Number(process.env.PERF_HEALTH_MAX_P95_MS ?? 300),
        maxErrorRate: Number(process.env.PERF_HEALTH_MAX_ERROR_RATE ?? 0.01),
        minRps: Number(process.env.PERF_HEALTH_MIN_RPS ?? 35),
    },
    listBatches: {
        requests: Number(process.env.PERF_LIST_REQUESTS ?? 120),
        concurrency: Number(process.env.PERF_LIST_CONCURRENCY ?? 12),
        maxP95Ms: Number(process.env.PERF_LIST_MAX_P95_MS ?? 900),
        maxErrorRate: Number(process.env.PERF_LIST_MAX_ERROR_RATE ?? 0.02),
        minRps: Number(process.env.PERF_LIST_MIN_RPS ?? 10),
    },
    preConfirmVerify: {
        requests: Number(process.env.PERF_VERIFY_REQUESTS ?? 20),
        concurrency: Number(process.env.PERF_VERIFY_CONCURRENCY ?? 1),
        maxP95Ms: Number(process.env.PERF_VERIFY_MAX_P95_MS ?? 5000),
        maxErrorRate: Number(process.env.PERF_VERIFY_MAX_ERROR_RATE ?? 0.02),
        minRps: Number(process.env.PERF_VERIFY_MIN_RPS ?? 0.2),
    },
};

const compactUtcTimestamp = () =>
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const round = (value, digits = 2) =>
    Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

const percentile = (values, p) => {
    if (values.length === 0) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
    );

    return sorted[index];
};

const parseResponseBody = async (response) => {
    const raw = await response.text();

    if (!raw) {
        return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
        contentType.includes("application/json") ||
        raw.startsWith("{") ||
        raw.startsWith("[")
    ) {
        try {
            return JSON.parse(raw);
        } catch {
            return { raw };
        }
    }

    return { raw };
};

const requestJson = async ({ method = "GET", url, token, body }) => {
    const headers = {};
    let payload = undefined;

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
    }

    const response = await fetch(url, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(PERF_TIMEOUT_MS),
    });

    return {
        status: response.status,
        body: await parseResponseBody(response),
    };
};

const requestVerify = async (qrImageBase64) => {
    const bytes = Buffer.from(qrImageBase64, "base64");
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), "batch.png");

    const response = await fetch(`${API_BASE}/verify`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(PERF_TIMEOUT_MS),
    });

    return {
        status: response.status,
        body: await parseResponseBody(response),
    };
};

const expectStatus = (label, response, expected) => {
    if (response.status !== expected) {
        throw new Error(
            `${label} expected ${expected}, got ${response.status} :: ${JSON.stringify(response.body)}`,
        );
    }
};

const runScenario = async ({
    name,
    totalRequests,
    concurrency,
    acceptedStatuses,
    requestFactory,
    thresholds,
}) => {
    const statusCounts = {};
    const latencies = [];
    const failureSamples = [];
    let failedRequests = 0;
    let cursor = 0;

    const scenarioStartedAt = performance.now();

    const worker = async () => {
        while (true) {
            const current = cursor;
            cursor += 1;

            if (current >= totalRequests) {
                return;
            }

            const requestStartedAt = performance.now();
            try {
                const response = await requestFactory(current);
                const durationMs = performance.now() - requestStartedAt;
                latencies.push(durationMs);

                const key = String(response.status);
                statusCounts[key] = (statusCounts[key] ?? 0) + 1;

                if (!acceptedStatuses.has(response.status)) {
                    failedRequests += 1;
                    if (failureSamples.length < 5) {
                        failureSamples.push({
                            status: response.status,
                            body: response.body,
                        });
                    }
                }
            } catch (error) {
                const durationMs = performance.now() - requestStartedAt;
                latencies.push(durationMs);
                failedRequests += 1;
                statusCounts.NETWORK_ERROR = (statusCounts.NETWORK_ERROR ?? 0) + 1;

                if (failureSamples.length < 5) {
                    failureSamples.push({
                        status: "NETWORK_ERROR",
                        error:
                            error instanceof Error ? error.message : String(error),
                    });
                }
            }
        }
    };

    await Promise.all(
        Array.from({ length: Math.max(1, concurrency) }, () => worker()),
    );

    const elapsedMs = performance.now() - scenarioStartedAt;
    const elapsedSeconds = elapsedMs / 1000;
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 1;

    const metrics = {
        requests: totalRequests,
        concurrency,
        elapsedMs: round(elapsedMs),
        rps: round(totalRequests / elapsedSeconds),
        successRps: round((totalRequests - failedRequests) / elapsedSeconds),
        errorRate: round(errorRate, 4),
        latencyMs: {
            min: round(Math.min(...latencies)),
            max: round(Math.max(...latencies)),
            avg: round(
                latencies.reduce((sum, latency) => sum + latency, 0) /
                    latencies.length,
            ),
            p50: round(percentile(latencies, 50)),
            p95: round(percentile(latencies, 95)),
            p99: round(percentile(latencies, 99)),
        },
        statusCounts,
    };

    const checks = [
        {
            key: "p95_ms",
            expected: `<= ${thresholds.maxP95Ms}`,
            actual: metrics.latencyMs.p95,
            pass: metrics.latencyMs.p95 <= thresholds.maxP95Ms,
        },
        {
            key: "error_rate",
            expected: `<= ${thresholds.maxErrorRate}`,
            actual: metrics.errorRate,
            pass: metrics.errorRate <= thresholds.maxErrorRate,
        },
        {
            key: "rps",
            expected: `>= ${thresholds.minRps}`,
            actual: metrics.rps,
            pass: metrics.rps >= thresholds.minRps,
        },
    ];

    return {
        name,
        pass: checks.every((check) => check.pass),
        checks,
        metrics,
        failureSamples,
    };
};

const run = async () => {
    const timestampUtc = new Date().toISOString();

    const healthProbe = await requestJson({
        method: "GET",
        url: `${BASE_URL}/health`,
    });
    expectStatus("health probe", healthProbe, 200);

    const now = Date.now();
    const manufacturerUsername = `perf_manu_${now}`;

    const registerResponse = await requestJson({
        method: "POST",
        url: `${API_BASE}/auth/register`,
        body: {
            username: manufacturerUsername,
            password: PERF_PASSWORD,
            role: "Manufacturer",
            mspId: "ManufacturerMSP",
        },
    });
    expectStatus("register perf manufacturer", registerResponse, 201);

    const loginResponse = await requestJson({
        method: "POST",
        url: `${API_BASE}/auth/login`,
        body: {
            username: manufacturerUsername,
            password: PERF_PASSWORD,
        },
    });
    expectStatus("login perf manufacturer", loginResponse, 200);

    const token = loginResponse.body?.data?.token;
    if (!token) {
        throw new Error("Missing token from login response");
    }

    const createBatchResponse = await requestJson({
        method: "POST",
        url: `${API_BASE}/batches`,
        token,
        body: {
            drugName: `Capacity Gate Batch ${now}`,
            quantity: 120,
            expiryDate: "2028-12-31T00:00:00.000Z",
        },
    });
    expectStatus("create perf batch", createBatchResponse, 201);

    const batchId = createBatchResponse.body?.data?.batch?.batchID;
    const qrImageBase64 = createBatchResponse.body?.data?.qrImageBase64;
    if (!batchId || !qrImageBase64) {
        throw new Error("Missing batchId or qrImageBase64 from create batch response");
    }

    const verifyProbe = await requestVerify(qrImageBase64);
    expectStatus("pre-confirm verify probe", verifyProbe, 400);

    const reportScenarios = [];

    reportScenarios.push(
        await runScenario({
            name: "health_read",
            totalRequests: settings.health.requests,
            concurrency: settings.health.concurrency,
            acceptedStatuses: new Set([200]),
            requestFactory: () =>
                requestJson({
                    method: "GET",
                    url: `${BASE_URL}/health`,
                }),
            thresholds: {
                maxP95Ms: settings.health.maxP95Ms,
                maxErrorRate: settings.health.maxErrorRate,
                minRps: settings.health.minRps,
            },
        }),
    );

    reportScenarios.push(
        await runScenario({
            name: "batch_list_query",
            totalRequests: settings.listBatches.requests,
            concurrency: settings.listBatches.concurrency,
            acceptedStatuses: new Set([200]),
            requestFactory: () =>
                requestJson({
                    method: "GET",
                    url: `${API_BASE}/batches?page=1&pageSize=20`,
                    token,
                }),
            thresholds: {
                maxP95Ms: settings.listBatches.maxP95Ms,
                maxErrorRate: settings.listBatches.maxErrorRate,
                minRps: settings.listBatches.minRps,
            },
        }),
    );

    reportScenarios.push(
        await runScenario({
            name: "preconfirm_verify_reject_path",
            totalRequests: settings.preConfirmVerify.requests,
            concurrency: settings.preConfirmVerify.concurrency,
            acceptedStatuses: new Set([400]),
            requestFactory: () => requestVerify(qrImageBase64),
            thresholds: {
                maxP95Ms: settings.preConfirmVerify.maxP95Ms,
                maxErrorRate: settings.preConfirmVerify.maxErrorRate,
                minRps: settings.preConfirmVerify.minRps,
            },
        }),
    );

    const passed = reportScenarios.every((scenario) => scenario.pass);
    const report = {
        status: passed ? "PASSED" : "FAILED",
        generatedAtUtc: timestampUtc,
        environment: {
            baseUrl: BASE_URL,
            releaseId: RELEASE_ID,
            timeoutMs: PERF_TIMEOUT_MS,
            nodeVersion: process.version,
        },
        setup: {
            manufacturerUsername,
            batchId,
        },
        thresholds: settings,
        scenarios: reportScenarios,
    };

    await mkdir(OUTPUT_DIR, { recursive: true });
    const outputFile = path.join(
        OUTPUT_DIR,
        `capacity-gate-${compactUtcTimestamp()}.json`,
    );
    await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({
        status: report.status,
        outputFile,
        scenarios: report.scenarios.map((scenario) => ({
            name: scenario.name,
            pass: scenario.pass,
            p95Ms: scenario.metrics.latencyMs.p95,
            errorRate: scenario.metrics.errorRate,
            rps: scenario.metrics.rps,
        })),
    }, null, 2));

    if (!passed) {
        process.exit(1);
    }
};

run().catch((error) => {
    console.error("E2E_CAPACITY_GATE_FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
