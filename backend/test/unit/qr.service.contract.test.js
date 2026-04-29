import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
process.env.MONGO_DB = process.env.MONGO_DB ?? "drug_guard_test";
process.env.QR_SERVICE_URL =
    process.env.QR_SERVICE_URL ?? "http://localhost:8080";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

const { QrService } = await import("../../src/services/qr/qr.service.js");
const { HttpException } = await import(
    "../../src/utils/http-exception/http-exception.js"
);

test("unit contract: qr generate request and success payload shape", async () => {
    const service = new QrService();

    service.http.post = async (path, body) => {
        assert.equal(path, "/api/v1/qr/generate");
        assert.deepEqual(body, {
            dataHash: "a1b2c3d4",
            metadataSeries: "1234567890abcdef",
            metadataIssued: "0011223344556677",
            metadataExpiry: "8899aabbccddeeff",
        });

        return {
            data: {
                success: true,
                data: {
                    token: "tok-123",
                    qrImageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
                },
            },
        };
    };

    const result = await service.generate({
        dataHash: "a1b2c3d4",
        metadataSeries: "1234567890abcdef",
        metadataIssued: "0011223344556677",
        metadataExpiry: "8899aabbccddeeff",
    });

    assert.deepEqual(result, {
        token: "tok-123",
        qrImageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    });
});

test("unit contract: qr verify request and success payload shape", async () => {
    const service = new QrService();

    service.http.post = async (path, form, options) => {
        assert.equal(path, "/api/v1/qr/verify");
        assert.equal(typeof form?.getHeaders, "function");
        assert.match(options?.headers?.["content-type"] ?? "", /multipart\/form-data/);

        return {
            data: {
                token: "tok-verify",
                isAuthentic: true,
                confidenceScore: 0.92,
                decodedMeta: {
                    dataHash: "a1b2c3d4",
                    metadataSeries: "1234567890abcdef",
                    metadataIssued: "0011223344556677",
                    metadataExpiry: "8899aabbccddeeff",
                },
            },
        };
    };

    const result = await service.verify(Buffer.from("img-bytes"));

    assert.deepEqual(result, {
        token: "tok-verify",
        isAuthentic: true,
        confidenceScore: 0.92,
        decodedMeta: {
            dataHash: "a1b2c3d4",
            metadataSeries: "1234567890abcdef",
            metadataIssued: "0011223344556677",
            metadataExpiry: "8899aabbccddeeff",
        },
    });
});

test("unit contract: qr generate rejects contract mismatch", async () => {
    const service = new QrService();

    service.http.post = async () => ({
        data: {
            success: true,
            data: {
                token: "tok-only",
            },
        },
    });

    await assert.rejects(
        () =>
            service.generate({
                dataHash: "a1b2c3d4",
                metadataSeries: "1234567890abcdef",
                metadataIssued: "0011223344556677",
                metadataExpiry: "8899aabbccddeeff",
            }),
        (error) => {
            assert.ok(error instanceof HttpException);
            assert.equal(error.status, 502);
            assert.equal(error.code, "QR_GENERATE_BAD_CONTRACT");
            assert.match(error.message, /contract mismatch/i);
            return true;
        },
    );
});

test("unit contract: qr verify maps upstream standardized error payload", async () => {
    const service = new QrService();

    service.http.post = async () => {
        throw {
            response: {
                status: 400,
                data: {
                    success: false,
                    error: {
                        code: "BAD_REQUEST",
                        message: "Image file is required",
                        traceId: "trace-qr-001",
                        details: {
                            errors: {
                                image: ["Required"],
                            },
                        },
                    },
                },
            },
        };
    };

    await assert.rejects(
        () => service.verify(Buffer.from("img-bytes")),
        (error) => {
            assert.ok(error instanceof HttpException);
            assert.equal(error.status, 400);
            assert.equal(error.code, "BAD_REQUEST");
            assert.equal(error.message, "Image file is required");
            assert.equal(error.traceId, "trace-qr-001");
            assert.deepEqual(error.details?.upstreamDetails, {
                errors: {
                    image: ["Required"],
                },
            });
            return true;
        },
    );
});

test("unit contract: qr verify maps legacy trace_id error payload", async () => {
    const service = new QrService();

    service.http.post = async () => {
        throw {
            response: {
                status: 400,
                data: {
                    success: false,
                    error: {
                        code: "BAD_REQUEST",
                        message: "Image file is required",
                        trace_id: "trace-qr-legacy-001",
                    },
                },
            },
        };
    };

    await assert.rejects(
        () => service.verify(Buffer.from("img-bytes")),
        (error) => {
            assert.ok(error instanceof HttpException);
            assert.equal(error.status, 400);
            assert.equal(error.code, "BAD_REQUEST");
            assert.equal(error.message, "Image file is required");
            assert.equal(error.traceId, "trace-qr-legacy-001");
            return true;
        },
    );
});
