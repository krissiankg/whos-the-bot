"use client";
import { readJsonObject } from "@/lib/wire-json";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, LogOut, PlugZap, Save, ScanEye, ShieldCheck } from "lucide-react";
import { ADMIN_ERRORS, type AdminStatus, type ProviderName } from "@/lib/admin";
import { LanguageSwitcher, useLanguage } from "./language-provider";

import { HomeLink } from "@/components/home-link";
const labels={nvidia:"NVIDIA Build",openai:"OpenAI"};
const defaultModels={nvidia:"nvidia/nemotron-3.5-lightning-30b-a3b",openai:"gpt-4.1-mini-2025-04-14"};
type Confirmation={kind:"activate"|"test";provider:ProviderName};

export function AdminDashboard(){
  const { locale, t } = useLanguage();
  const [state,setState]=useState<AdminStatus|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [setupCode,setSetupCode]=useState("");
  const [password,setPassword]=useState(""),[repeatPassword,setRepeatPassword]=useState("");
  const [keys,setKeys]=useState({nvidia:"",openai:""});
  const [models,setModels]=useState(defaultModels);
  const [visible,setVisible]=useState({nvidia:false,openai:false});
  const [confirmation,setConfirmation]=useState<Confirmation|null>(null),[acknowledged,setAcknowledged]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const authenticated=Boolean(state?.authenticated);
  const firstSetup=state && !state.initialized;

  async function refresh(){
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/admin",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(45000)});
      const data=await readJsonObject<AdminStatus & {error?:string}>(response);
      if(!response.ok)throw new Error(ADMIN_ERRORS[data.error || "ADMIN_UNAVAILABLE"] || ADMIN_ERRORS.ADMIN_UNAVAILABLE);
      setState(data);
      if(data.providers)setModels(Object.fromEntries(data.providers.map((p:{provider:string;model:string})=>[p.provider,p.model])) as typeof defaultModels);
    }catch(caught){setError(caught instanceof Error && Object.values(ADMIN_ERRORS).includes(caught.message)?caught.message:ADMIN_ERRORS.ADMIN_UNAVAILABLE);}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    const code=new URLSearchParams(window.location.hash.slice(1)).get("setup");
    if(code && /^[a-f0-9]{64}$/.test(code))setSetupCode(code);
    // A fragment never reaches HTTP logs; remove it immediately from the UI.
    if(window.location.hash)window.history.replaceState(null,"",window.location.pathname);
    void refresh();
  },[]);
  useEffect(()=>{
    if(confirmation){setAcknowledged(false);dialog.current?.showModal();}
    else dialog.current?.close();
  },[confirmation]);

  async function action(name:string,args:Record<string,unknown>={},provider?:ProviderName){
    if(busy)return false;
    setBusy(`${name}-${provider || "owner"}`);setError("");setNotice("");
    try{
      const response=await fetch("/api/admin",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:name,args}),signal:AbortSignal.timeout(45000)});
      const data=await readJsonObject<AdminStatus & {error?:string}>(response);
      if(!response.ok){
        if(response.status===401 && name!=="login")setState(previous=>previous?{...previous,authenticated:false}:null);
        throw new Error(ADMIN_ERRORS[data.error || "ADMIN_UNAVAILABLE"] || ADMIN_ERRORS.ADMIN_UNAVAILABLE);
      }
      if(name==="logout"){
        setState(previous=>previous?{...previous,authenticated:false}:null);setKeys({nvidia:"",openai:""});setPassword("");return true;
      }
      setState({...data,authenticated:true});
      if(name==="setup" || name==="login"){setPassword("");setRepeatPassword("");setSetupCode("");setNotice(t("Bienvenue dans ton espace administrateur."));}
      if(name==="save" && provider){setKeys(previous=>({...previous,[provider]:""}));setVisible(previous=>({...previous,[provider]:false}));setNotice(t("{0} : configuration enregistrée. L’autre fournisseur est conservé.", {"0": labels[provider]}));}
      if(name==="activate")setNotice(args.provider==="disabled"?t("L’IA est désactivée. Les clés restent enregistrées."):t("{0} est sélectionné. Aucun repli automatique vers l’autre fournisseur.", {"0": labels[args.provider as ProviderName]}));
      if(name==="test"){
        setNotice(data.testResult?.ok?t("Connexion réussie : le modèle a répondu."):"");
        if(!data.testResult?.ok)setError(data.testResult?.reason==="quota"?t("Le fournisseur refuse l’appel : quota ou crédits à vérifier."):data.testResult?.reason==="credentials"?t("Le fournisseur refuse la clé ou l’accès à ce modèle."):t("Le test a échoué. Vérifie la clé, l’accès au modèle et la disponibilité du fournisseur."));
      }
      setConfirmation(null);return true;
    }catch(caught){setError(caught instanceof Error && Object.values(ADMIN_ERRORS).includes(caught.message)?caught.message:ADMIN_ERRORS.ADMIN_UNAVAILABLE);return false;}
    finally{setBusy("");}
  }
  async function authenticate(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(firstSetup && password!==repeatPassword){setError(t("Les deux mots de passe ne correspondent pas."));return;}
    await action(firstSetup?"setup":"login",{password,...(firstSetup?{setupCode}:{})});
  }
  async function confirm(){
    if(!confirmation || !acknowledged)return;
    await action(confirmation.kind,{provider:confirmation.provider,...(confirmation.kind==="activate"?{confirmTrial:true,confirmCosts:true}:{})},confirmation.provider);
  }
  const active=state?.effectiveProvider;
  return <div className="app-shell admin-shell">
    <header className="site-header"><HomeLink className="brand"><span className="brand-mark"><ScanEye size={23}/></span>who’s the bot<span className="accent-text">?</span></HomeLink><LanguageSwitcher /><span className="admin-header-badge"><LockKeyhole size={14}/> {t("Administration privée")}</span>{authenticated && <button className="button button-secondary" disabled={Boolean(busy)} onClick={()=>void action("logout")}><LogOut size={15}/> {t("Déconnexion")}</button>}</header>
    <main className="page-content admin-main"><HomeLink className="back-button"><ArrowLeft size={16}/> {t("Retour au jeu")}</HomeLink>
      <div className="admin-heading"><div><div className="eyebrow">{t("LES COULISSES DU JEU")}</div><h1 className="screen-heading">{t("Ton jeu. Tes réglages.")}</h1><p className="screen-subtitle">{t("NVIDIA aujourd’hui. OpenAI quand tu veux. Les deux clés peuvent rester enregistrées.")}</p></div><ShieldCheck size={40} className="accent-text"/></div>
      {error && <div className="inline-notice notice-warning admin-feedback" role="alert">{t(error)}</div>}
      {notice && <div className="inline-notice admin-feedback" role="status"><Check size={18}/>{t(notice)}</div>}
      {loading?<div className="panel live-empty" role="status"><LoaderCircle className="loading-icon"/><p>{t("Ouverture de ton espace sécurisé…")}</p></div>:!state?<div className="panel live-empty"><p>{t("L’administration n’est pas encore accessible.")}</p><button className="button button-secondary" onClick={()=>void refresh()}>{t("Réessayer")}</button></div>:!authenticated?<section className="panel admin-auth">
        <span className="admin-lock"><KeyRound size={28}/></span><h2>{firstSetup?t("Choisis ton mot de passe administrateur."):t("Bienvenue dans les coulisses.")}</h2>
        <p>{firstSetup?t("Une seule configuration initiale. Aucun compte ni e-mail ne sera demandé aux joueurs."):t("Connecte-toi pour gérer tes fournisseurs et tes clés. Ce mot de passe est distinct de tes comptes NVIDIA, OpenAI et Supabase.")}</p>
        {firstSetup && !setupCode && <div className="inline-notice notice-warning">{t("Ouvre le lien privé d’installation pour définir ton mot de passe. Il est à usage unique et ne doit pas être partagé.")}</div>}
        <form onSubmit={authenticate}><label htmlFor="admin-password">{firstSetup?t("Nouveau mot de passe"):t("Mot de passe administrateur")}</label><input id="admin-password" type="password" value={password} minLength={12} maxLength={128} required autoComplete={firstSetup?"new-password":"current-password"} onChange={event=>setPassword(event.target.value)} disabled={Boolean(busy)}/>
          {firstSetup && <><label htmlFor="admin-password-repeat">{t("Confirmer le mot de passe")}</label><input id="admin-password-repeat" type="password" value={repeatPassword} minLength={12} maxLength={128} required autoComplete="new-password" onChange={event=>setRepeatPassword(event.target.value)} disabled={Boolean(busy)}/></>}
          <p className="small-label">{t("Au moins 12 caractères. Ne saisis pas une clé API dans ce champ.")}</p><button className="button button-primary" disabled={Boolean(busy) || Boolean(firstSetup && !setupCode)}>{busy?<LoaderCircle className="loading-icon" size={18}/>:<LockKeyhole size={17}/>} {firstSetup?t("Créer mon accès privé"):t("Se connecter")}</button></form>
      </section>:<>
        <section className="admin-stats" aria-label={t("État du jeu")}><div className="panel"><span className="section-label">{t("FOURNISSEUR SÉLECTIONNÉ")}</span><strong>{active?labels[active]:t("IA désactivée")}</strong><span className="small-label">{state.activeProvider==="environment"?t("Réglages serveur existants"):t("Choix explicite — aucun repli automatique")}</span></div><div className="panel"><span className="section-label">{t("APPELS RÉSERVÉS")}</span><strong>{state.usage?.reservedCalls || 0} <small>/ 200</small></strong><span className="small-label">{t("Fenêtre de 24 h · tests inclus · maximum 6 par manche")}</span></div><div className="panel"><span className="section-label">{t("SALONS EN PARTIE")}</span><strong>{state.usage?.activeRooms || 0}</strong><span className="small-label">{t("Sans accès aux discussions privées")}</span></div></section>
        <div className="admin-provider-grid">{(["nvidia","openai"] as ProviderName[]).map(provider=>{
          const item=state.providers.find(p=>p.provider===provider)!;
          const hasKey=item.saved || item.environmentConfigured;
          const unsaved=Boolean(keys[provider].trim()) || models[provider]!==item.model;
          const isActive=active===provider;
          return <section className={`panel admin-provider ${isActive?"admin-provider-active":""}`} key={provider} aria-labelledby={`${provider}-heading`}>
            <div className="admin-provider-heading"><span className={`admin-provider-icon ${provider}`}>{provider==="nvidia"?"NV":"AI"}</span><div><h2 id={`${provider}-heading`}>{labels[provider]}</h2><span className="small-label">{provider==="nvidia"?t("Prototypage et essais NVIDIA Build"):t("Alternative API à activer quand tu le souhaites")}</span></div>{isActive && <span className="you-badge">{t("SÉLECTIONNÉ")}</span>}</div>
            <p className="admin-provider-description">{provider==="nvidia"?t("Une clé NVIDIA suffit. Aucun compte OpenAI nécessaire. L’offre d’essai gratuite est réservée aux tests internes, pas à la production."):t("Tu peux enregistrer ta clé maintenant et rester sur NVIDIA. L’activation d’OpenAI est volontaire ; ses appels peuvent être payants.")}</p>
            <div className={`admin-key-state ${hasKey?"configured":""}`}><LockKeyhole size={15}/>{item.saved?t("Clé enregistrée dans le coffre chiffré"):item.environmentConfigured?t("Clé déjà présente dans les secrets serveur"):t("Aucune clé enregistrée")}</div>
            <form onSubmit={event=>{event.preventDefault();void action("save",{provider,apiKey:keys[provider],model:models[provider]},provider);}}>
              <label htmlFor={`${provider}-key`}>{hasKey?t("Remplacer la clé (facultatif)"):t("Clé API {0}", {"0": labels[provider]})}</label><div className="admin-key-input"><input id={`${provider}-key`} type={visible[provider]?"text":"password"} value={keys[provider]} autoComplete="off" spellCheck={false} maxLength={512} placeholder={hasKey?t("Laisser vide pour conserver la clé actuelle"):provider==="nvidia"?"nvapi-…":"sk-…"} disabled={Boolean(busy)} onChange={event=>setKeys(previous=>({...previous,[provider]:event.target.value}))}/><button type="button" aria-label={visible[provider]?t("Masquer la clé saisie"):t("Afficher la clé saisie")} onClick={()=>setVisible(previous=>({...previous,[provider]:!previous[provider]}))}>{visible[provider]?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
              <p className="small-label">{t("La clé déjà enregistrée n’est jamais réaffichée. Sauvegarder ici ne supprime pas celle de l’autre fournisseur.")}</p>
              <label htmlFor={`${provider}-model`}>{t("Modèle")}</label><select id={`${provider}-model`} value={models[provider]} disabled={Boolean(busy)} onChange={event=>setModels(previous=>({...previous,[provider]:event.target.value}))}>{provider==="nvidia"?<option value={defaultModels.nvidia}>Nemotron 3.5 Lightning 30B-A3B</option>:<><option value="gpt-4.1-mini-2025-04-14">{t("GPT-4.1 mini · version fixe")}</option><option value="gpt-4.1-mini">GPT-4.1 mini</option></>}</select>
              <div className="admin-provider-actions"><button className="button button-secondary" type="submit" disabled={Boolean(busy)}>{busy===`save-${provider}`?<LoaderCircle className="loading-icon" size={16}/>:<Save size={16}/>} {t("Enregistrer")}</button><button className="button button-secondary" type="button" disabled={Boolean(busy) || !hasKey || unsaved} onClick={()=>setConfirmation({kind:"test",provider})}><PlugZap size={16}/> {t("Tester la connexion")}</button></div>
            </form>
            {unsaved && <p className="small-label admin-unsaved">{t("Enregistre les modifications avant de tester ou d’activer.")}</p>}
            {item.lastTestAt && <p className={`admin-test-result ${item.lastTestOk?"success":"failure"}`}>{item.lastTestOk?t("✓ Le modèle a répondu au dernier test."):t("Le dernier test a échoué : clé, accès ou quota à vérifier.")} <time dateTime={item.lastTestAt}>{new Date(item.lastTestAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")}</time></p>}
            <button className={`button ${isActive?"button-secondary":"button-primary"} start-button`} disabled={Boolean(busy) || !hasKey || unsaved || isActive} onClick={()=>setConfirmation({kind:"activate",provider})}>{isActive?t("Fournisseur sélectionné"):t("Utiliser {0}", {"0": labels[provider]})} {!isActive && <ChevronRight size={17}/>}</button>
            <a href={provider==="nvidia"?"https://build.nvidia.com/settings/api-keys":"https://platform.openai.com/api-keys"} target="_blank" rel="noreferrer" className="text-link admin-help-link">{t("Obtenir une clé")} {labels[provider]} ↗</a>
          </section>;
        })}</div>
        <section className="panel admin-security-note"><ShieldCheck size={24}/><div><h2>{t("Les clés restent dans les coulisses.")}</h2><p>{t("Chiffrement dans Supabase Vault, session administrateur limitée à huit heures et aucune clé renvoyée aux joueurs. Un test effectue un appel au modèle et peut consommer des crédits. Le fournisseur ne change jamais automatiquement après une erreur.")}</p><p>{t("Besoin d’arrêter les appels ? Les clés peuvent rester enregistrées.")}</p><button className="button button-secondary" disabled={Boolean(busy) || state.activeProvider==="disabled"} onClick={()=>void action("activate",{provider:"disabled"})}>{t("Désactiver l’IA sans effacer les clés")}</button></div></section>
      </>}
    </main>
    <footer className="site-footer"><span className="small-label">{t("Administration du propriétaire · aucun compte requis pour les joueurs")}</span><a href="/privacy" className="text-link">{t("Confidentialité")}</a></footer>
    <dialog ref={dialog} className="modal native-dialog admin-confirm" onCancel={event=>{if(busy)event.preventDefault();else setConfirmation(null);}} onClose={()=>setConfirmation(null)} aria-labelledby="admin-confirm-title"><h2 id="admin-confirm-title">{confirmation?.kind==="test"?t("Tester la connexion ?"):t("Utiliser {0} ?", {"0": confirmation?labels[confirmation.provider]:"ce fournisseur"})}</h2><p>{confirmation?.kind==="test"?t("Ce bouton envoie un court message de test au modèle. Il peut consommer un appel, des crédits ou un coût API. Aucune clé ni réponse de diagnostic ne sera rendue publique."):confirmation?.provider==="nvidia"?t("L’offre NVIDIA Build gratuite est réservée aux essais et évaluations internes, pas à la production. Il faudra une autorisation ou une offre adaptée avant la publication publique du jeu."):t("OpenAI deviendra le fournisseur utilisé pour les prochains appels. Ces appels peuvent être payants. La clé NVIDIA restera enregistrée.")}</p><label className="practice-toggle"><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/> {t("J’ai compris et je confirme ce choix.")}</label><button className="button button-primary" disabled={!acknowledged || Boolean(busy)} onClick={()=>void confirm()}>{busy?t("Vérification…"):t("Confirmer")}</button><button className="button button-secondary" disabled={Boolean(busy)} onClick={()=>setConfirmation(null)}>{t("Annuler")}</button>{error && <p className="field-error" role="alert">{t(error)}</p>}</dialog>
  </div>;
}
