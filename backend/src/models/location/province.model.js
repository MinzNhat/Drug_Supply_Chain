import mongoose from "mongoose";

const ProvinceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        code: {
            type: String,
            unique: true,
        },
        region: {
            type: String,
            enum: ["NORTH", "CENTRAL", "SOUTH"],
        },
        lat: {
            type: Number,
        },
        lng: {
            type: Number,
        }
    },
    { timestamps: true }
);

ProvinceSchema.index({ name: 1 });

export const Province = mongoose.model("Province", ProvinceSchema);
