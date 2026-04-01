import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * One sink delivery attempt metadata for one canonical alert payload.
 */
const alertDeliveryAttemptSchema = new Schema(
    {
        attempt: { type: Number, required: true },
        succeeded: { type: Boolean, required: true },
        statusCode: { type: Number, default: null },
        errorMessage: { type: String, default: "" },
        executedAt: { type: Date, required: true },
    },
    { _id: false },
);

/**
 * Persistent sink delivery state keyed by idempotency key.
 */
const alertDeliverySchema = new Schema(
    {
        idempotencyKey: { type: String, required: true, unique: true, index: true },
        canonicalKey: { type: String, required: true, index: true },
        sinkEventId: { type: String, required: true, index: true },
        batchID: { type: String, default: "", index: true },
        traceId: { type: String, default: "", index: true },
        sourceType: { type: String, default: "", index: true },
        sourceKey: { type: String, default: "", index: true },
        status: {
            type: String,
            required: true,
            enum: ["PENDING", "RETRYING", "DELIVERED", "DEAD_LETTER"],
            default: "PENDING",
            index: true,
        },
        sinkChannel: { type: String, default: "", index: true },
        attemptsCount: { type: Number, required: true, default: 0 },
        retryScheduledAt: { type: Date, default: null },
        lastAttemptAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null },
        deadLetteredAt: { type: Date, default: null },
        lastErrorMessage: { type: String, default: "" },
        payload: { type: Schema.Types.Mixed, required: true },
        attempts: { type: [alertDeliveryAttemptSchema], default: [] },
    },
    { timestamps: true },
);

alertDeliverySchema.index({ canonicalKey: 1, createdAt: -1 });
alertDeliverySchema.index({ status: 1, updatedAt: -1 });
alertDeliverySchema.index({ sinkEventId: 1, updatedAt: -1 });

/**
 * Mongoose model for canonical alert sink delivery state.
 */
export const AlertDelivery = mongoose.model("AlertDelivery", alertDeliverySchema);
