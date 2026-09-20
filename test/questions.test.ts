import { test } from "node:test";
import assert from "node:assert/strict";
import { CRITERIA, TASK } from "../src/classes.ts";
import { splitParts } from "../src/split.ts";
import { buildQuestion, contextOf, lineStartsOf, locate, questionId, readChoice } from "../src/questions.ts";

const code = "const answer = 42; // the answer\nlet s = `a${answer}`;\n";

test("questionId is zero-padded and stable", () => {
  assert.equal(questionId(0), "q00000");
  assert.equal(questionId(42), "q00042");
});

test("lineStartsOf and locate give 1-based line and col", () => {
  const starts = lineStartsOf(code);
  assert.deepEqual(starts, [0, 33]);
  const parts = splitParts(code);
  const s = parts.find((p) => p.text === "s")!;
  assert.deepEqual(locate(s, starts), { line: 2, col: 5 });
});

test("contextOf is same-line text, at most 24 units each side", () => {
  const parts = splitParts(code);
  const answer = parts.find((p) => p.text === "answer")!;
  assert.deepEqual(contextOf(code, answer), { before: "const ", after: " = 42; // the answer" });
  const s = parts.find((p) => p.text === "s")!;
  assert.deepEqual(contextOf(code, s), { before: "let ", after: " = `a${answer}`;" });
  const long = "x".repeat(40) + " y " + "z".repeat(40);
  const y = splitParts(long).find((p) => p.text === "y")!;
  const ctx = contextOf(long, y);
  assert.equal(ctx.before.length, 24);
  assert.equal(ctx.after.length, 24);
});

test("buildQuestion carries the frozen task and criteria", () => {
  const parts = splitParts(code);
  const answer = parts.find((p) => p.text === "answer")!;
  const q = buildQuestion(code, answer, "q00002", { line: 1, col: 7 }, null);
  assert.equal(q.type, "choice");
  assert.deepEqual(q.criteria, CRITERIA);
  assert.deepEqual(q.instructions, {
    task: TASK, subject: "q00002", line: 1, col: 7, text: "answer", before: "const ", after: " = 42; // the answer",
  });
  const named = buildQuestion(code, answer, "q00002", { line: 1, col: 7 }, "src/a.ts");
  assert.ok(String(named.instructions.task).includes("src/a.ts"));
});

test("readChoice tolerates junk", () => {
  assert.equal(readChoice({ q0: { type: "choice", choice: "keyword", confidence: 0.8 } }, "q0")?.choice, "keyword");
  assert.equal(readChoice({ q0: { type: "choice", choice: "keyword" } }, "q0")?.confidence, 0);
  assert.equal(readChoice({ q0: { type: "score", value: 1 } }, "q0"), null);
  assert.equal(readChoice(undefined, "q0"), null);
});
