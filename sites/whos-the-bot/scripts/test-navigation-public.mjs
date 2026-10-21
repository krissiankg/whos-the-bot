import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL || "https://whos-the-bot.grassyhake7.chatgpt.site";
for (const locale of ["fr", "en"]) {
  for (const path of ["/", "/admin", "/how-to-play", "/privacy", "/room/ZZZZ"]) {
    const response = await fetch(new URL(path, base), {
      headers: { cookie: `wtb_language=${locale}`, accept: "text/html" },
      signal: AbortSignal.timeout(45000),
    });
    assert.equal(response.status, 200, `${path}: document must load`);
    const html = await response.text();
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    const home = anchors.filter(([, attrs]) => /\bhref="\/"/.test(attrs));
    assert.ok(home.length > 0, `${path}: native home destination must be present`);
    if (path === "/" || path.startsWith("/room/")) {
      const rules = anchors.filter(([, attrs]) => /\bhref="[/]how-to-play"/.test(attrs));
      assert.equal(rules.length, 2, "Header and footer must both link to the rules");
      for (const [, , body] of rules) assert.match(body, locale === "fr" ? /Comment jouer/ : /How to play/);
    }
    if (path === "/" || path === "/admin") {
      assert.ok(home.some(([, attrs, body]) => /class="brand"/.test(attrs) && /brand-mark/.test(body) && /who.s the bot/.test(body)), "Logo and name must be in the same home anchor");
    }
    if (path === "/admin") {
      assert.ok(home.some(([, attrs, body]) => /class="back-button"/.test(attrs) && /Retour au jeu|Back to the game/.test(body)), "Admin back button must point to the homepage");
    }
    console.log(`${locale} ${path}: document and home links OK`);
  }
}
console.log("Navigation HTTP checks passed (not a browser click test).");
