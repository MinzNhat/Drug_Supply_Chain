"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/theme-switcher";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, Check, Menu, X } from "lucide-react";

const LANGS = [
  { code: "vi" as const, label: "Tiếng Việt" },
  { code: "en" as const, label: "English" },
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
        className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <span>{current.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1 w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-50"
          >
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="flex items-center gap-2">
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

export default function PublicNavbar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    { label: t("nav_home"), href: "/" },
    { label: t("nav_verify"), href: "/verify" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b backdrop-blur-md bg-white/70 dark:bg-slate-950/70">
      <div className="mx-auto px-5 sm:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#5EB2BA" }}>
              <Image src="/logo.png" alt="Drug Guard" width={22} height={22} className="object-contain" />
            </div>
            <span className="font-bold text-[17px] tracking-tight" style={{ color: "#5EB2BA" }}>
              Drug Guard
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1 flex-1 ml-10">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${isActive(l.href)
                    ? "font-bold text-[#5EB2BA] bg-[#5EB2BA]/10"
                    : "font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LangDropdown />
            <Button
              asChild
              size="lg"
              className="hidden md:inline-flex text-white font-semibold rounded-lg shadow-none"
              style={{ backgroundColor: "#5EB2BA" }}
            >
              <Link href="/auth/login">{t("nav_login")}</Link>
            </Button>

            {/* Mobile toggle */}
            <button
              className="md:hidden flex items-center justify-center w-[38px] h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden border-t bg-white dark:bg-slate-950"
          >
            <div className="px-5 py-4 space-y-1">
              {links.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setIsOpen(false)}
                  className={`block px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive(l.href)
                      ? "font-bold text-[#5EB2BA] bg-[#5EB2BA]/10"
                      : "font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                >
                  {l.label}
                </Link>
              ))}
              <div className="pt-3 border-t mt-3">
                <Button asChild className="w-full text-white" style={{ backgroundColor: "#5EB2BA" }}>
                  <Link href="/auth/login" onClick={() => setIsOpen(false)}>
                    {t("nav_login")}
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
