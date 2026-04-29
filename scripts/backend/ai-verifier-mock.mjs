import http from "http";

const PORT = Number(process.env.AI_MOCK_PORT ?? 8095);

/**
 * Write JSON response with stable headers.
 *
 * @param {import("http").ServerResponse} response - Outgoing response.
 * @param {number} statusCode - HTTP status code.
 * @param {Record<string, unknown>} payload - JSON payload.
 */
const writeJson = (response, statusCode, payload) => {
    response.writeHead(statusCode, {
        "Content-Type": "application/json",
    });
    response.end(JSON.stringify(payload));
};

const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
        writeJson(response, 200, { ok: true });
        return;
    }

    if (
        request.method === "POST" &&
        (request.url === "/verify" || request.url === "/api/v1/verify")
    ) {
        // Drain request body and always emit a deterministic AI reject response.
        request.on("data", () => {});
        request.on("end", () => {
            writeJson(response, 200, {
                accepted: false,
                confidence_score: 0.12,
                is_authentic: false,
                reason: "mocked-ai-reject",
            });
        });
        return;
    }

    writeJson(response, 404, {
        code: "NOT_FOUND",
        message: "Unsupported path",
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`AI verifier mock listening on ${PORT}`);
});
