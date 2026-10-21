import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/components/language-provider";
import { requestLocale } from "@/lib/server/language";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: locale === "fr" ? "Who's the Bot ? — Fie-toi à ton instinct." : "Who's the Bot? — Trust your instincts.",
    description: locale === "fr" ? "Un jeu de déduction entre amis. Un joueur est une IA. Trois minutes pour le démasquer." : "A social deduction party game. One player is an AI. Three minutes. Who will you suspect?",
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101310",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  return (
    <html lang={locale}>
      <body><LanguageProvider initialLocale={locale}>{children}</LanguageProvider></body>
    </html>
  );
}
