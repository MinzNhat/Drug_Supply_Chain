"use client";

import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";

const HOTSPOTS = [
  { x: 54, y: 82, r: 55, intensity: 0.95, label: "TP.HCM", level: "high" },
  { x: 50, y: 73, r: 40, intensity: 0.75, label: "Bình Dương", level: "high" },
  { x: 44, y: 18, r: 35, intensity: 0.55, label: "Hà Nội", level: "medium" },
  { x: 58, y: 56, r: 28, intensity: 0.45, label: "Đà Nẵng", level: "medium" },
  { x: 60, y: 77, r: 22, intensity: 0.35, label: "Đồng Nai", level: "low" },
  { x: 38, y: 12, r: 18, intensity: 0.25, label: "Hải Phòng", level: "low" },
];

export default function VietnamMap() {
  return (
    <div className="relative w-full h-[calc(100vh-200px)] min-h-[600px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Real Map Layer Placeholder - Styled to feel premium */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
         {/* Grid pattern */}
         <div className="absolute inset-0" style={{ 
           backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(94,178,186,0.15) 1px, transparent 0)',
           backgroundSize: '24px 24px' 
         }} />
      </div>

      {/* Vietnam SVG Silhouette - High Quality */}
      <div className="absolute inset-0 flex items-center justify-center p-8">
        <svg 
          viewBox="0 0 100 100" 
          className="h-full w-auto drop-shadow-[0_0_30px_rgba(94,178,186,0.3)] transition-all duration-500"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Main land path - Abstracted but shaped like Vietnam */}
          <motion.path
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2, ease: "easeInOut" }}
            d="M45,5 L48,8 L46,12 L49,15 L47,20 L50,25 L48,30 L51,35 L49,40 L52,45 L50,50 L53,55 L51,60 L54,65 L52,70 L55,75 L53,80 L56,85 L54,90 L50,95 L46,90 L48,85 L44,80 L46,75 L42,70 L44,65 L40,60 L42,55 L38,50 L40,45 L36,40 L38,35 L34,30 L36,25 L32,20 L34,15 L30,10 L35,5 Z"
            fill="rgba(30, 41, 59, 0.8)"
            stroke="#5EB2BA"
            strokeWidth="0.5"
            strokeLinejoin="round"
          />

          {/* Heatmap Gradients */}
          <defs>
            {HOTSPOTS.map((h, i) => (
              <radialGradient key={i} id={`heat-grad-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={h.level === "high" ? "#ef4444" : h.level === "medium" ? "#f97316" : "#eab308"} stopOpacity={h.intensity} />
                <stop offset="100%" stopColor={h.level === "high" ? "#ef4444" : "#f97316"} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          {/* Rendering the "Map" Layer (Provinces simulation) */}
          {HOTSPOTS.map((h, i) => (
            <motion.ellipse
              key={`blob-${i}`}
              cx={h.x}
              cy={h.y}
              rx={h.r * 0.15}
              ry={h.r * 0.2}
              fill={`url(#heat-grad-${i})`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 1 }}
            />
          ))}
        </svg>
      </div>

      {/* Dynamic Hotspot Markers */}
      {HOTSPOTS.map((h, i) => (
        <div
          key={`marker-${i}`}
          className="absolute group cursor-pointer"
          style={{ left: `${h.x}%`, top: `${h.y}%`, transform: "translate(-50%, -50%)" }}
        >
          {/* Animated ping */}
          <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${h.level === 'high' ? 'bg-red-500' : 'bg-orange-500'}`} style={{ animationDuration: '2s' }} />
          
          {/* Dot */}
          <div className={`relative w-3 h-3 rounded-full border-2 border-white shadow-lg ${h.level === 'high' ? 'bg-red-500' : 'bg-orange-500'}`} />
          
          {/* Tooltip Link */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 backdrop-blur-md px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
            <p className="text-[10px] font-bold text-white mb-0.5">{h.label}</p>
            <p className="text-[8px] text-slate-400 uppercase tracking-tighter">Status: {h.level} alert</p>
          </div>
        </div>
      ))}

      {/* Legend & Controls Overlay */}
      <div className="absolute top-6 left-6 flex flex-col gap-4">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-4 rounded-xl shadow-2xl">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3 flex items-center gap-2">
            <ShieldAlert className="w-3 h-3 text-red-500" />
            Vùng Nguy Cơ Phóng Xạ/Thuốc Giả
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
              <span className="text-[11px] text-slate-400 font-medium">Báo động đỏ (Counterfeit Outbreak)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
              <span className="text-[11px] text-slate-400 font-medium">Nghi ngờ (Suspicious Activity)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="text-[11px] text-slate-400 font-medium">Đang theo dõi (Monitoring)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overlay Bottom Right */}
      <div className="absolute bottom-6 right-6 flex items-center gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-700/30 px-5 py-3 rounded-xl shadow-xl">
        <div className="text-center border-r border-slate-700 pr-4">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Total Alerts</p>
          <p className="text-xl font-black text-white">42</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Active Nodes</p>
          <p className="text-xl font-black text-emerald-400">100%</p>
        </div>
      </div>

      {/* Floating map controls mockup */}
      <div className="absolute right-6 top-6 flex flex-col gap-2">
         {[1, 2, 3].map(i => (
           <button key={i} className="w-10 h-10 bg-slate-800/80 hover:bg-[#5EB2BA] text-white border border-slate-700 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg">
             <span className="text-xs font-bold">{i === 1 ? '+' : i === 2 ? '-' : '📍'}</span>
           </button>
         ))}
      </div>
    </div>
  );
}
