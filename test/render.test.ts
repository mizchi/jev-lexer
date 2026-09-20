import { test } from "node:test";
import assert from "node:assert/strict";
import githubDark from "@shikijs/themes/github-dark";
import { codeToHtml as shikiCodeToHtml } from "shiki";
import { tokensToAnsi } from "../src/ansi.ts";
import { tokensToHtml } from "../src/html.ts";
import { codeToHtml, codeToTokens, codeToAnsi } from "../src/index.ts";
import type { AskClient, Spend } from "../src/jev.ts";
import { resolveTheme, toThemedTokens } from "../src/tokens.ts";

const theme = resolveTheme(githubDark);
const spend0: Spend = { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0, retried: 0, rateLimited: 0, tokensPerSecond: 0, splits: 0, usd: 0 };
const table: Record<string, string> = { const: "keyword", "=": "operator", "42": "number", ";": "operator", "/": "comment", hi: "comment", answer: "plain" };
const client: AskClient = {
  model: "fake", servedModel: null, spent: spend0,
  async askSplitting(_s, qs) {
    return { answers: Object.fromEntries(Object.entries(qs).map(([id, q]) => [id, { type: "choice", choice: table[String(q.instructions.text)] ?? "plain", confidence: 1 }])) };
  },
};

const code = "const answer = 42; // hi\n";

test("html has shiki's structure and, for these tokens, shiki's colours", async () => {
  const ours = await codeToHtml(code, { client, theme: githubDark });
  const ref = await shikiCodeToHtml(code, { lang: "ts", theme: "github-dark" });
  const head = (html: string) => html.slice(0, html.indexOf("<span style"));
  assert.equal(head(ours), head(ref)); // <pre class="shiki github-dark" style=... tabindex="0"><code><span class="line">
  assert.ok(ours.includes('<span class="line">'));
  assert.ok(ours.endsWith("</code></pre>"));
  const colorOf = (html: string, text: string) => new RegExp(`<span style="color:(#[0-9A-F]+)">${text}</span>`, "i").exec(html)?.[1]?.toUpperCase();
  assert.equal(colorOf(ours, "const"), colorOf(ref, "const"));
  assert.equal(colorOf(ours, "// hi"), colorOf(ref, "// hi"));
});

test("tokens API returns lines like shiki", async () => {
  const lines = await codeToTokens(code, { client, theme: githubDark });
  assert.equal(lines.length, 2);
  assert.equal(lines[0]![0]!.content, "const");
});

test("ansi wraps each token in a truecolor sequence and resets per line", async () => {
  const out = await codeToAnsi("a\nb", { client, theme: githubDark });
  const lines = out.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^\x1b\[38;2;\d+;\d+;\d+ma\x1b\[0m$/);
});

test("tokensToHtml and tokensToAnsi accept prebuilt tokens", () => {
  const tokens = toThemedTokens("x", [{ type: "keyword", start: 0, end: 1, confidence: 1 }], theme);
  assert.ok(tokensToHtml(tokens, theme).includes(">x</span>"));
  assert.ok(tokensToAnsi(tokens).includes("x"));
});
