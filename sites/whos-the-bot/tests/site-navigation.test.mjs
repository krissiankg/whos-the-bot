import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(e => e.isDirectory()
    ? files(new URL(e.name + "/", dir))
    : /[.](tsx?|jsx?)$/.test(e.name) ? [new URL(e.name, dir)] : []));
  return groups.flat();
}

test("all site screens avoid the incompatible client Link router", async () => {
  for (const dir of ["../app/", "../components/"]) {
    for (const file of await files(new URL(dir, import.meta.url))) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /from\s+["']next[/](?:link|router)["']/, file.pathname);
    }
  }
});

for (const [file, destinations] of Object.entries({
  "components/game-preview.tsx": { "/how-to-play": 2, "/privacy": 2, "/admin": 1, "/?dev=1": 1 },
  "components/live-lobby.tsx": { "/how-to-play": 2, "/privacy": 1, "/admin": 1, dynamic: 1 },
  "components/admin-dashboard.tsx": { "/privacy": 1, dynamic: 1 },
})) {
  test(file + ": rules and other navigation use native links with unchanged destinations", async () => {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const counts = {};
    function visit(node) {
      if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "a") {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const href = attrs.find(a => a.name.getText(ast) === "href")?.initializer;
        assert.ok(href, "Navigation must have a browser destination");
        const key = ts.isStringLiteral(href) ? href.text : "dynamic";
        counts[key] = (counts[key] || 0) + 1;
        assert.ok(!attrs.some(a => a.name.getText(ast) === "onClick"), "Do not cancel document navigation");
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.deepEqual(counts, destinations);
  });
}
