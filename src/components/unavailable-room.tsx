"use client";
import Link from "next/link";
import {LanguageSwitcher,useLanguage} from "./language-provider";
export function UnavailableRoom(){
  const {t}=useLanguage();
  return <main className="document-page"><LanguageSwitcher/><h1>{t("Room server not configured.")}</h1><p>{t("Add the two Supabase environment variables and restart Next.js.")}</p><Link href="/">{t("Back home")}</Link></main>;
}
