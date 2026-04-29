import { SystemLog } from "../../models/system/system-log.model.js";
import { asyncHandler } from "../../utils/async-handler/async-handler.js";

/**
 * Controller to handle system log queries.
 */
export const createSystemController = () => {
    /**
     * Get system logs with pagination and filtering.
     * Only Admin can access this.
     */
    const getLogs = asyncHandler(async (req, res) => {
        const { level, category, search, page = 1, limit = 50 } = req.query;

        const query = {};
        if (level && level !== "all") query.level = level;
        if (category && category !== "all") query.category = category;
        if (search) {
            query.$or = [
                { message: { $regex: search, $options: "i" } },
                { action: { $regex: search, $options: "i" } },
                { username: { $regex: search, $options: "i" } }
            ];
        }

        const skip = (page - 1) * limit;
        const [logs, total] = await Promise.all([
            SystemLog.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            SystemLog.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    });

    return { getLogs };
};
