import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Reverse lookup index that maps QR/hash metadata to batch identifiers.
 */
const batchIndexSchema = new Schema(
    {
        batchID: { type: String, required: true, unique: true, index: true },
        dataHash: { type: String, required: true, unique: true, index: true },
        tokenDigest: { type: String, default: "" },
        metadataSeries: { type: String, default: "" },
        metadataIssued: { type: String, default: "" },
        metadataExpiry: { type: String, default: "" },
        qrToken: { type: String, default: "" },
    },
    { timestamps: true },
);

/**
 * Mongoose model for protected-QR batch lookup index.
 */
export const BatchIndex = mongoose.model("BatchIndex", batchIndexSchema);
