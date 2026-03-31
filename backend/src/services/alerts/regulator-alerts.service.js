import { HttpException } from "../../utils/http-exception/http-exception.js";

/**
 * Convert one value into CSV-safe field content.
 *
 * @param {unknown} value - Raw value.
 * @returns {string} CSV-safe string field.
 */
const toCsvField = (value) => {
    const text =
        value === null || value === undefined
            ? ""
            : typeof value === "string"
              ? value
              : JSON.stringify(value);

    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replace(/\"/g, '""')}"`;
    }

    return text;
};

/**
 * Build one CSV document from alert DTO rows.
 *
 * @param {Array<Record<string, unknown>>} rows - Alert rows.
 * @returns {string} CSV content.
 */
const toAlertCsv = (rows) => {
    const headers = [
        "id",
        "canonicalKey",
        "sinkEventId",
        "severity",
        "sourceType",
        "sourceKey",
        "batchID",
        "traceId",
        "occurredAt",
        "details",
    ];

    const lines = [headers.join(",")];
    for (const row of rows) {
        lines.push(
            [
                row.id,
                row.canonicalKey,
                row.sinkEventId,
                row.severity,
                row.source?.type,
                row.source?.key,
                row.batchID,
                row.traceId,
                row.occurredAt,
                row.details,
            ]
                .map(toCsvField)
                .join(","),
        );
    }

    return `${lines.join("\n")}\n`;
};

/**
 * Compute summary counters from alert list.
 *
 * @param {Array<Record<string, unknown>>} items - Alert list.
 * @returns {Record<string, unknown>} Summary payload.
 */
const summarizeAlerts = (items) => {
    const bySeverity = { info: 0, warn: 0, critical: 0 };
    const byCanonicalKey = {};

    for (const item of items) {
        if (typeof item.severity === "string" && item.severity in bySeverity) {
            bySeverity[item.severity] += 1;
        }

        if (typeof item.canonicalKey === "string" && item.canonicalKey) {
            byCanonicalKey[item.canonicalKey] =
                (byCanonicalKey[item.canonicalKey] ?? 0) + 1;
        }
    }

    return {
        total: items.length,
        bySeverity,
        byCanonicalKey,
    };
};

/**
 * Regulator-facing API service for querying archived alerts and exporting reports.
 */
export class RegulatorAlertsService {
    /**
     * @param {{
     *   list: (filters: Record<string, unknown>) => Promise<Record<string, unknown>>,
     *   findById: (alertId: string) => Promise<Record<string, unknown> | null>,
     *   listForExport: (filters: Record<string, unknown>, limit: number) => Promise<Array<Record<string, unknown>>>
     * }} alertArchiveRepository
     * @param {{ publishReport: (payload: Record<string, unknown>) => Promise<Record<string, unknown>> }} sinkAdapter
     */
    constructor(alertArchiveRepository, sinkAdapter) {
        this.alertArchiveRepository = alertArchiveRepository;
        this.sinkAdapter = sinkAdapter;
    }

    /**
     * Ensure endpoint caller is regulator.
     *
     * @param {{ role?: string }} actor - Authenticated actor.
     */
    ensureRegulator(actor) {
        if (actor?.role !== "Regulator") {
            throw new HttpException(403, "FORBIDDEN", "Regulator access required");
        }
    }

    /**
     * Retrieve paginated archived alerts.
     *
     * @param {Record<string, unknown>} query - Query filters.
     * @param {{ role: string }} actor - Authenticated actor.
     * @returns {Promise<Record<string, unknown>>} Paginated alert response.
     */
    async listAlerts(query, actor) {
        this.ensureRegulator(actor);
        return this.alertArchiveRepository.list(query);
    }

    /**
     * Retrieve one archived alert by identifier.
     *
     * @param {string} alertId - Alert identifier.
     * @param {{ role: string }} actor - Authenticated actor.
     * @returns {Promise<Record<string, unknown>>} Alert DTO.
     */
    async getAlertById(alertId, actor) {
        this.ensureRegulator(actor);

        const row = await this.alertArchiveRepository.findById(alertId);
        if (!row) {
            throw new HttpException(404, "ALERT_NOT_FOUND", "Alert not found");
        }

        return row;
    }

    /**
     * Export alerts in JSON or CSV format and publish report metadata to sink.
     *
     * @param {Record<string, unknown>} query - Export query filters.
     * @param {{ id?: string, role: string, mspId?: string }} actor - Authenticated actor.
     * @returns {Promise<Record<string, unknown>>} Export payload.
     */
    async exportAlertsReport(query, actor) {
        this.ensureRegulator(actor);

        const format = query.format === "csv" ? "csv" : "json";
        const limit = Math.min(10_000, Math.max(1, Number(query.limit ?? 1000)));
        const exportedAt = new Date().toISOString();
        const filters = {
            canonicalKey: query.canonicalKey,
            severity: query.severity,
            batchID: query.batchID,
            sourceType: query.sourceType,
            sourceKey: query.sourceKey,
            traceId: query.traceId,
            from: query.from,
            to: query.to,
        };

        const items = await this.alertArchiveRepository.listForExport(filters, limit);
        const summary = summarizeAlerts(items);
        const sinkDelivery = await this.sinkAdapter.publishReport({
            actor,
            format,
            itemCount: items.length,
            exportedAt,
            filters,
        });

        if (format === "csv") {
            return {
                format,
                exportedAt,
                fileName: `alert-report-${exportedAt.replace(/[:.]/g, "-")}.csv`,
                summary,
                sinkDelivery,
                content: toAlertCsv(items),
            };
        }

        return {
            format,
            exportedAt,
            summary,
            sinkDelivery,
            items,
        };
    }
}
