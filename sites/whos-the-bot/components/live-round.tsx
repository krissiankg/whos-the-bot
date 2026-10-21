"use client";
import { ROUND_INTERRUPTION_MESSAGES } from "@/lib/lobby";

import { useEffect, useRef, useState } from "react";
import { HomeLink } from "@/components/home-link";
import { Flag, LoaderCircle, Send, ShieldCheck, X } from "lucide-react";
import { Avatar } from "./avatar";
import { useLanguage } from "./language-provider";
import {Leaderboard} from "./leaderboard";
import {playerName} from "@/lib/translations.mjs";
import { formatTime } from "@/lib/preview";
import type { LobbyPlayer, LobbyState } from "@/lib/lobby";

export function LiveRound({state,pending,onAction,onRefresh,onKick}:{
  state:LobbyState; pending:boolean;
  onAction:(action:string,args?:Record<string,unknown>)=>Promise<boolean>;
  onRefresh:()=>Promise<void>; onKick:(player:LobbyPlayer)=>void;
}) {
  const { locale, t } = useLanguage();
  const name=(source:string)=>playerName(source,state.room.language);
  const round=state.round!;
  const [draft,setDraft]=useState("");
  const [selected,setSelected]=useState("");
  const [now,setNow]=useState(Date.now());
  const clock=useRef({local:Date.now(),server:Date.parse(state.serverNow)});
  const bottom=useRef<HTMLDivElement>(null);
  const submission=useRef<{text:string;id:string}|null>(null);
  useEffect(()=>{clock.current={local:Date.now(),server:Date.parse(state.serverNow)};},[state.serverNow]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[]);
  const remaining=state.room.deadline?Math.max(0,Math.ceil((Date.parse(state.room.deadline)-clock.current.server-(now-clock.current.local))/1000)):0;
  const active=round.phase==="chat" || round.phase==="vote";
  const paused=Boolean(round.pausedUntil);
  useEffect(()=>{
    if(!active || paused || remaining>0) return;
    void onRefresh();
    const timer=setInterval(()=>void onRefresh(),3000);
    return()=>clearInterval(timer);
  },[active,paused,remaining,onRefresh]);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth",block:"nearest"});},[round.messages.length]);
  const find=(id:string|null)=>state.players.find(player=>player.id===id);
  async function send(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text=draft.trim();
    if(!text || pending || remaining<=0 || paused) return;
    // Preserve the UUID when retrying a response lost after server acceptance.
    if(submission.current?.text!==text) submission.current={text,id:crypto.randomUUID()};
    if(await onAction("message",{text,requestId:submission.current.id})) {setDraft("");submission.current=null;}
  }
  const bot=round.reveal?find(round.reveal.botId):undefined;
  if(state.match?.finished && state.leaderboard?.length) return <><Leaderboard rows={state.leaderboard} practice={state.match.practice}/><section className="panel final-reveal"><h2>{t("THE SECRET AI WAS")} · {bot?.name}</h2><ul className="live-vote-results">{round.reveal?.votes.map(vote=><li key={vote.voterId}><strong>{find(vote.voterId)?.name}</strong><span>→ {find(vote.targetId)?.name || t("Abstained")}</span></li>)}</ul></section></>;
  return <>
    <div className="screen-title-row"><div><div className="eyebrow">{t("Round {0} of 3",{0:round.number || 1})}{round.practice && " · "+t("Practice · no points")}</div><h1 className="screen-heading">{round.phase==="chat"?t("Act natural."):round.phase==="vote"?t("Who’s giving bot energy?"):round.phase==="cancelled"?t("Let’s call a timeout."):t("The mask comes off.")}</h1><p className="screen-subtitle">{round.topic}</p></div>{active && <span className="live-countdown" role="timer" aria-label={t("Time remaining")}>{paused?t("Paused"):formatTime(remaining)}</span>}</div>
    {paused && <div className="inline-notice notice-warning live-notice" role="status">{t("Waiting for at least two humans to reconnect. The round ends without a reveal if they do not return within 60 seconds.")}</div>}
    <div className="live-round-layout"><section className="panel live-conversation" aria-label={t("Shared conversation")}>
      <div className="panel-header"><h2>{round.phase==="chat"?t("Small talk. Big suspicions."):t("Conversation history")}</h2><span className="small-label">{t("One participant is AI")}</span></div>
      <div className="live-messages" role="log" aria-label={t("Chat messages")} aria-live="polite">
        {!round.messages.length && <p className="live-chat-empty">{t("Break the ice. What’s your take on the topic?")}</p>}
        {round.messages.map(message=>{
          const author=find(message.playerId); if(!author)return null;
          const reported=round.reportedIds.includes(message.id);
          const flagged=round.hostReportIds.includes(message.id);
          return <article key={message.id} className={`live-message ${message.playerId===state.meId?"live-message-mine":""}`}><Avatar player={author}/><div className="live-message-content"><div className="live-message-byline"><strong style={{color:author.color}}>{name(author.name )}{author.id===state.meId?t(" · you"):""}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></div><p>{message.text}</p>{flagged && <span className="small-label report-flag"><ShieldCheck size={12}/> {t("Reported · host review")}</span>}</div><button className="message-report" disabled={pending || reported} title={reported?t("Reported"):t("Report this message")} aria-label={`${reported?t("Reported"):t("Report message by")} ${name(author.name )}`} onClick={()=>void onAction("report",{messageId:message.id})}><Flag size={14}/>{reported && <span className="sr-only">{t("Reported")}</span>}</button></article>;
        })}<div ref={bottom}/>
      </div>
      {round.phase==="chat"?<form className="live-composer" onSubmit={send}><label className="sr-only" htmlFor="live-message">{t("Your message")}</label><input id="live-message" value={draft} maxLength={280} placeholder={paused?t("Waiting for reconnection…"):t("Say something suspiciously normal…")} disabled={pending || paused || remaining<=0} onChange={event=>setDraft(event.target.value)} autoComplete="off"/><button className="button button-primary" type="submit" disabled={pending || paused || remaining<=0 || !draft.trim()} aria-label={t("Send message")}>{pending?<LoaderCircle size={18} className="loading-icon"/>:<Send size={18}/>}</button><span className="small-label">{draft.length}{t("/280 · Keep it kind. No personal details.")}</span></form>:<p className="live-chat-closed">{t("Chat is closed.")} {round.phase==="vote"?t("Votes stay private until the deadline."):t("This conversation expires with the room.")}</p>}
    </section><aside className="live-round-aside">
      {round.phase==="vote" && <section className="panel live-voting"><h2>{t("Trust your instincts.")}</h2><p className="small-label">{t("One final vote. You cannot choose yourself. No vote means abstention.")}</p><div className="live-vote-options">{state.players.filter(player=>player.id!==state.meId).map(player=><button className={`live-vote-option ${selected===player.id || round.myVote===player.id?"is-selected":""}`} key={player.id} disabled={pending || paused || remaining<=0 || Boolean(round.myVote)} aria-pressed={selected===player.id || round.myVote===player.id} onClick={()=>setSelected(player.id)}><Avatar player={player}/><strong>{name(player.name )}</strong></button>)}</div><button className="button button-primary start-button" disabled={!selected || pending || paused || remaining<=0 || Boolean(round.myVote)} onClick={()=>void onAction("vote",{targetId:selected})}>{round.myVote?t("Vote locked in ✓"):t("Lock my vote")}</button></section>}
      {round.phase==="reveal" && round.reveal && <section className="panel live-reveal"><span className="section-label">{t("THE SECRET AI WAS")}</span>{bot && <><Avatar player={bot} size="large"/><h2 style={{color:bot.color}}>{name(bot.name)}</h2></>}<p>{round.myVote===round.reveal.botId?t("You found the bot!"):t("The bot had a good disguise.")}</p><ul className="live-vote-results">{round.reveal.votes.map(vote=><li key={vote.voterId}><strong>{name(find(vote.voterId)?.name || "")}</strong><span>→ {vote.targetId ? name(find(vote.targetId)?.name || "") : t("Abstained")}</span></li>)}</ul>{round.result && <><h3>{t("Points this round")}</h3><p>{t(round.result.aiWon?"The AI fooled the majority.":"The humans held their ground.")}</p><ul className="round-score-list">{round.result.scores.map(score=><li key={score.participantId}><span>{name(find(score.participantId)?.name || "")}</span><strong>{score.delta>0?"+":""}{score.delta}</strong></li>)}</ul></>}{round.practice && <p className="small-label">{t("Practice · no points")}</p>}{state.isHost?<button className="button button-primary start-button" disabled={pending} onClick={()=>void onAction("next",{roundId:round.id})}>{t("Next round")}</button>:<p className="small-label">{t("Waiting for the host to continue.")}</p>}<p className="small-label mt-6">{t("Finish the third reveal to see the final leaderboard.")}</p></section>}
      {round.phase==="cancelled" && <section className="panel live-reveal"><ShieldCheck size={30}/><h2>{t("Round interrupted.")}</h2><p>{t(ROUND_INTERRUPTION_MESSAGES[round.cancelReason || ""] || "A connection, moderation or service issue stopped this round. No identities or votes are revealed, and no points are awarded.")}</p><HomeLink className="button button-primary start-button">{t("Start fresh")}</HomeLink></section>}
      <section className="panel live-roster"><h2>{t("The suspects")}</h2><p className="small-label">{t("Fresh nicknames hide lobby identities.")}</p>{state.players.map(player=><div className="live-roster-row" key={player.id}><Avatar player={player}/><strong>{name(player.name )}</strong>{player.id===state.meId?<span className="you-badge">{t("YOU")}</span>:state.isHost && active && <button className="player-menu-button" disabled={pending} aria-label={t("Kick {0}", {"0": name(player.name )})} onClick={()=>onKick(player)}><X size={14}/></button>}</div>)}{state.isHost && active && <p className="small-label">{t("Removing any participant ends the round without a reveal. This rule is identical for humans and the bot.")}</p>}</section>
    </aside></div>
  </>;
}
