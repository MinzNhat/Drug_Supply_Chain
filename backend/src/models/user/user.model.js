import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Local user credential and role mapping document.
 */
const userSchema = new Schema(
    {
        username: { type: String, required: true, unique: true, index: true },
        password: { type: String, required: true },
        role: {
            type: String,
            enum: ["Manufacturer", "Distributor", "Regulator", "Admin"],
            required: true,
        },
        mspId: { type: String, required: true },
        distributorUnitId: {
            type: String,
            default: "",
            index: true,
        },
        businessName: { type: String },
        address: { type: String },
        taxId: { type: String },
        phoneNumber: { type: String },
        regulatorLevel: {
            type: String,
            enum: ["HIGH", "LOW"],
            default: "LOW",
        },
        province: { type: String },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "APPROVED",
        },
        blockchainNodeId: {
            type: String,
            default: "",
        },
        nodeRequestStatus: {
            type: String,
            enum: ["NONE", "REQUESTED", "APPROVED", "REJECTED"],
            default: "NONE",
        },
        nodeRequestedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true },
);

/**
 * Mongoose model for authenticated API users.
 */
export const User = mongoose.model("User", userSchema);
