import { HttpException } from "../../utils/http-exception/http-exception.js";
import { Report } from "../../models/report/report.model.js";

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

    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
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
            throw new HttpException(
                403,
                "FORBIDDEN",
                "Regulator access required",
            );
        }
    }

    /**
     * Retrieve paginated archived alerts.
     *
     * @param {Record<string, unknown>} query - Query filters.
     * @param {{ role: string, regulatorLevel: string, province: string }} actor - Authenticated actor.
     * @returns {Promise<Record<string, unknown>>} Paginated alert response.
     */
    async listAlerts(query, actor) {
        this.ensureRegulator(actor);
        // High level can see all, low level only their province
        if (actor.regulatorLevel === "LOW") {
            query.province = actor.province;
        }
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
     * @param {{ id?: string, role: string, mspId?: string, regulatorLevel: string, province: string }} actor - Authenticated actor.
     * @returns {Promise<Record<string, unknown>>} Export payload.
     */
    async exportAlertsReport(query, actor) {
        this.ensureRegulator(actor);

        const format = query.format === "csv" ? "csv" : "json";
        const limit = Math.min(
            10_000,
            Math.max(1, Number(query.limit ?? 1000)),
        );
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

        if (actor.regulatorLevel === "LOW") {
            filters.province = actor.province;
        }

        const items = await this.alertArchiveRepository.listForExport(
            filters,
            limit,
        );
        const summary = summarizeAlerts(items);
        const sinkDelivery = await this.sinkAdapter.publishReport({ 
            actor, 
            format, 
            itemCount: items.length, 
            exportedAt, 
            filters 
        });

        if (format === "csv") {
            return {
                format,
                exportedAt,
                fileName: `regulator-report-${Date.now()}.csv`,
                content: toAlertCsv(items),
                summary,
                sinkDelivery,
            };
        }

        return {
            format,
            exportedAt,
            items,
            summary,
            sinkDelivery,
        };
    }

    /**
     * List user reports (thuốc thật giả) with regional filtering.
     */
    async listReports(actor) {
        this.ensureRegulator(actor);
        const query = {};
        if (actor.regulatorLevel === "LOW") {
            query.province = actor.province;
        }
        return Report.find(query).sort({ createdAt: -1 }).lean();
    }

    /**
     * Update report status with an optional note.
     */
    async updateReportStatus(reportId, status, actor, note = "") {
        this.ensureRegulator(actor);
        const report = await Report.findById(reportId);
        if (!report) {
            throw new HttpException(404, "NOT_FOUND", "Report not found");
        }

        // Hierarchy check for LOW level regulators
        if (actor.regulatorLevel === "LOW" && report.province !== actor.province) {
            throw new HttpException(403, "FORBIDDEN", "Unauthorized to update reports outside your province");
        }

        report.status = status;
        if (note) {
            report.description = (report.description ? report.description + "\n\n" : "") + `[Status Updated to ${status}]: ${note}`;
        }
        await report.save();
        return report;
    }

    /**
     * Unified surveillance view merging Alerts and User Reports.
     */
    async listSurveillance(query, actor) {
        this.ensureRegulator(actor);

        const page = Math.max(1, Number(query.page ?? 1));
        const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 20)));
        
        // 1. Fetch Alerts (System Generated)
        const alertFilters = { ...query };
        if (actor.regulatorLevel === "LOW") {
            alertFilters.province = actor.province;
        }
        const alertsResult = await this.alertArchiveRepository.list(alertFilters);

        // 2. Fetch User Reports (User Generated)
        const reportQuery = {};
        if (actor.regulatorLevel === "LOW") {
            reportQuery.province = actor.province;
        }
        if (query.severity) {
            reportQuery.severity = query.severity;
        }
        const reports = await Report.find(reportQuery).sort({ createdAt: -1 }).lean();

        // 3. Merge and Normalize
        console.log(`[RegulatorAlertsService] Merging ${alertsResult.items.length} alerts and ${reports.length} reports for actor: ${actor.username}`);

        const normalizedAlerts = alertsResult.items.map(a => {
            let friendlyTitle = (a.canonicalKey || "").replace(/_/g, " ").trim();
            
            // Explicit Vietnamese Mapping
            if (a.canonicalKey === "RECALL_ALERT") friendlyTitle = "Cảnh báo Thu hồi";
            else if (a.canonicalKey === "SENSITIVE_MOVEMENT") friendlyTitle = "Di chuyển bất thường";
            else if (a.canonicalKey === "AUTH_FAILURE") friendlyTitle = "Xác thực thất bại";
            else if (a.canonicalKey === "COUNTERFEIT_DETECTED") friendlyTitle = "Phát hiện hàng giả";
            else if (a.canonicalKey === "SCAN_REJECTED") friendlyTitle = "Cảnh báo Quét lỗi";
            else if (a.canonicalKey === "SCAN_ACCEPTED") friendlyTitle = "Lượt quét thành công";
            else if (a.canonicalKey === "LEDGER_SCAN_SUSPICIOUS") friendlyTitle = "CẢNH BÁO: NGHI VẤN HÀNG GIẢ";
            else if (a.canonicalKey === "LEDGER_SCAN_WARNING") friendlyTitle = "Cảnh báo Quét bất thường";

            // Province normalization: Filter out "Unknown" string
            let prov = a.details?.province || actor.province || "Cả nước";
            if (prov === "Unknown") prov = "Cả nước";

            return {
                id: a.id,
                type: "ALERT",
                title: friendlyTitle,
                severity: a.severity,
                status: "RESOLVED", // Alerts are auto-logged as resolved/archived system events
                province: prov,
                occurredAt: a.occurredAt,
                details: a.details,
                batchID: a.batchID,
                traceId: a.traceId,
                lat: a.details?.lat,
                lng: a.details?.lng
            };
        });

        const normalizedReports = reports.map(r => {
            let prov = r.province || "Unknown";
            if (prov === "Unknown") prov = "Cả nước"; // Default for reports with missing province

            return {
                id: String(r._id),
                type: "REPORT",
                title: `Báo cáo hàng giả: ${r.productName}`,
                severity: r.severity || "warn",
                status: r.status,
                province: prov,
                occurredAt: r.createdAt,
            note: r.status !== 'PENDING' ? r.description : undefined,
            details: {
                issues: r.issues,
                description: r.description,
                paymentBill: r.paymentBillMeta,
                drugImage: r.drugImageMeta,
                qrImage: r.qrImageMeta,
                additionalImage: r.additionalImageMeta,
                reporterIP: r.reporterIP,
                batchID: r.batchID // Ensure batchID is passed for recall action
            },
            batchID: r.batchID, // Direct access for UI logic
            lat: r.lat,
            lng: r.lng
            };
        });

        const allItems = [...normalizedAlerts, ...normalizedReports].sort((a, b) => 
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
        );

        // 4. Pagination (Manual for merged list)
        const total = allItems.length;
        const pagedItems = allItems.slice((page - 1) * pageSize, page * pageSize);

        return {
            page,
            pageSize,
            total,
            items: pagedItems
        };
    }

    /**
     * Update report status.
     */
    async updateReportStatus(reportId, status, actor) {
        this.ensureRegulator(actor);
        const report = await Report.findById(reportId);
        if (!report) {
            throw new HttpException(404, "Report not found");
        }

        if (actor.regulatorLevel === "LOW" && report.province !== actor.province) {
            throw new HttpException(403, "You can only handle reports in your province");
        }

        report.status = status;
        await report.save();
        return report;
    }
}
