import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASSES_HASH, CRITERIA, SCOPES, TASK, TOKEN_CLASSES, isTokenClass, taskNamed } from "../src/classes.ts";

test("nine classes in gpu-lexer's order", () => {
  assert.deepEqual([...TOKEN_CLASSES], [
    "plain", "comment", "string", "number", "keyword", "type", "function", "constant", "operator",
  ]);
});

test("every class has a criterion and a scope list", () => {
  for (const c of TOKEN_CLASSES) {
    assert.ok(CRITERIA[c].length > 20, c);
    assert.ok(Array.isArray(SCOPES[c]), c);
  }
  assert.deepEqual(SCOPES.plain, []);
});

test("isTokenClass narrows", () => {
  assert.equal(isTokenClass("keyword"), true);
  assert.equal(isTokenClass("Keyword"), false);
  assert.equal(isTokenClass(42), false);
});

test("taskNamed mentions the path and keeps the base task", () => {
  const t = taskNamed("src/app.tsx");
  assert.ok(t.startsWith(TASK));
  assert.ok(t.includes("src/app.tsx"));
});

test("CLASSES_HASH is 16 hex chars", () => {
  assert.match(CLASSES_HASH, /^[0-9a-f]{16}$/);
});
