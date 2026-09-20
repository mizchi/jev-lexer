import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCli, loadTheme } from "../src/cli.ts";

test("parseCli defaults", () => {
  const a = parseCli(["src/x.ts"]);
  assert.equal(a.command, "highlight");
  assert.equal(a.file, "src/x.ts");
  assert.equal(a.theme, "github-dark");
  assert.equal(a.format, null);
  assert.equal(a.filename, true);
  assert.equal(a.dryRun, false);
});

test("parseCli flags", () => {
  const a = parseCli(["x.py", "--html", "--theme", "nord", "--no-filename", "--dry-run", "--no-cache"]);
  assert.equal(a.format, "html");
  assert.equal(a.theme, "nord");
  assert.equal(a.filename, false);
  assert.equal(a.dryRun, true);
  assert.equal(a.cache, null);
  assert.equal(parseCli(["eval", "--replay"]).command, "eval");
  assert.equal(parseCli(["bench"]).command, "bench");
});

test("loadTheme resolves a @shikijs/themes name", async () => {
  const t = await loadTheme("github-dark");
  assert.equal(t.name, "github-dark");
  await assert.rejects(loadTheme("no-such-theme"), /theme/);
});

import { comparePanes } from "../src/cli.ts";
import githubDark from "@shikijs/themes/github-dark";
import { resolveTheme } from "../src/tokens.ts";

test("comparePanes labels each pane and includes the correct one when a lang is given", async () => {
  const theme = resolveTheme(githubDark);
  const out = await comparePanes("const x = 1\n", { lang: "ts", theme, spans: [], gpu: null });
  assert.ok(out.includes("== shiki (ts)"));
  assert.ok(out.includes("== jev-lexer"));
  assert.ok(!out.includes("== gpu-lexer"));
});
