import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { gpuLexerAvailable, gpuLexerChars } from "../bench/gpu-lexer.ts";

const present = existsSync(new URL("../bench/vendor/gpu-lexer/packages/training/active/model-active.json", import.meta.url));

test("gpu-lexer labels every character on the CPU", { skip: !present && "submodule not checked out" }, async () => {
  assert.equal(await gpuLexerAvailable(), true);
  const code = "const n = 42; // x\n";
  const chars = await gpuLexerChars(code);
  assert.equal(chars.length, code.length);
  assert.deepEqual(chars.slice(0, 5), Array(5).fill("keyword"));
});
