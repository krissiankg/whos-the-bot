"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, ArrowRight, Bot, Check, Clock3, Copy, Link2, LoaderCircle, LockKeyhole, Plus, RefreshCw, ScanEye, ShieldCheck, Users, Wifi, WifiOff, X } from "lucide-react";
import { Avatar } from "./avatar";
import { waitingSeat } from "@/lib/waiting-seat";
import {playerName} from "@/lib/translations.mjs";
import { LanguageSwitcher, useLanguage } from "./language-provider";
import { LiveRound } from "./live-round";
import { LobbyError, LOBBY_ERRORS, lobbyRequest, type LobbyPlayer, type LobbyState } from "@/lib/lobby";

export function LiveLobby({ code, supabaseUrl, publishableKey }: { code: string; supabaseUrl: string; publishableKey: string }) {
  const { locale, t } = useLanguage();
  const [state, setState] = useState<LobbyState | null>(null);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notification, setNotification] = useState("");
  const [practice, setPractice] = useState(false);
  const [confirm, setConfirm] = useState<LobbyPlayer | "leave" | null>(null);
  const fetching = useRef(false);
  const disposed = useRef(false);
  const fatalRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastRefresh = useRef(0);
  const failureCount = useRef(0);

  const accept = useCallback((next: LobbyState) => {
    if (disposed.current) return;
    setState((previous) => !previous || Date.parse(next.serverNow) >= Date.parse(previous.serverNow) ? next : previous);
    setError(""); failureCount.current = 0;
  }, []);

  const refresh = useCallback(async () => {
    if (fetching.current || fatalRef.current || disposed.current) return;
    fetching.current = true;
    lastRefresh.current = Date.now();
    try {
      const response = await fetch(`/api/lobby?code=${encodeURIComponent(code)}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(25000) });
      const body = await response.json();
      if (!response.ok) throw new LobbyError(body.error || "SERVER_UNAVAILABLE", response.status);
      accept(body);
    } catch (caught) {
      if (disposed.current) return;
      failureCount.current += 1;
      if (caught instanceof LobbyError && [401, 403, 404].includes(caught.status)) {
        fatalRef.current = true; setFatal(true); setState(null);
      }
      setError(caught instanceof LobbyError ? caught.message : LOBBY_ERRORS.SERVER_UNAVAILABLE);
    } finally {
      fetching.current = false;
      if (!disposed.current) setLoading(false);
    }
  }, [accept, code]);

  useEffect(() => {
    disposed.current = false;
    void refresh();
    // Heartbeat and recovery, not the authoritative game timer. Realtime handles
    // normal changes; polling recovers dropped events and elects a new host.
    const timer = setInterval(() => {
      if (failureCount.current > 2 && Date.now() - lastRefresh.current < 30000) return;
      void refresh();
    }, 10000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed.current = true; clearInterval(timer); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const roomId = state?.room.id;
  useEffect(() => {
    if (!roomId || fatal) return;
    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let queued: ReturnType<typeof setTimeout> | undefined;
    const channel = client.channel(`lobby:${roomId}`).on("broadcast", { event: "changed" }, () => {
      // Broadcasts are untrusted invalidation hints. Never accept their payload
      // as state; debounce and reauthorize every data read on the server.
      if (queued) return;
      queued = setTimeout(() => { queued = undefined; void refresh(); }, Math.max(150, 2500 - (Date.now() - lastRefresh.current)));
    }).subscribe((status) => { setConnected(status === "SUBSCRIBED"); if (status === "SUBSCRIBED") void refresh(); });
    return () => { if (queued) clearTimeout(queued); void client.removeChannel(channel); };
  }, [roomId, fatal, publishableKey, supabaseUrl, refresh]);

  useEffect(() => {
    if (fatal) { setConfirm(null); return; }
    if (confirm) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirm, fatal]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(""), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  async function action(name: string, args: Record<string, unknown> = {}) {
    if (pending || fatal) return false;
    setPending(true); setError("");
    try {
      if (name === "leave") {
        await lobbyRequest("leave", { code });
        window.location.assign("/"); return true;
      }
      const result = await lobbyRequest(name, { code, ...args });
      accept(result); setConfirm(null); return true;
    } catch (caught) {
      setError(caught instanceof LobbyError ? caught.message : LOBBY_ERRORS.SERVER_UNAVAILABLE);
      if (caught instanceof LobbyError && [401,403,404].includes(caught.status)) void refresh();
      return false;
    } finally { setPending(false); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotification(t("{0} copied.", {"0": label})); }
    catch { setNotification(t("Copy isn’t available. Room code: {0}", {"0": code})); }
  }

  const displayName=(source:string)=>playerName(source,state?.room.language || locale);
  const waitingPlayers = state?.players.map((player, index) => waitingSeat(player, index, state.room.language)) ?? [];
  const me = state?.players.find((player) => player.id === state.meId);
  const isHost = state?.isHost || state?.room.hostId === state?.meId;
  const expires = state ? new Date(state.room.expiresAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB") : "";

  return <div className="app-shell">
    <header className="site-header"><Link href="/" className="brand"><span className="brand-mark"><ScanEye size={23} /></span>who’s the bot<span className="accent-text">?</span></Link><div className="header-actions"><LanguageSwitcher /><span className="header-preview"><span className="status-dot" /> {t("LIVE LOBBY")}</span><Link href="/how-to-play" className="header-howto">{t("How to play")} <ArrowRight size={14} /></Link></div></header>
    <div className="preview-banner"><div className="preview-banner-inner"><Users size={14} /><span><strong>{t("Playable core.")}</strong> {t("Three rounds. One hidden AI. Find it, vote, then compare your scores.")}</span></div></div>
    <main className="page-content"><section className="game-shell">
      {loading && <div className="panel live-empty" role="status"><LoaderCircle className="loading-icon" size={28} /><h1 className="screen-heading">{t("Finding your seat…")}</h1><p>{t("Restoring your anonymous guest session.")}</p></div>}
      {!loading && !state && <div className="panel live-empty"><ShieldCheck size={32} /><h1 className="screen-heading">{fatal ? t("This seat isn’t available.") : t("Connection interrupted.")}</h1><p role="alert">{t(error)}</p><div className="result-actions"><Link href={`/?room=${code}`} className="button button-primary">{t("Join with the tutorial")} <ArrowRight size={18} /></Link><Link href="/" className="button button-secondary">{t("Back home")}</Link>{!fatal && <button className="button button-secondary" onClick={() => void refresh()}><RefreshCw size={16} /> {t("Retry")}</button>}</div></div>}
      {state && <>
        <button className="back-button" onClick={() => setConfirm("leave")}><ArrowLeft size={16} /> {t("Leave lobby")}</button>
        {error && <div className="inline-notice notice-warning live-notice" role="alert">{t(error)}<button className="text-link" onClick={() => void refresh()}>{t("Retry")}</button></div>}
        {state.round ? <LiveRound key={state.round.id} state={state} pending={pending} onAction={action} onRefresh={refresh} onKick={setConfirm}/> : <>
        <div className="screen-title-row"><div><div className="eyebrow">{t("THE GATHERING PLACE")}</div><h1 className="screen-heading">{t("The usual suspects.")}</h1><p className="screen-subtitle">{t("Only waiting seats are visible. Your game identities are still sealed.")}</p></div><span className={`rule-chip ${error ? "notice-warning" : ""}`}>{connected && !error ? <Wifi size={14} /> : <WifiOff size={14} />}{error ? t("Reconnecting") : connected ? t("Live updates") : t("Backup refresh active")}</span></div>
        <div className="lobby-layout"><div className="panel lobby-main"><div className="panel-header"><h2>{t("Your human crew")} <span className="small-label">{state.players.length} / 6</span></h2><span className="small-label">{isHost ? t("You’re hosting") : t("Guest session")}</span></div>
          <div className="player-grid">{waitingPlayers.map((player) => <div className={`player-card ${player.online ? "" : "player-offline"}`} key={player.id}><Avatar player={player} size="large" /><div className="player-meta"><strong>{displayName(player.name )}</strong><span className="player-state"><span className={`status-dot ${player.online ? "" : "status-offline"}`} />{!player.online ? t("Reconnecting…") : player.ready ? t("Ready") : t("Getting comfortable")}</span>{state.room.hostId === player.id && <span className="host-label"><ShieldCheck size={11} /> {t("HOST")}</span>}</div>{player.id === state.meId ? <span className="you-badge">{t("YOU")}</span> : isHost && <button className="player-menu-button" disabled={pending} aria-label={t("Kick {0}", {"0": displayName(player.name )})} onClick={() => setConfirm(player)}><X size={16} /></button>}</div>)}{Array.from({ length: Math.max(0, 6 - state.players.length) }, (_, index) => <div className="player-card empty-seat" key={index}><span className="empty-avatar"><Plus size={20} /></span><div><strong>{t("A friend goes here")}</strong><span>{t("Send them the room code")}</span></div></div>)}</div>
          <div className="lobby-footer"><Bot size={21} /><p><strong>{t("One secret AI joins when the round starts.")}</strong><span>{t("At every round, humans and the AI receive shuffled names, avatars and colors. Waiting seat numbers do not carry over.")}</span></p><LockKeyhole size={16} /></div>
        </div><aside className="lobby-aside"><div className="panel room-share"><span className="section-label">{t("INVITE YOUR CO-CONSPIRATORS")}</span><div className="room-code" aria-label={t("Room code {0}", {"0": code.split("").join(" ")})}>{code.split("").map((letter, index) => <span key={index}>{letter}</span>)}</div><span className="small-label">{t("Same code. Same room. Different devices.")}</span><div className="share-actions"><button className="button button-secondary" onClick={() => void copy(code, t("Room code"))}><Copy size={16} /> {t("Copy code")}</button><button className="button button-secondary" onClick={() => void copy(`${window.location.origin}/?room=${code}`, t("Invite link"))}><Link2 size={16} /> {t("Copy link")}</button></div></div>
          <div className="panel lobby-settings"><div className="settings-row"><span><Clock3 size={16} /> {t("Chat time")}</span><strong>{t("3 minutes")}</strong></div><div className="settings-row"><label htmlFor="room-language">{t("Conversation language")}</label><select id="room-language" className="language-select" value={state.room.language} disabled={!isHost || pending} onChange={event => void action("language", { language: event.target.value })}><option value="fr">Français</option><option value="en">{t("English")}</option></select></div><p className="small-label">{t("Only the host can change this before the round starts.")}</p><div className="settings-row"><span><Users size={16} /> {t("Game type")}</span><strong>{state.players.length === 2 ? t("2-human practice") : t("3–6 humans")}</strong></div><p className="small-label">{t("Correct vote: +1. If most humans accuse humans, the most accused lose 1. Ties share the penalty.")}</p></div>
          <button className={`button ${me?.ready ? "button-secondary" : "button-primary"} start-button`} disabled={pending || Boolean(error)} onClick={() => void action("ready", { ready: !me?.ready })}>{pending ? <LoaderCircle size={18} className="loading-icon" /> : <Check size={18} />}{me?.ready ? t("Ready · click to undo") : t("I’m ready")}</button>
          {isHost && state.players.length===2 && <label className="practice-toggle"><input type="checkbox" checked={practice} onChange={event=>setPractice(event.target.checked)}/> {t("Start an unranked two-human practice round")}</label>}
          <button className="button button-secondary start-button" disabled={pending || !isHost || !state.aiAvailable || state.players.length<2 || state.players.some(player=>!player.ready || !player.online) || (state.players.length===2 && !practice)} onClick={()=>void action("start",{practice})}>{isHost?t("Start round"):t("Waiting for the host")}</button>
          {!state.aiAvailable && <p className="field-error" role="status">{t("Real AI is not activated yet. The project owner can configure NVIDIA Build or OpenAI in the")} <Link href="/admin" className="text-link">{t("protected administration dashboard")}</Link>{t(". No simulated bot is substituted.")}</p>}
          <p className="lobby-progress">{state.players.length < 2 ? t("Invite a friend to try the shared lobby.") : t("{0} of {1} humans ready.", {"0": state.players.filter((player) => player.ready).length, "1": state.players.length})}</p>
        </aside></div>
        <div className="inline-notice live-notice"><ShieldCheck size={18} /><span>{t("No account needed. Your seat is restored in this browser. If the host disconnects, hosting transfers after about 40 seconds. This room expires at")} <strong>{expires}</strong>{t("; access stops then and cleanup runs every 10 seconds.")}</span></div>
        </>}
      </>}
    </section></main>
    <footer className="site-footer"><div className="footer-left">{t("Human connection. Artificial suspicion.")}</div><div className="footer-links"><Link href="/how-to-play">{t("How to play")}</Link><Link href="/privacy">{t("Privacy")}</Link></div></footer>
    {notification && <div className="toast" role="status"><Check size={17} /><span>{t(notification)}</span></div>}
    <dialog ref={dialog} className="modal native-dialog" onCancel={(event) => { if (pending) event.preventDefault(); else setConfirm(null); }} onClose={() => setConfirm(null)} aria-labelledby="confirm-heading"><h2 id="confirm-heading">{confirm === "leave" ? t("Leave the game?") : t("Remove {0}?", {"0": confirm ? displayName(confirm.name) : t("this player")})}</h2><p>{state?.round ? t("During play, leaving or removing any participant ends the round without revealing identities or votes. Human seats removed by the host are revoked.") : confirm === "leave" ? t("Your seat will be released. If you’re hosting, another connected player becomes host.") : t("Their guest seat will be revoked for this room. They won’t be able to reconnect using that session.")}</p><button className={`button ${confirm === "leave" ? "button-primary" : "button-danger"}`} disabled={pending} onClick={() => void (confirm === "leave" ? action("leave") : action("kick", { playerId: confirm?.id }))}>{pending ? t("Please wait…") : t("Confirm")}</button><button className="button button-secondary" disabled={pending} onClick={() => setConfirm(null)}>{t("Cancel")}</button>{error && <p className="field-error" role="alert">{t(error)}</p>}</dialog>
  </div>;
}
