import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
process.env.MONGO_DB = process.env.MONGO_DB ?? "drug_guard_test";
process.env.QR_SERVICE_URL =
    process.env.QR_SERVICE_URL ?? "http://localhost:8080";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";
process.env.DOC_UPLOAD_PROVIDER = process.env.DOC_UPLOAD_PROVIDER ?? "mock";

const { DocumentStorageAdapter } = await import(
    "../../src/integrations/document-storage/document-storage.adapter.js"
);

test("unit: document storage adapter returns deterministic CID in mock mode", async () => {
    const adapter = new DocumentStorageAdapter();

    const result = await adapter.uploadDocument(Buffer.from("abc123"), {
        docType: "qualityCert",
        fileName: "quality-cert.pdf",
        mediaType: "application/pdf",
    });

    assert.equal(result.provider, "mock");
    assert.equal(result.pinStatus, "pinned");
    assert.equal(result.digestSha256.length, 64);
    assert.equal(result.sizeBytes, 6);
    assert.match(result.cid, /^mock[a-f0-9]{58}$/);
});

test("unit: document storage adapter rejects empty payload", async () => {
    const adapter = new DocumentStorageAdapter();

    await assert.rejects(
        () =>
            adapter.uploadDocument(Buffer.alloc(0), {
                docType: "packageImage",
                fileName: "package.jpg",
                mediaType: "image/jpeg",
            }),
        (error) => {
            assert.equal(error?.code, "INVALID_DOCUMENT_PAYLOAD");
            return true;
        },
    );
});
