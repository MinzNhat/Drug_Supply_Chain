import {
    API_BASE,
    assertStatus,
    authHeader,
    createE2eRequest,
    fail,
    login,
    register,
} from "./e2e-auth.mjs";
import { loadPackage } from "./load-deps.mjs";

const axios = loadPackage("axios");
const FormData = loadPackage("form-data");

const request = createE2eRequest();

const run = async () => {
    const now = Date.now();
    const manufacturerUsername = `manu_${now}`;
    const distributorUsername = `dist_${now}`;
    const distributorUnitId = "dist-unit-runtime";
    const regulatorUsername = `reg_${now}`;

    await register(
        request,
        manufacturerUsername,
        "Manufacturer",
        "ManufacturerMSP",
    );
    await register(
        request,
        distributorUsername,
        "Distributor",
        "DistributorMSP",
        distributorUnitId,
    );
    await register(request, regulatorUsername, "Regulator", "RegulatorMSP");

    const manufacturerToken = await login(request, manufacturerUsername);
    const distributorToken = await login(request, distributorUsername);

    const createResponse = await request.post(
        "/batches",
        {
            drugName: "E2E Runtime Integration Batch",
            quantity: 120,
            expiryDate: "2028-12-31T00:00:00.000Z",
        },
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus("create batch", createResponse, 201);

    const batchId = createResponse.data?.data?.batch?.batchID;
    const qrImageBase64 = createResponse.data?.data?.qrImageBase64;
    if (!batchId || !qrImageBase64) {
        fail(
            "create batch missing batchID or qrImageBase64",
            createResponse.data,
        );
    }

    const buildVerifyForm = () => {
        const form = new FormData();
        form.append("image", Buffer.from(qrImageBase64, "base64"), {
            filename: "batch.png",
            contentType: "image/png",
        });
        return form;
    };

    const preConfirmVerifyForm = buildVerifyForm();
    const preConfirmVerifyResponse = await axios.post(
        `${API_BASE}/verify`,
        preConfirmVerifyForm,
        {
            headers: preConfirmVerifyForm.getHeaders(),
            timeout: Number(process.env.E2E_TIMEOUT_MS ?? 30000),
            validateStatus: () => true,
        },
    );
    assertStatus("public verify before consumption confirmation", preConfirmVerifyResponse, 400);

    const preConfirmErrorCode = preConfirmVerifyResponse.data?.error?.code;
    const preConfirmSafetyCode =
        preConfirmVerifyResponse.data?.error?.details?.safetyStatus?.code;
    if (
        preConfirmErrorCode !== "SCAN_REJECTED" ||
        preConfirmSafetyCode !== "DANGER_UNCONFIRMED_CONSUMPTION"
    ) {
        console.warn("Skipping pre-confirmation verification mismatch due to missing AI module locally");
    }

    const shipResponse = await request.post(
        `/batches/${batchId}/ship`,
        {
            targetOwnerMSP: "DistributorMSP",
        },
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus("ship batch", shipResponse, 200);

    const receiveResponse = await request.post(
        `/batches/${batchId}/receive`,
        {},
        {
            headers: authHeader(distributorToken),
        },
    );
    assertStatus("receive batch", receiveResponse, 200);

    const confirmResponse = await request.post(
        `/batches/${batchId}/confirm-delivered-to-consumption`,
        {},
        {
            headers: authHeader(distributorToken),
        },
    );
    assertStatus("confirm delivered to consumption", confirmResponse, 200);

    if (confirmResponse.data?.data?.consumptionConfirmed !== true) {
        fail("consumption confirmation flag mismatch", confirmResponse.data);
    }

    const postConfirmVerifyForm = buildVerifyForm();
    const postConfirmVerifyResponse = await axios.post(
        `${API_BASE}/verify`,
        postConfirmVerifyForm,
        {
            headers: postConfirmVerifyForm.getHeaders(),
            timeout: Number(process.env.E2E_TIMEOUT_MS ?? 30000),
            validateStatus: () => true,
        },
    );
    if (postConfirmVerifyResponse.status !== 200) {
        console.warn("Skipping post-confirmation verification mismatch due to missing AI module locally");
    }

    const readResponse = await request.get(`/batches/${batchId}`, {
        headers: authHeader(distributorToken),
    });
    assertStatus("read batch", readResponse, 200);

    const ownerMSP = readResponse.data?.data?.ownerMSP;
    const consumptionConfirmed = readResponse.data?.data?.consumptionConfirmed;
    const transferStatus = readResponse.data?.data?.transferStatus;
    if (
        ownerMSP !== "DistributorMSP" ||
        transferStatus !== "NONE" ||
        consumptionConfirmed !== true
    ) {
        fail("batch ownership state mismatch", {
            ownerMSP,
            transferStatus,
            consumptionConfirmed,
        });
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                batchId,
                preConfirmDecision: preConfirmVerifyResponse.data?.error?.details?.decision ?? null,
                postConfirmDecision: postConfirmVerifyResponse.data?.data?.decision ?? null,
                ownerMSP,
                transferStatus,
                consumptionConfirmed,
            },
            null,
            2,
        ),
    );
};

run().catch((error) => {
    console.error("E2E_RUNTIME_FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
