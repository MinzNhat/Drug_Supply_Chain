/**
 * Convert persisted batch snapshot document to API list item DTO.
 *
 * @param {Record<string, unknown>} row - Snapshot row from storage.
 * @returns {Record<string, unknown>} Batch list item DTO.
 */
export const toBatchListItem = (row) => ({
    batchID: row.batchID,
    drugName: row.drugName,
    manufacturerMSP: row.manufacturerMSP,
    ownerMSP: row.ownerMSP,
    status: row.status,
    transferStatus: row.transferStatus,
    expiryDate: row.expiryDate,
    scanCount: row.scanCount,
    totalSupply: row.totalSupply,
    updatedAt: row.updatedAt,
    lastLedgerSyncAt: row.lastLedgerSyncAt,
    batch: row.batch,
});

/**
 * Convert batch geo event document to API response DTO.
 *
 * @param {Record<string, unknown>} event - Geo event document.
 * @returns {Record<string, unknown>} Geo event DTO.
 */
export const toBatchGeoEventDto = (event) => ({
    id: String(event._id),
    batchID: event.batchID,
    eventType: event.eventType,
    source: event.source,
    lat: event.lat,
    lng: event.lng,
    accuracyM: event.accuracyM,
    address: event.address,
    note: event.note,
    metadata: event.metadata,
    actorRole: event.actorRole,
    actorMSP: event.actorMSP,
    occurredAt: event.occurredAt,
});
