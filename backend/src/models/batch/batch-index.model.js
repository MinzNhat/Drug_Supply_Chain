import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Reverse lookup index that maps QR/hash metadata to batch identifiers.
 */
const batchIndexSchema = new Schema(
    {
        batchID: { type: String, required: true, unique: true, index: true },
        drugName: { type: String, index: true },
        quantity: { type: Number },
        expiryDate: { type: String },
        manufacturerMSP: { type: String, index: true },
        manufacturerId: { type: String, index: true },
        ownerMSP: { type: String, index: true },
        ownerId: { type: String, index: true },
        targetOwnerId: { type: String, index: true },
        transferStatus: { type: String, index: true, default: "NONE" },
        status: { type: String, index: true },
        qrMetadata: {
            dataHash: { type: String, index: true },
            metadataSeries: { type: String },
            metadataIssued: { type: String },
            metadataExpiry: { type: String },
        },
        qrImageBase64: { type: String },
        tokenDigest: { type: String, default: "" },
        qrToken: { type: String, default: "" },
        safetyStatus: {
            level: { type: String, default: "SAFE" },
            reason: { type: String, default: "" },
        },
        recallStatus: { type: String, index: true, default: "NONE" },
        recallNote: { type: String, default: "" },
    },
    { timestamps: true },
);

/**
 * Mongoose model for protected-QR batch lookup index.
 */
export const BatchIndex = mongoose.model("BatchIndex", batchIndexSchema);
