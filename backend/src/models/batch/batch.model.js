import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Historical record for one document CID update.
 */
const documentHistorySchema = new Schema(
    {
        cid: { type: String, required: true },
        updatedAt: { type: Date, required: true },
        updatedBy: { type: String, required: true },
    },
    { _id: false },
);

/**
 * Embedded metadata for one batch document (package image or quality cert).
 */
const documentSchema = new Schema(
    {
        currentCID: { type: String, default: "" },
        lastUpdated: { type: Date, default: null },
        pinned: { type: Boolean, default: false },
        history: { type: [documentHistorySchema], default: [] },
    },
    { _id: false },
);

/**
 * Ownership transfer timeline entry.
 */
const transferHistorySchema = new Schema(
    {
        from: { type: String, required: true },
        to: { type: String, required: true },
        timestamp: { type: Date, required: true },
    },
    { _id: false },
);

/**
 * Canonical batch aggregate document mirrored from ledger-related workflows.
 */
const batchSchema = new Schema(
    {
        docType: { type: String, default: "batch", index: true },
        batchID: { type: String, required: true, unique: true },
        drugName: { type: String, required: true },
        manufacturerMSP: { type: String, required: true },
        ownerMSP: { type: String, required: true },
        expiryDate: { type: Date, required: true },
        totalSupply: { type: Number, required: true },
        scanCount: { type: Number, default: 0 },
        warningThreshold: { type: Number, required: true },
        suspiciousThreshold: { type: Number, required: true },
        status: {
            type: String,
            enum: ["ACTIVE", "WARNING", "SUSPICIOUS", "RECALLED"],
            default: "ACTIVE",
        },
        transferStatus: {
            type: String,
            enum: ["NONE", "IN_TRANSIT"],
            default: "NONE",
        },
        targetOwnerMSP: { type: String, default: "" },
        qrToken: { type: String, required: true },
        dataHash: { type: String, required: true, index: true },
        documents: {
            packageImage: { type: documentSchema, default: () => ({}) },
            qualityCert: { type: documentSchema, default: () => ({}) },
        },
        transferHistory: { type: [transferHistorySchema], default: [] },
    },
    { timestamps: true },
);

/**
 * Mongoose model for batch aggregate state.
 */
export const Batch = mongoose.model("Batch", batchSchema);
