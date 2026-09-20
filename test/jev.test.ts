import { test } from "node:test";
import assert from "node:assert/strict";
import { Jev, JevError, Pacer, mapLimit } from "../src/jev.ts";

function fakeFetch(handler: (body: any) => { status: number; json?: unknown; text?: string }): typeof fetch {
  return (async (_url: any, init: any) => {
    const r = handler(JSON.parse(init.body));
    const text = r.text ?? JSON.stringify(r.json);
    return new Response(text, { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const q = { type: "choice", instructions: { text: "x" }, criteria: { a: "A", b: "B" } } as const;

test("ask posts model, state and questions and reads usage", async () => {
  let seen: any = null;
  const jev = new Jev({
    apiKey: "k", fetch: fakeFetch((body) => {
      seen = body;
      return { status: 200, json: { model: "jev-1", answers: { q0: { type: "choice", choice: "a", confidence: 0.9 } }, usage: { input_tokens: 10 } } };
    }),
  });
  const res = await jev.ask({ source: "s" }, { q0: q });
  assert.equal(seen.model, jev.model);
  assert.deepEqual(seen.state, { source: "s" });
  assert.equal((res.answers as any).q0.choice, "a");
  assert.equal(jev.spent.inputTokens, 10);
  assert.equal(jev.servedModel, "jev-1");
});

test("no key is an auth error before any request", async () => {
  const jev = new Jev({ apiKey: "", fetch: fakeFetch(() => { throw new Error("must not be called"); }) });
  await assert.rejects(jev.ask({}, { q0: q }), (e: any) => e instanceof JevError && e.kind === "auth");
});

test("askSplitting halves on max_tokens_exceeded", async () => {
  const sizes: number[] = [];
  const jev = new Jev({
    apiKey: "k", fetch: fakeFetch((body) => {
      const names = Object.keys(body.questions);
      sizes.push(names.length);
      if (names.length > 2) return { status: 400, text: '{"error":"max_tokens_exceeded"}' };
      return { status: 200, json: { answers: Object.fromEntries(names.map((n) => [n, { type: "choice", choice: "a", confidence: 1 }])), usage: { input_tokens: 1 } } };
    }),
  });
  const qs = Object.fromEntries(["q0", "q1", "q2", "q3", "q4"].map((n) => [n, q]));
  const res = await jev.askSplitting({}, qs);
  assert.deepEqual(Object.keys(res.answers!).sort(), ["q0", "q1", "q2", "q3", "q4"]);
  assert.equal(sizes[0], 5);
  assert.equal(jev.splits, 2);
});

test("5xx is retried, 401 is not", async () => {
  let calls = 0;
  const flaky = new Jev({ apiKey: "k", retries: 2, fetch: fakeFetch(() => (++calls < 2 ? { status: 503, text: "down" } : { status: 200, json: { answers: {}, usage: {} } })) });
  await flaky.ask({}, { q0: q });
  assert.equal(calls, 2);
  const denied = new Jev({ apiKey: "k", retries: 2, fetch: fakeFetch(() => ({ status: 401, text: "nope" })) });
  await assert.rejects(denied.ask({}, { q0: q }), (e: any) => e.kind === "auth");
});

test("pacer waits when the bucket is empty", () => {
  const p = new Pacer(1000, 100, 0);
  assert.equal(p.delay(50, 0), 0);
  p.settle(0, 100);
  assert.ok(p.delay(50, 0) > 0);
});

test("mapLimit preserves order", async () => {
  const out = await mapLimit([3, 1, 2], 2, async (n) => { await new Promise((r) => setTimeout(r, n)); return n * 10; });
  assert.deepEqual(out, [30, 10, 20]);
});
