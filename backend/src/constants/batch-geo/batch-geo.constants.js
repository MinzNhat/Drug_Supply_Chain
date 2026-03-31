/**
 * Allowed event types for batch geospatial tracking.
 *
 * Keep this list in sync with controller validation and persistence schema.
 */
export const BATCH_GEO_EVENT_TYPES = Object.freeze([
    "SCAN",
    "HANDOVER_OUT",
    "HANDOVER_IN",
    "WAREHOUSE",
    "DELIVERY",
    "RECALL_ALERT",
    "INSPECTION",
]);

/**
 * Allowed source markers that describe how a geospatial event was created.
 *
 * These values are consumed by API validation, event persistence, and analytics filters.
 */
export const BATCH_GEO_SOURCE_TYPES = Object.freeze([
    "MANUAL",
    "VERIFY",
    "SHIP",
    "RECEIVE",
    "SYSTEM",
]);
