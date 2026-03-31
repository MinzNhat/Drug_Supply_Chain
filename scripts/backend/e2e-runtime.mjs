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

    const form = new FormData();
    form.append("image", Buffer.from(qrImageBase64, "base64"), {
        filename: "batch.png",
        contentType: "image/png",
    });

    const verifyResponse = await axios.post(`${API_BASE}/verify`, form, {
        headers: form.getHeaders(),
        timeout: Number(process.env.E2E_TIMEOUT_MS ?? 30000),
        validateStatus: () => true,
    });
    assertStatus("public verify", verifyResponse, 200);

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

    const readResponse = await request.get(`/batches/${batchId}`, {
        headers: authHeader(distributorToken),
    });
    assertStatus("read batch", readResponse, 200);

    const ownerMSP = readResponse.data?.data?.ownerMSP;
    const transferStatus = readResponse.data?.data?.transferStatus;
    if (ownerMSP !== "DistributorMSP" || transferStatus !== "NONE") {
        fail("batch ownership state mismatch", {
            ownerMSP,
            transferStatus,
        });
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                batchId,
                verifyDecision: verifyResponse.data?.data?.decision ?? null,
                ownerMSP,
                transferStatus,
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
