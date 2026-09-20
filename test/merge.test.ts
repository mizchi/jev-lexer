import { test } from "node:test";
import assert from "node:assert/strict";
import type { PartLabel } from "../src/merge.ts";
import { mergeSpans } from "../src/merge.ts";
import { splitParts } from "../src/split.ts";

function labelsFor(code: string, table: Record<string, [string, number]>): PartLabel[] {
  return splitParts(code).map((p) => {
    const hit = table[p.text];
    return hit ? { type: hit[0] as any, confidence: hit[1] } : null;
  }) as PartLabel[];
}

const show = (spans: ReturnType<typeof mergeSpans>, code: string) =>
  spans.map((s) => `${s.type}:${JSON.stringify(code.slice(s.start, s.end))}`);

test("adjacent equal classes merge, whitespace between equals joins them", () => {
  const code = "// a comment";
  const labels = labelsFor(code, { "/": ["comment", 0.9], a: ["comment", 0.8], comment: ["comment", 0.7] });
  assert.deepEqual(show(mergeSpans(splitParts(code), labels, 0), code), ['comment:"// a comment"']);
  assert.equal(mergeSpans(splitParts(code), labels, 0)[0]!.confidence, 0.7);
});

test("whitespace between different classes is plain, unanswered parts are plain", () => {
  const code = "const x = 1";
  const labels = labelsFor(code, { const: ["keyword", 1], "=": ["operator", 1], "1": ["number", 1] });
  assert.deepEqual(show(mergeSpans(splitParts(code), labels, 0), code), [
    'keyword:"const"', 'plain:" x "', 'operator:"="', 'plain:" "', 'number:"1"',
  ]);
});

test("newlines end spans and are covered by none", () => {
  const code = "a\nb";
  const labels = labelsFor(code, { a: ["keyword", 1], b: ["keyword", 1] });
  const spans = mergeSpans(splitParts(code), labels, 0);
  assert.deepEqual(show(spans, code), ['keyword:"a"', 'keyword:"b"']);
});

test("below minConfidence becomes plain", () => {
  const code = "x y";
  const labels = labelsFor(code, { x: ["type", 0.3], y: ["type", 0.9] });
  assert.deepEqual(show(mergeSpans(splitParts(code), labels, 0.5), code), ['plain:"x "', 'type:"y"']);
});

test("leading and trailing whitespace on a line is plain", () => {
  const code = "  x  ";
  const labels = labelsFor(code, { x: ["keyword", 1] });
  assert.deepEqual(show(mergeSpans(splitParts(code), labels, 0), code), ['plain:"  "', 'keyword:"x"', 'plain:"  "']);
});
