import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { requireActor } from "../product/product.helpers.js";
import {
    exportRegulatorAlertsQuerySchema,
    listRegulatorAlertsQuerySchema,
} from "./regulator-alerts.schemas.js";

/**
 * Build regulator alerts controller from service dependency.
 *
 * @param {import("../../services/alerts/regulator-alerts.service.js").RegulatorAlertsService} service - Regulator alert service.
 * @returns {{ listAlerts: import("express").RequestHandler, getAlertById: import("express").RequestHandler, exportReport: import("express").RequestHandler }} Controller handlers.
 */
export const createRegulatorAlertsController = (service) => {
    /**
     * Return paginated alert archive list for regulator dashboards.
     */
    const listAlerts = asyncHandler(async (req, res) => {
        const parsed = listRegulatorAlertsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid query", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.listAlerts(parsed.data, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Return one archived alert by identifier.
     */
    const getAlertById = asyncHandler(async (req, res) => {
        const alertId = String(req.params.alertId || "").trim();
        if (!alertId) {
            throw new HttpException(400, "BAD_REQUEST", "alertId is required");
        }

        const actor = requireActor(req);
        const data = await service.getAlertById(alertId, actor);
        return res.status(200).json({ success: true, data });
    });

    /**
     * Export alert report in json or csv format.
     */
    const exportReport = asyncHandler(async (req, res) => {
        const parsed = exportRegulatorAlertsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new HttpException(400, "Invalid query", {
                errors: parsed.error.flatten(),
            });
        }

        const actor = requireActor(req);
        const data = await service.exportAlertsReport(parsed.data, actor);

        if (data.format === "csv") {
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${data.fileName}"`,
            );
            return res.status(200).send(data.content);
        }

        return res.status(200).json({ success: true, data });
    });

    return {
        listAlerts,
        getAlertById,
        exportReport,
    };
};
