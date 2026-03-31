import { status as grpcStatus } from "@grpc/grpc-js";
import assert from "node:assert/strict";
import test from "node:test";
import {
    isRetriableFabricError,
    translateFabricError,
} from "../../src/integrations/fabric/fabric-error-translator.js";

/**
 * Unit tests for Fabric error retry detection and HTTP translation.
 */

test("isRetriableFabricError returns true for transient grpc codes", () => {
    assert.equal(
        isRetriableFabricError({ code: grpcStatus.UNAVAILABLE }),
        true,
    );
    assert.equal(
        isRetriableFabricError({ code: grpcStatus.INVALID_ARGUMENT }),
        false,
    );
});

test("translateFabricError maps grpc timeout to standardized api error", () => {
    const error = translateFabricError(
        {
            code: grpcStatus.DEADLINE_EXCEEDED,
            message: "deadline exceeded",
        },
        {
            transactionName: "ReadBatch",
            mode: "evaluate",
            traceId: "trace-123",
        },
    );

    assert.equal(error.status, 504);
    assert.equal(error.code, "FABRIC_TIMEOUT");
    assert.equal(error.details.traceId, "trace-123");
});

test("translateFabricError infers denied message as forbidden", () => {
    const error = translateFabricError(
        {
            message: "Denied: only owner can ship",
        },
        {
            transactionName: "ShipBatch",
            mode: "submit",
            traceId: "trace-456",
        },
    );

    assert.equal(error.status, 403);
    assert.equal(error.code, "FABRIC_FORBIDDEN");
    assert.match(error.message, /Denied:/);
});
