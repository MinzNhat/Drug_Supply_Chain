import mongoose from "mongoose";
import {
    BATCH_GEO_EVENT_TYPES,
    BATCH_GEO_SOURCE_TYPES,
} from "../../constants/batch-geo/batch-geo.constants.js";

const { Schema } = mongoose;

/**
 * Geo event stream document used for timeline and heatmap analytics.
 */
const batchGeoEventSchema = new Schema(
    {
        batchID: { type: String, required: true, index: true },
        eventType: {
            type: String,
            required: true,
            enum: BATCH_GEO_EVENT_TYPES,
            index: true,
        },
        source: {
            type: String,
            required: true,
            enum: BATCH_GEO_SOURCE_TYPES,
            default: "MANUAL",
            index: true,
        },
        location: {
            type: {
                type: String,
                enum: ["Point"],
                required: true,
                default: "Point",
            },
            coordinates: {
                type: [Number],
                required: true,
                validate: {
                    validator(value) {
                        return (
                            Array.isArray(value) &&
                            value.length === 2 &&
                            Number.isFinite(value[0]) &&
                            Number.isFinite(value[1])
                        );
                    },
                    message: "location.coordinates must be [lng, lat]",
                },
            },
        },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        accuracyM: { type: Number, default: null },
        address: { type: String, default: "" },
        note: { type: String, default: "" },
        metadata: { type: Schema.Types.Mixed, default: {} },
        actorRole: { type: String, default: "", index: true },
        actorMSP: { type: String, default: "", index: true },
        actorUserId: { type: String, default: "", index: true },
        province: { type: String, default: "", index: true },
        traceId: { type: String, default: "", index: true },
        occurredAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true },
);

// Spatial index for map aggregation queries.
batchGeoEventSchema.index({ location: "2dsphere" });
// Timeline index for one batch.
batchGeoEventSchema.index({ batchID: 1, occurredAt: -1 });
// Actor scope index for organization-level analytics filters.
batchGeoEventSchema.index({ actorMSP: 1, occurredAt: -1 });

/**
 * Mongoose model for batch geo event stream.
 */
export const BatchGeoEvent = mongoose.model(
    "BatchGeoEvent",
    batchGeoEventSchema,
);
