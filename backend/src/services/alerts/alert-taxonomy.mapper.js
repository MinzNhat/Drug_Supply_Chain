import {
    ALERT_SEVERITY_BY_KEY,
    BACKEND_DECISION_TO_CANONICAL_ALERT_KEY,
    CANONICAL_ALERT_KEYS,
    CANONICAL_ALERT_TO_SINK_EVENT_ID,
    CHAINCODE_EVENT_TO_CANONICAL_ALERT_KEY,
} from "../../constants/alert/alert-taxonomy.constants.js";
import { logger } from "../../utils/logger/logger.js";

/**
 * Resolve one canonical alert key from backend decision code.
 *
 * @param {string} decisionCode - Backend decision code.
 * @returns {string} Canonical alert key or empty string when not mapped.
 */
export const resolveCanonicalAlertFromDecision = (decisionCode) => {
    return BACKEND_DECISION_TO_CANONICAL_ALERT_KEY[decisionCode] ?? "";
};

/**
 * Resolve one canonical alert key from chaincode event name.
 *
 * @param {string} eventName - Chaincode event name.
 * @returns {string} Canonical alert key or empty string when not mapped.
 */
export const resolveCanonicalAlertFromChaincodeEvent = (eventName) => {
    return CHAINCODE_EVENT_TO_CANONICAL_ALERT_KEY[eventName] ?? "";
};

/**
 * Build standardized alert payload from canonical taxonomy key.
 *
 * @param {{
 *   canonicalKey: string,
 *   sourceType: "backend_decision" | "chaincode_event" | "backend_action",
 *   sourceKey: string,
 *   batchID?: string,
 *   traceId?: string,
 *   occurredAt?: string,
 *   details?: Record<string, unknown>
 * }} input - Alert context.
 * @returns {Record<string, unknown> | null} Standardized alert payload.
 */
export const buildStandardAlertPayload = (input) => {
    const canonicalKey = input?.canonicalKey ?? "";
    if (!CANONICAL_ALERT_KEYS.includes(canonicalKey)) {
        return null;
    }

    const occurredAt =
        typeof input?.occurredAt === "string" && input.occurredAt.length > 0
            ? input.occurredAt
            : new Date().toISOString();

    return {
        canonicalKey,
        sinkEventId: CANONICAL_ALERT_TO_SINK_EVENT_ID[canonicalKey],
        severity: ALERT_SEVERITY_BY_KEY[canonicalKey] ?? "info",
        source: {
            type: input.sourceType,
            key: input.sourceKey,
        },
        batchID: input.batchID ?? "",
        traceId: input.traceId ?? "",
        occurredAt,
        details: input.details ?? {},
    };
};

/**
 * Emit standardized alert payload to structured logs.
 *
 * @param {Record<string, unknown> | null} payload - Standardized payload.
 * @returns {Record<string, unknown> | null} Emitted payload.
 */
export const emitStandardAlert = (payload) => {
    if (!payload) {
        return null;
    }

    const severity = payload.severity;
    if (severity === "critical") {
        logger.error({
            message: "standardized-alert",
            alert: payload,
        });
    } else if (severity === "warn") {
        logger.warn({
            message: "standardized-alert",
            alert: payload,
        });
    } else {
        logger.info({
            message: "standardized-alert",
            alert: payload,
        });
    }

    return payload;
};

/**
 * Map and emit alert from one backend decision code.
 *
 * @param {string} decisionCode - Decision code from service flow.
 * @param {{ batchID?: string, traceId?: string, details?: Record<string, unknown> }} context - Alert context.
 * @returns {Record<string, unknown> | null} Emitted payload.
 */
export const emitDecisionAlert = (decisionCode, context = {}) => {
    const canonicalKey = resolveCanonicalAlertFromDecision(decisionCode);
    if (!canonicalKey) {
        return null;
    }

    const payload = buildStandardAlertPayload({
        canonicalKey,
        sourceType: "backend_decision",
        sourceKey: decisionCode,
        ...context,
    });

    return emitStandardAlert(payload);
};

/**
 * Map and emit alert from one chaincode event name.
 *
 * @param {string} eventName - Event name emitted by chaincode.
 * @param {{ batchID?: string, traceId?: string, details?: Record<string, unknown> }} context - Alert context.
 * @returns {Record<string, unknown> | null} Emitted payload.
 */
export const emitChaincodeEventAlert = (eventName, context = {}) => {
    const canonicalKey = resolveCanonicalAlertFromChaincodeEvent(eventName);
    if (!canonicalKey) {
        return null;
    }

    const payload = buildStandardAlertPayload({
        canonicalKey,
        sourceType: "chaincode_event",
        sourceKey: eventName,
        ...context,
    });

    return emitStandardAlert(payload);
};

/**
 * Emit alert directly from canonical key for backend-driven actions.
 *
 * @param {string} canonicalKey - Canonical alert key.
 * @param {{ sourceKey?: string, batchID?: string, traceId?: string, details?: Record<string, unknown> }} context - Alert context.
 * @returns {Record<string, unknown> | null} Emitted payload.
 */
export const emitCanonicalAlert = (canonicalKey, context = {}) => {
    const payload = buildStandardAlertPayload({
        canonicalKey,
        sourceType: "backend_action",
        sourceKey: context.sourceKey ?? canonicalKey,
        ...context,
    });

    return emitStandardAlert(payload);
};
