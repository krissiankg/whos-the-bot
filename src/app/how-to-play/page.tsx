"use client";
import Link from "next/link";
import { LanguageSwitcher, useLanguage } from "@/components/language-provider";
import { ArrowLeft, ArrowRight, Bot, MessageCircle, ScanEye, ShieldCheck, Trophy } from "lucide-react";

export default function HowToPlay() {
  const { t } = useLanguage();
  return (
    <main className="document-page">
      <div className="document-toolbar"><LanguageSwitcher /><Link className="text-link" href="/"><ArrowLeft size={17} /> {t("Back to the game")}</Link></div>
      <div className="eyebrow mt-10">{t("THE VERY SHORT RULEBOOK")}</div>
      <h1>{t("Friends. Small talk.")}<br /><span className="accent-text">{t("One secret bot.")}</span></h1>
      <p className="document-intro">{t("One of the anonymous players is an AI. Your job is to figure out which one, while everyone is trying to look human.")}</p>
      <div className="inline-notice">{t("Your identity is assigned only when each round starts, alongside the AI. Keep your new nickname to yourself outside the game.")}</div>
      <div className="rules-list">
        <section><MessageCircle /><div><h2>{t("01 / Get talking")}</h2><p>{t("A host invites 3–6 humans with a four-letter code or link. You each get a fresh anonymous name and color every round. One AI joins the conversation, disguised as another player. Discuss the casual topic for three minutes.")}</p></div></section>
        <section><ScanEye /><div><h2>{t("02 / Trust your instincts")}</h2><p>{t("When chat closes, humans have 30 seconds to vote for the player they suspect. You cannot vote for yourself. Votes are hidden until the reveal. A missing vote is an abstention; the AI does not vote.")}</p></div></section>
        <section><Bot /><div><h2>{t("03 / Meet the impostor")}</h2><p>{t("The reveal shows the AI and everyone’s votes. A majority means more than half the humans who were eligible at the start of the round, including those who abstain.")}</p></div></section>
        <section><Trophy /><div><h2>{t("04 / Make it count")}</h2><p>{t("Finding the AI earns +1. If a majority votes for human players, the AI wins and the most-accused human loses 1 point. Tied most-accused humans each lose 1. The leaderboard follows three rounds.")}</p><span className="small-label">{t("Three rounds per game. Practice is unranked. Tied players share their rank.")}</span></div></section>
        <section><ShieldCheck /><div><h2>{t("A few house rules")}</h2><p>{t("Keep it kind and leave personal information out of chat. Report inappropriate messages; hosts can remove disruptive participants. During play, removal or voluntary departure ends the round without revealing anyone’s identity or awarding points. With only two humans, the host must select practice mode. Reconnect in the same browser to restore your seat. Below two connected humans, play pauses for up to 60 seconds before cancellation. Rooms and their messages expire after 24 hours.")}</p></div></section>
      </div>
      <div className="inline-notice">{t("Play three live rounds with shared chat, a hidden AI, private voting, reveals and a final leaderboard. Download or share your anonymous result card. Real play requires an activated server-side NVIDIA Build or OpenAI key. Developer mode remains an explicitly scripted playground.")}</div>
      <Link href="/" className="button button-primary mt-6">{t("Got it. Let’s play")} <ArrowRight size={18} /></Link>
    </main>
  );
}
