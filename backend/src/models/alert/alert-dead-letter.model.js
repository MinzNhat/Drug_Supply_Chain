import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Dead-letter record for alerts that exceeded retry policy.
 */
const alertDeadLetterSchema = new Schema(
    {
        idempotencyKey: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        canonicalKey: { type: String, required: true, index: true },
        sinkEventId: { type: String, required: true, index: true },
        sinkChannel: { type: String, required: true, index: true },
        batchID: { type: String, default: "", index: true },
        traceId: { type: String, default: "", index: true },
        attemptsCount: { type: Number, required: true },
        finalErrorMessage: { type: String, default: "" },
        failedAt: { type: Date, required: true, index: true },
        payload: { type: Schema.Types.Mixed, required: true },
    },
    { timestamps: true },
);

/**
 * Mongoose model for alert dead-letter queue.
 */
export const AlertDeadLetter = mongoose.model(
    "AlertDeadLetter",
    alertDeadLetterSchema,
);
