import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Drug Category schema for manufacturer registration and regulator approval.
 */
const drugCategorySchema = new Schema(
    {
        name: { type: String, required: true, index: true },
        registrationNumber: { type: String, required: true, unique: true, index: true },
        manufacturerMSP: { type: String, required: true, index: true },
        manufacturerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
        description: { type: String, default: "" },
        imageCID: { type: String, default: "" },
        certificates: [
            {
                name: { type: String, required: true },
                cid: { type: String, required: true }
            }
        ],
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED", "PENDING_DELETE"],
            default: "PENDING",
            index: true
        },
        approvals: [
            {
                regulatorId: { type: Schema.Types.ObjectId, ref: "User" },
                regulatorLevel: { type: String, enum: ["LOW", "HIGH"] },
                approvedAt: { type: Date, default: Date.now }
            }
        ],
        rejectionReason: { type: String, default: "" },
        province: { type: String, required: true, index: true }, // Province of manufacturer for LOW level regulator
    },
    { timestamps: true }
);

/**
 * Mongoose model for Drug Category.
 */
export const DrugCategory = mongoose.model("DrugCategory", drugCategorySchema);
