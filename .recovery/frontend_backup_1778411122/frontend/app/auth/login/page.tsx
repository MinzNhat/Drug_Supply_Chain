/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { fetchApi } from "@/lib/api";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Package,
  Truck,
  Activity,
  Globe,
  Info,
} from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { login } = useAuth();
  const { lang, setLang, t } = useI18n();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const res = await fetchApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const token = res.data.token;
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      const decoded = JSON.parse(jsonPayload);
      login(token, {
        id: decoded.userId || "unknown",
        username,
        role: decoded.role || "User",
        mspId: decoded.mspId || "",
      });
    } catch (err: any) {
      setError(err.message || t("login_error_generic"));
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: Package, titleKey: "login_feature1_title" as const, descKey: "login_feature1_desc" as const },
    { icon: Truck, titleKey: "login_feature2_title" as const, descKey: "login_feature2_desc" as const },
    { icon: Activity, titleKey: "login_feature3_title" as const, descKey: "login_feature3_desc" as const },
  ];

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">

      {/* ── LEFT BRANDING PANEL ──────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[54%] relative overflow-hidden flex-col justify-between p-12"
        style={{ backgroundColor: "#0f2a2c" }}
      >
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(94,178,186,1) 1px, transparent 1px), linear-gradient(90deg, rgba(94,178,186,1) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        {/* Top glow */}
        <div
          className="absolute top-[-120px] left-[-60px] w-[480px] h-[480px] rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: "rgba(94,178,186,0.18)" }}
        />
        {/* Bottom glow */}
        <div
          className="absolute bottom-[-80px] right-[-40px] w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: "rgba(94,178,186,0.10)" }}
        />

        {/* Logo + brand */}
        <div className="relative z-10 flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "#5EB2BA" }}
          >
            <Image src="/logo.png" alt="Drug Guard" width={32} height={32} className="object-contain" />
          </div>
          <div>
            <p className="font-bold text-xl text-white tracking-tight">Drug Guard</p>
            <p className="text-xs" style={{ color: "rgba(94,178,186,0.7)" }}>
              Blockchain Supply Chain Platform
            </p>
          </div>
        </div>

        {/* Hero text + feature cards */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: "rgba(94,178,186,0.12)",
                borderColor: "rgba(94,178,186,0.3)",
                color: "#5EB2BA",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#5EB2BA" }} />
              Hyperledger Fabric · Network Active
            </div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              {t("login_tagline")}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
              {t("login_sub")}
            </p>
          </div>

          <div className="space-y-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 rounded-xl border backdrop-blur-sm transition-all duration-500"
                style={{
                  backgroundColor: "rgba(94,178,186,0.06)",
                  borderColor: "rgba(94,178,186,0.15)",
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(12px)",
                  transitionDelay: `${i * 100}ms`,
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "rgba(94,178,186,0.15)", border: "1px solid rgba(94,178,186,0.25)" }}
                >
                  <f.icon className="w-4 h-4" style={{ color: "#5EB2BA" }} />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{t(f.titleKey)}</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                    {t(f.descKey)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
          {t("footer")}
        </p>
      </div>

      {/* ── RIGHT FORM PANEL ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col px-8 py-8 bg-white dark:bg-slate-950">

        {/* Top bar */}
        <div className="flex justify-between items-center mb-auto">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("login_back")}
          </Link>

          {/* Language toggle */}
          <button
            onClick={() => setLang(lang === "vi" ? "en" : "vi")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {lang === "vi" ? "English" : "Tiếng Việt"}
          </button>
        </div>

        {/* Center form */}
        <div className="flex flex-col items-center justify-center flex-1">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#5EB2BA" }}>
              <Image src="/logo.png" alt="Drug Guard" width={26} height={26} className="object-contain" />
            </div>
            <span className="font-bold text-xl" style={{ color: "#5EB2BA" }}>Drug Guard</span>
          </div>

          <div className="w-full max-w-sm space-y-7">
            {/* Heading */}
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t("login_heading")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("login_sub")}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl">
                <div className="w-1 h-full min-h-[1rem] flex-shrink-0 mt-0.5 rounded-full bg-red-500" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-slate-700 dark:text-slate-300 text-sm font-medium">
                  {t("login_username")}
                </Label>
                <div className="relative mt-2">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="username"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("login_username_ph")}
                    className="pl-9 h-11"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-700 dark:text-slate-300 text-sm font-medium">
                  {t("login_password")}
                </Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login_password_ph")}
                    className="pl-9 pr-10 h-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="mt-6 w-full h-11 font-semibold rounded-xl text-white transition-all duration-200 flex items-center justify-center gap-2 group"
                style={{ backgroundColor: "#5EB2BA" }}
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {t("login_loading")}
                  </>
                ) : (
                  <>
                    {t("login_submit")}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </Button>
            </form>

            {/* Notice */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "rgba(94,178,186,0.12)" }}
                >
                  <Info className="w-4 h-4" style={{ color: "#5EB2BA" }} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                    {t("login_notice_title")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed">
                    {t("login_notice_body")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom padding spacer */}
        <div className="lg:hidden mt-auto pt-8 text-center text-xs text-slate-400 dark:text-slate-600">
          {t("footer")}
        </div>
      </div>
    </div>
  );
}
