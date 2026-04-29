import { Province } from "../../models/location/province.model.js";
import { asyncHandler } from "../../utils/async-handler/async-handler.js";

/**
 * Controller to handle location/province queries.
 */
export const createLocationController = () => {
    /**
     * Get all provinces.
     * Publicly accessible for registration and admin purposes.
     */
    const getProvinces = asyncHandler(async (req, res) => {
        const provinces = await Province.find().sort({ name: 1 }).lean();

        return res.status(200).json({
            success: true,
            data: provinces
        });
    });

    return { getProvinces };
};
