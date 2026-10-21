// Mechanical migration of known display expressions, never stored player IDs.
import {readFile,writeFile} from "node:fs/promises";
const files=["src/components/game-preview.tsx","src/components/live-lobby.tsx","src/components/live-round.tsx","src/components/admin-dashboard.tsx","src/app/how-to-play/page.tsx","src/app/privacy/page.tsx"];
for(const file of files){
  let source=await readFile(file,"utf8");
  if(file.includes("live-lobby"))source=source.replace('className="header-actions">','className="header-actions"><LanguageSwitcher />');
  if(file.includes("admin-dashboard"))source=source.replace('<span className="admin-header-badge">','<LanguageSwitcher /><span className="admin-header-badge">').replace('toLocaleString("fr-FR")','toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")');
  if(file.includes("page.tsx"))source=source.replace('<Link className="text-link" href="/">','<div className="document-toolbar"><LanguageSwitcher /><Link className="text-link" href="/">').replace('Back to the game")}</Link>','Back to the game")}</Link></div>');
  for(const key of ["error","notice","notification","liveError","joinError","messageError","toast"]) {
    source=source.replaceAll(`{${key}}`,`{t(${key})}`);
  }
  if(file.includes("game-preview")){
    source=source.replaceAll('{title}</h2>','{t(title)}</h2>').replaceAll('{text}</p>','{t(text)}</p>').replaceAll('{time}</span>','{t(time)}</span>');
    source=source.replace('{target}</button>','{t(`phase.${target}`)}</button>');
    source=source.replace('{TOPIC}','{translate(gameLanguage, TOPIC)}');
    source=source.replace('{message.text}</div>','{message.id.startsWith("seed-") || message.id.startsWith("script-") ? translate(gameLanguage, message.text) : message.text}</div>');
    source=source.replace('{message.time}</span>','{message.time === "now" ? t("Just now") : message.time}</span>');
    source=source.replace('["very convincing", "a little too chill", "definitely maybe"][index]','["very convincing", "a little too chill", "definitely maybe"][index]');
    source=source.replace('[t("very convincing"), t("a little too chill"), t("definitely maybe")][index]','[t("very convincing"), t("a little too chill"), t("definitely maybe")][index]');
  }
  // Canonical names may be French or English depending on the room; render
  // their equivalent in the viewer’s interface language without touching IDs.
  if(!file.includes("admin-dashboard") && !file.includes("page.tsx")){
    const fn=file.includes("live-lobby")?"displayName":"name";
    source=source.replace(/\b(modal\.player|player|author|bot|voter|target|votedFor|LOCAL_PLAYER|PREVIEW_BOT)\.name\b/g,`$FN($& )`.replace("$FN",fn));
    source=source.replace('confirm?.name || "this player"',`confirm ? ${fn}(confirm.name) : t("this player")`);
  }
  source=source.replace('{find(vote.voterId)?.name}','{name(find(vote.voterId)?.name || "")}').replace('{find(vote.targetId)?.name || t("Abstained")}','{vote.targetId ? name(find(vote.targetId)?.name || "") : t("Abstained")}');
  await writeFile(file,source);
}
