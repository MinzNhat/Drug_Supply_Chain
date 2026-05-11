"use client";

import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { QrCode, ShieldCheck, AlertTriangle, CheckCircle2, Smartphone, Search } from "lucide-react";

export default function Home() {
  const { t } = useI18n();

  const steps = [
    {
      step: "01",
      icon: Smartphone,
      titleKey: "land_step1_title" as const,
      descKey: "land_step1_desc" as const,
    },
    {
      step: "02",
      icon: Search,
      titleKey: "land_step2_title" as const,
      descKey: "land_step2_desc" as const,
    },
    {
      step: "03",
      icon: CheckCircle2,
      titleKey: "land_step3_title" as const,
      descKey: "land_step3_desc" as const,
    },
  ];

  const stats = [
    { value: "100%", label: t("land_stat1") },
    { value: "3s", label: t("land_stat2") },
    { value: "0", label: t("land_stat3") },
  ];

  return (
    <main className="min-h-[85vh]">

      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="flex flex-col items-center justify-center px-6 pt-20 pb-16 text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-8 border"
          style={{ borderColor: "rgba(94,178,186,0.4)", color: "#5EB2BA", backgroundColor: "rgba(94,178,186,0.08)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#5EB2BA" }} />
          {t("land_badge")}
        </div>

        {/* Logo — white logo needs solid teal background */}
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center mb-8"
          style={{ backgroundColor: "#5EB2BA" }}
        >
          <Image src="/logo.png" alt="Drug Guard" width={56} height={56} className="object-contain" />
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-5 max-w-3xl leading-tight">
          {t("land_hero")}
        </h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl leading-relaxed">
          {t("land_sub")}
        </p>

        <div className="flex flex-wrap gap-3 justify-center">
          <Button
            size="lg"
            asChild
            className="h-12 px-8 text-base font-semibold text-white rounded-xl shadow-none"
            style={{ backgroundColor: "#5EB2BA" }}
          >
            <Link href="/verify">{t("land_cta_verify")}</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="h-12 px-8 text-base font-semibold rounded-xl shadow-none"
            style={{ borderColor: "rgba(94,178,186,0.5)", color: "#5EB2BA" }}
          >
            <Link href="/auth/login">{t("land_cta_dash")}</Link>
          </Button>
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────── */}
      <section
        className="py-8 border-y"
        style={{ backgroundColor: "rgba(94,178,186,0.05)" }}
      >
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-6 text-center">
          {stats.map((s, i) => (
            <div key={i}>
              <p className="text-3xl font-extrabold" style={{ color: "#5EB2BA" }}>{s.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────── */}
      <section className="px-6 py-16 text-center max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold mb-2">{t("land_howto_title")}</h2>
        <p className="text-muted-foreground text-sm mb-12">{t("land_howto_sub")}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {steps.map(({ step, icon: Icon, titleKey, descKey }, i) => (
            <div
              key={i}
              className="relative p-6 border rounded-2xl bg-card group transition-colors hover:border-[#5EB2BA]/40"
            >
              <span
                className="text-5xl font-black leading-none opacity-10 absolute top-4 right-5 select-none"
                style={{ color: "#5EB2BA" }}
              >
                {step}
              </span>
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ backgroundColor: "#5EB2BA20" }}
              >
                <Icon className="w-5 h-5" style={{ color: "#5EB2BA" }} />
              </div>
              <h3 className="text-base font-bold mb-2">{t(titleKey)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ALERT BANNER ──────────────────────────────────── */}
      <section className="px-6 pb-16 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 rounded-2xl">
          <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">{t("land_alert_title")}</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5 leading-relaxed">{t("land_alert_body")}</p>
          </div>
          <Button
            asChild
            size="sm"
            className="sm:ml-auto shrink-0 font-semibold rounded-lg shadow-none text-white"
            style={{ backgroundColor: "#e78c2a" }}
          >
            <Link href="/verify">
              <QrCode className="w-3.5 h-3.5 mr-1.5" />
              {t("land_alert_cta")}
            </Link>
          </Button>
        </div>
      </section>

      {/* ── TRUST SECTION ─────────────────────────────────── */}
      <section
        className="py-14 px-6 text-center"
        style={{ backgroundColor: "rgba(94,178,186,0.05)", borderTop: "1px solid rgba(94,178,186,0.12)" }}
      >
        <div className="max-w-3xl mx-auto space-y-4">
          <ShieldCheck className="w-10 h-10 mx-auto" style={{ color: "#5EB2BA" }} />
          <h2 className="text-xl font-bold">{t("land_trust_title")}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("land_trust_body")}</p>
          <Button
            asChild
            className="mt-4 text-white font-semibold rounded-xl shadow-none inline-flex"
            style={{ backgroundColor: "#5EB2BA" }}
          >
            <Link href="/verify">{t("land_cta_verify")}</Link>
          </Button>
        </div>
      </section>

    </main>
  );
}
