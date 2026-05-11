"use client";

import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/theme-switcher";
import { HamburgerMenuIcon, Cross1Icon } from "@radix-ui/react-icons";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Globe } from "lucide-react";

export default function NavBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useI18n();

  const menuItems = [
    { name: t("nav_home"), href: "/" },
    { name: t("nav_dashboard"), href: "/dashboard" },
    { name: t("nav_verify"), href: "/verify" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur supports-backdrop-filter:bg-background/60 border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Mobile hamburger */}
          <div className="flex sm:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="relative"
            >
              <motion.div
                animate={{ rotate: isMenuOpen ? 90 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                {isMenuOpen ? <Cross1Icon /> : <HamburgerMenuIcon />}
              </motion.div>
            </Button>
          </div>

          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/logo.png"
                alt="Drug Guard Logo"
                width={36}
                height={36}
                className="rounded-lg object-contain"
              />
              <span className="font-bold text-lg tracking-tight" style={{ color: "#5EB2BA" }}>
                Drug Guard
              </span>
            </Link>
          </div>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center space-x-1 ml-10 flex-1">
            {menuItems.map((item) => (
              <Button key={item.name} asChild variant="ghost" size="sm">
                <Link href={item.href}>{item.name}</Link>
              </Button>
            ))}
          </div>

          {/* Right controls */}
          <div className="flex items-center space-x-2">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "vi" ? "en" : "vi")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Switch language"
            >
              <Globe className="w-3.5 h-3.5" />
              {lang === "vi" ? "EN" : "VI"}
            </button>

            {user ? (
              <div className="hidden sm:flex items-center space-x-3">
                <span className="text-sm text-muted-foreground font-medium">
                  {user.role} · {user.username}
                </span>
                <Button variant="outline" size="sm" onClick={logout}>
                  {t("nav_signout")}
                </Button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/auth/login">{t("nav_login")}</Link>
                </Button>
              </div>
            )}
            <ThemeSwitcher />
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="sm:hidden overflow-hidden"
            >
              <motion.div className="px-2 pt-2 pb-3 space-y-1">
                {menuItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="block px-3 py-2 text-base font-medium rounded-md hover:bg-muted"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}

                <div className="pt-4 pb-2 border-t mt-2 flex items-center justify-between px-3">
                  <button
                    onClick={() => setLang(lang === "vi" ? "en" : "vi")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border text-slate-600 dark:text-slate-300 hover:bg-muted transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {lang === "vi" ? "Switch to English" : "Chuyển sang Tiếng Việt"}
                  </button>
                </div>

                <div className="px-3 space-y-2 pb-2">
                  {user ? (
                    <>
                      <p className="text-sm font-medium text-muted-foreground">{user.username} ({user.role})</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() => { setIsMenuOpen(false); logout(); }}
                      >
                        {t("nav_signout")}
                      </Button>
                    </>
                  ) : (
                    <Button className="w-full" size="sm" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link href="/auth/login">{t("nav_login")}</Link>
                    </Button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
