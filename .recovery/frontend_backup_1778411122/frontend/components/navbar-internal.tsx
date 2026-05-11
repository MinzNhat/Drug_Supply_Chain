"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import ThemeSwitcher from "@/components/theme-switcher";
import {
  LayoutDashboard,
  QrCode,
  LogOut,
  ShieldCheck,
  ChevronDown,
  Check,
  Package,
  PlusSquare,
  Warehouse,
  AlertCircle,
  Scan,
  Truck,
  ArrowDownLeft,
  Activity,
  Search,
  FileText,
  ClipboardCheck,
  Users,
  Server,
  Terminal,
  Menu,
  X,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

const LANGS = [
  { code: "vi" as const, label: "Tiếng Việt", logo: "/vn.png" },
  { code: "en" as const, label: "English", logo: "/us.png" },
];

function LangDropdown() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGS.find(l => l.code === lang)!;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 w-8 h-8 justify-center rounded border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="Switch language"
      >
        <Image src={current.logo} alt={current.label} width={16} height={16} className="object-contain" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-50"
          >
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Image src={l.logo} alt={l.label} width={16} height={16} className="object-contain" />
                  <span>{l.label}</span>
                </span>
                {lang === l.code && <Check className="w-3.5 h-3.5 text-[#5EB2BA]" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function InternalNavbar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dropOpen, setDropOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close mobile menu on pathname change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const getNavItems = () => {
    const items = [];

    if (user?.role === "Manufacturer") {
      items.push(
        { href: "/dashboard/manufacturer/products", icon: Package, label: t("nav_manufacturer_products") },
        { href: "/dashboard/manufacturer/mint", icon: PlusSquare, label: t("nav_manufacturer_mint") },
        { href: "/dashboard/manufacturer/inventory", icon: Warehouse, label: t("nav_manufacturer_inventory") },
        { href: "/dashboard/manufacturer/recall", icon: AlertCircle, label: t("nav_manufacturer_recall") }
      );
    } else if (user?.role === "Distributor") {
      items.push(
        { href: "/dashboard/distributor/gateway", icon: Scan, label: t("nav_distributor_gateway") },
        { href: "/dashboard/distributor/outbound", icon: Truck, label: t("nav_distributor_outbound") },
        { href: "/dashboard/distributor/inbound", icon: ArrowDownLeft, label: t("nav_distributor_inbound") },
        { href: "/dashboard/distributor/stock", icon: Warehouse, label: t("nav_distributor_stock") }
      );
    } else if (user?.role === "Regulator") {
      items.push(
        { href: "/dashboard/authority/surveillance", icon: Activity, label: t("nav_authority_surveillance") },
        { href: "/dashboard/authority/trace", icon: Search, label: t("nav_authority_trace") },
        { href: "/dashboard/authority/approve", icon: FileText, label: t("nav_authority_approve") },
        { href: "/dashboard/authority/triage", icon: ClipboardCheck, label: t("nav_authority_triage") },
        { href: "/dashboard/admin/users", icon: Users, label: t("nav_admin_users") },
        { href: "/dashboard/admin/health", icon: Server, label: t("nav_admin_network") },
        { href: "/dashboard/admin/logs", icon: Terminal, label: t("nav_admin_logs") }
      );
    }

    return items;
  };

  const navItems = getNavItems();

  const isActive = (itemHref: string) => pathname === itemHref;

  // Role badge colour
  const roleMeta: Record<string, { bg: string; text: string }> = {
    Manufacturer: { bg: "#EFF6FF", text: "#2563EB" },
    Distributor: { bg: "#F0FDF4", text: "#16A34A" },
    Regulator: { bg: "#FFF7ED", text: "#EA580C" },
  };
  const badge = roleMeta[user?.role ?? ""] ?? { bg: "#F1F5F9", text: "#475569" };

  return (
    <nav className="sticky top-0 z-[60] w-full border-b bg-white dark:bg-slate-900 transition-colors">
      <div className="px-3 flex items-center justify-between h-12 gap-2">

        {/* Left: Logo & Mobile Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: "#5EB2BA" }}>
              <Image src="/logo.png" alt="Drug Guard" width={18} height={18} className="object-contain" />
            </div>
          </Link>

          {/* Mobile Menu Toggle button - Visible < 600px */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex min-[600px]:hidden items-center justify-center w-8 h-8 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Center: Desktop Nav items - Visible > 600px */}
        <div className="hidden min-[600px]:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium border transition-colors ${isActive(item.href) ? "border-[#5EB2BA] text-[#5EB2BA] bg-[#5EB2BA]/5" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden min-[1392px]:block">{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          <LangDropdown />

          <div className="[&>button]:w-8 [&>button]:h-8 [&>button]:rounded [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-slate-700">
            <ThemeSwitcher />
          </div>

          {/* User Profile */}
          {user && (
            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setDropOpen(!dropOpen)}
                className="flex items-center gap-1.5 px-2 py-1 h-8 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span
                  className="px-1 py-0.5 rounded text-[9px] font-black"
                  style={{ backgroundColor: badge.bg, color: badge.text }}
                >
                  {user.role === "Manufacturer" ? "NSX" : user.role === "Distributor" ? "DPT" : "REG"}
                </span>
                <span className="hidden sm:block max-w-[60px] truncate">{user.username}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${dropOpen ? "rotate-180" : ""}`} />
              </button>

              {dropOpen && (
                <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{user.username}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5 font-mono">{user.mspId}</p>
                  </div>
                  <button
                    onClick={() => { setDropOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t("nav_signout")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown - Smooth AnimatePresence */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="min-[600px]:hidden overflow-hidden border-t bg-white dark:bg-slate-900 border-border"
          >
            <div className="p-3 grid grid-cols-2 gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded text-xs font-bold border transition-colors ${isActive(item.href) ? "border-[#5EB2BA] text-[#5EB2BA] bg-[#5EB2BA]/5" : "border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
