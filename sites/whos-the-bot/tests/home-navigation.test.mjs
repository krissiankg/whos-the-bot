import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = await readFile(new URL("../components/home-link.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText.replaceAll("react/jsx-runtime", import.meta.resolve("react/jsx-runtime"));
const { HomeLink } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("home link renders a native anchor, preserving styling and accessible text in both languages", () => {
  for (const label of ["Retour au jeu", "Back to the game"]) {
    const html = renderToStaticMarkup(createElement(HomeLink, { className: "brand", "aria-label": label }, label));
    assert.equal(html, `<a class="brand" aria-label="${label}" href="/">${label}</a>`);
  }
  assert.doesNotMatch(source, /next[/]link|next[/]navigation|preventDefault|window[.]/);
});

const screens = {
  "components/admin-dashboard.tsx": 2,
  "components/game-preview.tsx": 1,
  "components/live-lobby.tsx": 2,
  "components/live-round.tsx": 1,
  "components/leaderboard.tsx": 1,
  "components/unavailable-room.tsx": 1,
  "app/how-to-play/page.tsx": 2,
  "app/privacy/page.tsx": 1,
  "app/not-found.tsx": 1,
};

for (const [file, expected] of Object.entries(screens)) {
  test(`${file}: home controls use document navigation, including same-path game screens`, async () => {
    const text = await readFile(new URL("../" + file, import.meta.url), "utf8");
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let count = 0;
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(ast);
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const attr = name => attrs.find(a => a.name.getText(ast) === name);
        const href = attr("href")?.initializer;
        assert.ok(!(tag === "Link" && href && ts.isStringLiteral(href) && href.text === "/"), "Home must not be intercepted by the client router");
        if (attr("className")?.initializer?.text === "brand") assert.equal(tag, "HomeLink", "Logo and game name must share the home link");
        if (tag === "HomeLink") {
          count++;
          for (const forbidden of ["href", "onClick", "target"]) assert.equal(attr(forbidden), undefined, `${forbidden} must not override home navigation`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(count, expected);
  });
}
