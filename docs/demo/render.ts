/**
 * The README picture: eval/corpus/ts/session.ts highlighted by Shiki
 * with the language known, and by jev-lexer with nothing but the text,
 * side by side. jev-lexer's labels come from eval/baseline.json (bare
 * arm), so this needs no key and draws exactly what the numbers score.
 *
 *   node --experimental-strip-types docs/demo/render.ts
 *   → docs/demo/session-ts.html, docs/demo/session-ts.png
 */
import { readFile, writeFile } from "node:fs/promises";
import githubDark from "@shikijs/themes/github-dark";
import { chromium } from "playwright";
import { codeToHtml as shikiCodeToHtml } from "shiki";
import { BASELINE, type Recording } from "../../eval/run.ts";
import { mergeSpans } from "../../src/merge.ts";
import { splitParts } from "../../src/split.ts";
import { resolveTheme, toThemedTokens } from "../../src/tokens.ts";
import { tokensToHtml } from "../../src/html.ts";

const FILE = "ts/session.ts";
const LINES = 34; // enough to show a doc comment, a regexp, a template literal and a class

const here = new URL("./", import.meta.url);
const code = (await readFile(new URL(`../../eval/corpus/${FILE}`, import.meta.url), "utf8"))
  .split("\n").slice(0, LINES).join("\n") + "\n";
const rec = JSON.parse(await readFile(BASELINE, "utf8")) as Recording;
const full = (await readFile(new URL(`../../eval/corpus/${FILE}`, import.meta.url), "utf8"));
const parts = splitParts(full);
const labels = rec.labels.bare[FILE]!.map((t, i) => (t ? { type: t, confidence: 1 } : null));
const spans = mergeSpans(parts, labels).filter((s) => s.start < code.length).map((s) => ({ ...s, end: Math.min(s.end, code.length) }));
const theme = resolveTheme(githubDark);

const ours = tokensToHtml(toThemedTokens(code, spans, theme), theme);
const ref = await shikiCodeToHtml(code, { lang: "ts", theme: "github-dark" });

const html = `<!doctype html><meta charset="utf-8"><title>jev-lexer demo</title>
<style>
  body { margin: 0; background: #0d1117; color: #e1e4e8; font-family: ui-sans-serif, system-ui, sans-serif; }
  .wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 20px; width: 1400px; box-sizing: border-box; }
  h2 { font-size: 14px; font-weight: 600; margin: 0 0 8px; color: #8b949e; letter-spacing: .02em; }
  h2 b { color: #e1e4e8; }
  pre.shiki { margin: 0; padding: 14px 16px; border-radius: 8px; font: 12.5px/1.55 ui-monospace, "SF Mono", Menlo, monospace; white-space: pre-wrap; word-break: break-all; }
</style>
<div class="wrap">
  <section><h2><b>Shiki</b> · github-dark · lang: ts</h2>${ref}</section>
  <section><h2><b>jev-lexer</b> · github-dark · no language, no file name (${rec.model})</h2>${ours}</section>
</div>`;
await writeFile(new URL("session-ts.html", here), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 });
await page.setContent(html);
const wrap = page.locator(".wrap");
await wrap.screenshot({ path: new URL("session-ts.png", here).pathname });
await browser.close();
console.log("wrote docs/demo/session-ts.png");
