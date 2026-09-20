import { test } from "node:test";
import assert from "node:assert/strict";
import { partLabels, score } from "../eval/metrics.ts";
import { splitParts } from "../src/split.ts";
import type { TokenClass } from "../src/classes.ts";

test("partLabels takes the majority class of a part's characters, skipping whitespace", () => {
  const code = "ab cd";
  const chars: TokenClass[] = ["keyword", "keyword", "plain", "string", "plain"];
  const parts = splitParts(code);
  assert.deepEqual(partLabels(parts, chars), ["keyword", null, "string"]);
});

test("score: agreement, macro F1 over non-plain, false colour rate, confusion", () => {
  const truth: (TokenClass | null)[] = ["keyword", "plain", "string", "string", null, "number"];
  const pred: (TokenClass | null)[] = ["keyword", "string", "string", "plain", null, "number"];
  const s = score(truth, pred);
  assert.equal(s.supervised, 5);
  assert.equal(s.agreement, 3 / 5);
  assert.equal(s.plainFalseColour, 1 / 1);
  assert.equal(s.confusion.string!.plain, 1);
  assert.ok(s.macroF1 > 0 && s.macroF1 < 1);
});
