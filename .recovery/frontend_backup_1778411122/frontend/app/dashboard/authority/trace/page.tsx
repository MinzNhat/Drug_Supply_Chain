"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  Search,
  RefreshCw,
  Fingerprint,
  Users,
  Calendar,
  Layers,
  History,
  Activity,
  MapPin,
  X,
  Pencil,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BatchEvent {
  id: string;
  batchID: string;
  eventType: string;
  source: string;
  lat: number;
  lng: number;
  address: string;
  note: string;
  actorRole: string;
  actorMSP: string;
  occurredAt: string;
  traceId: string;
}

interface Batch {
  batchID: string;
  drugName: string;
  quantity: number;
  expiryDate: string;
  manufacturerMSP: string;
  ownerMSP: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  scanCount?: number;
  batch?: {
    ManufacturingDate?: string;
    [key: string]: any;
  };
}

export default function BlockchainTracePage() {
  const { t } = useI18n();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [timeline, setTimeline] = useState<BatchEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetchApi("/batches?pageSize=100");
      setBatches(res.data?.items || []);
    } catch (err) {
      console.error("Failed to fetch blockchain data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "r" || e.key === "R") && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "")) {
        fetchData();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredBatches = useMemo(() => {
    return batches.filter(
      (b) =>
        b.batchID.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.drugName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [batches, searchTerm]);

  const handleViewDetails = async (batch: Batch) => {
    setSelectedBatch(batch);
    setDetailsOpen(true);
    setTimelineLoading(true);
    try {
      const res = await fetchApi(`/batches/${batch.batchID}/events`);
      setTimeline(res.data?.events || []);
    } catch (err) {
      console.error("Failed to fetch timeline:", err);
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  const getStatusIndicator = (status: string) => {
    const s = status.toUpperCase();
    if (s === "ACTIVE" || s === "COMMITTED" || s === "DELIVERED") return "bg-emerald-500";
    if (s === "IN_TRANSIT" || s === "SHIPPED") return "bg-blue-500";
    if (s === "RECALLED" || s === "REVOKED") return "bg-rose-500";
    if (s === "SUSPICIOUS" || s === "FLAGGED") return "bg-amber-500";
    if (s === "MANUFACTURED" || s === "CREATED") return "bg-slate-400";
    return "bg-slate-300";
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-49px)] min-[1392px]:h-[calc(100dvh-49px)] h-[calc(100dvh-48px)] bg-background overflow-hidden font-sans select-none rounded-none border-none">
      {/* Search Header - Flat */}
      <div className="shrink-0 flex h-8 border-b border-border bg-card">
        <div className="flex-1 relative group">
          <Search className="absolute text-muted-foreground left-2.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary" size={12} />
          <input
            type="text"
            placeholder={t("trace_search_ph")}
            className="w-full h-full bg-transparent pl-8 pr-3 text-[11px] focus:outline-none placeholder:text-muted-foreground rounded-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 justify-center w-[64.5px] h-full hover:bg-slate-100 border-l border-border dark:hover:bg-slate-800 transition-colors text-[10px] font-medium text-muted-foreground group rounded-none"
        >
          <RefreshCw size={12} className={loading && batches.length > 0 ? "animate-spin text-primary" : ""} />
          <span className="bg-slate-200 dark:bg-slate-800 px-1 text-[9px] font-bold">R</span>
        </button>
      </div>

      {/* Main Table Area - Pure Grid */}
      <div className="flex-1 overflow-auto bg-background border-b border-border">
        {loading && batches.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Activity size={20} className="text-primary/20 animate-pulse" />
          </div>
        ) : (
          <table className="w-full border-collapse border-b border-border">
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                <th className="px-3 py-1 text-left border-r border-border w-44 whitespace-nowrap">{t("trace_th_id")}</th>
                <th className="px-3 py-1 text-left border-r border-border whitespace-nowrap">{t("trace_th_product")}</th>
                <th className="px-3 py-1 text-left border-r border-border w-20 whitespace-nowrap">{t("trace_details_qty")}</th>
                <th className="px-3 py-1 text-left border-r border-border w-34 whitespace-nowrap">{t("trace_th_owner")}</th>
                <th className="px-1.5 py-1 text-left border-r border-border w-20 whitespace-nowrap">{t("trace_th_status")}</th>
                <th className="px-3 py-1 text-left border-r border-border w-30 whitespace-nowrap">{t("trace_th_modified")}</th>
                <th className="px-1 py-1 text-right min-w-16 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((batch) => (
                <tr
                  key={batch.batchID}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-default border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-1 text-[11px] text-foreground border-r border-border/50 whitespace-nowrap">
                    {batch.batchID}
                  </td>
                  <td className="px-3 py-1 text-[11px] text-foreground border-r border-border/50 whitespace-nowrap">
                    {batch.drugName}
                  </td>
                  <td className="px-3 py-1 text-[11px] text-muted-foreground border-r border-border/50 font-normal">
                    {batch.quantity?.toLocaleString() ?? "0"}
                  </td>
                  <td className="px-3 py-1 text-[11px] uppercase border-r border-border/50 whitespace-nowrap">
                    {batch.ownerMSP}
                  </td>
                  <td className="px-1.5 py-1 border-r border-border/50 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1 h-1 rounded-full ${getStatusIndicator(batch.status)}`} />
                      <span className="text-[10px] font-normal capitalize">{batch.status.toLowerCase()}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1 text-[11px] text-muted-foreground border-r border-border/50 whitespace-nowrap font-normal">
                    {new Date(batch.updatedAt || batch.createdAt || Date.now()).toLocaleDateString('vi-VN', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                  <td className="px-1 py-1 flex justify-center">
                    <button
                      onClick={() => handleViewDetails(batch)}
                      className="p-1 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredBatches.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-20 text-center text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
                    {t("trace_empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {detailsOpen && selectedBatch && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDetailsOpen(false)}
              className="absolute inset-0 bg-black/60"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="relative w-full max-w-xl bg-card border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[90dvh]"
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                    <Fingerprint size={16} className="text-foreground/80" />
                  </div>
                  <div>
                    <h2 className="text-[12px] font-bold uppercase tracking-tight text-foreground">{t("trace_details_title")}</h2>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{selectedBatch.batchID}</p>
                  </div>
                </div>
                <button onClick={() => setDetailsOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground transition-colors rounded-full">
                  <X size={16} />
                </button>
              </div>

              {/* Information Grid Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-none">
                <div className="grid grid-cols-2 gap-2">
                  {/* Nhà Sản Xuất (Manufacturer) */}
                  <div className="p-3 border border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                      <Users size={10} />
                      <p className="text-[8px] font-bold uppercase">{t("trace_details_manufacturer")}</p>
                    </div>
                    <p className="text-[11px] text-foreground font-medium">{selectedBatch.manufacturerMSP || "N/A"}</p>
                  </div>
                  {/* Hạn Sử Dụng (Expiry Date - HSD) */}
                  <div className="p-3 border border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                      <Clock size={10} />
                      <p className="text-[8px] font-bold uppercase">{t("trace_details_expiry")}</p>
                    </div>
                    <p className="text-[11px] text-foreground font-medium">
                      {selectedBatch.expiryDate ? new Date(selectedBatch.expiryDate).toLocaleDateString('vi-VN') : 'N/A'}
                    </p>
                  </div>
                  {/* Ngày Sản Xuất (Manufacturing Date) */}
                  <div className="p-3 border border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                      <Calendar size={10} />
                      <p className="text-[8px] font-bold uppercase">{t("trace_details_manufactured")}</p>
                    </div>
                    <p className="text-[11px] text-foreground font-medium">
                      {selectedBatch.batch?.ManufacturingDate ? new Date(selectedBatch.batch.ManufacturingDate).toLocaleDateString('vi-VN') : 'N/A'}
                    </p>
                  </div>
                  {/* Số Lượng (Quantity) */}
                  <div className="p-3 border border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                      <Layers size={10} />
                      <p className="text-[8px] font-bold uppercase">{t("trace_details_qty")}</p>
                    </div>
                    <p className="text-[11px] font-bold text-foreground">{selectedBatch.quantity?.toLocaleString() ?? "0"} Unit</p>
                  </div>
                </div>

                {/* Audit Trail - Monochrome */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2 border-b border-border pb-1.5">
                    <History size={11} /> {t("trace_details_timeline")}
                  </h3>

                  {timelineLoading ? (
                    <div className="flex justify-center py-10 opacity-30 animate-pulse"><Activity size={20} /></div>
                  ) : timeline.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground italic px-2">{t("trace_details_no_events")}</p>
                  ) : (
                    <div className="relative border-l border-border ml-2 space-y-5 pt-1">
                      {timeline.map((ev, idx) => (
                        <div key={ev.id} className="relative pl-6">
                          <div className={`absolute -left-[4.5px] top-1.5 w-[8px] h-[8px] ring-2 ring-background ${idx === 0 ? 'bg-slate-800 dark:bg-slate-200' : 'bg-slate-300'}`} />

                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[11px] font-bold text-foreground uppercase">{ev.eventType}</h4>
                              <span className="text-[9px] text-muted-foreground font-medium">
                                {new Date(ev.occurredAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 uppercase font-medium">{ev.source} &mdash; {ev.actorRole}</p>

                            <div className="mt-1 p-2.5 bg-slate-100/50 dark:bg-slate-800/40 rounded border border-border/50 text-[10px] text-foreground/80 leading-relaxed font-normal">
                              {ev.note || "Data synchronization verified."}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
