import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
    {
        productName: {
            type: String,
            required: true,
        },
        issues: {
            type: String,
            required: true,
        },
        description: {
            type: String,
        },
        paymentBillMeta: {
            fileName: String,
            size: Number,
        },
        qrImageMeta: {
            fileName: String,
            size: Number,
        },
        drugImageMeta: {
            fileName: String,
            size: Number,
        },
        additionalImageMeta: {
            fileName: String,
            size: Number,
        },
        status: {
            type: String,
            enum: ["PENDING", "RESOLVED", "REJECTED"],
            default: "PENDING",
        },
        severity: {
            type: String,
            enum: ["info", "warn", "critical"],
            default: "warn",
        },
        lat: Number,
        lng: Number,
        reporterIP: String,
        province: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// TTL index to automatically delete reports after 30 days of resolution
// We would ideally have a background worker clean up the file system too, 
// but this satisfies the basic auto-delete metadata requirement.
reportSchema.index(
    { updatedAt: 1 },
    { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { status: "RESOLVED" } }
);

export const Report = mongoose.model("Report", reportSchema);
