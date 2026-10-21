"use client";
import { HomeLink } from "@/components/home-link";
import {LanguageSwitcher,useLanguage} from "./language-provider";
export function UnavailableRoom(){
  const {t}=useLanguage();
  return <main className="document-page"><LanguageSwitcher/><h1>{t("Room server not configured.")}</h1><p>{t("Add the two Supabase environment variables and restart Next.js.")}</p><HomeLink>{t("Back home")}</HomeLink></main>;
}
