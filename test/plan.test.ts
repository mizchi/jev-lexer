import { test } from "node:test";
import assert from "node:assert/strict";
import { REQUEST_BUDGET, STATE_BUDGET, estimateTokens } from "../src/estimate.ts";
import { OVERLAP_LINES, buildPlan, stateOf } from "../src/plan.ts";
import { isAskable, splitParts } from "../src/split.ts";

function askableIndexes(parts: ReturnType<typeof splitParts>): number[] {
  return parts.flatMap((p, i) => (isAskable(p) ? [i] : []));
}

test("a small file is one window, one batch, every askable part once", () => {
  const code = "const a = 1;\nlet b = a + 2; // hi\n";
  const parts = splitParts(code);
  const plan = buildPlan(code, parts, {});
  assert.equal(plan.windows.length, 1);
  assert.equal(plan.windows[0]!.firstLine, 1);
  assert.equal(plan.windows[0]!.text, code);
  assert.equal(plan.batches.length, 1);
  assert.deepEqual([...plan.batches[0]!.parts].sort((x, y) => x - y), askableIndexes(parts));
  assert.equal(plan.skipped, 0);
  assert.ok(plan.estimatedTokens > 0);
});

test("stateOf carries the path only when named", () => {
  const w = { text: "x", firstLine: 1, start: 0, end: 1, oversized: false };
  assert.deepEqual(stateOf(w, null), { source: "x" });
  assert.deepEqual(stateOf(w, "a/b.ts"), { path: "a/b.ts", source: "x" });
});

test("a big file is windowed on line boundaries with overlap, and every part is covered exactly once", () => {
  const line = "let value = compute(index) + 1; // some trailing words here\n";
  const code = line.repeat(4000);
  const parts = splitParts(code);
  const plan = buildPlan(code, parts, {});
  assert.ok(plan.windows.length > 1);
  for (const w of plan.windows) {
    assert.ok(estimateTokens(stateOf(w, null)) <= STATE_BUDGET, "window under budget");
    assert.ok(w.text.length === 0 || w.text.endsWith("\n"));
    assert.equal(w.oversized, false);
  }
  const seen = new Map<number, number>();
  for (const b of plan.batches) {
    const w = plan.windows[b.window]!;
    let qTokens = 0;
    for (const i of b.parts) {
      seen.set(i, (seen.get(i) ?? 0) + 1);
      const p = parts[i]!;
      assert.ok(p.start >= w.start && p.end <= w.end, "part inside its window");
      qTokens += 40;
    }
    assert.ok(estimateTokens(stateOf(w, null)) + qTokens <= REQUEST_BUDGET);
  }
  assert.deepEqual([...seen.keys()].sort((x, y) => x - y), askableIndexes(parts));
  assert.ok([...seen.values()].every((n) => n === 1));
  // consecutive windows overlap by OVERLAP_LINES lines on the inner side
  const w0 = plan.windows[0]!;
  const w1 = plan.windows[1]!;
  assert.ok(w1.start < w0.end);
  assert.equal(w0.end - w1.start, OVERLAP_LINES * 2 * line.length);
});

test("a single line over the state budget is an oversized window and its parts are skipped", () => {
  const code = "a ".repeat(200_000) + "\nb c\n";
  const parts = splitParts(code);
  const plan = buildPlan(code, parts, {});
  const over = plan.windows.filter((w) => w.oversized);
  assert.equal(over.length, 1);
  assert.ok(plan.skipped >= 200_000);
  const asked = new Set(plan.batches.flatMap((b) => b.parts));
  assert.ok(asked.has(parts.findIndex((p) => p.text === "b")));
});

test("batches split when questions alone exceed the request budget", () => {
  const code = "x ".repeat(6000) + "\n";
  const parts = splitParts(code);
  const plan = buildPlan(code, parts, {});
  assert.equal(plan.windows.length, 1);
  assert.ok(plan.batches.length > 1);
});
