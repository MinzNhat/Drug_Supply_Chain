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
    const distributorAUsername = `dist_transfer_a_${now}`;
    const distributorBUsername = `dist_transfer_b_${now}`;

    const distributorUnitA = "dist-unit-a";
    const distributorUnitB = "dist-unit-b";

    await register(
        request,
        manufacturerUsername,
        "Manufacturer",
        "ManufacturerMSP",
    );
    await register(
        request,
        distributorAUsername,
        "Distributor",
        "DistributorMSP",
        distributorUnitA,
    );
    await register(
        request,
        distributorBUsername,
        "Distributor",
        "DistributorMSP",
        distributorUnitB,
    );

    const manufacturerToken = await login(request, manufacturerUsername);
    const distributorAToken = await login(request, distributorAUsername);
    const distributorBToken = await login(request, distributorBUsername);

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
            targetDistributorUnitId: distributorUnitA,
        },
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus("ship batch", shipResponse, 200);

    const receiveResponse = await request.post(
        `/batches/${batchId}/receive`,
        {
            receiverUnitId: distributorUnitA,
        },
        {
            headers: authHeader(distributorAToken),
        },
    );
    assertStatus("receive batch", receiveResponse, 200);

    const crossUnitShipResponse = await request.post(
        `/batches/${batchId}/ship`,
        {
            targetOwnerMSP: "DistributorMSP",
            targetDistributorUnitId: distributorUnitB,
        },
        {
            headers: authHeader(distributorAToken),
        },
    );
    assertStatus("cross-unit ship", crossUnitShipResponse, 200);

    const crossUnitReceiveResponse = await request.post(
        `/batches/${batchId}/receive`,
        {
            receiverUnitId: distributorUnitB,
        },
        {
            headers: authHeader(distributorBToken),
        },
    );
    assertStatus("cross-unit receive", crossUnitReceiveResponse, 200);

    const readResponse = await request.get(`/batches/${batchId}`, {
        headers: authHeader(distributorBToken),
    });
    assertStatus("read batch", readResponse, 200);

    const ownerMSP = readResponse.data?.data?.ownerMSP;
    const ownerUnitId = readResponse.data?.data?.ownerUnitId;
    const transferStatus = readResponse.data?.data?.transferStatus;
    const transferHistory = Array.isArray(readResponse.data?.data?.transferHistory)
        ? readResponse.data.data.transferHistory
        : [];
    const lastTransfer = transferHistory[transferHistory.length - 1] || {};

    if (
        ownerMSP !== "DistributorMSP" ||
        ownerUnitId !== distributorUnitB ||
        transferStatus !== "NONE" ||
        lastTransfer.fromUnitId !== distributorUnitA ||
        lastTransfer.toUnitId !== distributorUnitB
    ) {
        fail("ownership transfer state mismatch", {
            ownerMSP,
            ownerUnitId,
            transferStatus,
            lastTransfer,
        });
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                batchId,
                shippedTo: "DistributorMSP",
                ownerMSP,
                ownerUnitId,
                transferStatus,
                lastTransfer,
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
