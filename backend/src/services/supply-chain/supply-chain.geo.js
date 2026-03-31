import {
    BATCH_GEO_EVENT_TYPES,
    BATCH_GEO_SOURCE_TYPES,
} from "../../constants/batch-geo/batch-geo.constants.js";
import { BatchGeoEvent } from "../../models/batch/batch-geo-event.model.js";
import { BatchState } from "../../models/batch/batch-state.model.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import {
    toBatchGeoEventDto,
    toBatchListItem,
} from "./supply-chain.mappers.js";

/**
 * Parse user-provided date into Date or null.
 *
 * @param {unknown} value - User-provided date value.
 * @returns {Date | null} Parsed Date or null.
 */
const toDateOrNull = (value) => {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Convert coordinates to a precision grid bucket key.
 *
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {number} precision - Decimal precision.
 * @returns {string} Stable grid key.
 */
const toGridBucket = (lat, lng, precision) => {
    const factor = 10 ** precision;
    const bucketLat = Math.round(lat * factor) / factor;
    const bucketLng = Math.round(lng * factor) / factor;
    return `${bucketLat.toFixed(precision)},${bucketLng.toFixed(precision)}`;
};

/**
 * Validate coordinate numeric value.
 *
 * @param {unknown} value - Raw coordinate value.
 * @param {string} fieldName - Field name for error reporting.
 * @returns {number} Valid finite number.
 */
const ensureFiniteCoordinate = (value, fieldName) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new HttpException(
            400,
            "INVALID_COORDINATE",
            `${fieldName} is invalid`,
        );
    }
    return parsed;
};

/**
 * Validate latitude/longitude bounds.
 *
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 */
const ensureCoordinateRange = (lat, lng) => {
    if (lat < -90 || lat > 90) {
        throw new HttpException(
            400,
            "INVALID_COORDINATE",
            "lat must be in [-90, 90]",
        );
    }
    if (lng < -180 || lng > 180) {
        throw new HttpException(
            400,
            "INVALID_COORDINATE",
            "lng must be in [-180, 180]",
        );
    }
};

/**
 * Enforce actor scope for non-regulator users.
 *
 * @param {{ role: string, mspId: string }} actor - Authenticated actor.
 * @param {string} requestedMsp - Requested MSP scope.
 */
const ensureRoleAccessToMsp = (actor, requestedMsp) => {
    if (!requestedMsp) {
        return;
    }
    if (actor.role === "Regulator") {
        return;
    }
    if (requestedMsp !== actor.mspId) {
        throw new HttpException(
            403,
            "FORBIDDEN",
            "Cannot access other MSP scope",
        );
    }
};

/**
 * List batch snapshots with pagination and filtering.
 *
 * @param {Record<string, unknown>} filters - Query filters.
 * @param {{ role: string, mspId: string }} actor - Authenticated actor.
 * @returns {Promise<Record<string, unknown>>} Paginated batch list payload.
 */
export const listBatchSnapshots = async (filters, actor) => {
    const page = Math.max(1, Number(filters.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 20)));

    const query = {};
    if (filters.status) {
        query.status = String(filters.status);
    }
    if (filters.transferStatus) {
        query.transferStatus = String(filters.transferStatus);
    }
    if (filters.ownerMSP) {
        const ownerMSP = String(filters.ownerMSP);
        ensureRoleAccessToMsp(actor, ownerMSP);
        query.ownerMSP = ownerMSP;
    } else if (actor.role !== "Regulator") {
        query.ownerMSP = actor.mspId;
    }
    if (filters.drugName) {
        query.drugName = {
            $regex: String(filters.drugName).trim(),
            $options: "i",
        };
    }

    const [total, rows] = await Promise.all([
        BatchState.countDocuments(query),
        BatchState.find(query)
            .sort({ updatedAt: -1, batchID: 1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean(),
    ]);

    return {
        page,
        pageSize,
        total,
        items: rows.map(toBatchListItem),
    };
};

/**
 * Persist one geospatial supply-chain event.
 *
 * @param {string} batchID - Batch identifier.
 * @param {Record<string, unknown>} input - Event payload.
 * @param {{ role: string, mspId: string, id: string, traceId?: string }} actor - Authenticated actor.
 * @returns {Promise<Record<string, unknown>>} Event DTO.
 */
export const createBatchGeoEvent = async (batchID, input, actor) => {
    const lat = ensureFiniteCoordinate(input.lat, "lat");
    const lng = ensureFiniteCoordinate(input.lng, "lng");
    ensureCoordinateRange(lat, lng);

    const eventType = String(input.eventType || "SCAN");
    if (!BATCH_GEO_EVENT_TYPES.includes(eventType)) {
        throw new HttpException(400, "INVALID_EVENT_TYPE", "Unsupported eventType");
    }

    const source = String(input.source || "MANUAL");
    if (!BATCH_GEO_SOURCE_TYPES.includes(source)) {
        throw new HttpException(400, "INVALID_EVENT_SOURCE", "Unsupported source");
    }

    const event = await BatchGeoEvent.create({
        batchID,
        eventType,
        source,
        location: {
            type: "Point",
            coordinates: [lng, lat],
        },
        lat,
        lng,
        accuracyM:
            input.accuracyM === undefined || input.accuracyM === null
                ? null
                : Number(input.accuracyM),
        address: input.address || "",
        note: input.note || "",
        metadata: input.metadata || {},
        actorRole: actor.role,
        actorMSP: actor.mspId,
        actorUserId: actor.id,
        traceId: actor.traceId || "",
        occurredAt: toDateOrNull(input.occurredAt) || new Date(),
    });

    return toBatchGeoEventDto(event);
};

/**
 * Query timeline events for one batch.
 *
 * @param {string} batchID - Batch identifier.
 * @param {Record<string, unknown>} query - Timeline filters.
 * @returns {Promise<Array<Record<string, unknown>>>} Event timeline DTO list.
 */
export const queryBatchTimelineEvents = async (batchID, query) => {
    const limit = Math.min(500, Math.max(1, Number(query.limit ?? 100)));

    const findQuery = { batchID };
    const fromDate = toDateOrNull(query.from);
    const toDate = toDateOrNull(query.to);
    if (fromDate || toDate) {
        findQuery.occurredAt = {};
        if (fromDate) {
            findQuery.occurredAt.$gte = fromDate;
        }
        if (toDate) {
            findQuery.occurredAt.$lte = toDate;
        }
    }

    if (query.eventType) {
        findQuery.eventType = String(query.eventType);
    }

    const events = await BatchGeoEvent.find(findQuery)
        .sort({ occurredAt: -1 })
        .limit(limit)
        .lean();

    return events.map(toBatchGeoEventDto);
};

/**
 * Aggregate geo events into heatmap buckets.
 *
 * @param {Record<string, unknown>} query - Heatmap query filters.
 * @param {{ role: string, mspId: string }} actor - Authenticated actor.
 * @returns {Promise<Record<string, unknown>>} Heatmap payload.
 */
export const aggregateSupplyHeatmap = async (query, actor) => {
    const precision = Math.min(4, Math.max(2, Number(query.precision ?? 3)));
    const limit = Math.min(10_000, Math.max(1, Number(query.limit ?? 5000)));

    const findQuery = {};

    const actorMSP = query.actorMSP ? String(query.actorMSP) : "";
    if (actorMSP) {
        ensureRoleAccessToMsp(actor, actorMSP);
        findQuery.actorMSP = actorMSP;
    } else if (actor.role !== "Regulator") {
        findQuery.actorMSP = actor.mspId;
    }

    if (query.eventType) {
        findQuery.eventType = String(query.eventType);
    }
    if (query.source) {
        findQuery.source = String(query.source);
    }

    const fromDate = toDateOrNull(query.from);
    const toDate = toDateOrNull(query.to);
    if (fromDate || toDate) {
        findQuery.occurredAt = {};
        if (fromDate) {
            findQuery.occurredAt.$gte = fromDate;
        }
        if (toDate) {
            findQuery.occurredAt.$lte = toDate;
        }
    }

    const minLat = query.minLat !== undefined ? Number(query.minLat) : null;
    const maxLat = query.maxLat !== undefined ? Number(query.maxLat) : null;
    const minLng = query.minLng !== undefined ? Number(query.minLng) : null;
    const maxLng = query.maxLng !== undefined ? Number(query.maxLng) : null;
    if (
        Number.isFinite(minLat) ||
        Number.isFinite(maxLat) ||
        Number.isFinite(minLng) ||
        Number.isFinite(maxLng)
    ) {
        findQuery.lat = {};
        findQuery.lng = {};
        if (Number.isFinite(minLat)) {
            findQuery.lat.$gte = minLat;
        }
        if (Number.isFinite(maxLat)) {
            findQuery.lat.$lte = maxLat;
        }
        if (Number.isFinite(minLng)) {
            findQuery.lng.$gte = minLng;
        }
        if (Number.isFinite(maxLng)) {
            findQuery.lng.$lte = maxLng;
        }
    }

    const events = await BatchGeoEvent.find(findQuery)
        .sort({ occurredAt: -1 })
        .limit(limit)
        .lean();

    const buckets = new Map();

    for (const event of events) {
        const key = toGridBucket(event.lat, event.lng, precision);
        const [bucketLatRaw, bucketLngRaw] = key.split(",");
        const bucketLat = Number(bucketLatRaw);
        const bucketLng = Number(bucketLngRaw);

        if (!buckets.has(key)) {
            buckets.set(key, {
                lat: bucketLat,
                lng: bucketLng,
                count: 0,
                eventTypes: new Set(),
                sources: new Set(),
                lastOccurredAt: null,
            });
        }

        const bucket = buckets.get(key);
        bucket.count += 1;
        bucket.eventTypes.add(event.eventType);
        bucket.sources.add(event.source);
        if (!bucket.lastOccurredAt || event.occurredAt > bucket.lastOccurredAt) {
            bucket.lastOccurredAt = event.occurredAt;
        }
    }

    return {
        precision,
        totalPoints: events.length,
        buckets: Array.from(buckets.values())
            .map((bucket) => ({
                lat: bucket.lat,
                lng: bucket.lng,
                count: bucket.count,
                eventTypes: Array.from(bucket.eventTypes),
                sources: Array.from(bucket.sources),
                lastOccurredAt: bucket.lastOccurredAt,
            }))
            .sort((a, b) => b.count - a.count),
    };
};
