import crypto from "crypto";
import { config } from "../../config/index.js";
import { DELIVERABLE_CANONICAL_ALERT_KEYS } from "../../constants/alert/alert-taxonomy.constants.js";
import {
    LoggerAlertSinkAdapter,
    WebhookAlertSinkAdapter,
} from "../../integrations/alert-sink/alert-sink.adapter.js";
import { createAlertDeadLetterRepository } from "../../repositories/alert/alert-dead-letter.repository.js";
import { createAlertDeliveryRepository } from "../../repositories/alert/alert-delivery.repository.js";
import { logger } from "../../utils/logger/logger.js";

/**
 * Wait asynchronously for retry backoff interval.
 *
 * @param {number} ms - Delay in milliseconds.
 * @returns {Promise<void>} Promise resolved after delay.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalize unknown error into display-safe text and status code.
 *
 * @param {unknown} error - Unknown thrown value.
 * @returns {{ message: string, statusCode: number | null }} Normalized error tuple.
 */
const toSinkErrorInfo = (error) => {
    const fallback = {
        message: "Unknown sink error",
        statusCode: null,
    };

    if (!error || typeof error !== "object") {
        return fallback;
    }

    const maybeMessage =
        typeof error.message === "string" ? error.message : fallback.message;
    const maybeStatusCode =
        typeof error.response?.status === "number"
            ? error.response.status
            : null;

    return {
        message: maybeMessage,
        statusCode: maybeStatusCode,
    };
};

/**
 * Build deterministic idempotency key from canonical alert identity fields.
 *
 * @param {Record<string, unknown>} alertPayload - Standardized canonical alert payload.
 * @returns {string} Idempotency hash key.
 */
const buildIdempotencyKey = (alertPayload) => {
    const seed = [
        alertPayload.canonicalKey ?? "",
        alertPayload.sinkEventId ?? "",
        alertPayload.batchID ?? "",
        alertPayload.source?.type ?? "",
        alertPayload.source?.key ?? "",
        alertPayload.traceId ?? "",
    ].join("|");

    return crypto.createHash("sha256").update(seed).digest("hex");
};

/**
 * Compute exponential retry delay bounded by maxDelayMs.
 *
 * @param {{ attempt: number, baseDelayMs: number, maxDelayMs: number }} input - Retry input.
 * @returns {number} Delay in milliseconds.
 */
const computeBackoffDelayMs = (input) => {
    const exponent = Math.max(0, input.attempt - 1);
    const delay = input.baseDelayMs * 2 ** exponent;
    return Math.min(delay, input.maxDelayMs);
};

/**
 * Build alert sink adapter according to runtime config.
 *
 * @returns {LoggerAlertSinkAdapter | WebhookAlertSinkAdapter} Sink adapter instance.
 */
export const createAlertSinkAdapter = () => {
    const sinkType = config.alertSink.type;
    if (sinkType === "webhook" && config.alertSink.webhook.url) {
        return new WebhookAlertSinkAdapter({
            url: config.alertSink.webhook.url,
            timeoutMs: config.alertSink.webhook.timeoutMs,
            authHeader: config.alertSink.webhook.authHeader,
            authToken: config.alertSink.webhook.authToken,
        });
    }

    if (sinkType === "webhook" && !config.alertSink.webhook.url) {
        logger.warn({
            message:
                "ALERT_SINK_TYPE=webhook but ALERT_SINK_WEBHOOK_URL is empty; fallback to logger sink",
        });
    }

    return new LoggerAlertSinkAdapter();
};

/**
 * Service that dispatches selected canonical alerts to external sink channels.
 */
export class AlertDeliveryService {
    /**
     * @param {{
     *  sinkAdapter: { publishAlert: (payload: Record<string, unknown>) => Promise<Record<string, unknown>> },
     *  deliveryRepository: { findByIdempotencyKey: (idempotencyKey: string) => Promise<Record<string, unknown> | null>, ensurePending: (input: Record<string, unknown>) => Promise<Record<string, unknown>>, markAttemptFailure: (input: Record<string, unknown>) => Promise<void>, markDelivered: (input: Record<string, unknown>) => Promise<void>, markDeadLetter: (input: Record<string, unknown>) => Promise<void> },
     *  deadLetterRepository: { upsert: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
     *  retry: { maxAttempts: number, baseDelayMs: number, maxDelayMs: number }
     * }} input - Alert delivery dependencies.
     */
    constructor(input) {
        this.sinkAdapter = input.sinkAdapter;
        this.deliveryRepository = input.deliveryRepository;
        this.deadLetterRepository = input.deadLetterRepository;
        this.retry = input.retry;
    }

    /**
     * Check whether alert key is part of sink-delivery policy.
     *
     * @param {Record<string, unknown> | null} alertPayload - Standardized alert payload.
     * @returns {boolean} True when alert should be delivered to sink.
     */
    isDeliverable(alertPayload) {
        if (!alertPayload || typeof alertPayload !== "object") {
            return false;
        }

        return DELIVERABLE_CANONICAL_ALERT_KEYS.includes(
            String(alertPayload.canonicalKey || ""),
        );
    }

    /**
     * Dispatch one alert payload using retry and dead-letter policy.
     *
     * @param {Record<string, unknown> | null} alertPayload - Standardized alert payload.
     * @returns {Promise<Record<string, unknown>>} Delivery result.
     */
    async dispatchAlert(alertPayload) {
        if (!config.alertSink.enabled) {
            return { status: "skipped", reason: "sink_disabled" };
        }

        if (!this.isDeliverable(alertPayload)) {
            return { status: "skipped", reason: "not_deliverable" };
        }

        const idempotencyKey = buildIdempotencyKey(alertPayload);
        const existing =
            await this.deliveryRepository.findByIdempotencyKey(idempotencyKey);
        if (existing?.status === "DELIVERED") {
            logger.info({
                message: "alert-sink-duplicate-skipped",
                idempotencyKey,
                canonicalKey: alertPayload.canonicalKey,
            });
            return {
                status: "duplicate",
                idempotencyKey,
            };
        }

        await this.deliveryRepository.ensurePending({
            idempotencyKey,
            alertPayload,
            sinkChannel: config.alertSink.type,
        });

        const maxAttempts = Math.max(1, this.retry.maxAttempts);
        const baseDelayMs = Math.max(1, this.retry.baseDelayMs);
        const maxDelayMs = Math.max(baseDelayMs, this.retry.maxDelayMs);

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                const sinkResult = await this.sinkAdapter.publishAlert({
                    idempotencyKey,
                    alert: alertPayload,
                });

                await this.deliveryRepository.markDelivered({
                    idempotencyKey,
                    attempt,
                    statusCode:
                        typeof sinkResult?.statusCode === "number"
                            ? sinkResult.statusCode
                            : null,
                });

                logger.info({
                    message: "alert-sink-delivered",
                    idempotencyKey,
                    canonicalKey: alertPayload.canonicalKey,
                    attempt,
                    sinkChannel: sinkResult?.channel ?? config.alertSink.type,
                });

                return {
                    status: "delivered",
                    idempotencyKey,
                    attempt,
                    sink: sinkResult,
                };
            } catch (error) {
                const errorInfo = toSinkErrorInfo(error);
                const hasRemainingAttempts = attempt < maxAttempts;
                const retryDelayMs = hasRemainingAttempts
                    ? computeBackoffDelayMs({
                          attempt,
                          baseDelayMs,
                          maxDelayMs,
                      })
                    : 0;

                await this.deliveryRepository.markAttemptFailure({
                    idempotencyKey,
                    attempt,
                    errorMessage: errorInfo.message,
                    statusCode: errorInfo.statusCode,
                    retryScheduledAt: hasRemainingAttempts
                        ? new Date(Date.now() + retryDelayMs)
                        : null,
                });

                logger.warn({
                    message: "alert-sink-delivery-failed",
                    idempotencyKey,
                    canonicalKey: alertPayload.canonicalKey,
                    attempt,
                    maxAttempts,
                    retryDelayMs,
                    statusCode: errorInfo.statusCode,
                    error: errorInfo.message,
                });

                if (hasRemainingAttempts) {
                    await sleep(retryDelayMs);
                    continue;
                }

                const deadLetter = await this.deadLetterRepository.upsert({
                    idempotencyKey,
                    canonicalKey: alertPayload.canonicalKey,
                    sinkEventId: alertPayload.sinkEventId,
                    sinkChannel: config.alertSink.type,
                    batchID: alertPayload.batchID,
                    traceId: alertPayload.traceId,
                    attemptsCount: attempt,
                    finalErrorMessage: errorInfo.message,
                    payload: alertPayload,
                });

                await this.deliveryRepository.markDeadLetter({
                    idempotencyKey,
                    errorMessage: errorInfo.message,
                });

                logger.error({
                    message: "alert-sink-dead-lettered",
                    idempotencyKey,
                    canonicalKey: alertPayload.canonicalKey,
                    attempts: attempt,
                    deadLetterId: deadLetter?._id ? String(deadLetter._id) : "",
                    error: errorInfo.message,
                });

                return {
                    status: "dead_letter",
                    idempotencyKey,
                    attempts: attempt,
                    deadLetterId: deadLetter?._id ? String(deadLetter._id) : "",
                };
            }
        }

        return {
            status: "skipped",
            reason: "unexpected_exit",
        };
    }
}

/**
 * Build default alert delivery service from runtime config.
 *
 * @returns {AlertDeliveryService} Configured delivery service.
 */
export const createAlertDeliveryService = () => {
    return new AlertDeliveryService({
        sinkAdapter: createAlertSinkAdapter(),
        deliveryRepository: createAlertDeliveryRepository(),
        deadLetterRepository: createAlertDeadLetterRepository(),
        retry: {
            maxAttempts: config.alertSink.retry.maxAttempts,
            baseDelayMs: config.alertSink.retry.baseDelayMs,
            maxDelayMs: config.alertSink.retry.maxDelayMs,
        },
    });
};
