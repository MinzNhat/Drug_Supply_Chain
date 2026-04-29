import { z } from "zod";
import {
    BATCH_GEO_EVENT_TYPES,
    BATCH_GEO_SOURCE_TYPES,
} from "../../constants/batch-geo/batch-geo.constants.js";

const batchGeoEventTypeSchema = z.enum([...BATCH_GEO_EVENT_TYPES]);
const batchGeoSourceTypeSchema = z.enum([...BATCH_GEO_SOURCE_TYPES]);

/**
 * Request schema for creating a new batch.
 */
export const createBatchSchema = z.object({
    drugName: z.string().min(2).max(120),
    quantity: z.coerce.number().int().positive().max(1_000_000_000),
    expiryDate: z
        .string()
        .refine((value) => !Number.isNaN(Date.parse(value)), {
            message: "expiryDate must be a valid ISO date",
        })
        .refine((value) => new Date(value).getTime() > Date.now(), {
            message: "expiryDate must be in the future",
        }),
});

/**
 * Request schema for shipping a batch.
 */
export const shipBatchSchema = z.object({
    targetOwnerMSP: z.string().min(1),
    targetDistributorUnitId: z.string().optional(),
});

/**
 * Base request schema for updating document metadata.
 */
export const updateDocumentBaseSchema = z.object({
    docType: z.enum(["packageImage", "qualityCert"]),
});

/**
 * Legacy request schema for CID-only document update.
 */
export const updateDocumentCidSchema = updateDocumentBaseSchema.extend({
    newCID: z
        .string()
        .min(10)
        .max(200)
        .regex(/^[a-zA-Z0-9]+$/),
});

/**
 * Query schema for listing batch snapshots.
 */
export const listBatchesQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(100000).optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    ownerMSP: z.string().min(1).optional(),
    status: z.string().min(1).max(40).optional(),
    transferStatus: z.string().min(1).max(40).optional(),
    drugName: z.string().min(1).max(120).optional(),
});

/**
 * Request schema for recording geospatial supply-chain events.
 */
export const recordBatchEventSchema = z.object({
    eventType: batchGeoEventTypeSchema,
    source: batchGeoSourceTypeSchema.optional(),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    accuracyM: z.coerce.number().min(0).max(10000).optional(),
    address: z.string().max(300).optional(),
    province: z.string().max(100).optional(),
    note: z.string().max(500).optional(),
    occurredAt: z.string().datetime().optional(),
    metadata: z.record(z.unknown()).optional(),
});

/**
 * Query schema for timeline retrieval.
 */
export const batchTimelineQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    eventType: batchGeoEventTypeSchema.optional(),
});

/**
 * Query schema for heatmap aggregation.
 */
export const heatmapQuerySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    eventType: batchGeoEventTypeSchema.optional(),
    source: batchGeoSourceTypeSchema.optional(),
    actorMSP: z.string().min(1).optional(),
    minLat: z.coerce.number().min(-90).max(90).optional(),
    maxLat: z.coerce.number().min(-90).max(90).optional(),
    minLng: z.coerce.number().min(-180).max(180).optional(),
    maxLng: z.coerce.number().min(-180).max(180).optional(),
    precision: z.coerce.number().int().min(2).max(4).optional(),
    limit: z.coerce.number().int().positive().max(10000).optional(),
});

/**
 * Request schema for protected QR rebinding.
 */
export const bindProtectedQrSchema = z
    .object({
        dataHash: z.string().regex(/^[0-9a-f]{8}$/i),
        metadataSeries: z.string().regex(/^[0-9a-f]{16}$/i),
        metadataIssued: z.string().regex(/^[0-9a-f]{16}$/i),
        metadataExpiry: z.string().regex(/^[0-9a-f]{16}$/i),
        tokenDigest: z
            .string()
            .regex(/^[0-9a-f]{64}$/i)
            .optional(),
        token: z.string().min(10).optional(),
    })
    .refine((value) => value.tokenDigest || value.token, {
        message: "tokenDigest or token is required",
        path: ["tokenDigest"],
    });

/**
 * Request schema for protected QR token policy lifecycle updates.
 */
export const protectedQrTokenPolicySchema = z
    .object({
        actionType: z.enum(["BLOCKLIST", "REVOKE", "RESTORE"]),
        tokenDigest: z.string().regex(/^[0-9a-f]{64}$/i),
        reason: z.string().min(1).max(300).optional(),
        note: z.string().max(500).optional(),
    })
    .refine(
        (value) =>
            value.actionType === "RESTORE" ||
            (typeof value.reason === "string" && value.reason.trim().length > 0),
        {
            message: "reason is required for BLOCKLIST and REVOKE",
            path: ["reason"],
        },
    );
