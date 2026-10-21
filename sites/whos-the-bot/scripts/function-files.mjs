// MCP deployment input builder. No secrets are read or written by this helper.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export async function functionFiles(name) {
  if(!["game-lobby","game-bot","game-admin"].includes(name)) throw new Error("Unknown function");
  const files=[
    {name:`${name}/index.ts`,content:await readFile(path.join(root,"supabase/functions",name,"index.ts"),"utf8")},
    {name:"_shared/bot-provider.mjs",content:await readFile(path.join(root,"supabase/functions/_shared/bot-provider.mjs"),"utf8")},
    {name:"_shared/provider-runtime.mjs",content:await readFile(path.join(root,"supabase/functions/_shared/provider-runtime.mjs"),"utf8")},
  ];
  if(name==="game-bot") {
    const prompt=await readFile(path.join(root,"prompts/hidden-player.system.md"),"utf8");
    if(prompt.length<100 || prompt.length>4000) throw new Error("Invalid system prompt length");
    files.push({name:`${name}/system-prompt.ts`,content:`export const systemPrompt = ${JSON.stringify(prompt)};\n`});
    files.push({name:`${name}/policy.mjs`,content:await readFile(path.join(root,"supabase/functions/game-bot/policy.mjs"),"utf8")});
  }
  if(name==="game-admin") files.push({name:"game-bot/policy.mjs",content:await readFile(path.join(root,"supabase/functions/game-bot/policy.mjs"),"utf8")});
  return files;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(await functionFiles(process.argv[2])));

