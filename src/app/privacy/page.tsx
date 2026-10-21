"use client";
import Link from "next/link";
import { LanguageSwitcher, useLanguage } from "@/components/language-provider";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  const { t } = useLanguage();
  return (
    <main className="document-page">
      <div className="document-toolbar"><LanguageSwitcher /><Link className="text-link" href="/"><ArrowLeft size={17} /> {t("Back to the game")}</Link></div>
      <div className="eyebrow mt-10">{t("YOUR SEAT, NOT YOUR IDENTITY")}</div>
      <h1>{t("Just bring")}<br /><span className="accent-text">{t("your instincts.")}</span></h1>
      <div className="privacy-copy">
        <p>{t("A language preference cookie keeps your FR/EN interface choice for 24 hours. It contains no identity or API key.")}</p>
        <h2>{t("Shared lobbies")}</h2><p>{t("No email, real name, or profile is requested. Supabase stores the room, random animal identities, readiness, and temporary presence. An HttpOnly cookie identifies your guest seat for at most 24 hours; only a hash of that random credential is stored in the database. Reloading restores your seat. Browsers sharing cookies share the same identity.")}</p>
        <h2>{t("24-hour expiry")}</h2><p>{t("Rooms expire 24 hours after creation, even if people are still connected. Access is denied at the deadline. A database cleanup job runs every 10 seconds and deletes expired rooms and their associated players, round identities, messages, votes, reports, and AI jobs. A failed cleanup is retried by the next scheduled run. Provider-managed infrastructure logs and backups have their own retention policies.")}</p>
        <h2>{t("Developer playground")}</h2><p>{t("The explicitly labeled developer mode remains local and scripted. Its messages and votes stay in page memory and reset on reload. It does not send chat to Supabase or an AI provider. There are no analytics, advertising trackers, or external fonts.")}</p>
        <h2>{t("Owner administration")}</h2><p>{t("The owner’s dashboard has a separate password-protected session. No administrator password or provider key is returned to players. Provider keys entered there are encrypted in Supabase Vault and persist independently of the 24-hour room expiry so the owner can switch between providers without re-entering them. The administrator password is stored as a salted hash. Administrator sessions expire after eight hours; setup links expire after 24 hours and can be used only once.")}</p>
        <h2>{t("Chat and AI processing")}</h2><p>{t("Other people in your room see your messages. When real AI is enabled, the topic, bot nickname, and up to 12 recent messages with fictional nicknames are sent to the server-selected provider: NVIDIA Build or OpenAI. Guest credentials and network hashes are not sent to the model. Do not share real names, contact details, confidential information or other personal data in chat.")}</p>
        <h2>{t("NVIDIA Build trial")}</h2><p>{t("NVIDIA’s trial terms allow collection and use of inputs and generated outputs to operate and improve its services and models, and logging for security and abuse prevention. Do not assume zero retention or deletion after 24 hours. See the")} <a href="https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf" target="_blank" rel="noreferrer" className="text-link">{t("NVIDIA API Trial Terms")}</a> {t("and")} <a href="https://www.nvidia.com/en-us/about-nvidia/privacy-policy/" target="_blank" rel="noreferrer" className="text-link">{t("NVIDIA Privacy Policy")}</a>{t(". This trial option is for internal testing and evaluation, not production service.")}</p>
        <h2>{t("OpenAI alternative")}</h2><p>{t("OpenAI requests use the Responses API with storage disabled. That does not guarantee zero retention: OpenAI may retain abuse-monitoring logs under its own policies. See")} <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer" className="text-link">{t("OpenAI’s data controls")}</a>{t(". The app’s 24-hour cleanup cannot delete independent records held by either provider.")}</p>
        <h2>{t("Abuse prevention")}</h2><p>{t("The room server uses keyed hashes of network addresses, rotating daily, plus independent guest-session limits. Raw IPs are not saved in game tables. Network quotas are best effort and people sharing a network may share a quota; creating a fresh browser identity can bypass a seat-specific kick. Hosting providers process connection information under their own policies. We do not log chat or credentials in application code.")}</p>
      </div>
    </main>
  );
}
