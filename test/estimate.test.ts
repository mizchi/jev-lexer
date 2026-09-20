import { test } from "node:test";
import assert from "node:assert/strict";
import { REQUEST_BUDGET, STATE_BUDGET, estimateTokens } from "../src/estimate.ts";

test("budgets sit under the server ceilings with margin", () => {
  assert.equal(STATE_BUDGET, Math.floor(32_768 / 1.25));
  assert.equal(REQUEST_BUDGET, Math.floor(65_536 / 1.1));
});

test("estimate grows with text and is roughly chars/3.4 for long strings", () => {
  const long = "x".repeat(3400);
  const n = estimateTokens({ source: long });
  assert.ok(n > 950 && n < 1100, String(n));
  assert.ok(estimateTokens({ a: "hi" }) < estimateTokens({ a: "hi there friend" }));
});
