import { test } from "node:test";
import assert from "node:assert/strict";
import githubDark from "@shikijs/themes/github-dark";
import { codeToTokens as shikiCodeToTokens } from "shiki";
import type { Span } from "../src/merge.ts";
import { colorFor, resolveTheme, toThemedTokens } from "../src/tokens.ts";

const theme = resolveTheme(githubDark);

test("colours come from the theme's tokenColors by longest scope prefix", async () => {
  // Ask shiki what colour it gives each scope in this theme, then check ours agrees.
  const ref = await shikiCodeToTokens("const answer = 42; // hi\n'str'", { lang: "ts", theme: "github-dark" });
  const color = (content: string) => ref.tokens.flat().find((t) => t.content.trim() === content)!.color!.toUpperCase();
  assert.equal(colorFor(theme, "keyword"), color("const"));
  assert.equal(colorFor(theme, "number"), color("42"));
  assert.equal(colorFor(theme, "comment"), color("// hi"));
  assert.equal(colorFor(theme, "string"), color("'str'"));
  assert.equal(colorFor(theme, "plain"), theme.fg.toUpperCase());
});

test("toThemedTokens yields shiki's line/offset/content shape", () => {
  const code = "const x\n\nend";
  const spans: Span[] = [
    { type: "keyword", start: 0, end: 5, confidence: 1 },
    { type: "plain", start: 5, end: 7, confidence: 1 },
    { type: "keyword", start: 9, end: 12, confidence: 1 },
  ];
  const lines = toThemedTokens(code, spans, theme);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0]!.map((t) => [t.content, t.offset, t.color]), [
    ["const", 0, colorFor(theme, "keyword")],
    [" x", 5, theme.fg.toUpperCase()],
  ]);
  assert.deepEqual(lines[1], []);
  assert.deepEqual(lines[2]!.map((t) => [t.content, t.offset]), [["end", 9]]);
});

test("uncovered text is plain, CRLF lines split cleanly", () => {
  const code = "a\r\nb";
  const lines = toThemedTokens(code, [], theme);
  assert.deepEqual(lines.map((l) => l.map((t) => t.content)), [["a"], ["b"]]);
  assert.equal(lines[1]![0]!.offset, 3);
});
