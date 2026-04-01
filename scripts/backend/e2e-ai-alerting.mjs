import { loadPackage } from "./load-deps.mjs";

const axios = loadPackage("axios");
const FormData = loadPackage("form-data");

const PASSWORD = process.env.E2E_PASSWORD ?? "StrongPass123";
const E2E_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 30000);

const AI_REJECT_BASE_URL =
    process.env.AI_REJECT_BASE_URL ?? "http://localhost:8093";
const AI_FAIL_OPEN_BASE_URL =
    process.env.AI_FAIL_OPEN_BASE_URL ?? "http://localhost:8091";
const AI_FAIL_CLOSE_BASE_URL =
    process.env.AI_FAIL_CLOSE_BASE_URL ?? "http://localhost:8092";

/**
 * Throw assertion error with optional debugging context.
 *
 * @param {string} message - Error message.
 * @param {Record<string, unknown>=} context - Extra debugging details.
 */
const fail = (message, context = undefined) => {
    const detail = context ? ` | ${JSON.stringify(context)}` : "";
    throw new Error(`${message}${detail}`);
};

/**
 * Build one API client for the given backend base URL.
 *
 * @param {string} baseUrl - Backend origin URL.
 * @returns {import("axios").AxiosInstance} API client with /api/v1 base path.
 */
const createRequest = (baseUrl) => {
    return axios.create({
        baseURL: `${baseUrl}/api/v1`,
        timeout: E2E_TIMEOUT_MS,
        validateStatus: () => true,
    });
};

/**
 * Assert exact HTTP status code.
 *
 * @param {string} label - Step label.
 * @param {import("axios").AxiosResponse} response - HTTP response.
 * @param {number} expectedStatus - Expected status code.
 */
const assertStatus = (label, response, expectedStatus) => {
    if (response.status !== expectedStatus) {
        fail(`${label} failed`, {
            expected: expectedStatus,
            actual: response.status,
            body: response.data,
        });
    }
};

/**
 * Register one user for scenario setup.
 *
 * @param {import("axios").AxiosInstance} request - API request client.
 * @param {string} username - Username.
 * @param {"Manufacturer" | "Distributor" | "Regulator"} role - Role name.
 * @param {"ManufacturerMSP" | "DistributorMSP" | "RegulatorMSP"} mspId - MSP identifier.
 */
const register = async (request, username, role, mspId) => {
    const response = await request.post("/auth/register", {
        username,
        password: PASSWORD,
        role,
        mspId,
    });
    assertStatus(`register ${username}`, response, 201);
};

/**
 * Authenticate one existing user and return bearer token.
 *
 * @param {import("axios").AxiosInstance} request - API request client.
 * @param {string} username - Username.
 * @returns {Promise<string>} JWT bearer token.
 */
const login = async (request, username) => {
    const response = await request.post("/auth/login", {
        username,
        password: PASSWORD,
    });
    assertStatus(`login ${username}`, response, 200);

    const token = response.data?.data?.token;
    if (!token) {
        fail(`login ${username} missing token`, response.data);
    }

    return token;
};

/**
 * Build bearer authorization headers.
 *
 * @param {string} token - JWT bearer token.
 * @returns {Record<string, string>} Header object.
 */
const authHeader = (token) => ({
    Authorization: `Bearer ${token}`,
});

/**
 * Register and login manufacturer/regulator users for one scenario.
 *
 * @param {string} baseUrl - Backend origin URL.
 * @param {string} scenarioTag - Unique scenario suffix.
 * @returns {Promise<{ request: import("axios").AxiosInstance, manufacturerToken: string, regulatorToken: string, users: Record<string, string> }>} Scenario actors.
 */
const setupActors = async (baseUrl, scenarioTag) => {
    const request = createRequest(baseUrl);
    const now = Date.now();
    const manufacturerUsername = `manu_${scenarioTag}_${now}`;
    const regulatorUsername = `reg_${scenarioTag}_${now}`;

    await register(
        request,
        manufacturerUsername,
        "Manufacturer",
        "ManufacturerMSP",
    );
    await register(request, regulatorUsername, "Regulator", "RegulatorMSP");

    const manufacturerToken = await login(request, manufacturerUsername);
    const regulatorToken = await login(request, regulatorUsername);

    return {
        request,
        manufacturerToken,
        regulatorToken,
        users: {
            manufacturerUsername,
            regulatorUsername,
        },
    };
};

/**
 * Create one batch and return identifiers required for verification calls.
 *
 * @param {import("axios").AxiosInstance} request - API request client.
 * @param {string} manufacturerToken - Manufacturer JWT token.
 * @param {string} label - Batch name suffix.
 * @returns {Promise<{ batchId: string, qrImageBase64: string }>} Created batch info.
 */
const createBatch = async (request, manufacturerToken, label) => {
    const response = await request.post(
        "/batches",
        {
            drugName: `P0-08 ${label}`,
            quantity: 100,
            expiryDate: "2029-12-31T00:00:00.000Z",
        },
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus(`create batch ${label}`, response, 201);

    const batchId = response.data?.data?.batch?.batchID;
    const qrImageBase64 = response.data?.data?.qrImageBase64;

    if (!batchId || !qrImageBase64) {
        fail(`create batch ${label} missing required fields`, response.data);
    }

    return {
        batchId,
        qrImageBase64,
    };
};

/**
 * Submit public verify request with QR + packaging images.
 *
 * @param {string} baseUrl - Backend origin URL.
 * @param {string} qrImageBase64 - QR image payload.
 * @returns {Promise<import("axios").AxiosResponse>} Verify response.
 */
const verifyWithPackagingImage = async (baseUrl, qrImageBase64) => {
    const form = new FormData();
    form.append("image", Buffer.from(qrImageBase64, "base64"), {
        filename: "batch.png",
        contentType: "image/png",
    });
    form.append("packagingImage", Buffer.from("p0-08-packaging-image"), {
        filename: "packaging.png",
        contentType: "image/png",
    });

    return axios.post(`${baseUrl}/api/v1/verify`, form, {
        headers: form.getHeaders(),
        timeout: E2E_TIMEOUT_MS,
        validateStatus: () => true,
    });
};

/**
 * Assert AI reject behavior and downstream regulator alert/report paths.
 *
 * @returns {Promise<Record<string, unknown>>} Scenario summary.
 */
const runRejectAndReportScenario = async () => {
    const { request, manufacturerToken, regulatorToken, users } =
        await setupActors(AI_REJECT_BASE_URL, "ai_reject");
    const { batchId, qrImageBase64 } = await createBatch(
        request,
        manufacturerToken,
        "AI Reject",
    );

    const verifyResponse = await verifyWithPackagingImage(
        AI_REJECT_BASE_URL,
        qrImageBase64,
    );
    assertStatus("ai reject verify", verifyResponse, 400);

    const rejectCode = verifyResponse.data?.error?.code;
    const decisionCode =
        verifyResponse.data?.error?.details?.decision?.code ?? "";
    const aiCode =
        verifyResponse.data?.error?.details?.aiVerification?.code ?? "";

    if (rejectCode !== "SCAN_REJECTED" || decisionCode !== "SCAN_REJECTED") {
        fail("ai reject decision mismatch", verifyResponse.data);
    }

    if (aiCode !== "AI_REJECTED") {
        fail("ai reject verification code mismatch", verifyResponse.data);
    }

    const listRejectAlertsResponse = await request.get("/regulator/alerts", {
        headers: authHeader(regulatorToken),
        params: {
            batchID: batchId,
            canonicalKey: "SCAN_REJECTED",
        },
    });
    assertStatus("list reject alerts", listRejectAlertsResponse, 200);

    const rejectItems = listRejectAlertsResponse.data?.data?.items ?? [];
    if (!Array.isArray(rejectItems) || rejectItems.length === 0) {
        fail("missing archived SCAN_REJECTED alert", {
            body: listRejectAlertsResponse.data,
            users,
        });
    }

    const rejectAlertId = rejectItems[0]?.id;
    if (!rejectAlertId) {
        fail("missing reject alert id", rejectItems[0]);
    }

    const getRejectAlertResponse = await request.get(
        `/regulator/alerts/${rejectAlertId}`,
        {
            headers: authHeader(regulatorToken),
        },
    );
    assertStatus("get reject alert", getRejectAlertResponse, 200);

    const recallResponse = await request.post(
        `/batches/${batchId}/recall`,
        {},
        {
            headers: authHeader(regulatorToken),
        },
    );
    assertStatus("recall batch", recallResponse, 200);

    const recallAlertKey = recallResponse.data?.data?.recallAlert?.canonicalKey;
    if (recallAlertKey !== "RECALL_ALERT") {
        fail("recall alert canonical key mismatch", recallResponse.data);
    }

    const listRecallAlertsResponse = await request.get("/regulator/alerts", {
        headers: authHeader(regulatorToken),
        params: {
            batchID: batchId,
            canonicalKey: "RECALL_ALERT",
        },
    });
    assertStatus("list recall alerts", listRecallAlertsResponse, 200);

    const recallItems = listRecallAlertsResponse.data?.data?.items ?? [];
    if (!Array.isArray(recallItems) || recallItems.length === 0) {
        fail("missing archived RECALL_ALERT", listRecallAlertsResponse.data);
    }

    const exportJsonResponse = await request.get("/regulator/reports/export", {
        headers: authHeader(regulatorToken),
        params: {
            format: "json",
            batchID: batchId,
            limit: 100,
        },
    });
    assertStatus("export report json", exportJsonResponse, 200);

    const exportJsonData = exportJsonResponse.data?.data;
    if (!exportJsonData || exportJsonData.format !== "json") {
        fail("invalid JSON report export payload", exportJsonResponse.data);
    }

    const exportCsvResponse = await request.get("/regulator/reports/export", {
        headers: authHeader(regulatorToken),
        params: {
            format: "csv",
            batchID: batchId,
            limit: 100,
        },
    });
    assertStatus("export report csv", exportCsvResponse, 200);

    const csvContent =
        typeof exportCsvResponse.data === "string"
            ? exportCsvResponse.data
            : "";

    if (!csvContent.includes("canonicalKey") || !csvContent.includes(batchId)) {
        fail("invalid CSV report export content", {
            status: exportCsvResponse.status,
            body: exportCsvResponse.data,
        });
    }

    return {
        mode: "reject-and-report",
        baseUrl: AI_REJECT_BASE_URL,
        batchId,
        rejectAlertId,
        rejectAlertCount: rejectItems.length,
        recallAlertCount: recallItems.length,
        reportJsonSummary: exportJsonData.summary,
        reportJsonItemCount: exportJsonData.itemCount,
        reportCsvLength: csvContent.length,
    };
};

/**
 * Assert fail-open behavior when AI service is unavailable.
 *
 * @returns {Promise<Record<string, unknown>>} Scenario summary.
 */
const runFailOpenScenario = async () => {
    const { request, manufacturerToken } = await setupActors(
        AI_FAIL_OPEN_BASE_URL,
        "ai_fail_open",
    );
    const { batchId, qrImageBase64 } = await createBatch(
        request,
        manufacturerToken,
        "AI Fail Open",
    );

    const verifyResponse = await verifyWithPackagingImage(
        AI_FAIL_OPEN_BASE_URL,
        qrImageBase64,
    );
    assertStatus("ai fail-open verify", verifyResponse, 200);

    const decisionCode = verifyResponse.data?.data?.decision?.code;
    const aiCode = verifyResponse.data?.data?.aiVerification?.code;

    if (decisionCode !== "SCAN_ACCEPTED") {
        fail("fail-open decision mismatch", verifyResponse.data);
    }

    if (aiCode !== "AI_UNAVAILABLE_FAIL_OPEN") {
        fail("fail-open AI code mismatch", verifyResponse.data);
    }

    return {
        mode: "fail-open",
        baseUrl: AI_FAIL_OPEN_BASE_URL,
        batchId,
        decisionCode,
        aiCode,
    };
};

/**
 * Assert fail-close behavior when AI service is unavailable.
 *
 * @returns {Promise<Record<string, unknown>>} Scenario summary.
 */
const runFailCloseScenario = async () => {
    const { request, manufacturerToken } = await setupActors(
        AI_FAIL_CLOSE_BASE_URL,
        "ai_fail_close",
    );
    const { qrImageBase64 } = await createBatch(
        request,
        manufacturerToken,
        "AI Fail Close",
    );

    const verifyResponse = await verifyWithPackagingImage(
        AI_FAIL_CLOSE_BASE_URL,
        qrImageBase64,
    );
    assertStatus("ai fail-close verify", verifyResponse, 502);

    const errorCode = verifyResponse.data?.error?.code;
    if (errorCode !== "AI_VERIFY_FAILED") {
        fail("fail-close error code mismatch", verifyResponse.data);
    }

    return {
        mode: "fail-close",
        baseUrl: AI_FAIL_CLOSE_BASE_URL,
        errorCode,
    };
};

const run = async () => {
    const rejectAndReport = await runRejectAndReportScenario();
    const failOpen = await runFailOpenScenario();
    const failClose = await runFailCloseScenario();

    console.log(
        JSON.stringify(
            {
                ok: true,
                scenarios: {
                    rejectAndReport,
                    failOpen,
                    failClose,
                },
            },
            null,
            2,
        ),
    );
};

run().catch((error) => {
    console.error("E2E_AI_ALERTING_FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
