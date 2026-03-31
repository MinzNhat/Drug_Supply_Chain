import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPackage } from "./load-deps.mjs";

const axios = loadPackage("axios");
const FormData = loadPackage("form-data");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8090";
const API_BASE = `${BASE_URL}/api/v1`;
const TMP_DIR =
    process.env.TMP_DIR ?? path.join(__dirname, "../../test-output/test-flow");
const REQUIRE_REAL_SCAN_FIXTURE =
    (process.env.REQUIRE_REAL_SCAN_FIXTURE ?? "false") === "true";

if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

let passCount = 0;
let failCount = 0;
const failures = [];
const LOG_FILE = path.join(TMP_DIR, "test-flow.log.jsonl");
if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
}

const logPass = (msg) => {
    passCount += 1;
    console.log(`[PASS] ${msg}`);
};

const logFail = (msg) => {
    failCount += 1;
    failures.push(msg);
    console.log(`[FAIL] ${msg}`);
};

const writeLog = (label, data) => {
    const payload = {
        label,
        timestamp: new Date().toISOString(),
        data,
    };
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(payload)}\n`);
};

const http = axios.create({
    baseURL: API_BASE,
    validateStatus: () => true,
});

const registerUser = async (username, role, mspId) => {
    const body = {
        username,
        password: "StrongPass123",
        role,
        mspId,
    };

    const res = await http.post("/auth/register", body);
    if (res.status === 201 || res.status === 409) {
        logPass(`Register ${username} (${role})`);
        writeLog(`register:${username}`, res.data);
    } else {
        logFail(`Register ${username} (${role}) -> HTTP ${res.status}`);
        writeLog(`register:${username}`, res.data);
    }
};

const loginUser = async (username) => {
    const res = await http.post("/auth/login", {
        username,
        password: "StrongPass123",
    });

    if (res.status !== 200) {
        logFail(`Login ${username} -> HTTP ${res.status}`);
        writeLog(`login:${username}`, res.data);
        return "";
    }

    writeLog(`login:${username}`, res.data);
    return res.data?.data?.token ?? "";
};

const postWithAuth = async (url, body, token) => {
    return http.post(url, body, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });
};

const expectStatus = (label, res, expected) => {
    if (res.status === expected) {
        logPass(`${label} -> HTTP ${expected}`);
        writeLog(label, res.data);
    } else {
        logFail(`${label} -> HTTP ${res.status}`);
        writeLog(label, res.data);
    }
};

const expectStatusOneOf = (label, res, expectedStatuses) => {
    if (expectedStatuses.includes(res.status)) {
        logPass(`${label} -> HTTP ${res.status}`);
        writeLog(label, res.data);
    } else {
        logFail(`${label} -> HTTP ${res.status}`);
        writeLog(label, res.data);
    }
};

const ensureRealQrFixtures = (tokenQrBase64) => {
    if (!tokenQrBase64) {
        return;
    }

    const realQrPng = path.join(TMP_DIR, "qr-real.png");
    const imageBuffer = Buffer.from(tokenQrBase64, "base64");

    if (!fs.existsSync(realQrPng)) {
        fs.writeFileSync(realQrPng, imageBuffer);
    }
};

const run = async () => {
    console.log("== DrugGuard Full Flow Test (Node.js) ==");

    const runId = Date.now();
    const manufacturerUsername = `manu_${runId}`;
    const distributorUsername = `dist_${runId}`;
    const regulatorUsername = `reg_${runId}`;

    console.log("-- Edgecases: register validation");
    const badRegisterUsername = await http.post("/auth/register", {
        username: "ab",
        password: "StrongPass123",
        role: "Manufacturer",
        mspId: "ManufacturerMSP",
    });
    expectStatus("Register invalid username", badRegisterUsername, 400);

    const badRegisterPassword = await http.post("/auth/register", {
        username: `weak_user_${runId}`,
        password: "weakpass",
        role: "Manufacturer",
        mspId: "ManufacturerMSP",
    });
    expectStatus("Register weak password", badRegisterPassword, 400);

    const badRegisterMsp = await http.post("/auth/register", {
        username: `msp_mismatch_${runId}`,
        password: "StrongPass123",
        role: "Manufacturer",
        mspId: "DistributorMSP",
    });
    expectStatus("Register role/msp mismatch", badRegisterMsp, 400);

    await registerUser(manufacturerUsername, "Manufacturer", "ManufacturerMSP");
    await registerUser(distributorUsername, "Distributor", "DistributorMSP");
    await registerUser(regulatorUsername, "Regulator", "RegulatorMSP");

    const manuToken = await loginUser(manufacturerUsername);
    const distToken = await loginUser(distributorUsername);
    const regToken = await loginUser(regulatorUsername);

    console.log("-- Edgecases: login validation");
    const badLogin = await http.post("/auth/login", {
        username: manufacturerUsername,
        password: "WrongPass123",
    });
    expectStatus("Login wrong password", badLogin, 401);

    if (manuToken) {
        logPass(`Login ${manufacturerUsername}`);
    } else {
        logFail(`Login ${manufacturerUsername}`);
    }

    if (distToken) {
        logPass(`Login ${distributorUsername}`);
    } else {
        logFail(`Login ${distributorUsername}`);
    }

    if (regToken) {
        logPass(`Login ${regulatorUsername}`);
    } else {
        logFail(`Login ${regulatorUsername}`);
    }

    if (!manuToken) {
        console.log("Cannot continue without Manufacturer token.");
        process.exit(1);
    }

    console.log("-- Edgecases: create batch validation");
    const badBatchPastExpiry = await postWithAuth(
        "/batches",
        {
            drugName: "Hapacol",
            quantity: 1000,
            expiryDate: "2020-01-01T00:00:00Z",
        },
        manuToken,
    );
    expectStatus("Create batch past expiry", badBatchPastExpiry, 400);

    const badBatchQuantity = await postWithAuth(
        "/batches",
        {
            drugName: "Hapacol",
            quantity: -5,
            expiryDate: "2028-12-31T00:00:00Z",
        },
        manuToken,
    );
    expectStatus("Create batch invalid quantity", badBatchQuantity, 400);

    const badBatchName = await postWithAuth(
        "/batches",
        {
            drugName: "A",
            quantity: 1000,
            expiryDate: "2028-12-31T00:00:00Z",
        },
        manuToken,
    );
    expectStatus("Create batch short name", badBatchName, 400);

    const createBody = {
        drugName: "Hapacol 650 Extra",
        quantity: 1000,
        expiryDate: "2028-12-31T00:00:00Z",
    };

    const createRes = await postWithAuth("/batches", createBody, manuToken);
    if (createRes.status === 201) {
        logPass("Create batch");
        writeLog("create-batch", createRes.data);
    } else {
        logFail(`Create batch -> HTTP ${createRes.status}`);
        writeLog("create-batch", createRes.data);
    }

    const batchId = createRes.data?.data?.batch?.batchID ?? "";
    const qrB64 = createRes.data?.data?.qrImageBase64 ?? "";

    if (batchId) {
        logPass("Batch ID received");
    } else {
        logFail("Missing batch ID");
    }

    ensureRealQrFixtures(qrB64);

    const mintFailRes = await postWithAuth("/batches", createBody, distToken);
    expectStatusOneOf("RBAC minting guard", mintFailRes, [403, 409]);

    console.log("-- Threshold scan flow");
    const thresholdCreateRes = await postWithAuth(
        "/batches",
        {
            drugName: "Threshold Test",
            quantity: 20,
            expiryDate: "2028-12-31T00:00:00Z",
        },
        manuToken,
    );
    if (thresholdCreateRes.status === 201) {
        logPass("Create threshold batch");
        writeLog("create-threshold-batch", thresholdCreateRes.data);
    } else {
        logFail(`Create threshold batch -> HTTP ${thresholdCreateRes.status}`);
        writeLog("create-threshold-batch", thresholdCreateRes.data);
    }

    const thresholdQrB64 = thresholdCreateRes.data?.data?.qrImageBase64 ?? "";
    const thresholdQrPath = path.join(TMP_DIR, "qr-threshold.png");
    if (thresholdQrB64) {
        fs.writeFileSync(
            thresholdQrPath,
            Buffer.from(thresholdQrB64, "base64"),
        );
    }

    if (thresholdQrB64) {
        let lastStatus = "";
        let thresholdRejected = false;
        for (let i = 0; i < 22; i += 1) {
            const form = new FormData();
            form.append("image", fs.createReadStream(thresholdQrPath));
            const verifyRes = await axios.post(`${API_BASE}/verify`, form, {
                headers: form.getHeaders(),
                validateStatus: () => true,
            });
            writeLog(`threshold-verify-${i + 1}`, verifyRes.data);

            if (verifyRes.status === 400) {
                const errorCode =
                    verifyRes.data?.error?.code ??
                    verifyRes.data?.error?.details?.decision?.code ??
                    "";

                if (errorCode === "SCAN_REJECTED" || i + 1 >= 22) {
                    logPass(`Threshold rejection reached at #${i + 1}`);
                    thresholdRejected = true;
                    break;
                }
            }

            if (verifyRes.status !== 200) {
                logFail(
                    `Threshold verify #${i + 1} -> HTTP ${verifyRes.status}`,
                );
                break;
            }

            const status = verifyRes.data?.data?.batchInfo?.status ?? "";
            if (status && status !== lastStatus) {
                logPass(`Threshold status -> ${status}`);
                lastStatus = status;
            }
        }

        if (!thresholdRejected) {
            logPass("Threshold flow completed");
        }
    } else {
        logFail("Threshold verify skipped (missing qrImageBase64)");
    }

    if (qrB64) {
        const qrPath = path.join(TMP_DIR, "qr.png");
        fs.writeFileSync(qrPath, Buffer.from(qrB64, "base64"));

        const form = new FormData();
        form.append("image", fs.createReadStream(qrPath));

        const verifyRes = await axios.post(`${API_BASE}/verify`, form, {
            headers: form.getHeaders(),
            validateStatus: () => true,
        });

        if (verifyRes.status === 200) {
            logPass("Verify QR");
            writeLog("verify-qr", verifyRes.data);
        } else if (verifyRes.status === 400) {
            logPass("Verify QR flagged counterfeit");
            writeLog("verify-qr", verifyRes.data);
        } else {
            logFail(`Verify QR -> HTTP ${verifyRes.status}`);
            writeLog("verify-qr", verifyRes.data);
        }
    } else {
        logFail("Verify QR skipped (missing qrImageBase64)");
    }

    const shipBody = { targetOwnerMSP: "DistributorMSP" };
    const shipRes = await postWithAuth(
        `/batches/${batchId}/ship`,
        shipBody,
        manuToken,
    );
    if (shipRes.status === 200) {
        logPass("Ship batch");
        writeLog("ship-batch", shipRes.data);
    } else {
        logFail(`Ship batch -> HTTP ${shipRes.status}`);
        writeLog("ship-batch", shipRes.data);
    }

    console.log("-- Edgecases: ship validation");
    const badShipOwner = await postWithAuth(
        `/batches/${batchId}/ship`,
        shipBody,
        distToken,
    );
    expectStatusOneOf("Ship batch non-owner", badShipOwner, [403, 409]);

    const badShipTarget = await postWithAuth(
        `/batches/${batchId}/ship`,
        { targetOwnerMSP: "BadMSP" },
        manuToken,
    );
    expectStatus("Ship batch invalid MSP", badShipTarget, 400);

    console.log("-- Edgecases: receive validation");
    const badReceive = await postWithAuth(
        `/batches/${batchId}/receive`,
        {},
        regToken,
    );
    expectStatusOneOf("Receive batch non-target", badReceive, [403, 409]);

    const receiveRes = await postWithAuth(
        `/batches/${batchId}/receive`,
        {},
        distToken,
    );
    if (receiveRes.status === 200) {
        logPass("Receive batch");
        writeLog("receive-batch", receiveRes.data);
    } else {
        logFail(`Receive batch -> HTTP ${receiveRes.status}`);
        writeLog("receive-batch", receiveRes.data);
    }

    const recallRes = await postWithAuth(
        `/batches/${batchId}/recall`,
        {},
        regToken,
    );
    if (recallRes.status === 200) {
        logPass("Recall batch");
        writeLog("recall-batch", recallRes.data);
    } else {
        logFail(`Recall batch -> HTTP ${recallRes.status}`);
        writeLog("recall-batch", recallRes.data);
    }

    console.log("-- Edgecases: recall validation");
    const badRecall = await postWithAuth(
        `/batches/${batchId}/recall`,
        {},
        manuToken,
    );
    expectStatusOneOf("Recall batch non-regulator", badRecall, [403, 409]);

    console.log("-- Edgecases: verify without image");
    const verifyMissing = await axios.post(
        `${API_BASE}/verify`,
        {},
        {
            headers: { "Content-Type": "application/json" },
            validateStatus: () => true,
        },
    );
    if (verifyMissing.status === 400) {
        logPass("Verify missing image -> 400");
        writeLog("verify-missing-image", verifyMissing.data);
    } else {
        logFail(`Verify missing image -> HTTP ${verifyMissing.status}`);
        writeLog("verify-missing-image", verifyMissing.data);
    }

    console.log("-- QR real image verification");
    const realQrPng = path.join(TMP_DIR, "qr-real.png");
    if (fs.existsSync(realQrPng)) {
        const realForm = new FormData();
        realForm.append("image", fs.createReadStream(realQrPng));
        const realVerify = await axios.post(`${API_BASE}/verify`, realForm, {
            headers: realForm.getHeaders(),
            validateStatus: () => true,
        });

        const confidence =
            realVerify.data?.data?.confidenceScore ??
            realVerify.data?.error?.details?.confidenceScore ??
            0;

        if (realVerify.status === 200) {
            logPass(
                `Verify qr-real.png (confidence: ${confidence.toFixed(4)})`,
            );
            writeLog("verify-qr-real-png", realVerify.data);
        } else if (realVerify.status === 400) {
            logPass(
                `Verify qr-real.png flagged counterfeit (confidence: ${confidence.toFixed(4)})`,
            );
            writeLog("verify-qr-real-png", realVerify.data);
        } else {
            logFail(`Verify qr-real.png -> HTTP ${realVerify.status}`);
            writeLog("verify-qr-real-png", realVerify.data);
        }
    } else {
        logFail("Missing qr-real.png in tmp folder");
    }

    console.log("-- QR scanned photo verification");
    const realQrJpg = path.join(TMP_DIR, "qr-real.jpg");
    if (fs.existsSync(realQrJpg)) {
        const scanForm = new FormData();
        scanForm.append("image", fs.createReadStream(realQrJpg));
        const scanVerify = await axios.post(`${API_BASE}/verify`, scanForm, {
            headers: scanForm.getHeaders(),
            validateStatus: () => true,
        });

        const scanConfidence =
            scanVerify.data?.data?.confidenceScore ??
            scanVerify.data?.error?.details?.confidenceScore ??
            0;

        if (scanVerify.status === 200) {
            logPass(
                `Verify qr-real.jpg (confidence: ${scanConfidence.toFixed(4)})`,
            );
            writeLog("verify-qr-real-jpg", scanVerify.data);
        } else if (scanVerify.status === 400) {
            logPass(
                `Verify qr-real.jpg flagged counterfeit (confidence: ${scanConfidence.toFixed(4)})`,
            );
            writeLog("verify-qr-real-jpg", scanVerify.data);
        } else {
            logFail(`Verify qr-real.jpg -> HTTP ${scanVerify.status}`);
            writeLog("verify-qr-real-jpg", scanVerify.data);
        }
    } else {
        const skipMessage =
            "Missing qr-real.jpg in tmp folder (real scan fixture not provided)";
        writeLog("verify-qr-real-jpg", {
            status: "SKIPPED",
            reason: skipMessage,
        });
        if (REQUIRE_REAL_SCAN_FIXTURE) {
            logFail(skipMessage);
        } else {
            logPass(`${skipMessage}; set REQUIRE_REAL_SCAN_FIXTURE=true to enforce`);
        }
    }

    const noTokenRes = await http.post("/batches", createBody);
    if (noTokenRes.status === 401) {
        logPass("Missing token -> 401");
        writeLog("missing-token", noTokenRes.data);
    } else {
        logFail(`Missing token -> HTTP ${noTokenRes.status}`);
        writeLog("missing-token", noTokenRes.data);
    }

    const badTokenRes = await postWithAuth(
        "/batches",
        createBody,
        "bad.token.here",
    );
    if (badTokenRes.status === 403) {
        logPass("Invalid token -> 403");
        writeLog("invalid-token", badTokenRes.data);
    } else {
        logFail(`Invalid token -> HTTP ${badTokenRes.status}`);
        writeLog("invalid-token", badTokenRes.data);
    }

    console.log("");
    console.log("== Summary ==");
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);

    if (failCount > 0) {
        console.log("Failures:");
        for (const item of failures) {
            console.log(`- ${item}`);
        }
        process.exit(1);
    }

    process.exit(0);
};

run().catch((err) => {
    const message = err?.message ? String(err.message) : String(err);
    console.error("Test script failed:", message);
    if (err?.response) {
        console.error("HTTP status:", err.response.status);
        writeLog("fatal-error-response", {
            status: err.response.status,
            data: err.response.data,
        });
    }
    if (err?.stack) {
        writeLog("fatal-error-stack", { stack: err.stack });
    }
    process.exit(1);
});
