"use client";
import Link from "next/link";
import {LanguageSwitcher,useLanguage} from "@/components/language-provider";
export default function NotFound(){
  const {t}=useLanguage();
  return <main className="document-page"><LanguageSwitcher/><h1>{t("Page not found.")}</h1><p>{t("Check the link or return to the game.")}</p><Link className="button button-primary mt-6" href="/">{t("Back home")}</Link></main>;
}
