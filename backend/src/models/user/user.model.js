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
            enum: ["Manufacturer", "Distributor", "Regulator"],
            required: true,
        },
        mspId: { type: String, required: true },
    },
    { timestamps: true },
);

/**
 * Mongoose model for authenticated API users.
 */
export const User = mongoose.model("User", userSchema);
