import { z } from "zod";

/**
 * Request schema for drug category registration.
 */
export const registerDrugCategorySchema = z.object({
    name: z.string().min(2).max(120),
    registrationNumber: z.string().min(2).max(50),
    description: z.string().max(500).optional(),
    manufacturerId: z.string().optional(),
});

/**
 * Query schema for listing drug categories.
 */
export const listDrugCategoriesQuerySchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "PENDING_DELETE"]).optional(),
    manufacturerMSP: z.string().optional(),
    province: z.string().optional(),
});

/**
 * Request schema for category approval.
 */
export const approveDrugCategorySchema = z.object({
    // Approval action might not need complex body if just toggling status
});

/**
 * Request schema for category rejection.
 */
export const rejectDrugCategorySchema = z.object({
    reason: z.string().min(1).max(500),
});
