"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Beaker, Bot, Check, CheckCheck,
  Clock3, Copy, Flag, Link2, LockKeyhole, MessageCircle, Minus,
  Plus, ScanEye, Send, ShieldCheck, Sparkles, Users, X,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { waitingSeat } from "@/lib/waiting-seat";
import { LanguageSwitcher, useLanguage } from "./language-provider";
import { translate } from "@/lib/translations.mjs";
import {scoreRound} from "@/lib/scoring.mjs";
import {Leaderboard} from "./leaderboard";
import { enterLiveRoom, LobbyError, LOBBY_ERRORS } from "@/lib/lobby";
import {
  CHAT_SECONDS, DEMO_ROOM_CODE, LOCAL_PLAYER, PREVIEW_BOT, SAMPLE_MESSAGES,
  SIMULATED_HUMANS, SIMULATED_REPLIES, TOPIC, VOTE_SECONDS, formatTime,
  type Message, type Phase, type Player,
} from "@/lib/preview";

type Modal = { type: "join" } | { type: "report"; message: Message } | { type: "kick"; player: Player } | { type: "leave" } | null;
type TutorialIntent = "create" | "join";
const PHASES: Phase[] = ["home", "tutorial", "lobby", "chat", "vote", "reveal"];

export function GamePreview({
  developerMode,
  developmentAvailable,
  initialRoomCode,
  liveAvailable = false,
}: {
  developerMode: boolean;
  developmentAvailable: boolean;
  initialRoomCode: string;
  liveAvailable?: boolean;
}) {
  const { locale, t, name } = useLanguage();
  const [gameLanguage, setGameLanguage] = useState<"en" | "fr">(locale);
  const [phase, setPhase] = useState<Phase>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [roomInput, setRoomInput] = useState(initialRoomCode.toUpperCase().slice(0, 4));
  const [joinError, setJoinError] = useState("");
  const [tutorialIntent, setTutorialIntent] = useState<TutorialIntent>("create");
  const [acknowledged, setAcknowledged] = useState(false);
  const [isHost, setIsHost] = useState(true);
  const [simulatedIds, setSimulatedIds] = useState<string[]>(developerMode ? ["sim-1", "sim-2"] : []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [messageError, setMessageError] = useState("");
  const [reports, setReports] = useState<string[]>([]);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [submittedVote, setSubmittedVote] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(CHAT_SECONDS);
  const [toast, setToast] = useState("");
  const [botMuted, setBotMuted] = useState(false);
  const [previewRound, setPreviewRound] = useState(0);
  const [previewScores,setPreviewScores]=useState<Record<string,number>>({});
  const [previewFound,setPreviewFound]=useState<Record<string,number>>({});
  const scoredPreviewRounds=useRef(new Set<number>());
  const [joining, setJoining] = useState(false);
  const [liveError, setLiveError] = useState("");
  const createRequest = useRef<string | null>(null);
  const lastMessageAt = useRef(0);
  const scriptIndex = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef(phase);
  const toastId = useRef<ReturnType<typeof setTimeout> | null>(null);

  const simulatedPlayers = SIMULATED_HUMANS.filter((player) => simulatedIds.includes(player.id));
  const humans = [LOCAL_PLAYER, ...simulatedPlayers];
  const participants = [...humans, PREVIEW_BOT];
  const practice = humans.length === 2;
  const inRound = phase === "chat" || phase === "vote" || phase === "reveal";

  useEffect(() => { if (developerMode) setGameLanguage(locale); }, [developerMode, locale]);

  useEffect(() => {
    if (liveAvailable && /^[A-Z]{4}$/.test(initialRoomCode.toUpperCase())) setModal({ type: "join" });
  }, [liveAvailable, initialRoomCode]);

  function notify(text: string) {
    setToast(text);
    if (toastId.current) clearTimeout(toastId.current);
    toastId.current = setTimeout(() => setToast(""), 4500);
  }

  useEffect(() => () => { if (toastId.current) clearTimeout(toastId.current); }, []);

  useEffect(() => {
    if (previousPhase.current !== phase) {
      headingRef.current?.focus();
      previousPhase.current = phase;
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [phase]);

  // Preview-only timer. The multiplayer build will use server deadlines,
  // lazy transitions on requests, and a 5–10 second scheduler safety net.
  useEffect(() => {
    if (!deadline || (phase !== "chat" && phase !== "vote")) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) {
        setModal(null);
        if (phase === "chat") {
          setPhase("vote");
          setRemaining(VOTE_SECONDS);
          setDeadline(Date.now() + VOTE_SECONDS * 1000);
        } else {
          setPhase("reveal");
          setDeadline(null);
        }
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, phase]);

  useEffect(() => {
    if (phase !== "chat" || !developerMode) return;
    const timer = setInterval(() => {
      const reply = SIMULATED_REPLIES[scriptIndex.current];
      scriptIndex.current += 1;
      if (!reply) { clearInterval(timer); return; }
      if (reply.playerId === PREVIEW_BOT.id ? botMuted : !simulatedIds.includes(reply.playerId)) return;
      setMessages((current) => [...current, {
        id: `script-${crypto.randomUUID()}`,
        playerId: reply.playerId,
        text: reply.text,
        time: "now",
      }]);
    }, 6500);
    return () => clearInterval(timer);
  }, [phase, developerMode, simulatedIds, botMuted, previewRound]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages, phase]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(t("{0} copied. This is a preview link, not a shared live room yet.", {"0": label}));
    } catch {
      notify(t("Copy isn’t available here. Room code: {0}", {"0": DEMO_ROOM_CODE}));
    }
  }

  function beginTutorial(intent: TutorialIntent) {
    setLiveError("");
    if (intent === "create") { createRequest.current = null; setGameLanguage(locale); }
    setTutorialIntent(intent);
    setAcknowledged(false);
    setModal(null);
    setPhase("tutorial");
  }

  async function enterLobby() {
    if (liveAvailable) {
      if (joining || !acknowledged) return;
      setJoining(true); setLiveError("");
      try {
        if (!createRequest.current) {
          const bytes = crypto.getRandomValues(new Uint8Array(16));
          bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
          const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
          createRequest.current = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
        }
        const state = await enterLiveRoom(tutorialIntent, tutorialIntent === "create" ? { requestId: createRequest.current, language: gameLanguage } : { code: roomInput });
        window.location.assign(`/room/${state.room.code}`);
      } catch (caught) { setLiveError(caught instanceof LobbyError ? caught.message : LOBBY_ERRORS.SERVER_UNAVAILABLE); setJoining(false); }
      return;
    }
    setIsHost(tutorialIntent === "create");
    setPhase("lobby");
    setMessages([]);
    setReports([]);
    setSelectedVote(null);
    setSubmittedVote(null);
    setBotMuted(false);
    lastMessageAt.current = 0;
  }

  function jumpTo(next: Phase) {
    if (!developerMode) return;
    if (["chat", "vote", "reveal"].includes(next) && simulatedIds.length === 0) {
      setSimulatedIds(["sim-1", "sim-2"]);
    }
    setModal(null);
    setPhase(next);
    setMessageInput("");
    setMessageError("");
    if (next === "chat") {
      if(previewRound>=3){setPreviewScores({});setPreviewFound({});scoredPreviewRounds.current.clear();}
      setPreviewRound((round) => round>=3?1:round+1);
      scriptIndex.current = 0;
      lastMessageAt.current = 0;
      const activeIds = simulatedIds.length ? simulatedIds : ["sim-1", "sim-2"];
      setMessages(SAMPLE_MESSAGES.filter((message) => message.playerId === PREVIEW_BOT.id || activeIds.includes(message.playerId)));
      setReports([]);
      setSelectedVote(null);
      setSubmittedVote(null);
      setBotMuted(false);
      setRemaining(CHAT_SECONDS);
      setDeadline(Date.now() + CHAT_SECONDS * 1000);
    } else if (next === "vote") {
      setSelectedVote(null);
      setSubmittedVote(null);
      setRemaining(VOTE_SECONDS);
      setDeadline(Date.now() + VOTE_SECONDS * 1000);
    } else {
      setDeadline(null);
    }
  }

  function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (phase !== "chat" || !deadline || Date.now() >= deadline) return;
    const text = messageInput.trim();
    if (!text) { setMessageError(t("Give us a little more than empty space.")); return; }
    if (Date.now() - lastMessageAt.current < 2000) {
      setMessageError(t("Take a breath. You can send a message every 2 seconds.")); return;
    }
    lastMessageAt.current = Date.now();
    setMessages((current) => [...current, {
      id: crypto.randomUUID(), playerId: LOCAL_PLAYER.id, text, time: "now",
    }]);
    setMessageInput("");
    setMessageError("");
  }

  function confirmKick(player: Player) {
    if (player.id === PREVIEW_BOT.id) setBotMuted(true);
    else setSimulatedIds((ids) => ids.filter((id) => id !== player.id));
    setModal(null);
    if(inRound){setPhase("lobby");setDeadline(null);setMessages([]);setPreviewRound(0);setPreviewScores({});setPreviewFound({});scoredPreviewRounds.current.clear();notify(t("The preview round ended without revealing identities or awarding points."));} else notify(t("{0} {1} in this preview. Restart the preview to restore players.", {"0": name(player.name ), "1": player.id === PREVIEW_BOT.id ? t("was muted") : t("was removed")}));
  }

  function reset() {
    setPreviewRound(0);setPreviewScores({});setPreviewFound({});scoredPreviewRounds.current.clear();
    setPhase("home"); setDeadline(null); setModal(null);
    setSimulatedIds(developerMode ? ["sim-1", "sim-2"] : []);
    setMessages([]); setReports([]); setSelectedVote(null); setSubmittedVote(null);
    setMessageInput(""); setMessageError(""); setBotMuted(false); setIsHost(true);
    lastMessageAt.current = 0;
    scriptIndex.current = 0;
  }

  function renderRoster() {
    return (
      <div className="sidebar-players">
        {participants.map((player) => (
          <div className="sidebar-player" key={player.id}>
            <Avatar player={player} size="small" />
            <span>{name(player.name )}{player.id === LOCAL_PLAYER.id && <small>{t("you")}</small>}</span>
            {isHost && player.id !== LOCAL_PLAYER.id && phase === "chat" && <button className="player-menu-button" title={t("Kick {0}", {"0": name(player.name )})} aria-label={t("Kick {0}", {"0": name(player.name )})} onClick={() => setModal({ type: "kick", player })}><X size={15} /></button>}
          </div>
        ))}
      </div>
    );
  }

  const simulatedVotes = simulatedPlayers.map((player, index) => ({
    voter: player,
    target: index % 2 === 0 ? PREVIEW_BOT : LOCAL_PLAYER,
  }));
  const votedFor = participants.find((player) => player.id === submittedVote);

  useEffect(()=>{
    if(phase!=="reveal" || previewRound<1 || humans.length<2 || scoredPreviewRounds.current.has(previewRound))return;
    scoredPreviewRounds.current.add(previewRound);
    const result=scoreRound({humans:humans.map(player=>player.id),botId:PREVIEW_BOT.id,practice,
      votes:[{voterId:LOCAL_PLAYER.id,targetId:submittedVote},...simulatedPlayers.map((player,index)=>({voterId:player.id,targetId:index%2===0?PREVIEW_BOT.id:LOCAL_PLAYER.id}))]});
    setPreviewScores(previous=>{const next={...previous};for(const score of result.scores)next[score.participantId]=(next[score.participantId]||0)+score.delta;return next;});
    setPreviewFound(previous=>{const next={...previous};for(const score of result.scores)next[score.participantId]=(next[score.participantId]||0)+Number(score.foundBot);return next;});
  },[phase,previewRound,submittedVote,practice,humans,simulatedPlayers]);
  const demoLeaderboard=humans.map(player=>({...player,name:name(player.name),score:previewScores[player.id]||0,found:previewFound[player.id]||0,me:player.id===LOCAL_PLAYER.id,rank:1})).sort((a,b)=>b.score-a.score);
  for(const row of demoLeaderboard)row.rank=1+new Set(demoLeaderboard.filter(other=>other.score>row.score).map(other=>other.score)).size;

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label={t("Who's the Bot? home")} onClick={reset}>
          <span className="brand-mark"><ScanEye size={23} strokeWidth={2.3} /></span>
          who’s the bot<span className="accent-text">?</span>
        </Link>
        <div className="header-actions">
          <LanguageSwitcher />
          <span className="header-preview"><span className="status-dot" /> {liveAvailable ? t("LIVE LOBBIES") : t("SCREEN PREVIEW")}</span>
          <Link href="/how-to-play" className="header-howto">{t("How to play")} <ArrowRight size={14} /></Link>
        </div>
      </header>

      <div className="preview-banner">
        <div className="preview-banner-inner"><Beaker size={14} /><span>{liveAvailable ? <><strong>{t("Playable core.")}</strong> {t("Invite your friends, talk for three minutes, then find the hidden AI.")} <Link href="/admin" className="text-link">{t("Owner settings")}</Link></> : <><strong>{t("Developer UI preview.")}</strong> {t("No shared rooms or real AI here.")} {developerMode ? t("Simulated players are enabled.") : t("Try developer mode to explore a full round alone.")}</>}</span></div>
      </div>

      <main className={`page-content ${phase === "home" ? "home-content" : ""}`}>
        {phase === "home" && <>
          <div className="home-grid">
            <section className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> {t("A VERY HUMAN PARTY GAME")}</div>
              <h1 className="hero-title" ref={headingRef} tabIndex={-1}>{t("Good chat.")}<br />{t("Bad alibis.")}<br /><span className="accent-text">{t("One bot.")}</span></h1>
              <p className="hero-description">{t("Your friends. A few suspicious opinions.")}<br className="desktop-break" /> {t("And an AI trying very hard to fit in.")}<br className="desktop-break" /> {t("Can you spot who doesn’t belong?")}</p>
              <div className="hero-actions">
                <button className="button button-primary" onClick={() => beginTutorial("create")}>{t("Create a room")} <ArrowRight size={19} /></button>
                <button className="button button-secondary" onClick={() => { setModal({ type: "join" }); setJoinError(""); }}>{t("Join with a code")} <Users size={18} /></button>
              </div>
              <div className="feature-row"><span className="feature-item"><Users size={15} /> {t("3–6 friends")}</span><span className="feature-item"><Clock3 size={15} /> {t("3-minute rounds")}</span><span className="feature-item"><LockKeyhole size={15} /> {t("No sign-up")}</span></div>
            </section>
            <section className="hero-art" aria-label={t("An anonymous fox, cat, frog, and owl. One is secretly an AI.")}>
              <div className="art-orbit" /><span className="floating-question question-one">?</span><span className="floating-question question-two">?</span>
              <div className="mini-bubble bubble-one">{t("“sounds exactly like")}<br />{t("something a bot would say”")} <span>👀</span></div>
              <div className="lineup-card">
                <div className="lineup-top"><span className="status-dot" /> {t("EVERYONE SEEMS HUMAN.")}<span>01 / 03</span></div>
                <div className="lineup-players">{[LOCAL_PLAYER, SIMULATED_HUMANS[0], SIMULATED_HUMANS[1], PREVIEW_BOT].map((player, index) => <div className="lineup-person" key={player.id}><Avatar player={player} size="large" /><span>{name(player.name )}</span><span className="lineup-suspicion">{index === 3 ? t("...right?") : [t("very convincing"), t("a little too chill"), t("definitely maybe")][index]}</span></div>)}</div>
                <div className="lineup-bottom"><ScanEye size={17} /><span>{t("ONE OF THEM ISN’T.")}</span><span className="orbit-label">{t("TRUST YOUR GUT")}</span></div>
              </div>
              <div className="mini-bubble bubble-two">{t("“i just really like pancakes??”")} <span>🥞</span></div>
            </section>
          </div>
          <section className="how-strip" aria-label={t("The game in three steps")}>
            {[{ icon: MessageCircle, title: t("Talk it out"), text: t("One topic. Three minutes. Act natural.") }, { icon: ScanEye, title: t("Call the bluff"), text: t("Pick the player giving you bot energy.") }, { icon: Sparkles, title: t("Question everything"), text: t("Meet the bot. Reconsider your friendships.") }].map(({ icon: Icon, title, text }, index) => <div className="how-strip-item" key={title}><span className="step-index">0{index + 1}</span><Icon size={21} /><div><h2>{t(title)}</h2><p>{t(text)}</p></div></div>)}
          </section>
        </>}

        {phase === "tutorial" && <section className="game-shell">
          <button className="back-button" onClick={() => setPhase("home")}><ArrowLeft size={16} /> {t("Back")}</button>
          <div className="tutorial-header"><div className="eyebrow">{t("YOUR 30-SECOND BRIEFING")}</div><h1 className="screen-heading" ref={headingRef} tabIndex={-1}>{t("Small talk. Big suspicions.")}</h1><p className="screen-subtitle">{t("A little social deduction. Absolutely no acting skills required.")}</p></div>
          <div className="tutorial-disclosure"><Bot size={25} /><div><strong>{t("One of the players is an AI.")}</strong><p>{t("Everyone knows there’s a bot. Nobody knows which anonymous player it is.")}</p></div></div>
          <div className="inline-notice"><LockKeyhole size={18} /><span>{t("Your identity is assigned only when each round starts, alongside the AI. Keep your new nickname to yourself outside the game.")}</span></div>
          <div className="tutorial-grid">
            {[{ icon: MessageCircle, title: t("Chat like a human"), text: t("You get an anonymous name, a color, and a casual topic. Chat with everyone for 3 minutes. The AI chats too."), time: t("10 seconds to learn") }, { icon: ScanEye, title: t("Find the odd one out"), text: t("Watch for suspicious replies. Then you have 30 seconds to vote. You can’t vote for yourself, and your choice stays secret."), time: t("10 seconds to learn") }, { icon: Sparkles, title: t("The truth comes out"), text: t("We reveal the bot and every vote. Correct guesses earn points across 3 rounds."), time: t("10 seconds to learn") }].map(({ icon: Icon, title, text, time }, index) => <article className="tutorial-card" key={title}><div className="tutorial-card-top"><span className="tutorial-icon"><Icon size={25} /></span><span className="step-index">0{index + 1}</span></div><h2>{t(title)}</h2><p>{t(text)}</p><span className="tutorial-time"><Clock3 size={13} />{t(time)}</span></article>)}
          </div>
          <label className="tutorial-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>{t("I understand that one of the players is an AI.")}</span></label>
          {tutorialIntent === "create" && <div className="tutorial-language"><label htmlFor="game-language">{t("Choose the conversation language")}</label><select id="game-language" className="language-select" value={gameLanguage} onChange={event => setGameLanguage(event.target.value as "en" | "fr")}><option value="fr">Français</option><option value="en">{t("English")}</option></select><p>{t("The host chooses the topic and AI language. Interface language stays personal.")}</p></div>}
          {liveAvailable && <p className="small-label">{t("Recent messages are sent to the server-selected NVIDIA Build or OpenAI model. NVIDIA trial inputs and outputs may be used to improve its services. Do not share personal information.")} <Link href="/privacy" className="text-link">{t("Read the privacy details")}</Link>.</p>}
          {liveError && <div className="inline-notice notice-warning live-notice" role="alert">{t(liveError)}</div>}
          <div className="tutorial-footer"><span><ShieldCheck size={16} /> {t("Be kind. Keep personal details out of chat.")}</span><button className="button button-primary" disabled={!acknowledged || joining} onClick={() => void enterLobby()}>{joining ? t("Finding your seat…") : t("Got it. Enter lobby")} <ArrowRight size={18} /></button></div>
        </section>}

        {phase === "lobby" && <section className="game-shell">
          <button className="back-button" onClick={() => setModal({ type: "leave" })}><ArrowLeft size={16} /> {t("Leave lobby")}</button>
          <div className="screen-title-row"><div><div className="eyebrow">{t("THE GATHERING PLACE")}</div><h1 className="screen-heading" ref={headingRef} tabIndex={-1}>{t("The usual suspects.")}</h1><p className="screen-subtitle">{t("Grab your friends. Leave your real names at the door.")}</p></div><span className="rule-chip"><span className="status-dot" /> {t("Lobby open")}</span></div>
          <div className="lobby-layout">
            <div className="panel lobby-main">
              <div className="panel-header"><h2>{t("Your human crew")} <span className="small-label">{humans.length} / 6</span></h2><span className="small-label">{isHost ? t("You’re hosting") : t("Guest preview")}</span></div>
              <div className="player-grid">
                {humans.map((player, index) => waitingSeat({ ...player, ready: false, online: true }, index, gameLanguage)).map((player) => <div className="player-card" key={player.id}><Avatar player={player} size="large" /><div className="player-meta"><strong>{name(player.name )}</strong><span className="player-state"><span className="status-dot" /> {player.id === LOCAL_PLAYER.id ? t("Ready when you are") : t("Simulated player")}</span></div>{player.id === LOCAL_PLAYER.id ? <span className="you-badge">{t("YOU")}</span> : isHost && <button className="player-menu-button" aria-label={t("Kick {0}", {"0": name(player.name )})} onClick={() => setModal({ type: "kick", player })}><X size={16} /></button>}</div>)}
                {Array.from({ length: 6 - humans.length }, (_, index) => <div className="player-card empty-seat" key={`empty-${index}`}><span className="empty-avatar"><Plus size={20} /></span><div><strong>{t("A friend goes here")}</strong><span>{t("Suspiciously empty")}</span></div></div>)}
              </div>
              <div className="lobby-footer"><Bot size={21} /><p><strong>{t("+ 1 secret AI player")}</strong><span>{t("They’ll get an anonymous identity when the round starts.")}</span></p><LockKeyhole size={16} /></div>
            </div>
            <aside className="lobby-aside">
              <div className="panel room-share"><span className="section-label">{t("INVITE YOUR CO-CONSPIRATORS")}</span><div className="room-code" aria-label={t("Room code {0}", {"0": DEMO_ROOM_CODE.split("").join(" ")})}>{DEMO_ROOM_CODE.split("").map((letter, index) => <span key={index}>{letter}</span>)}</div><span className="small-label">{t("Preview code · not a live room")}</span><div className="share-actions"><button className="button button-secondary" onClick={() => copy(DEMO_ROOM_CODE, t("Room code"))}><Copy size={16} /> {t("Copy code")}</button><button className="button button-secondary" onClick={() => copy(`${window.location.origin}/?room=${DEMO_ROOM_CODE}${developerMode ? "&dev=1" : ""}`, t("Preview link"))}><Link2 size={16} /> {t("Copy link")}</button></div></div>
              <div className="panel lobby-settings"><div className="settings-row"><span><Clock3 size={16} /> {t("Chat time")}</span><strong>{t("3 minutes")}</strong></div><div className="settings-row"><span><MessageCircle size={16} /> {t("Language")}</span><select aria-label={t("Conversation language")} className="language-select" value={gameLanguage} disabled={!isHost} onChange={event=>setGameLanguage(event.target.value as "en" | "fr")}><option value="fr">Français</option><option value="en">English</option></select></div><div className="settings-row"><span><Users size={16} /> {t("Game type")}</span><strong>{practice ? t("2-human practice") : t("3–6 humans")}</strong></div><p className="small-label">{t("Correct vote: +1. If most humans accuse humans, the most accused lose 1. Ties share the penalty.")}</p></div>
              <button className="button button-primary start-button" disabled={!developerMode || !isHost || humans.length < 2} onClick={() => jumpTo("chat")}>{practice ? t("Start practice preview") : t("Start round preview")}<ArrowRight size={19} /></button>
              <p className="lobby-progress">{!developerMode ? <>{t("Real rooms connect in step 2.")} {developmentAvailable && <Link href="/?dev=1">{t("Try simulated players →")}</Link>}</> : !isHost ? t("Switch to Host in developer controls to start.") : humans.length < 2 ? t("Add a simulated human to start practice.") : t("Scripted players enabled. No AI credits needed.")}</p>
            </aside>
          </div>
        </section>}

        {phase === "chat" && <section className="game-shell">
          <div className="phase-topbar"><div><div className="phase-label"><span className="status-dot" /> {t("THE CONVERSATION")}</div><h1 ref={headingRef} tabIndex={-1}>{t("Act natural.")}</h1></div><div className={`timer ${remaining <= 30 ? "timer-urgent" : ""}`} role="timer" aria-label={t("{0} seconds remaining", {"0": remaining})}><Clock3 size={20} />{formatTime(remaining)}</div></div>
          <div className="chat-layout"><div className="panel chat-main">
            <div className="topic-card"><span className="topic-label"><Sparkles size={14} /> {t("YOUR CONVERSATION STARTER")}</span><h2>{translate(gameLanguage, TOPIC)}</h2><span>{t("Everyone here is anonymous. One of you isn’t human.")}</span></div>
            <div className="message-list" ref={scrollRef} role="log" aria-label={t("Room messages")} aria-live="polite" aria-relevant="additions">
              <div className="chat-system-message"><LockKeyhole size={12} /> {t("The round has started. Let the overthinking begin.")}</div>
              {messages.map((message) => {
                const player = participants.find((candidate) => candidate.id === message.playerId) ?? SIMULATED_HUMANS.find((candidate) => candidate.id === message.playerId);
                if (!player) return null;
                const own = player.id === LOCAL_PLAYER.id;
                return <div className={`message-row ${own ? "message-own" : ""}`} key={message.id}><Avatar player={player} size="small" /><div className="message-content"><div className="message-meta"><strong style={{ color: player.color }}>{name(player.name )}{own ? t(" (you)") : ""}</strong><span>{message.time === "now" ? t("Just now") : message.time}</span></div><div className="message-bubble">{message.id.startsWith("seed-") || message.id.startsWith("script-") ? translate(gameLanguage, message.text) : message.text}</div></div><button className={`message-report ${reports.includes(message.id) ? "reported" : ""}`} title={reports.includes(message.id) ? t("Reported in preview") : t("Report message")} aria-label={t("{0} by {1}", {"0": reports.includes(message.id) ? t("Reported message") : t("Report message"), "1": name(player.name )})} disabled={reports.includes(message.id)} onClick={() => setModal({ type: "report", message })}>{reports.includes(message.id) ? <Check size={14} /> : <Flag size={14} />}</button></div>;
              })}
            </div>
            <div className="composer-wrap"><form className="message-composer" onSubmit={sendMessage}><label className="sr-only" htmlFor="message-input">{t("Your message")}</label><input className="composer-input" id="message-input" value={messageInput} onChange={(event) => { setMessageInput(event.target.value); setMessageError(""); }} maxLength={280} autoComplete="off" placeholder={t("Say something suspiciously human…")} aria-describedby="composer-hint" /><button className="send-button" type="submit" disabled={!messageInput.trim()} aria-label={t("Send message")}><Send size={19} /></button></form><div className="composer-hint" id="composer-hint">{messageError ? <span role="alert" className="field-error">{t(messageError)}</span> : <><span>{t("Keep it kind. Keep it short.")}</span><span>{messageInput.length}{t("/280 · Enter to send")}</span></>}</div></div>
          </div><aside className="panel chat-sidebar"><div className="panel-header"><h2>{t("The suspects")}</h2><span className="small-label">{participants.length}</span></div>{renderRoster()}<div className="sidebar-note"><ScanEye size={24} /><strong>{t("Read between the lines.")}</strong><p>{t("Oddly perfect grammar? Too many pancakes? Everyone’s a suspect.")}</p></div><div className="inline-notice">{t("Scripted preview. Reports and kicks affect only this browser session.")}</div></aside></div>
        </section>}

        {phase === "vote" && <section className="game-shell vote-screen">
          <div className="phase-topbar"><div><div className="phase-label"><ScanEye size={16} /> {t("DECISION TIME")}</div><h1 ref={headingRef} tabIndex={-1}>{t("Who’s giving bot energy?")}</h1></div><div className={`timer ${remaining <= 10 ? "timer-urgent" : ""}`} role="timer" aria-label={t("{0} seconds remaining", {"0": remaining})}><Clock3 size={20} />{formatTime(remaining)}</div></div>
          <p className="screen-subtitle">{t("The chat is closed. Pick your suspect. Your vote stays secret until the reveal.")}</p>
          <div className="vote-grid">{participants.map((player) => {
            const own = player.id === LOCAL_PLAYER.id;
            const chosen = (submittedVote ?? selectedVote) === player.id;
            return <button className={`vote-card ${chosen ? "vote-selected" : ""}`} key={player.id} disabled={own || Boolean(submittedVote)} aria-pressed={chosen} onClick={() => setSelectedVote(player.id)}><span className="vote-check">{chosen && <Check size={16} />}</span><Avatar player={player} size="hero" /><strong>{name(player.name )}</strong><span>{own ? t("That’s you. Nice try.") : chosen ? t("Your prime suspect") : t("Seems human. Maybe.")}</span></button>;
          })}</div>
          <div className="vote-footer">{submittedVote ? <div className="vote-confirmed" role="status"><CheckCheck size={23} /><div><strong>{t("Vote locked. Poker face on.")}</strong><p>{t("Waiting for the timer. The developer controls can skip to the reveal.")}</p></div></div> : <><span><LockKeyhole size={16} /> {t("One vote. No take-backs. Skipping is an abstention.")}</span><button className="button button-primary" disabled={!selectedVote} onClick={() => { if (deadline && Date.now() < deadline) setSubmittedVote(selectedVote); }}>{t("Lock in my vote")} <ArrowRight size={18} /></button></>}</div>
        </section>}

        {phase === "reveal" && previewRound >= 3 && <Leaderboard rows={demoLeaderboard} practice={practice} preview/>}
        {phase === "reveal" && previewRound < 3 && <section className="game-shell reveal-screen">
          <div className="reveal-hero"><div className="eyebrow">{t("Round {0} of 3",{0:previewRound || 1})}</div><h1 className="screen-heading" ref={headingRef} tabIndex={-1}>{t("Well, well,")} <span className="accent-text">{t("well.")}</span></h1><div className="reveal-avatar"><Avatar player={PREVIEW_BOT} size="hero" /><span className="reveal-badge"><Bot size={15} /> {t("THE BOT")}</span></div><h2 className="reveal-title">{name(PREVIEW_BOT.name )}</h2><p className="screen-subtitle">{submittedVote === PREVIEW_BOT.id ? t("You saw right through those pancakes. Good instincts.") : submittedVote ? t("Sometimes the pancake critic is, in fact, a bot.") : t("No vote this time. The pancake critic was the bot all along.")}</p><span className="small-label">{t("In this developer preview, the bot is a scripted character.")}</span></div>
          <div className="panel vote-breakdown"><div className="panel-header"><h2>{t("The finger-pointing")}</h2><span className="small-label">{t("Votes revealed")}</span></div><div className="vote-breakdown-row"><span><Avatar player={LOCAL_PLAYER} size="small" /><strong>{name(LOCAL_PLAYER.name )} <small>{t("(you)")}</small></strong></span><ArrowRight size={16} /><span>{votedFor ? <><Avatar player={votedFor} size="small" /><strong>{name(votedFor.name )}</strong>{votedFor.id === PREVIEW_BOT.id && <Check size={16} className="accent-text" />}</> : <span className="small-label">{t("Abstained")}</span>}</span></div>{simulatedVotes.map(({ voter, target }) => <div className="vote-breakdown-row" key={voter.id}><span><Avatar player={voter} size="small" /><strong>{name(voter.name )}</strong></span><ArrowRight size={16} /><span><Avatar player={target} size="small" /><strong>{name(target.name )}</strong>{target.id === PREVIEW_BOT.id && <Check size={16} className="accent-text" />}</span></div>)}<div className="result-summary">{t("These votes are simulated. The same scoring rules apply. Play three rounds to see your result card.")}</div></div>
          <div className="result-actions"><button className="button button-secondary" onClick={reset}>{t("Back to home")}</button><button className="button button-primary" onClick={() => jumpTo("chat")}>{t("Next round")} <ArrowRight size={18} /></button></div>
        </section>}

        {developerMode && <section className="developer-panel" aria-label={t("Developer controls")}><div className="developer-head"><span><Beaker size={17} /><strong>{t("Developer playground")}</strong><span className="dev-label">{t("LOCAL ONLY")}</span></span><button className="button-quiet" onClick={reset}>{t("Reset preview")}</button></div><p>{t("Simulated humans + a scripted bot. No network, API key, or shared state. These controls are unavailable in production.")}</p><div className="developer-actions"><span className="dev-count">{t("Humans")} <button aria-label={t("Remove simulated human")} disabled={simulatedIds.length === 0 || inRound} onClick={() => setSimulatedIds((ids) => ids.slice(0, -1))}><Minus size={15} /></button><strong>{humans.length}</strong><button aria-label={t("Add simulated human")} disabled={simulatedIds.length >= 5 || inRound} onClick={() => { const next = SIMULATED_HUMANS.find((player) => !simulatedIds.includes(player.id)); if (next) setSimulatedIds((ids) => [...ids, next.id]); }}><Plus size={15} /></button></span><button className="dev-toggle" aria-pressed={isHost} onClick={() => setIsHost((host) => !host)}>{isHost ? t("Role: Host") : t("Role: Guest")}</button><span className="dev-phase-label">{t("Jump to")}</span>{PHASES.map((target) => <button className={`developer-phase ${phase === target ? "active" : ""}`} aria-pressed={phase === target} key={target} onClick={() => jumpTo(target)}>{t(`phase.${target}`)}</button>)}</div></section>}
      </main>

      <footer className="site-footer"><div className="footer-left"><span className="brand-mark small"><ScanEye size={16} /></span><span>{t("Human connection. Artificial suspicion.")}</span></div><div className="footer-links"><Link href="/how-to-play">{t("How to play")}</Link><Link href="/privacy">{t("Privacy")}</Link><span>{t("Made for your group chat")} <span className="accent-text">↗</span></span></div></footer>

      {toast && <div className="toast" role="status"><Check size={17} /><span>{t(toast)}</span><button onClick={() => setToast("")} aria-label={t("Dismiss notification")}><X size={15} /></button></div>}

      {modal && <PreviewDialog title={modal.type === "join" ? t("Got a secret code?") : modal.type === "report" ? t("Report this message?") : modal.type === "kick" ? t("Remove {0}?", {"0": name(modal.player.name )}) : t("Leave the preview?")} close={() => setModal(null)}>
        {modal.type === "join" && <><span className="modal-icon"><Users size={25} /></span><h2 id="dialog-title">{t("Got a secret code?")}</h2><p>{t("Enter the four-letter code from your host.")}</p><form onSubmit={(event) => { event.preventDefault(); if (!liveAvailable && roomInput.toUpperCase() !== DEMO_ROOM_CODE) { setJoinError(t("This developer preview only supports {0}.", {"0": DEMO_ROOM_CODE})); return; } beginTutorial("join"); }}><label htmlFor="room-code" className="field-label">{t("ROOM CODE")}</label><input id="room-code" className="room-input" value={roomInput} onChange={(event) => { setRoomInput(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)); setJoinError(""); }} placeholder="ABCD" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={4} required pattern="[A-Z]{4}" aria-invalid={Boolean(joinError)} aria-describedby="room-help" /><p id="room-help" className={joinError ? "field-error" : "small-label"}>{joinError || (liveAvailable ? t("You’ll read the short tutorial before joining the shared room.") : t("Try {0}. This opens an independent local preview.", {"0": DEMO_ROOM_CODE}))}</p><button className="button button-primary w-full" type="submit" disabled={roomInput.length !== 4}>{liveAvailable ? t("Continue to tutorial") : t("Join preview")} <ArrowRight size={18} /></button></form></>}
        {modal.type === "report" && <><span className="modal-icon"><Flag size={25} /></span><h2 id="dialog-title">{t("Report this message?")}</h2><p>{t("Flag inappropriate content for the host. In this preview, reports stay in this browser and reset on reload.")}</p><blockquote>{modal.message.text}</blockquote><button className="button button-primary w-full" onClick={() => { setReports((ids) => [...ids, modal.message.id]); setModal(null); notify(t("Message flagged in this preview. Server-side reports arrive with multiplayer.")); }}>{t("Report message")} <Flag size={16} /></button></>}
        {modal.type === "kick" && <><span className="modal-icon"><ShieldCheck size={25} /></span><h2 id="dialog-title">{t("Remove")} {name(modal.player.name )}?</h2><p>{t("In this preview, removing a simulated human changes the local roster. The scripted character can be muted. Live kicks and reconnect prevention arrive with the server.")}</p><button className="button button-danger w-full" onClick={() => confirmKick(modal.player)}>{t("Confirm removal")} <X size={16} /></button></>}
        {modal.type === "leave" && <><span className="modal-icon"><ArrowLeft size={25} /></span><h2 id="dialog-title">{t("Leave the preview?")}</h2><p>{t("You’ll return to the home screen. This preview’s messages and votes will be reset.")}</p><button className="button button-primary w-full" onClick={reset}>{t("Leave preview")} <ArrowRight size={18} /></button></>}
      </PreviewDialog>}
    </div>
  );
}

function PreviewDialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]') ?? []);
    const input = dialogRef.current?.querySelector<HTMLInputElement>("input");
    (input ?? focusable()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0]; const last = elements[elements.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}><div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" aria-label={t("Close dialog")} onClick={close}><X size={20} /></button>{children}</div></div>;
}
