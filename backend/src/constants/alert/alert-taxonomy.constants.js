/**
 * Canonical alert keys shared across backend decision codes, chaincode events,
 * and outbound sink event identifiers.
 */
export const CANONICAL_ALERT_KEYS = Object.freeze([
    "SCAN_ACCEPTED",
    "SCAN_REJECTED",
    "RECALL_ALERT",
    "LEDGER_SCAN_WARNING",
    "LEDGER_SCAN_SUSPICIOUS",
    "PROTECTED_QR_BOUND",
    "PROTECTED_QR_VERIFICATION_RECORDED",
]);

/**
 * Standard severity level for each canonical alert key.
 */
export const ALERT_SEVERITY_BY_KEY = Object.freeze({
    SCAN_ACCEPTED: "info",
    SCAN_REJECTED: "warn",
    RECALL_ALERT: "critical",
    LEDGER_SCAN_WARNING: "warn",
    LEDGER_SCAN_SUSPICIOUS: "critical",
    PROTECTED_QR_BOUND: "info",
    PROTECTED_QR_VERIFICATION_RECORDED: "info",
});

/**
 * Map backend decision codes to canonical alert keys.
 */
export const BACKEND_DECISION_TO_CANONICAL_ALERT_KEY = Object.freeze({
    SCAN_ACCEPTED: "SCAN_ACCEPTED",
    SCAN_REJECTED: "SCAN_REJECTED",
});

/**
 * Map Fabric chaincode event names to canonical alert keys.
 */
export const CHAINCODE_EVENT_TO_CANONICAL_ALERT_KEY = Object.freeze({
    GovMonitor: "LEDGER_SCAN_WARNING",
    PublicAlert: "LEDGER_SCAN_SUSPICIOUS",
    ProtectedQRBound: "PROTECTED_QR_BOUND",
    ProtectedQRVerificationRecorded: "PROTECTED_QR_VERIFICATION_RECORDED",
    RecallAlert: "RECALL_ALERT",
});

/**
 * Canonical outbound sink event IDs.
 *
 * These IDs are stable and suitable for SIEM/webhook/case-management channels.
 */
export const CANONICAL_ALERT_TO_SINK_EVENT_ID = Object.freeze(
    Object.fromEntries(CANONICAL_ALERT_KEYS.map((key) => [key, `DATN_${key}`])),
);

/**
 * Canonical alert keys that must be pushed to external sink channels.
 */
export const DELIVERABLE_CANONICAL_ALERT_KEYS = Object.freeze([
    "SCAN_REJECTED",
    "RECALL_ALERT",
]);
