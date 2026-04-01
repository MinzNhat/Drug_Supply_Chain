import assert from "node:assert/strict";
import test from "node:test";

process.env.PYTHON_SERVICE_URL =
    process.env.PYTHON_SERVICE_URL || "http://localhost:8700";

const { AiAppearanceService } = await import(
    "../../src/services/ai-appearance.service.js"
);
const { HttpException } = await import("../../src/utils/http-exception.js");

/**
 * Assert error is HttpException with expected status/code.
 *
 * @param {unknown} error - Thrown error.
 * @param {number} status - Expected status.
 * @param {string} code - Expected code.
 */
const assertHttpException = (error, status, code) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
};

test("verify throws IMAGE_REQUIRED when image buffer is missing", async () => {
    const service = new AiAppearanceService();

    await assert.rejects(
        async () => service.verify(null, "trace-1"),
        (error) => {
            assertHttpException(error, 400, "IMAGE_REQUIRED");
            return true;
        },
    );
});

test("verify returns upstream payload when python core responds successfully", async () => {
    const service = new AiAppearanceService();
    service.http = {
        post: async () => ({
            data: {
                accepted: true,
                confidence_score: 0.92,
                verdict: "AUTHENTIC",
            },
        }),
    };

    const result = await service.verify(Buffer.from("image"), "trace-2");

    assert.equal(result.accepted, true);
    assert.equal(result.confidence_score, 0.92);
    assert.equal(result.verdict, "AUTHENTIC");
});

test("verify maps upstream 400 to AI_BAD_IMAGE", async () => {
    const service = new AiAppearanceService();
    service.http = {
        post: async () => {
            throw {
                isAxiosError: true,
                response: {
                    status: 400,
                    data: {
                        detail: "image field must be image/*",
                    },
                },
            };
        },
    };

    await assert.rejects(
        async () => service.verify(Buffer.from("bad"), "trace-3"),
        (error) => {
            assertHttpException(error, 400, "AI_BAD_IMAGE");
            assert.equal(error.message, "image field must be image/*");
            return true;
        },
    );
});

test("verify maps upstream 503 to AI_MODEL_UNAVAILABLE", async () => {
    const service = new AiAppearanceService();
    service.http = {
        post: async () => {
            throw {
                isAxiosError: true,
                response: {
                    status: 503,
                    data: {
                        detail: "AI model is not available",
                    },
                },
            };
        },
    };

    await assert.rejects(
        async () => service.verify(Buffer.from("img"), "trace-4"),
        (error) => {
            assertHttpException(error, 503, "AI_MODEL_UNAVAILABLE");
            return true;
        },
    );
});

test("verify maps unknown upstream failure to AI_UPSTREAM_FAILED", async () => {
    const service = new AiAppearanceService();
    service.http = {
        post: async () => {
            throw new Error("socket hang up");
        },
    };

    await assert.rejects(
        async () => service.verify(Buffer.from("img"), "trace-5"),
        (error) => {
            assertHttpException(error, 502, "AI_UPSTREAM_FAILED");
            return true;
        },
    );
});
