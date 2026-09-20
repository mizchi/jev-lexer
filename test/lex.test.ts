import { test } from "node:test";
import assert from "node:assert/strict";
import type { AskClient, Question, Spend, SystemOneResponse } from "../src/jev.ts";
import { JevError } from "../src/jev.ts";
import { lex } from "../src/lex.ts";
import { AnswerCache } from "../src/cache.ts";

const spend0: Spend = { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0, retried: 0, rateLimited: 0, tokensPerSecond: 0, splits: 0, usd: 0 };

/** Answers by part text; anything not in the table is left unanswered. */
function fakeClient(table: Record<string, string>, opts: { fail?: "auth" | "other"; onAsk?: (state: any, qs: Record<string, Question>) => void } = {}): AskClient & { asked: number } {
  return {
    model: "fake", servedModel: "fake-1", spent: spend0, asked: 0,
    async askSplitting(state, questions) {
      this.asked += 1;
      opts.onAsk?.(state, questions);
      if (opts.fail === "auth") throw new JevError("nope", { kind: "auth" });
      if (opts.fail === "other") throw new JevError("boom", { kind: "other" });
      const answers: Record<string, unknown> = {};
      for (const [id, q] of Object.entries(questions)) {
        const cls = table[String(q.instructions.text)];
        if (cls) answers[id] = { type: "choice", choice: cls, confidence: 0.9 };
      }
      return { answers, usage: { input_tokens: 1 } } satisfies SystemOneResponse;
    },
  };
}

const code = "const x = 42; // hi\n";

test("lex asks once per batch and returns merged spans", async () => {
  const client = fakeClient({ const: "keyword", "=": "operator", "42": "number", "/": "comment", hi: "comment" });
  const r = await lex(code, { client });
  assert.equal(client.asked, 1);
  assert.deepEqual(r.spans.map((s) => `${s.type}:${code.slice(s.start, s.end)}`), [
    "keyword:const", "plain: x ", "operator:=", "plain: ", "number:42", "plain:; ", "comment:// hi",
  ]);
  assert.equal(r.unanswered, 2); // "x" and ";" had no answer
});

test("filename reaches the state and the task", async () => {
  let seenState: any; let seenTask = "";
  const client = fakeClient({}, { onAsk: (s, qs) => { seenState = s; seenTask = String(Object.values(qs)[0]!.instructions.task); } });
  await lex(code, { client, filename: "a/b.ts" });
  assert.equal(seenState.path, "a/b.ts");
  assert.ok(seenTask.includes("a/b.ts"));
  const bare = fakeClient({}, { onAsk: (s) => { seenState = s; } });
  await lex(code, { client: bare });
  assert.equal("path" in seenState, false);
});

test("an unknown label counts as unanswered; auth errors propagate; other errors leave parts plain", async () => {
  const junk = fakeClient({ const: "banana" });
  const r = await lex("const", { client: junk });
  assert.equal(r.unanswered, 1);
  assert.equal(r.spans[0]!.type, "plain");
  await assert.rejects(lex(code, { client: fakeClient({}, { fail: "auth" }) }), (e: any) => e.kind === "auth");
  const failed = await lex(code, { client: fakeClient({}, { fail: "other" }) });
  assert.equal(failed.unanswered, 8);
  assert.equal(failed.errors.length, 1);
});

test("cache hits skip the request", async () => {
  const cache = new AnswerCache(null);
  const client = fakeClient({ const: "keyword", x: "plain", "=": "operator", "42": "number", ";": "operator", "/": "comment", hi: "comment" });
  const first = await lex(code, { client, cache });
  assert.equal(first.unanswered, 0);
  assert.equal(client.asked, 1);
  const second = await lex(code, { client, cache });
  assert.equal(client.asked, 1);
  assert.deepEqual(second.spans, first.spans);
});

test("minConfidence is applied at merge time", async () => {
  const client = fakeClient({ const: "keyword" });
  const r = await lex("const", { client, minConfidence: 0.95 });
  assert.equal(r.spans[0]!.type, "plain");
  assert.equal(r.unanswered, 0);
});
