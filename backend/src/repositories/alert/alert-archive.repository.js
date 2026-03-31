import { Types } from "mongoose";
import { AlertArchive } from "../../models/alert/alert-archive.model.js";

/**
 * Parse optional date string into Date instance.
 *
 * @param {unknown} input - Raw date-like value.
 * @returns {Date | null} Parsed Date or null.
 */
const toDateOrNull = (input) => {
    if (typeof input !== "string" || input.trim().length === 0) {
        return null;
    }

    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Build Mongo query object from alert API filters.
 *
 * @param {Record<string, unknown>} filters - API query filters.
 * @returns {Record<string, unknown>} Mongo query.
 */
const toFindQuery = (filters = {}) => {
    const query = {};

    if (typeof filters.canonicalKey === "string" && filters.canonicalKey) {
        query.canonicalKey = filters.canonicalKey;
    }
    if (typeof filters.severity === "string" && filters.severity) {
        query.severity = filters.severity;
    }
    if (typeof filters.batchID === "string" && filters.batchID) {
        query.batchID = filters.batchID;
    }
    if (typeof filters.sourceType === "string" && filters.sourceType) {
        query["source.type"] = filters.sourceType;
    }
    if (typeof filters.sourceKey === "string" && filters.sourceKey) {
        query["source.key"] = filters.sourceKey;
    }
    if (typeof filters.traceId === "string" && filters.traceId) {
        query.traceId = filters.traceId;
    }

    const from = toDateOrNull(filters.from);
    const to = toDateOrNull(filters.to);
    if (from || to) {
        query.occurredAt = {};
        if (from) {
            query.occurredAt.$gte = from;
        }
        if (to) {
            query.occurredAt.$lte = to;
        }
    }

    return query;
};

/**
 * Convert archive row to stable API DTO shape.
 *
 * @param {Record<string, unknown>} row - Mongo document row.
 * @returns {Record<string, unknown>} API DTO.
 */
const toAlertDto = (row) => ({
    id: String(row._id),
    canonicalKey: row.canonicalKey,
    sinkEventId: row.sinkEventId,
    severity: row.severity,
    source: row.source,
    batchID: row.batchID,
    traceId: row.traceId,
    occurredAt: row.occurredAt,
    details: row.details,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});

/**
 * Repository for canonical alert archive persistence and query.
 */
export class AlertArchiveRepository {
    /**
     * Persist one standardized alert payload.
     *
     * @param {Record<string, unknown> | null} payload - Standardized alert payload.
     * @returns {Promise<Record<string, unknown> | null>} Persisted alert DTO.
     */
    async save(payload) {
        if (!payload || typeof payload !== "object") {
            return null;
        }

        const occurredAtValue =
            typeof payload.occurredAt === "string" && payload.occurredAt
                ? new Date(payload.occurredAt)
                : new Date();

        const created = await AlertArchive.create({
            canonicalKey: payload.canonicalKey,
            sinkEventId: payload.sinkEventId,
            severity: payload.severity,
            source: payload.source,
            batchID: payload.batchID ?? "",
            traceId: payload.traceId ?? "",
            occurredAt: Number.isNaN(occurredAtValue.getTime())
                ? new Date()
                : occurredAtValue,
            details: payload.details ?? {},
        });

        return toAlertDto(created.toObject());
    }

    /**
     * Query archived alerts with pagination and filtering.
     *
     * @param {Record<string, unknown>} filters - API query filters.
     * @returns {Promise<Record<string, unknown>>} Paginated result.
     */
    async list(filters = {}) {
        const page = Math.max(1, Number(filters.page ?? 1));
        const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize ?? 20)));
        const findQuery = toFindQuery(filters);

        const [total, rows] = await Promise.all([
            AlertArchive.countDocuments(findQuery),
            AlertArchive.find(findQuery)
                .sort({ occurredAt: -1, _id: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .lean(),
        ]);

        return {
            page,
            pageSize,
            total,
            items: rows.map(toAlertDto),
        };
    }

    /**
     * Query one archived alert by id.
     *
     * @param {string} alertId - Alert identifier.
     * @returns {Promise<Record<string, unknown> | null>} Alert DTO or null.
     */
    async findById(alertId) {
        if (!Types.ObjectId.isValid(alertId)) {
            return null;
        }

        const row = await AlertArchive.findById(alertId).lean();
        return row ? toAlertDto(row) : null;
    }

    /**
     * Query alerts for export payload without pagination metadata.
     *
     * @param {Record<string, unknown>} filters - API query filters.
     * @param {number} limit - Maximum records returned.
     * @returns {Promise<Array<Record<string, unknown>>>} Alert DTO list.
     */
    async listForExport(filters = {}, limit = 1000) {
        const cappedLimit = Math.min(10_000, Math.max(1, Number(limit) || 1000));
        const rows = await AlertArchive.find(toFindQuery(filters))
            .sort({ occurredAt: -1, _id: -1 })
            .limit(cappedLimit)
            .lean();

        return rows.map(toAlertDto);
    }
}

/**
 * Build alert archive repository instance.
 *
 * @returns {AlertArchiveRepository} Alert archive repository.
 */
export const createAlertArchiveRepository = () => new AlertArchiveRepository();
