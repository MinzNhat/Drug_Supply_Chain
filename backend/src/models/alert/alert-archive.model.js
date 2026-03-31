import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Persisted canonical alert payload for regulator retrieval and reporting APIs.
 */
const alertArchiveSchema = new Schema(
    {
        canonicalKey: { type: String, required: true, index: true },
        sinkEventId: { type: String, required: true, index: true },
        severity: {
            type: String,
            required: true,
            enum: ["info", "warn", "critical"],
            index: true,
        },
        source: {
            type: {
                type: String,
                required: true,
                enum: ["backend_decision", "chaincode_event", "backend_action"],
                index: true,
            },
            key: { type: String, required: true, index: true },
        },
        batchID: { type: String, default: "", index: true },
        traceId: { type: String, default: "", index: true },
        occurredAt: { type: Date, required: true, index: true },
        details: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true },
);

alertArchiveSchema.index({ canonicalKey: 1, occurredAt: -1 });
alertArchiveSchema.index({ severity: 1, occurredAt: -1 });
alertArchiveSchema.index({ batchID: 1, occurredAt: -1 });

/**
 * Mongoose model for canonical alert archive storage.
 */
export const AlertArchive = mongoose.model("AlertArchive", alertArchiveSchema);
