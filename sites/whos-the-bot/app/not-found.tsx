"use client";
import { HomeLink } from "@/components/home-link";
import {LanguageSwitcher,useLanguage} from "@/components/language-provider";
export default function NotFound(){
  const {t}=useLanguage();
  return <main className="document-page"><LanguageSwitcher/><h1>{t("Page not found.")}</h1><p>{t("Check the link or return to the game.")}</p><HomeLink className="button button-primary mt-6">{t("Back home")}</HomeLink></main>;
}
