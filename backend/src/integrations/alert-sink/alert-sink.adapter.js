import axios from "axios";
import { logger } from "../../utils/logger/logger.js";

/**
 * Baseline sink adapter that records alert/report publication into structured logs.
 *
 * This acts as safe fallback when external sink is not configured.
 */
export class LoggerAlertSinkAdapter {
    /**
     * Publish one canonical alert payload to logger sink.
     *
     * @param {{ idempotencyKey: string, alert: Record<string, unknown> }} payload - Alert delivery payload.
     * @returns {Promise<Record<string, unknown>>} Sink delivery metadata.
     */
    async publishAlert(payload) {
        const deliveredAt = new Date().toISOString();

        logger.info({
            message: "canonical-alert-sink-delivery",
            sink: {
                channel: "logger",
                delivered: true,
                deliveredAt,
                payload,
            },
        });

        return {
            channel: "logger",
            delivered: true,
            deliveredAt,
        };
    }

    /**
     * Publish report export metadata to the sink channel.
     *
     * @param {{
     *   actor: { id?: string, role?: string, mspId?: string },
     *   format: "json" | "csv",
     *   itemCount: number,
     *   exportedAt: string,
     *   filters: Record<string, unknown>
     * }} payload - Report publication metadata.
     * @returns {Promise<Record<string, unknown>>} Sink delivery metadata.
     */
    async publishReport(payload) {
        const deliveredAt = new Date().toISOString();

        logger.info({
            message: "regulator-alert-report-published",
            sink: {
                channel: "logger",
                delivered: true,
                deliveredAt,
                payload,
            },
        });

        return {
            channel: "logger",
            delivered: true,
            deliveredAt,
        };
    }
}

/**
 * Webhook sink adapter for canonical alert/report delivery.
 */
export class WebhookAlertSinkAdapter {
    /**
     * @param {{ url: string, timeoutMs: number, authHeader: string, authToken: string }} options - Webhook transport options.
     */
    constructor(options) {
        this.url = options.url;
        this.timeoutMs = options.timeoutMs;
        this.authHeader = options.authHeader;
        this.authToken = options.authToken;
    }

    /**
     * Build common outbound HTTP headers for sink requests.
     *
     * @param {string} idempotencyKey - Idempotency key for duplicate prevention at receiver side.
     * @returns {Record<string, string>} HTTP headers.
     */
    buildHeaders(idempotencyKey) {
        const headers = {
            "Content-Type": "application/json",
            "x-idempotency-key": idempotencyKey,
        };

        if (this.authToken) {
            headers[this.authHeader] = this.authToken;
        }

        return headers;
    }

    /**
     * Publish one canonical alert payload to external webhook sink.
     *
     * @param {{ idempotencyKey: string, alert: Record<string, unknown> }} payload - Alert payload.
     * @returns {Promise<Record<string, unknown>>} Sink delivery metadata.
     */
    async publishAlert(payload) {
        const response = await axios.post(
            this.url,
            {
                eventType: "alert",
                idempotencyKey: payload.idempotencyKey,
                alert: payload.alert,
            },
            {
                timeout: this.timeoutMs,
                headers: this.buildHeaders(payload.idempotencyKey),
            },
        );

        return {
            channel: "webhook",
            delivered: true,
            deliveredAt: new Date().toISOString(),
            statusCode: response.status,
        };
    }

    /**
     * Publish report metadata to external webhook sink.
     *
     * @param {{ actor: Record<string, unknown>, format: "json" | "csv", itemCount: number, exportedAt: string, filters: Record<string, unknown> }} payload - Report payload.
     * @returns {Promise<Record<string, unknown>>} Sink delivery metadata.
     */
    async publishReport(payload) {
        const idempotencyKey = `report:${payload.exportedAt}:${payload.format}:${payload.itemCount}`;
        const response = await axios.post(
            this.url,
            {
                eventType: "report",
                idempotencyKey,
                report: payload,
            },
            {
                timeout: this.timeoutMs,
                headers: this.buildHeaders(idempotencyKey),
            },
        );

        return {
            channel: "webhook",
            delivered: true,
            deliveredAt: new Date().toISOString(),
            statusCode: response.status,
        };
    }
}
