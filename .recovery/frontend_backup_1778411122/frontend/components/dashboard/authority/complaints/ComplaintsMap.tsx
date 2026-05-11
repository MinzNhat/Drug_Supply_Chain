"use client";

import { useI18n } from "@/lib/i18n";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
    MapContainer,
    Marker,
    TileLayer,
    Tooltip,
    useMap,
} from "react-leaflet";

interface ReportItem {
    id: string;
    lat?: number;
    lng?: number;
    severity?: "info" | "warn" | "critical";
    status?: string;
    title?: string;
}

function ChangeView({
    center,
    zoom,
}: {
    center: [number, number];
    zoom?: number;
}) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom || map.getZoom());
    }, [center, zoom, map]);
    return null;
}

const SEVERITY_COLORS = {
    critical: "#ef4444",
    warn: "#f59e0b",
    info: "#3b82f6",
    default: "#64748b",
};

const getSeverityColor = (sev?: string) => {
    return (
        SEVERITY_COLORS[sev as keyof typeof SEVERITY_COLORS] ||
        SEVERITY_COLORS.default
    );
};

// --- Icon Factories ---

const createHeatNode = (count: number, dominantColor: string) => {
    const size = Math.min(150, 60 + count * 8);
    const opacity = Math.min(0.6, 0.15 + count * 0.05);

    return L.divIcon({
        html: `<div class="rounded-full blur-[12px] transition-all duration-700" 
                    style="width: ${size}px; height: ${size}px; 
                           background: ${dominantColor}; 
                           opacity: ${opacity};">
               </div>`,
        className:
            "bg-transparent border-none pointer-events-none mix-blend-multiply",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
};

// [FIXED] Điểm neo dữ liệu
const microDotIcon = (color: string) => {
    return L.divIcon({
        // Dùng w-full h-full cho vùng bắt chuột, thêm 'group' để kích hoạt hiệu ứng cho thẻ con
        html: `<div class="w-full h-full flex items-center justify-center group">
                  <div class="w-2.5 h-2.5 rounded-full border border-white shadow-sm transition-transform duration-300 group-hover:scale-[1.7]" style="background: ${color};"></div>
               </div>`,
        // Loại bỏ transition/transform ở container cha của Leaflet
        className: "bg-transparent border-none cursor-pointer",
        // Tăng size khung tàng hình lên 24x24 để user cực kỳ dễ hover/click trúng
        iconSize: [24, 24],
        // Neo điểm ở giữa khung 24x24 (12, 12)
        iconAnchor: [12, 12],
    });
};

export default function ComplaintsMap({ items }: { items: ReportItem[] }) {
    const { t } = useI18n();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const points = useMemo(
        () =>
            items.filter(
                (i) => typeof i.lat === "number" && typeof i.lng === "number",
            ),
        [items],
    );

    const center: [number, number] = useMemo(() => {
        if (points.length === 0) return [16.047, 108.206];
        const lat =
            points.reduce((s, p) => s + (p.lat || 0), 0) / points.length;
        const lng =
            points.reduce((s, p) => s + (p.lng || 0), 0) / points.length;
        return [lat, lng];
    }, [points]);

    const clusters = useMemo(() => {
        const map = new Map<string, ReportItem[]>();
        for (const p of points) {
            const key = `${p.lat!.toFixed(2)}:${p.lng!.toFixed(2)}`;
            const arr = map.get(key) || [];
            arr.push(p);
            map.set(key, arr);
        }
        return Array.from(map.entries()).map(([k, arr]) => {
            const avgLat =
                arr.reduce((s, x) => s + (x.lat || 0), 0) / arr.length;
            const avgLng =
                arr.reduce((s, x) => s + (x.lng || 0), 0) / arr.length;

            const severityCounts = arr.reduce(
                (acc, curr) => {
                    const sev = curr.severity || "default";
                    acc[sev] = (acc[sev] || 0) + 1;
                    return acc;
                },
                {} as Record<string, number>,
            );

            const dominantSeverity = Object.keys(severityCounts).reduce(
                (a, b) => (severityCounts[a] > severityCounts[b] ? a : b),
            );

            return {
                key: k,
                lat: avgLat,
                lng: avgLng,
                count: arr.length,
                color: getSeverityColor(dominantSeverity),
            };
        });
    }, [points]);

    const counts = useMemo(
        () => ({
            total: items.length,
            pending: items.filter((i) => i.status === "PENDING").length,
            resolved: items.filter((i) => i.status === "RESOLVED").length,
            rejected: items.filter((i) => i.status === "REJECTED").length,
        }),
        [items],
    );

    if (!mounted)
        return (
            <div className="w-full h-full bg-slate-50/50 flex items-center justify-center">
                <div className="animate-pulse text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {t("surv_load_map") || "Loading Map..."}
                </div>
            </div>
        );

    return (
        <div className="w-full h-full relative font-sans">
            <MapContainer
                center={center}
                zoom={6}
                style={{ width: "100%", height: "100%", zIndex: 0 }}
                zoomControl={false}
                attributionControl={false}
            >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />

                {clusters.map((c) => (
                    <Marker
                        key={`heat-${c.key}`}
                        position={[c.lat, c.lng]}
                        icon={createHeatNode(c.count, c.color)}
                        interactive={false}
                    />
                ))}

                {points.map((p) => (
                    <Marker
                        key={p.id}
                        position={[p.lat!, p.lng!]}
                        icon={microDotIcon(getSeverityColor(p.severity))}
                        eventHandlers={{
                            click: () => {
                                router.push(
                                    `/dashboard/authority/complaints?search=${encodeURIComponent(p.id)}`,
                                );
                            },
                        }}
                    >
                        {/* Đẩy offset Tooltip lên 1 chút để không bị che khuất điểm Marker khi zoom lên */}
                        <Tooltip
                            direction="top"
                            offset={[0, -10]}
                            className="!bg-white/95 !backdrop-blur-sm !border !border-slate-100 !shadow-lg !rounded-xl !p-3 !font-sans"
                        >
                            <div className="flex flex-col gap-1 min-w-[160px]">
                                <span className="text-xs font-semibold text-slate-800 leading-tight">
                                    {p.title || t("surv_report_info")}
                                </span>
                                <span className="text-[10px] font-medium text-slate-400 uppercase">
                                    {t("trace_hist_th_time")}
                                </span>
                                <span className="mt-1 text-[10px] text-blue-600 font-semibold cursor-pointer">
                                    {t("surv_action_view")} →
                                </span>
                            </div>
                        </Tooltip>
                    </Marker>
                ))}

                <ChangeView center={center} zoom={6} />
            </MapContainer>

            <div className="absolute right-6 bottom-6 z-50 bg-white/80 backdrop-blur-md border border-white/40 p-4 rounded-2xl min-w-[200px] shadow-xl text-slate-800">
                <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-3">
                    {t("surv_title") || "Report Overview"}
                </div>
                <div className="flex flex-col gap-2.5 text-[13px] font-medium">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <span className="text-slate-600">
                            {t("trace_footer_total") || "Total"}
                        </span>
                        <span className="font-bold text-slate-900">
                            {counts.total}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-rose-600">
                            {t("surv_sev_critical")}
                        </span>
                        <span className="font-bold text-rose-600">
                            {
                                items.filter((i) => i.severity === "critical")
                                    .length
                            }
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-amber-500">
                            {t("surv_sev_warn")}
                        </span>
                        <span className="font-bold text-amber-500">
                            {items.filter((i) => i.severity === "warn").length}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-blue-500">
                            {t("surv_sev_info")}
                        </span>
                        <span className="font-bold text-blue-500">
                            {items.filter((i) => i.severity === "info").length}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
