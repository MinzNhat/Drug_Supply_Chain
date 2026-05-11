"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import vi from "./locales/vi";
import en from "./locales/en";

const translations = { vi, en } as const;

type Lang = "vi" | "en";
type TranslationKey = keyof typeof translations.vi;

interface I18nContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "vi",
  setLang: () => {},
  t: (k) => k as string,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("vi");

  const t = (key: TranslationKey): string =>
    translations[lang][key] ?? translations.vi[key] ?? key;

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
