import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Read-optimized snapshot of batch state used by list/filter API endpoints.
 */
const batchStateSchema = new Schema(
    {
        batchID: { type: String, required: true, unique: true, index: true },
        drugName: { type: String, default: "", index: true },
        manufacturerMSP: { type: String, default: "", index: true },
        manufacturerId: { type: String, default: "", index: true },
        ownerMSP: { type: String, default: "", index: true },
        ownerId: { type: String, default: "", index: true },
        targetOwnerId: { type: String, default: "", index: true },
        status: { type: String, default: "", index: true },
        transferStatus: { type: String, default: "", index: true },
        expiryDate: { type: Date, default: null, index: true },
        scanCount: { type: Number, default: 0 },
        totalSupply: { type: Number, default: 0 },
        province: { type: String, default: "", index: true }, // For hierarchy filtering
        recallStatus: {
            type: String,
            enum: ["NONE", "REQUESTED", "APPROVED", "REJECTED"],
            default: "NONE",
            index: true,
        },
        recallRequestedById: { type: String, default: "" },
        recallRequestedAt: { type: Date, default: null },
        recallNote: { type: String, default: "" },
        consumptionConfirmed: { type: Boolean, default: false, index: true },
        lastLedgerSyncAt: { type: Date, default: Date.now, index: true },
        batch: { type: Schema.Types.Mixed, required: true },
        metadata: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true },
);

// Composite index optimized for owner/status transfer list queries.
batchStateSchema.index({ ownerId: 1, ownerMSP: 1, status: 1, transferStatus: 1 });

/**
 * Mongoose model for batch snapshot read model.
 */
export const BatchState = mongoose.model("BatchState", batchStateSchema);
