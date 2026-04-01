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
 * Ensure one value is a non-empty string.
 *
 * @param {unknown} value - Candidate value.
 * @param {string} label - Field label for error messages.
 */
const assertNonEmptyString = (value, label) => {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label} must be a non-empty string`, { value });
    }
};

/**
 * Ensure one value is a finite number.
 *
 * @param {unknown} value - Candidate numeric value.
 * @param {string} label - Field label for error messages.
 */
const assertFiniteNumber = (value, label) => {
    if (!Number.isFinite(Number(value))) {
        fail(`${label} must be a finite number`, { value });
    }
};

const run = async () => {
    const now = Date.now();
    const manufacturerUsername = `manu_geo_${now}`;
    const distributorUsername = `dist_geo_${now}`;
    const regulatorUsername = `reg_geo_${now}`;
    const scenarioTag = `geo-e2e-${now}`;
    const fromIso = new Date(now - 1000).toISOString();

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
    const regulatorToken = await login(request, regulatorUsername);

    const createBatchResponse = await request.post(
        "/batches",
        {
            drugName: "E2E Geo Flow Batch",
            quantity: 50,
            expiryDate: "2028-12-31T00:00:00.000Z",
        },
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus("create batch", createBatchResponse, 201);

    const batchId = createBatchResponse.data?.data?.batch?.batchID;
    assertNonEmptyString(batchId, "batchId");

    // Use slightly different coordinates to exercise heatmap bucketing.
    const eventsToCreate = [
        {
            eventType: "WAREHOUSE",
            source: "MANUAL",
            lat: 10.77691,
            lng: 106.70091,
            note: `${scenarioTag}-warehouse`,
            metadata: { lane: "storage" },
        },
        {
            eventType: "DELIVERY",
            source: "SYSTEM",
            lat: 10.77721,
            lng: 106.70124,
            note: `${scenarioTag}-delivery`,
            metadata: { lane: "transport" },
        },
        {
            eventType: "SCAN",
            source: "VERIFY",
            lat: 10.77735,
            lng: 106.70135,
            note: `${scenarioTag}-scan`,
            metadata: { lane: "retail" },
        },
    ];

    for (const payload of eventsToCreate) {
        const ingestResponse = await request.post(
            `/batches/${batchId}/events`,
            payload,
            {
                headers: authHeader(manufacturerToken),
            },
        );
        assertStatus(`ingest event ${payload.eventType}`, ingestResponse, 201);

        const eventRow = ingestResponse.data?.data;
        assertNonEmptyString(eventRow?.id, "event.id");
        if (eventRow?.batchID !== batchId) {
            fail("event batchID mismatch", { expected: batchId, actual: eventRow?.batchID });
        }
        assertFiniteNumber(eventRow?.lat, "event.lat");
        assertFiniteNumber(eventRow?.lng, "event.lng");
    }

    const timelineQuery = new URLSearchParams({
        limit: "50",
        from: fromIso,
    });
    const timelineResponse = await request.get(
        `/batches/${batchId}/events?${timelineQuery.toString()}`,
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus("timeline query", timelineResponse, 200);

    const timelineRows = timelineResponse.data?.data?.events;
    if (!Array.isArray(timelineRows)) {
        fail("timeline response must include events array", timelineResponse.data);
    }

    const scenarioEvents = timelineRows.filter((row) => {
        return typeof row?.note === "string" && row.note.includes(scenarioTag);
    });
    if (scenarioEvents.length !== eventsToCreate.length) {
        fail("timeline event count mismatch", {
            expected: eventsToCreate.length,
            actual: scenarioEvents.length,
        });
    }

    for (const row of scenarioEvents) {
        assertNonEmptyString(row.id, "timeline.id");
        if (row.batchID !== batchId) {
            fail("timeline batchID mismatch", { expected: batchId, actual: row.batchID });
        }
        if (row.actorMSP !== "ManufacturerMSP") {
            fail("timeline actorMSP mismatch", {
                expected: "ManufacturerMSP",
                actual: row.actorMSP,
            });
        }
        assertFiniteNumber(row.lat, "timeline.lat");
        assertFiniteNumber(row.lng, "timeline.lng");
    }

    // Non-regulator user cannot query cross-MSP heatmap scope.
    const forbiddenHeatmapQuery = new URLSearchParams({
        actorMSP: "DistributorMSP",
        from: fromIso,
    });
    const forbiddenHeatmapResponse = await request.get(
        `/analytics/heatmap?${forbiddenHeatmapQuery.toString()}`,
        {
            headers: authHeader(manufacturerToken),
        },
    );
    assertStatus(
        "heatmap cross-msp forbidden",
        forbiddenHeatmapResponse,
        403,
    );

    const regulatorHeatmapQuery = new URLSearchParams({
        actorMSP: "ManufacturerMSP",
        precision: "3",
        limit: "2000",
        from: fromIso,
    });
    const regulatorHeatmapResponse = await request.get(
        `/analytics/heatmap?${regulatorHeatmapQuery.toString()}`,
        {
            headers: authHeader(regulatorToken),
        },
    );
    assertStatus("regulator heatmap query", regulatorHeatmapResponse, 200);

    const heatmapData = regulatorHeatmapResponse.data?.data;
    if (!heatmapData || !Array.isArray(heatmapData.buckets)) {
        fail("heatmap response missing buckets", regulatorHeatmapResponse.data);
    }
    assertFiniteNumber(heatmapData.totalPoints, "heatmap.totalPoints");

    if (Number(heatmapData.totalPoints) < eventsToCreate.length) {
        fail("heatmap totalPoints lower than ingested events", {
            expectedAtLeast: eventsToCreate.length,
            actual: heatmapData.totalPoints,
        });
    }

    const bucketCountSum = heatmapData.buckets.reduce((sum, bucket) => {
        return sum + Number(bucket?.count ?? 0);
    }, 0);
    if (bucketCountSum < eventsToCreate.length) {
        fail("heatmap aggregation count mismatch", {
            expectedAtLeast: eventsToCreate.length,
            actual: bucketCountSum,
        });
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                batchId,
                scenarioTag,
                ingestedEvents: eventsToCreate.length,
                timelineEvents: scenarioEvents.length,
                heatmapTotalPoints: heatmapData.totalPoints,
                heatmapBuckets: heatmapData.buckets.length,
            },
            null,
            2,
        ),
    );
};

run().catch((error) => {
    console.error("E2E_GEO_FLOW_FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
