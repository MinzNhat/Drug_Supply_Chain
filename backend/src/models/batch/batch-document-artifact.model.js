import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Off-chain artifact record for document CID updates.
 */
const batchDocumentArtifactSchema = new Schema(
    {
        batchID: { type: String, required: true, index: true },
        docType: {
            type: String,
            required: true,
            enum: ["packageImage", "qualityCert"],
            index: true,
        },
        cid: { type: String, required: true, index: true },
        source: {
            type: String,
            required: true,
            enum: ["manual-cid", "direct-upload"],
            index: true,
        },
        provider: { type: String, required: true, default: "manual" },
        pinStatus: {
            type: String,
            required: true,
            enum: ["pinned", "uploaded", "unknown", "orphaned"],
            default: "unknown",
        },
        digestSha256: { type: String, default: "" },
        sizeBytes: { type: Number, default: 0 },
        mediaType: { type: String, default: "" },
        ledgerUpdated: { type: Boolean, required: true, default: false },
        ledgerError: { type: String, default: "" },
        uploadedBy: {
            id: { type: String, default: "" },
            role: { type: String, default: "" },
            mspId: { type: String, default: "" },
        },
        traceId: { type: String, default: "", index: true },
    },
    { timestamps: true },
);

batchDocumentArtifactSchema.index({ batchID: 1, docType: 1, createdAt: -1 });
batchDocumentArtifactSchema.index({ cid: 1, createdAt: -1 });

/**
 * Mongoose model for batch document upload/manual CID traces.
 */
export const BatchDocumentArtifact = mongoose.model(
    "BatchDocumentArtifact",
    batchDocumentArtifactSchema,
);