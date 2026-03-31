import { z } from "zod";

/**
 * Shared query filters for regulator alert retrieval and export.
 */
const sharedAlertFilterSchema = {
    canonicalKey: z.string().min(1).max(80).optional(),
    severity: z.enum(["info", "warn", "critical"]).optional(),
    batchID: z.string().min(1).max(120).optional(),
    sourceType: z
        .enum(["backend_decision", "chaincode_event", "backend_action"])
        .optional(),
    sourceKey: z.string().min(1).max(120).optional(),
    traceId: z.string().min(1).max(120).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
};

/**
 * Query schema for paginated alert list endpoint.
 */
export const listRegulatorAlertsQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(100000).optional(),
    pageSize: z.coerce.number().int().positive().max(200).optional(),
    ...sharedAlertFilterSchema,
});

/**
 * Query schema for report export endpoint.
 */
export const exportRegulatorAlertsQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional(),
    limit: z.coerce.number().int().positive().max(10000).optional(),
    ...sharedAlertFilterSchema,
});
