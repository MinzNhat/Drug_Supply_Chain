import {
    assertStatus,
    authHeader,
    createE2eRequest,
    fail,
    login,
    register,
} from "./e2e-auth.mjs";

const request = createE2eRequest();

const run = async () => {
    const now = Date.now();
    const manufacturerUsername = `manu_transfer_${now}`;
    const distributorUsername = `dist_transfer_${now}`;

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

    const manufacturerToken = await login(request, manufacturerUsername);
    const distributorToken = await login(request, distributorUsername);

    const createResponse = await request.post(
        "/batches",
        {
            drugName: "E2E Transfer Batch",
            quantity: 60,
            expiryDate: "2028-12-31T00:00:00.000Z",
        },
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus("create batch", createResponse, 201);

    const batchId = createResponse.data?.data?.batch?.batchID;
    if (!batchId) {
        fail("create batch missing batchID", createResponse.data);
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

    const readResponse = await request.get(`/batches/${batchId}`, {
        headers: authHeader(distributorToken),
    });
    assertStatus("read batch", readResponse, 200);

    const ownerMSP = readResponse.data?.data?.ownerMSP;
    const transferStatus = readResponse.data?.data?.transferStatus;
    if (ownerMSP !== "DistributorMSP" || transferStatus !== "NONE") {
        fail("ownership transfer state mismatch", {
            ownerMSP,
            transferStatus,
        });
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                batchId,
                shippedTo: "DistributorMSP",
                ownerMSP,
                transferStatus,
            },
            null,
            2,
        ),
    );
};

run().catch((error) => {
    console.error("E2E_TRANSFER_BATCH_FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
