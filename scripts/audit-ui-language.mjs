import ts from "typescript";
import { readFile } from "node:fs/promises";
const files=["src/components/game-preview.tsx","src/components/live-lobby.tsx","src/components/live-round.tsx","src/components/admin-dashboard.tsx","src/app/how-to-play/page.tsx","src/app/privacy/page.tsx"];
for(const file of files){
  const tree=ts.createSourceFile(file,await readFile(file,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const values=new Set();
  function visit(node){
    if(ts.isCallExpression(node) && node.expression.getText(tree)==="t")return;
    if(ts.isJsxText(node)){const text=node.text.replace(/\s+/g," ").trim();if(/[a-zÀ-ÿ]{2}/i.test(text))values.add(text);}
    if(ts.isStringLiteral(node) && /\s/.test(node.text) && /[a-zÀ-ÿ]{3}/i.test(node.text) && !node.text.includes("-") && !ts.isImportDeclaration(node.parent) && !(ts.isJsxAttribute(node.parent) && !["title","placeholder","aria-label"].includes(node.parent.name.getText(tree))))values.add(node.text);
    if(ts.isTemplateExpression(node) && /[a-zÀ-ÿ]{2}\s|\s[a-zÀ-ÿ]{2}/i.test(node.getText(tree)))values.add(node.getText(tree));
    ts.forEachChild(node,visit);
  }visit(tree);console.log(file,JSON.stringify([...values],null,2));
}
