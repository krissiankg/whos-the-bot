// One-time mechanical catalog migration. Only known phrases are rewritten;
// identifiers, routes, CSS classes and live user content are never translated.
import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";
import { french, english } from "../src/lib/translations.mjs";

const known = new Set([...Object.keys(french), ...Object.keys(english)]);
const files = ["src/components/game-preview.tsx", "src/components/live-lobby.tsx", "src/components/live-round.tsx", "src/components/admin-dashboard.tsx", "src/app/how-to-play/page.tsx", "src/app/privacy/page.tsx"];
for (const file of files) {
  let source = await readFile(file, "utf8");
  const updates = [
    ["French and scoring follow the playable core.", "Scores follow the playable core."],
    ["French, scoring, and rounds follow the playable core.", "Scores follow the playable core."],
    ["Three minutes. One hidden AI. A private vote, then the reveal. Scoring and French follow next.", "Three minutes. One hidden AI. A private vote, then the reveal. Scores and three-round games follow next."],
    ["This milestone plays one round. Scores, three rounds and French are next.", "This milestone plays one round. Scores and three-round games are next."],
    ["Scores, French, three-round games, and result cards are next.", "Scores, three-round games, and result cards are next."],
  ];
  for (const [before,after] of updates) source=source.replaceAll(before,after);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    const start = node.getStart(tree);
    if (ts.isJsxText(node)) {
      const raw = node.getFullText(tree);
      const text = raw.replace(/\s+/g, " ").trim();
      if (known.has(text)) {
        const leading = /^\s/.test(raw) ? " " : "";
        const trailing = /\s$/.test(raw) ? " " : "";
        edits.push([node.pos, node.end, `${leading}{t(${JSON.stringify(text)})}${trailing}`]);
      }
      return;
    }
    if (ts.isStringLiteral(node) && known.has(node.text)) {
      const call = `t(${JSON.stringify(node.text)})`;
      edits.push([start,node.end,ts.isJsxAttribute(node.parent) ? `{${call}}` : call]);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      let key = node.head.text;
      node.templateSpans.forEach((span,i) => { key += `{${i}}${span.literal.text}`; });
      if (known.has(key)) {
        const values = node.templateSpans.map((span,i) => `${JSON.stringify(String(i))}: ${span.expression.getText(tree)}`);
        edits.push([start,node.end,`t(${JSON.stringify(key)}, {${values.join(", ")}})`]);
        return;
      }
    }
    // Already-localized expressions must not be wrapped a second time.
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "t") return;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const [start,end,text] of edits.sort((a,b)=>b[0]-a[0])) source=source.slice(0,start)+text+source.slice(end);
  await writeFile(file,source);
  console.log(`${file}: ${edits.length} localized phrases`);
}
