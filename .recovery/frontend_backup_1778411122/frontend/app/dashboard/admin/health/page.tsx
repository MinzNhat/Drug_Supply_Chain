"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  Search,
  RefreshCw,
  Server,
  Users,
  Layers,
  MapPin,
  Activity,
  Zap,
  Clock,
  ShieldCheck,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Node {
  id: string;
  label: string;
  type: string;
  org: string;
  mspId: string;
  host: string;
  port: number | string;
  status: "UP" | "DOWN" | "UNKNOWN";
  latencyMs: number | null;
  checkedAt: string;
}

interface FabricInfo {
  enabled: boolean;
  channelName: string;
  chaincodeName: string;
}

export default function NetworkHealthPage() {
  const { t, lang } = useI18n();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [fabricInfo, setFabricInfo] = useState<FabricInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetchApi("/network/topology");
      setNodes(res.data?.nodes || []);
      setFabricInfo(res.data?.fabric || null);
    } catch (err) {
      console.error("Failed to fetch network topology:", err);
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

  const filteredNodes = useMemo(() => {
    return nodes.filter(
      (n) =>
        n.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.org.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.host.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [nodes, searchTerm]);

  const getStatusIndicator = (status: string) => {
    const s = status.toUpperCase();
    if (s === "UP") return "bg-emerald-500";
    if (s === "DOWN") return "bg-rose-500";
    return "bg-amber-500";
  };

  // Translations for labels not in vi.ts
  const getColLabel = (key: string) => {
    const labels: Record<string, any> = {
      vi: {
        id: "Mã Node",
        type: "Loại",
        org: "Tổ chức",
        endpoint: "Địa chỉ",
        latency: "Độ trễ",
        checked: "Kết nối cuối",
        fabric: "Hệ thống Fabric",
        channel: "Kênh (Channel)",
        chaincode: "Hợp đồng (Chaincode)",
        search: "Tìm node, tổ chức, địa chỉ..."
      },
      en: {
        id: "Node ID",
        type: "Type",
        org: "Organization",
        endpoint: "Endpoint",
        latency: "Latency",
        checked: "Last Check",
        fabric: "Fabric System",
        channel: "Channel",
        chaincode: "Chaincode",
        search: "Search nodes, orgs, hosts..."
      }
    };
    return labels[lang][key] || key;
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-49px)] min-[1392px]:h-[calc(100dvh-49px)] h-[calc(100dvh-48px)] bg-background overflow-hidden font-sans select-none rounded-none border-none">
      {/* Search Header - Exactly like Trace */}
      <div className="shrink-0 flex h-8 border-b border-border bg-card">
        <div className="flex-1 relative group">
          <Search className="absolute text-muted-foreground left-2.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary" size={12} />
          <input
            type="text"
            placeholder={getColLabel("search")}
            className="w-full h-full bg-transparent pl-8 pr-3 text-[11px] focus:outline-none placeholder:text-muted-foreground rounded-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button
          onClick={fetchData}
          className="flex items-center gap-2 justify-center w-[64.5px] h-full hover:bg-slate-100 border-l border-border dark:hover:bg-slate-800 transition-colors text-[10px] font-medium text-muted-foreground group rounded-none"
        >
          <RefreshCw size={12} className={loading && nodes.length > 0 ? "animate-spin text-primary" : ""} />
          <span className="bg-slate-200 dark:bg-slate-800 px-1 text-[9px] font-bold">R</span>
        </button>
      </div>

      {/* Main Table Area - Pure Grid Styling from Trace */}
      <div className="flex-1 overflow-auto bg-background border-b border-border">
        {loading && nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Activity size={20} className="text-primary/20 animate-pulse" />
          </div>
        ) : (
          <table className="w-full border-collapse border-b border-border">
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                <th className="px-3 py-1 text-left border-r border-border w-48 whitespace-nowrap">{getColLabel("id")}</th>
                <th className="px-3 py-1 text-left border-r border-border w-24 whitespace-nowrap">{getColLabel("type")}</th>
                <th className="px-3 py-1 text-left border-r border-border w-32 whitespace-nowrap">{getColLabel("org")}</th>
                <th className="px-3 py-1 text-left border-r border-border whitespace-nowrap">{getColLabel("endpoint")}</th>
                <th className="px-1.5 py-1 text-left border-r border-border w-20 whitespace-nowrap">{t("trace_th_status")}</th>
                <th className="px-3 py-1 text-left border-r border-border w-24 whitespace-nowrap">{getColLabel("latency")}</th>
                <th className="px-3 py-1 text-left border-r border-border w-36 whitespace-nowrap">{getColLabel("checked")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map((node) => (
                <tr
                  key={node.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-default border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-1 text-[11px] text-foreground border-r border-border/50 whitespace-nowrap font-medium">
                    <div className="flex items-center gap-2">
                      <Server size={10} className="text-muted-foreground" />
                      {node.label || node.id}
                    </div>
                  </td>
                  <td className="px-3 py-1 text-[11px] text-muted-foreground border-r border-border/50 font-normal uppercase">
                    {node.type}
                  </td>
                  <td className="px-3 py-1 text-[11px] text-foreground border-r border-border/50 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Users size={10} className="text-muted-foreground" />
                      {node.org}
                    </div>
                  </td>
                  <td className="px-3 py-1 text-[11px] text-muted-foreground border-r border-border/50 whitespace-nowrap font-mono">
                    {node.host}:{node.port}
                  </td>
                  <td className="px-1.5 py-1 border-r border-border/50 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1 h-1 rounded-full ${getStatusIndicator(node.status)}`} />
                      <span className="text-[10px] font-normal capitalize">{node.status.toLowerCase()}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1 text-[11px] border-r border-border/50 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Zap size={10} className={node.latencyMs && node.latencyMs < 50 ? "text-emerald-500" : "text-amber-500"} />
                      <span className={node.latencyMs ? "" : "text-muted-foreground italic"}>
                        {node.latencyMs ? `${node.latencyMs}ms` : "N/A"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1 text-[11px] text-muted-foreground whitespace-nowrap font-normal">
                    {new Date(node.checkedAt).toLocaleDateString('vi-VN', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}
                  </td>
                </tr>
              ))}
              {filteredNodes.length === 0 && !loading && (
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

      {/* Footer Stat Bar - Style same as Trace */}
      <div className="shrink-0 h-6 bg-card border-t border-border flex items-center px-3 justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Activity size={10} className="text-emerald-500" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase">{t("trace_footer_status")}</span>
          </div>
          <div className="w-[1px] h-2 bg-border" />
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={10} className="text-primary" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase">SECURED BY HYPERLEDGER</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-[9px] font-bold uppercase">{lang === 'vi' ? 'Tổng số Node' : 'Total Nodes'}:</span>
          <span className="text-[10px] font-bold text-foreground">{nodes.length}</span>
        </div>
      </div>
    </div>
  );
}
