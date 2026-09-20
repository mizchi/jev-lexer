import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnswerCache, cacheKey } from "../src/cache.ts";

test("cacheKey changes with model, state, question and the class contract", () => {
  const q = { type: "choice", instructions: { text: "x" }, criteria: {} } as const;
  const a = cacheKey("m1", { source: "s" }, q);
  assert.notEqual(a, cacheKey("m2", { source: "s" }, q));
  assert.notEqual(a, cacheKey("m1", { source: "t" }, q));
  assert.notEqual(a, cacheKey("m1", { source: "s" }, { ...q, instructions: { text: "y" } }));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("cache round-trips through a file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jev-lexer-"));
  const path = join(dir, "c.json");
  const c1 = await AnswerCache.open(path);
  assert.equal(c1.get("k"), undefined);
  c1.set("k", { type: "keyword", confidence: 0.9 });
  await c1.save();
  const c2 = await AnswerCache.open(path);
  assert.deepEqual(c2.get("k"), { type: "keyword", confidence: 0.9 });
  assert.equal(c2.size, 1);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(raw.version, 1);
});
