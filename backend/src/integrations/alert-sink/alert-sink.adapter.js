import { logger } from "../../utils/logger/logger.js";

/**
 * Baseline sink adapter that records report publication into structured logs.
 *
 * This keeps the integration contract stable until pluggable sinks are added in P0-05.
 */
export class LoggerAlertSinkAdapter {
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
