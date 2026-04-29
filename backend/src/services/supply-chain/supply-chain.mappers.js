/**
 * Convert persisted batch snapshot document to API list item DTO.
 *
 * @param {Record<string, unknown>} row - Snapshot row from storage.
 * @returns {Record<string, unknown>} Batch list item DTO.
 */
export const toBatchListItem = (row) => ({
    batchID: row.batchID,
    drugName: row.drugName,
    quantity: row.totalSupply || row.quantity || 0,
    manufacturerMSP: row.manufacturerMSP,
    manufacturerId: row.manufacturerId || null,
    manufacturerDetails: row.manufacturerDetails || null,
    ownerMSP: row.ownerMSP,
    ownerId: row.ownerId || null,
    ownerDetails: row.ownerDetails || null,
    targetOwnerId: row.targetOwnerId || null,
    status: row.status,
    transferStatus: row.transferStatus,
    expiryDate: row.expiryDate,
    createdAt: row.createdAt || row.updatedAt || null,
    scanCount: row.scanCount || 0,
    updatedAt: row.updatedAt,
    qrImageBase64: row.qrImageBase64 || null,
    // Recall Information
    recallStatus: row.recallStatus || "NONE",
    recallNote: row.recallNote || "",
    recallRequestedAt: row.recallRequestedAt || null,
    province: row.province || "",
    // Preserve protected_qr for enrichment logic (dataHash)
    protected_qr: row.batch?.protected_qr || row.protected_qr || null,
});

/**
 * Convert batch geo event document to API response DTO.
 */
export const toBatchGeoEventDto = (event) => ({
    id: String(event._id),
    batchID: event.batchID,
    eventType: event.eventType,
    source: event.source,
    lat: event.lat,
    lng: event.lng,
    address: event.address,
    province: event.province || "",
    actorRole: event.actorRole,
    actorMSP: event.actorMSP,
    occurredAt: event.occurredAt,
    metadata: event.metadata || {},
});

/**
 * Filter sensitive fields for batch details.
 */
export const toBatchDetail = (batch) => {
    // If it's a ledger response, it might be nested
    const source = batch.batch || batch;
    
    return {
        batchID: source.batchID,
        drugName: source.drugName,
        quantity: source.totalSupply || source.quantity || 0,
        manufacturerMSP: source.manufacturerMSP,
        manufacturerId: source.manufacturerId || batch.manufacturerId || null,
        manufacturerDetails: batch.manufacturerDetails || null,
        ownerMSP: source.ownerMSP,
        ownerId: source.ownerId || batch.ownerId || null,
        ownerDetails: batch.ownerDetails || null,
        targetOwnerId: source.targetOwnerId || batch.targetOwnerId || null,
        status: source.status,
        transferStatus: source.transferStatus,
        expiryDate: source.expiryDate,
        createdAt: source.createdAt || source.updatedAt || null,
        scanCount: source.scanCount || 0,
        safetyStatus: batch.safetyStatus || null,
        qrImageBase64: batch.qrImageBase64 || null,
        drugDetails: batch.drugDetails || null,
        updatedAt: source.updatedAt,
        // Recall Information
        recallStatus: source.recallStatus || batch.recallStatus || "NONE",
        recallNote: source.recallNote || batch.recallNote || "",
        recallRequestedAt: source.recallRequestedAt || batch.recallRequestedAt || null,
        province: source.province || batch.province || "",
        // Preserve protected_qr for frontend logic
        protected_qr: source.protected_qr || null,
        metadata: batch.metadata || source.metadata || {},
    };
};
