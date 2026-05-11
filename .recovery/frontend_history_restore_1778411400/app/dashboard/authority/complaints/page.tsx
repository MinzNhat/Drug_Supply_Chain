"use client";

import { ImageViewer } from "@/components/dashboard/product/ImageViewer";
import { ConfirmWithNoteDialog } from "@/components/ui/confirm-with-note-dialog";
import { ProtectedImage } from "@/components/ui/protected-image";
import { RowDetailPopup } from "@/components/ui/row-detail-popup";
import { fetchApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { AnimatePresence, motion } from "framer-motion";
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Eye,
    FileText,
    Filter,
    Image as ImageIcon,
    Maximize,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    ShieldX,
} from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// Dynamically import the map for single report location
const SinglePointMap = dynamic(
    () =>
        import("@/components/dashboard/authority/complaints/single-point-map"),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-full bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center">
                <Activity className="animate-pulse text-primary/20" size={24} />
            </div>
        ),
    },
);

interface SurveillanceItem {
    id: string;
    type: "REPORT" | "ALERT";
    title: string;
    severity: "info" | "warn" | "critical";
    status: "PENDING" | "RESOLVED" | "REJECTED" | "ARCHIVED";
    province: string;
    occurredAt: string;
    details: any;
    batchID?: string;
    traceId?: string;
    lat?: number;
    lng?: number;
    note?: string;
}

function ComplaintsContent() {
    const { t, lang } = useI18n();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const urlSearchParam = searchParams.get("search");

    const [items, setItems] = useState<SurveillanceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRow, setSelectedRow] = useState<SurveillanceItem | null>(
        null,
    );
    const [viewingImage, setViewingImage] = useState<string | null>(null);

    // Search states
    const [searchInput, setSearchInput] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    const [severityFilter, setSeverityFilter] = useState<string>("all");
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    // Status Update State
    const [confirmingStatus, setConfirmingStatus] = useState<{
        id: string;
        status: string;
        variant: "success" | "danger";
    } | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (urlSearchParam) {
            setSearchInput(urlSearchParam);
            setSearchTerm(urlSearchParam);
            router.replace(pathname, { scroll: false });
        }
    }, [urlSearchParam, pathname, router]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchInput !== searchTerm) {
                setSearchTerm(searchInput);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchInput, searchTerm]);

    const fetchSurveillance = async () => {
        setLoading(true);
        try {
            // Vẫn truyền searchTerm vào API phòng trường hợp Backend có hỗ trợ
            const res = await fetchApi(
                `/regulator/surveillance?severity=${severityFilter === "all" ? "" : severityFilter}&search=${searchTerm}`,
            );
            if (res.success) {
                setItems(res.data.items || []);
            }
        } catch (error) {
            console.error("Failed to fetch surveillance:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSurveillance();
    }, [severityFilter, searchTerm]);

    const filteredItems = useMemo(() => {
        if (!searchTerm) return items;
        const term = searchTerm.toLowerCase().trim();

        return items.filter((item) => {
            return (
                item.id.toLowerCase().includes(term) ||
                item.title.toLowerCase().includes(term) ||
                item.province.toLowerCase().includes(term) ||
                item.type.toLowerCase().includes(term) ||
                item.status.toLowerCase().includes(term)
            );
        });
    }, [items, searchTerm]);

    // Hotkey R
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                (e.key === "r" || e.key === "R") &&
                !["INPUT", "TEXTAREA", "SELECT"].includes(
                    document.activeElement?.tagName || "",
                )
            ) {
                fetchSurveillance();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [severityFilter, searchTerm]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                filterRef.current &&
                !filterRef.current.contains(e.target as Node)
            ) {
                setFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleUpdateStatus = async (note: string) => {
        if (!confirmingStatus) return;
        setIsUpdating(true);
        try {
            const res = await fetchApi(
                `/regulator/surveillance/${confirmingStatus.id}/status`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        status: confirmingStatus.status,
                        note,
                    }),
                },
            );
            if (res.success) {
                toast.success(t("surv_status_updated") || "Status updated");
                setItems((prev) =>
                    prev.map((item) =>
                        item.id === confirmingStatus.id
                            ? {
                                  ...item,
                                  status: confirmingStatus.status as any,
                              }
                            : item,
                    ),
                );
                if (selectedRow?.id === confirmingStatus.id) {
                    setSelectedRow((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  status: confirmingStatus.status as any,
                              }
                            : null,
                    );
                }
                setConfirmingStatus(null);
            }
        } catch (error) {
            toast.error("Failed to update status");
        } finally {
            setIsUpdating(false);
        }
    };

    const getSeverityColor = (sev: string) => {
        switch (sev) {
            case "critical":
                return "text-rose-600";
            case "warn":
                return "text-amber-600";
            case "info":
                return "text-blue-600";
            default:
                return "text-slate-600";
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "RESOLVED":
                return "text-emerald-600";
            case "REJECTED":
                return "text-rose-500";
            case "PENDING":
                return "text-amber-600";
            default:
                return "text-slate-600";
        }
    };

    const detailFields = useMemo(
        () => [
            {
                key: "type",
                label: t("surv_th_type"),
                render: (val: string) =>
                    t(
                        val === "REPORT"
                            ? "surv_source_user"
                            : "surv_source_system",
                    ),
            },
            { key: "title", label: t("catalog_name") },
            {
                key: "severity",
                label: t("surv_th_severity"),
                render: (val: string) => (
                    <span
                        className={`uppercase font-medium ${getSeverityColor(val)}`}
                    >
                        {t(`surv_sev_${val}`)}
                    </span>
                ),
            },
            { key: "province", label: t("login_province") },
            {
                key: "occurredAt",
                label: t("trace_hist_th_time"),
                render: (val: string) =>
                    new Date(val).toLocaleString(
                        lang === "vi" ? "vi-VN" : "en-US",
                    ),
            },
            {
                key: "status",
                label: t("users_status"),
                render: (val: string) => (
                    <span
                        className={`uppercase font-medium ${getStatusColor(val)}`}
                    >
                        {t(`surv_status_${val.toLowerCase()}`)}
                    </span>
                ),
            },
        ],
        [t, lang],
    );

    const getImagePath = (reportId: string, type: string) => {
        return `/reports/${reportId}/images/${type}`;
    };

    return (
        <div className="flex flex-col h-[calc(100dvh-48px)] bg-background overflow-hidden font-sans select-none rounded-none border-none">
            {/* Toolbar */}
            <div className="shrink-0 flex h-8 border-b border-border bg-card">
                <div className="flex-1 relative group flex items-center">
                    <Search
                        className="absolute text-muted-foreground left-2.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary"
                        size={12}
                    />
                    <input
                        type="text"
                        placeholder={t("catalog_search_ph")}
                        className="w-full h-full bg-transparent pl-8 pr-4 text-[11px] focus:outline-none placeholder:text-muted-foreground rounded-none font-normal"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </div>

                <div className="flex items-center border-l border-border bg-card">
                    <div
                        className="relative flex items-center px-2 h-full"
                        ref={filterRef}
                    >
                        <button
                            onClick={() => setFilterOpen(!filterOpen)}
                            className="flex justify-between items-center w-[150px] gap-2 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors h-full px-1"
                        >
                            <div className="flex items-center gap-2 flex-1">
                                <Filter size={11} />
                                <span className="uppercase mt-0.5 flex-1 text-center font-bold">
                                    {severityFilter === "all"
                                        ? t("surv_th_severity")
                                        : t(`surv_sev_${severityFilter}`)}
                                </span>
                            </div>
                            <ChevronDown
                                size={10}
                                className={`transition-transform duration-200 ${filterOpen ? "rotate-180" : ""}`}
                            />
                        </button>

                        <AnimatePresence>
                            {filterOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                    transition={{ duration: 0.1 }}
                                    className="absolute left-0 top-full mt-0 w-[166.5px] bg-white dark:bg-slate-900 border border-border shadow-xl z-50 overflow-hidden"
                                >
                                    {["all", "critical", "warn", "info"].map(
                                        (sev) => (
                                            <button
                                                key={sev}
                                                onClick={() => {
                                                    setSeverityFilter(sev);
                                                    setFilterOpen(false);
                                                }}
                                                className={`w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${severityFilter === sev ? "text-primary bg-primary/5" : "text-muted-foreground"}`}
                                            >
                                                {sev === "all"
                                                    ? t("catalog_all")
                                                    : t(`surv_sev_${sev}`)}
                                                {severityFilter === sev && (
                                                    <Check
                                                        size={10}
                                                        className="text-primary"
                                                    />
                                                )}
                                            </button>
                                        ),
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <button
                    onClick={() => fetchSurveillance()}
                    className="flex items-center gap-2 justify-center w-[64.5px] h-full hover:bg-slate-100 dark:hover:bg-slate-800 border-l border-border transition-colors text-[10px] font-medium text-muted-foreground group rounded-none"
                >
                    <RefreshCw
                        size={12}
                        className={loading ? "animate-spin text-primary" : ""}
                    />
                    <span className="bg-slate-200 dark:bg-slate-800 px-1 text-[9px] font-bold">
                        R
                    </span>
                </button>
            </div>

            {/* Main Table */}
            <div className="flex-1 overflow-auto bg-background border-b border-border">
                {loading && items.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <Activity
                            size={20}
                            className="text-primary/20 animate-pulse"
                        />
                    </div>
                ) : (
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 z-10 bg-card border-b border-border">
                            <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                                <th className="px-3 py-2 text-center border-r border-border w-24">
                                    {t("net_health_th_actions")}
                                </th>
                                <th className="px-3 py-2 text-left border-r border-border w-44 whitespace-nowrap">
                                    {t("trace_hist_th_time")}
                                </th>
                                <th className="px-3 py-2 text-left border-r border-border w-32 whitespace-nowrap">
                                    {t("surv_th_type")}
                                </th>
                                <th className="px-3 py-2 text-left border-r border-border w-32 whitespace-nowrap">
                                    {t("surv_th_severity")}
                                </th>
                                <th className="px-3 py-2 text-left border-r border-border min-w-[200px] whitespace-nowrap">
                                    {t("catalog_name")}
                                </th>
                                <th className="px-3 py-2 text-left border-r border-border w-40 whitespace-nowrap">
                                    {t("login_province")}
                                </th>
                                <th className="px-3 py-2 text-left whitespace-nowrap">
                                    {t("users_status")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Render bằng filteredItems thay vì items */}
                            {filteredItems.map((item) => (
                                <tr
                                    key={item.id}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors border-b border-border cursor-pointer"
                                >
                                    <td className="px-3 border-r border-border">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                className="p-1 text-muted-foreground hover:text-primary transition-colors"
                                                onClick={() =>
                                                    setSelectedRow(item)
                                                }
                                                title={t("surv_action_view")}
                                            >
                                                <Eye size={12} />
                                            </button>
                                            {item.status === "PENDING" ? (
                                                <>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmingStatus(
                                                                {
                                                                    id: item.id,
                                                                    status: "RESOLVED",
                                                                    variant:
                                                                        "success",
                                                                },
                                                            );
                                                        }}
                                                        className="p-1 text-muted-foreground hover:text-emerald-600 transition-colors"
                                                        title={t(
                                                            "surv_resolve_btn",
                                                        )}
                                                    >
                                                        <ShieldCheck
                                                            size={12}
                                                        />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmingStatus(
                                                                {
                                                                    id: item.id,
                                                                    status: "REJECTED",
                                                                    variant:
                                                                        "danger",
                                                                },
                                                            );
                                                        }}
                                                        className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                                                        title={t(
                                                            "surv_reject_btn",
                                                        )}
                                                    >
                                                        <ShieldX size={12} />
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="w-8 flex justify-center">
                                                    <Check size={10} />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td
                                        className="px-3 py-1.5 text-[11px] font-normal text-foreground border-r border-border/50 whitespace-nowrap"
                                        onClick={() => setSelectedRow(item)}
                                    >
                                        {new Date(
                                            item.occurredAt,
                                        ).toLocaleString(
                                            lang === "vi" ? "vi-VN" : "en-US",
                                        )}
                                    </td>
                                    <td
                                        className="px-3 py-1.5 text-[11px] font-normal border-r border-border/50 whitespace-nowrap uppercase"
                                        onClick={() => setSelectedRow(item)}
                                    >
                                        {t(
                                            item.type === "REPORT"
                                                ? "surv_source_user"
                                                : "surv_source_system",
                                        )}
                                    </td>
                                    <td
                                        className="px-3 py-1.5 text-[11px] border-r border-border/50"
                                        onClick={() => setSelectedRow(item)}
                                    >
                                        <span
                                            className={`uppercase font-medium ${getSeverityColor(item.severity)}`}
                                        >
                                            {t(`surv_sev_${item.severity}`)}
                                        </span>
                                    </td>
                                    <td
                                        className="px-3 py-1.5 text-[11px] font-normal text-foreground border-r border-border/50 truncate max-w-[300px]"
                                        onClick={() => setSelectedRow(item)}
                                    >
                                        {item.title}
                                    </td>
                                    <td
                                        className="px-3 py-1.5 text-[11px] font-normal text-foreground border-r border-border/50"
                                        onClick={() => setSelectedRow(item)}
                                    >
                                        {item.province}
                                    </td>
                                    <td
                                        className="px-3 py-1.5 text-[11px] font-normal"
                                        onClick={() => setSelectedRow(item)}
                                    >
                                        <span
                                            className={`uppercase ${getStatusColor(item.status)}`}
                                        >
                                            {t(
                                                `surv_status_${item.status.toLowerCase()}`,
                                            )}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {!loading && filteredItems.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-3 py-20 text-center text-[10px] uppercase font-bold text-muted-foreground border-b border-border bg-slate-50/30"
                                    >
                                        {t("trace_empty") || "No records found"}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer Info */}
            <div className="shrink-0 h-8 bg-card border-t-0.5 border-border flex items-center px-3 justify-between">
                <div className="text-[9px] font-bold text-muted-foreground uppercase">
                    {t("trace_footer_total")}: {filteredItems.length}
                </div>
                <div className="flex items-center gap-2">
                    <button className="p-1 opacity-30 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <ChevronLeft size={14} />
                    </button>
                    <button className="p-1 opacity-30 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            {/* Detail Popup */}
            <RowDetailPopup
                isOpen={!!selectedRow}
                onClose={() => setSelectedRow(null)}
                title={t("surv_detail_title")}
                data={selectedRow || {}}
                fields={detailFields}
                hideRawData={true}
                sideContent={
                    selectedRow && (
                        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex-1 relative overflow-hidden">
                                <SinglePointMap item={selectedRow} />
                            </div>
                        </div>
                    )
                }
                customContent={
                    selectedRow && (
                        <div className="space-y-6 py-2">
                            {/* Status Management */}
                            {selectedRow.status !== "PENDING" &&
                                selectedRow.note && (
                                    <div className="p-3 bg-slate-100 dark:bg-slate-800/50 border border-border rounded-lg space-y-1">
                                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                            <AlertTriangle
                                                size={12}
                                                className="text-amber-500"
                                            />
                                            {t("surv_resolution_trail")}
                                        </p>
                                        <p className="text-[11px] leading-relaxed whitespace-pre-wrap italic opacity-80">
                                            {selectedRow.note}
                                        </p>
                                    </div>
                                )}

                            {/* Report Info */}
                            <div className="space-y-2">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <FileText
                                        size={12}
                                        className="text-primary"
                                    />
                                    {t("surv_report_info")}
                                </h4>
                                <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-3">
                                    <div className="space-y-0.5">
                                        <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-tighter">
                                            {selectedRow.type === "REPORT"
                                                ? t("surv_issues_reported")
                                                : t("surv_alert_key")}
                                        </p>
                                        <p className="text-[11px] font-medium leading-relaxed">
                                            {selectedRow.type === "REPORT"
                                                ? selectedRow.details.issues
                                                : selectedRow.title}
                                        </p>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-tighter">
                                            {t("surv_additional_details")}
                                        </p>
                                        <p className="text-[11px] text-foreground/80 leading-relaxed font-normal">
                                            {selectedRow.type === "REPORT"
                                                ? selectedRow.details
                                                      .description || "—"
                                                : t("surv_auto_entry")}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Evidence Images */}
                            {selectedRow.type === "REPORT" && (
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <ImageIcon
                                            size={12}
                                            className="text-primary"
                                        />
                                        {t("surv_evidence_images")}
                                    </h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2 group">
                                            <div
                                                onClick={() =>
                                                    selectedRow.details
                                                        .paymentBill &&
                                                    setViewingImage(
                                                        getImagePath(
                                                            selectedRow.id,
                                                            "paymentBill",
                                                        ),
                                                    )
                                                }
                                                className={`aspect-square bg-muted/20 rounded border border-border overflow-hidden relative ${selectedRow.details.paymentBill ? "cursor-zoom-in hover:bg-muted/30 shadow-sm transition-shadow" : ""}`}
                                            >
                                                {selectedRow.details
                                                    .paymentBill ? (
                                                    <>
                                                        <ProtectedImage
                                                            url={getImagePath(
                                                                selectedRow.id,
                                                                "paymentBill",
                                                            )}
                                                            alt={t(
                                                                "surv_payment_bill",
                                                            )}
                                                            className="w-full h-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                                                            <Maximize
                                                                size={16}
                                                                className="text-white drop-shadow-md"
                                                            />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/10">
                                                        <ImageIcon size={32} />
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[9px] font-bold uppercase tracking-tight text-center">
                                                {t("surv_payment_bill")}
                                            </p>
                                        </div>

                                        <div className="space-y-2 group">
                                            <div
                                                onClick={() =>
                                                    selectedRow.details
                                                        .additionalImage &&
                                                    setViewingImage(
                                                        getImagePath(
                                                            selectedRow.id,
                                                            "additionalImage",
                                                        ),
                                                    )
                                                }
                                                className={`aspect-square bg-muted/20 rounded border border-border overflow-hidden relative ${selectedRow.details.additionalImage ? "cursor-zoom-in hover:bg-muted/30 shadow-sm transition-shadow" : ""}`}
                                            >
                                                {selectedRow.details
                                                    .additionalImage ? (
                                                    <>
                                                        <ProtectedImage
                                                            url={getImagePath(
                                                                selectedRow.id,
                                                                "additionalImage",
                                                            )}
                                                            alt={t(
                                                                "surv_product_evidence",
                                                            )}
                                                            className="w-full h-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                                                            <Maximize
                                                                size={16}
                                                                className="text-white drop-shadow-md"
                                                            />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/10">
                                                        <ImageIcon size={32} />
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[9px] font-bold uppercase tracking-tight text-center">
                                                {t("surv_product_evidence")}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Trace Integration */}
                            {(selectedRow.batchID ||
                                selectedRow.details?.batchID) && (
                                <div className="pt-2">
                                    <a
                                        href={`/dashboard/authority/trace?search=${selectedRow.batchID || selectedRow.details.batchID}`}
                                        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 border border-border rounded-lg group hover:border-primary/50 transition-all duration-300"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-slate-200 dark:bg-slate-800 rounded text-slate-600 group-hover:text-primary transition-colors">
                                                <ShieldAlert size={14} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">
                                                    {t("surv_history_ref")}
                                                </p>
                                                <p className="text-[9px] text-muted-foreground font-mono">
                                                    ID:{" "}
                                                    {selectedRow.batchID ||
                                                        selectedRow.details
                                                            .batchID}
                                                </p>
                                            </div>
                                        </div>
                                        <ArrowRight
                                            size={14}
                                            className="text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1"
                                        />
                                    </a>
                                </div>
                            )}
                        </div>
                    )
                }
            />

            {/* Confirmation Dialog with Note */}
            <ConfirmWithNoteDialog
                isOpen={!!confirmingStatus}
                onClose={() => setConfirmingStatus(null)}
                onConfirm={handleUpdateStatus}
                isLoading={isUpdating}
                title={
                    confirmingStatus?.status === "RESOLVED"
                        ? t("surv_resolve_title")
                        : t("surv_reject_title")
                }
                description={t("surv_status_note_desc")}
                confirmText={
                    confirmingStatus?.status === "RESOLVED"
                        ? t("surv_resolve_btn")
                        : t("surv_reject_btn")
                }
                variant={confirmingStatus?.variant || "primary"}
            />

            {/* Image Viewer */}
            <AnimatePresence>
                {viewingImage && (
                    <ImageViewer
                        url={viewingImage}
                        onClose={() => setViewingImage(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// Bọc Component chính trong Suspense vì dùng useSearchParams ở Client Component
export default function ComplaintsPage() {
    return (
        <Suspense
            fallback={
                <div className="w-full h-full flex items-center justify-center">
                    <Activity
                        className="animate-pulse text-primary/20"
                        size={24}
                    />
                </div>
            }
        >
            <ComplaintsContent />
        </Suspense>
    );
}
