import { test } from "node:test";
import assert from "node:assert/strict";
import { oracleChars } from "../eval/oracle.ts";

test("shiki oracle labels every character of a TypeScript line", async () => {
  const code = "const n = 42; // x\n";
  const chars = await oracleChars(code, "ts");
  assert.equal(chars.length, code.length);
  assert.deepEqual(chars.slice(0, 5), Array(5).fill("keyword"));
  assert.equal(chars[10], "number");
  assert.equal(chars[14], "comment");
  assert.equal(chars[code.length - 1], "plain"); // the newline
});
