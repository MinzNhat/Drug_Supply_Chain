import {
    assertStatus,
    authHeader,
    createE2eRequest,
    fail,
    login,
    register,
} from "./e2e-auth.mjs";

const request = createE2eRequest();

/**
 * Assert API error shape with explicit status and code expectations.
 *
 * @param {string} label - Assertion label.
 * @param {import("axios").AxiosResponse} response - HTTP response object.
 * @param {number[]} expectedStatuses - Allowed HTTP statuses.
 * @param {string[]} expectedCodes - Allowed error codes.
 */
const assertError = (label, response, expectedStatuses, expectedCodes) => {
    if (!expectedStatuses.includes(response.status)) {
        fail(`${label} unexpected status`, {
            expectedStatuses,
            actualStatus: response.status,
            body: response.data,
        });
    }

    const code = response.data?.error?.code;
    if (!expectedCodes.includes(code)) {
        fail(`${label} unexpected error code`, {
            expectedCodes,
            actualCode: code,
            status: response.status,
            body: response.data,
        });
    }
};

/**
 * Build compact transfer-state snapshot for immutability assertions.
 *
 * @param {Record<string, unknown>} batch - Batch payload from API read endpoint.
 * @returns {{ ownerMSP: string, ownerUnitId: string, transferStatus: string, targetOwnerMSP: string, targetOwnerUnitId: string, transferHistoryLength: number }}
 */
const toTransferState = (batch) => ({
    ownerMSP: String(batch?.ownerMSP ?? ""),
    ownerUnitId: String(batch?.ownerUnitId ?? ""),
    transferStatus: String(batch?.transferStatus ?? ""),
    targetOwnerMSP: String(batch?.targetOwnerMSP ?? ""),
    targetOwnerUnitId: String(batch?.targetOwnerUnitId ?? ""),
    transferHistoryLength: Array.isArray(batch?.transferHistory)
        ? batch.transferHistory.length
        : 0,
});

const run = async () => {
    const now = Date.now();
    const manufacturerUsername = `manu_tn_${now}`;
    const distributorAUsername = `dist_tn_a_${now}`;
    const distributorBUsername = `dist_tn_b_${now}`;
    const regulatorUsername = `reg_tn_${now}`;
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
    await register(request, regulatorUsername, "Regulator", "RegulatorMSP");

    const manufacturerToken = await login(request, manufacturerUsername);
    const distributorAToken = await login(request, distributorAUsername);
    const distributorBToken = await login(request, distributorBUsername);
    const regulatorToken = await login(request, regulatorUsername);

    const createResponse = await request.post(
        "/batches",
        {
            drugName: "E2E Transfer Negative Batch",
            quantity: 80,
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

    const expectedNegativeStatuses = [403, 409];
    const expectedNegativeCodes = ["FABRIC_FORBIDDEN", "FABRIC_CONFLICT"];

    const initialRead = await request.get(`/batches/${batchId}`, {
        headers: authHeader(manufacturerToken),
    });
    assertStatus("read initial batch", initialRead, 200);
    const initialState = toTransferState(initialRead.data?.data);

    // Case 1: forbidden actor tries to ship batch (non-owner ship attempt).
    const forbiddenShip = await request.post(
        `/batches/${batchId}/ship`,
        {
            targetOwnerMSP: "DistributorMSP",
            targetDistributorUnitId: distributorUnitB,
        },
        {
            headers: authHeader(distributorAToken),
        },
    );
    assertError(
        "forbidden ship",
        forbiddenShip,
        expectedNegativeStatuses,
        expectedNegativeCodes,
    );

    const afterForbiddenShipRead = await request.get(`/batches/${batchId}`, {
        headers: authHeader(manufacturerToken),
    });
    assertStatus("read after forbidden ship", afterForbiddenShipRead, 200);
    const afterForbiddenShipState = toTransferState(afterForbiddenShipRead.data?.data);
    if (
        afterForbiddenShipState.ownerMSP !== initialState.ownerMSP ||
        afterForbiddenShipState.ownerUnitId !== initialState.ownerUnitId ||
        afterForbiddenShipState.transferStatus !== initialState.transferStatus ||
        afterForbiddenShipState.targetOwnerMSP !== initialState.targetOwnerMSP ||
        afterForbiddenShipState.targetOwnerUnitId !==
            initialState.targetOwnerUnitId ||
        afterForbiddenShipState.transferHistoryLength !==
            initialState.transferHistoryLength
    ) {
        fail("state mutated after forbidden ship", {
            initialState,
            afterForbiddenShipState,
        });
    }

    // Move to in-transit state for receive negative-path checks.
    const validShip = await request.post(
        `/batches/${batchId}/ship`,
        {
            targetOwnerMSP: "DistributorMSP",
            targetDistributorUnitId: distributorUnitA,
        },
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus("valid ship", validShip, 200);

    // Case 2: wrong owner MSP receives batch (non-target receive attempt).
    const wrongReceiver = await request.post(
        `/batches/${batchId}/receive`,
        {},
        {
            headers: authHeader(regulatorToken),
        },
    );
    assertError(
        "wrong receiver",
        wrongReceiver,
        expectedNegativeStatuses,
        expectedNegativeCodes,
    );

    const inTransitRead = await request.get(`/batches/${batchId}`, {
        headers: authHeader(manufacturerToken),
    });
    assertStatus("read in-transit batch", inTransitRead, 200);
    const inTransitState = toTransferState(inTransitRead.data?.data);
    if (
        inTransitState.ownerMSP !== "ManufacturerMSP" ||
        inTransitState.transferStatus !== "IN_TRANSIT" ||
        inTransitState.targetOwnerMSP !== "DistributorMSP" ||
        inTransitState.targetOwnerUnitId !== distributorUnitA
    ) {
        fail("in-transit state mismatch after wrong receiver", {
            inTransitState,
        });
    }

    const validReceive = await request.post(
        `/batches/${batchId}/receive`,
        {},
        {
            headers: authHeader(distributorAToken),
        },
    );
    assertStatus("valid receive", validReceive, 200);

    // Case 3: distributor cannot ship to the same distributor unit.
    const sameUnitShip = await request.post(
        `/batches/${batchId}/ship`,
        {
            targetOwnerMSP: "DistributorMSP",
            targetDistributorUnitId: distributorUnitA,
        },
        {
            headers: authHeader(distributorAToken),
        },
    );
    assertError(
        "same unit ship",
        sameUnitShip,
        expectedNegativeStatuses,
        [
            ...expectedNegativeCodes,
            "SAME_DISTRIBUTOR_UNIT_TRANSFER_NOT_ALLOWED",
        ],
    );

    // Move to in-transit again for repeated receive negative-path checks.
    const crossUnitShip = await request.post(
        `/batches/${batchId}/ship`,
        {
            targetOwnerMSP: "DistributorMSP",
            targetDistributorUnitId: distributorUnitB,
        },
        {
            headers: authHeader(distributorAToken),
        },
    );
    assertStatus("cross unit ship", crossUnitShip, 200);

    const crossUnitReceive = await request.post(
        `/batches/${batchId}/receive`,
        {},
        {
            headers: authHeader(distributorBToken),
        },
    );
    assertStatus("cross unit receive", crossUnitReceive, 200);

    const afterValidReceiveRead = await request.get(`/batches/${batchId}`, {
        headers: authHeader(distributorBToken),
    });
    assertStatus("read after valid receive", afterValidReceiveRead, 200);
    const postReceiveState = toTransferState(afterValidReceiveRead.data?.data);

    // Case 4: repeated receive must fail and preserve post-receive state.
    const repeatedReceive = await request.post(
        `/batches/${batchId}/receive`,
        {},
        {
            headers: authHeader(distributorBToken),
        },
    );
    assertError(
        "repeated receive",
        repeatedReceive,
        expectedNegativeStatuses,
        expectedNegativeCodes,
    );

    const finalRead = await request.get(`/batches/${batchId}`, {
        headers: authHeader(distributorBToken),
    });
    assertStatus("read final batch state", finalRead, 200);
    const finalState = toTransferState(finalRead.data?.data);

    if (
        finalState.ownerMSP !== postReceiveState.ownerMSP ||
        finalState.ownerUnitId !== postReceiveState.ownerUnitId ||
        finalState.transferStatus !== postReceiveState.transferStatus ||
        finalState.targetOwnerMSP !== postReceiveState.targetOwnerMSP ||
        finalState.targetOwnerUnitId !== postReceiveState.targetOwnerUnitId ||
        finalState.transferHistoryLength !== postReceiveState.transferHistoryLength
    ) {
        fail("state mutated after repeated receive", {
            postReceiveState,
            finalState,
        });
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                batchId,
                forbiddenShipStatus: forbiddenShip.status,
                wrongReceiverStatus: wrongReceiver.status,
                sameUnitShipStatus: sameUnitShip.status,
                repeatedReceiveStatus: repeatedReceive.status,
                finalState,
            },
            null,
            2,
        ),
    );
};

run().catch((error) => {
    console.error("E2E_TRANSFER_NEGATIVE_FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
