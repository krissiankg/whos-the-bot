"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {usePathname} from "next/navigation";
import { translate, playerName } from "@/lib/translations.mjs";

export type Locale = "en" | "fr";
const LanguageContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (source: string, values?: Record<string, string | number>) => string;
  name: (source: string) => string;
} | null>(null);

export function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  const pathname=usePathname();
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    document.cookie = `wtb_language=${next}; Path=/; Max-Age=86400; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = pathname === "/admin"
      ? locale === "fr" ? "Administration · Who’s the Bot ?" : "Owner settings · Who’s the Bot?"
      : locale === "fr" ? "Who's the Bot ? — Fie-toi à ton instinct." : "Who's the Bot? — Trust your instincts.";
  }, [locale,pathname]);
  const t = useCallback((source: string, values?: Record<string, string | number>) => translate(locale, source, values), [locale]);
  const name = useCallback((source: string) => playerName(source, locale), [locale]);
  return <LanguageContext.Provider value={{ locale, setLocale, t, name }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  return <div className="language-switcher" role="group" aria-label={locale === "fr" ? "Langue de l’interface" : "Interface language"}>
    <button type="button" lang="fr" aria-label="Français" aria-pressed={locale === "fr"} onClick={() => setLocale("fr")}>FR</button>
    <button type="button" lang="en" aria-label="English" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
  </div>;
}
