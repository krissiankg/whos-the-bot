"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {Download,Share2,Trophy} from "lucide-react";
import {Avatar} from "./avatar";
import {useLanguage} from "./language-provider";
import {resultCardData} from "@/lib/result-card.mjs";
import type {LeaderboardPlayer} from "@/lib/lobby";

export function Leaderboard({rows,practice=false,preview=false}:{rows:LeaderboardPlayer[];practice?:boolean;preview?:boolean}){
  const {locale,t}=useLanguage();
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const [cardUrl,setCardUrl]=useState("");
  useEffect(()=>()=>{if(cardUrl)URL.revokeObjectURL(cardUrl);},[cardUrl]);
  useEffect(()=>{setCardUrl("");setNotice("");},[locale]);
  async function card(){
    const data=resultCardData(rows,practice);
    const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1200;
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas unavailable");
    ctx.fillStyle="#101610";ctx.fillRect(0,0,1080,1200);
    ctx.fillStyle="#c9f381";ctx.fillRect(56,56,12,1088);
    ctx.font="700 62px sans-serif";ctx.fillText("who’s the bot?",100,155);
    ctx.fillStyle="#f3f5ed";ctx.font="700 44px sans-serif";ctx.fillText(t("Final leaderboard"),100,235);
    ctx.fillStyle="#bcc7b3";ctx.font="26px sans-serif";ctx.fillText(practice?t("Practice · no points"):t("Three rounds. One secret AI."),100,290);
    data.players.forEach((player,index)=>{
      const y=375+index*98;ctx.fillStyle=player.me?"#2b3d20":"#1c261b";ctx.fillRect(96,y-42,890,82);
      ctx.fillStyle=player.me?"#d4ff9c":"#f3f5ed";ctx.font="700 30px sans-serif";
      ctx.fillText(String(player.rank).padStart(2,"0"),120,y+8);
      ctx.font="500 29px sans-serif";ctx.fillText(player.name+(player.me?t(" (you)"):""),195,y+8,620);
      ctx.font="700 32px sans-serif";ctx.textAlign="right";ctx.fillText(practice?"—":String(player.score),950,y+8);ctx.textAlign="left";
    });
    const me=data.players.find(player=>player.me);
    ctx.fillStyle="#c9f381";ctx.font="28px sans-serif";
    ctx.fillText(me?t("Bots found: {0}/3",{0:me.found}):t("Trust your instincts."),100,1065);
    ctx.fillStyle="#a8b49c";ctx.font="24px sans-serif";ctx.fillText(t("Human connection. Artificial suspicion."),100,1120);
    return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Export failed")),"image/png"));
  }
  async function exportCard(share:boolean){
    if(busy)return;setBusy(true);setNotice("");
    try{
      const blob=await card();const filename="whos-the-bot-"+locale+".png";
      const url=URL.createObjectURL(blob);setCardUrl(url);
      const file=new File([blob],filename,{type:"image/png"});
      if(share && navigator.canShare?.({files:[file]}))await navigator.share({title:"Who’s the Bot?",files:[file]});
      else{
        const link=document.createElement("a");link.href=url;link.download=filename;link.click();
        setNotice("Your card is ready to save.");
      }
    }catch(error){if(!(error instanceof DOMException && error.name==="AbortError"))setNotice("Could not export the card. Try again.");}
    finally{setBusy(false);}
  }
  return <section className="leaderboard-screen">
    <div className="eyebrow">{t("THREE ROUNDS LATER")}</div><Trophy className="leaderboard-trophy" size={48}/>
    <h1 className="screen-heading">{t("Final leaderboard")}</h1>
    <p className="screen-subtitle">{practice?t("Practice · no points"):t("Good instincts. Questionable friends.")}</p>
    {preview && <div className="inline-notice">{t("Scripted developer results. No real AI was called.")}</div>}
    <ol className="leaderboard-list">{rows.map(player=><li key={player.id} className={player.me?"leaderboard-me":""}>
      <span className="leaderboard-rank">{player.rank}</span><Avatar player={player} size="large"/>
      <div className="leaderboard-person"><strong>{player.name} {player.me && <span className="you-badge">{t("YOU")}</span>}</strong><span>{t("Bots found: {0}/3",{0:player.found})}</span></div>
      <strong className="leaderboard-points">{practice?"—":player.score}<small>{practice?t("Practice"):t("points")}</small></strong>
    </li>)}</ol>
    <div className="result-actions"><button className="button button-primary" disabled={busy} onClick={()=>void exportCard(true)}><Share2 size={18}/>{t("Share my result")}</button><button className="button button-secondary" disabled={busy} onClick={()=>void exportCard(false)}><Download size={18}/>{t("Download PNG")}</button><Link href="/" className="button button-secondary">{t("Play again")}</Link></div>
    <p className="small-label mt-6">{t("The card contains only anonymous names and results. No chat messages or room code.")}</p>
    {notice && <p className="inline-notice" role="status">{t(notice)}</p>}
    {cardUrl && <figure className="result-card-preview"><img src={cardUrl} alt={t("Your result card")} width={1080} height={1200}/><figcaption><a className="button button-secondary" download={"whos-the-bot-"+locale+".png"} href={cardUrl}>{t("Save image")}</a></figcaption></figure>}
  </section>;
}
