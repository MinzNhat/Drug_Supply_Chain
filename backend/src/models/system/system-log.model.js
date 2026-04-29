import mongoose from "mongoose";

const SystemLogSchema = new mongoose.Schema(
    {
        level: {
            type: String,
            enum: ["info", "warn", "error"],
            default: "info",
        },
        category: {
            type: String,
            required: true,
            enum: ["AUTH", "NETWORK", "BLOCKCHAIN", "PRODUCT", "SYSTEM"],
        },
        action: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        username: {
            type: String,
        },
        ip: {
            type: String,
        },
        userAgent: {
            type: String,
        }
    },
    { timestamps: true }
);

// Indexing for faster log retrieval
SystemLogSchema.index({ createdAt: -1 });
SystemLogSchema.index({ level: 1 });
SystemLogSchema.index({ category: 1 });

export const SystemLog = mongoose.model("SystemLog", SystemLogSchema);
