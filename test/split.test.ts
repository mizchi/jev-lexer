import { test } from "node:test";
import assert from "node:assert/strict";
import { isAskable, splitParts } from "../src/split.ts";

const roundTrips = [
  "const answer = 42;",
  "a\r\nb\nc\r",
  "\tx  =\ty",
  "日本語 と emoji 🎉 ok",
  "",
  "   ",
  "x\n\n\ny",
];

test("concatenating parts reproduces the input", () => {
  for (const code of roundTrips) {
    const parts = splitParts(code);
    assert.equal(parts.map((p) => p.text).join(""), code, JSON.stringify(code));
    let at = 0;
    for (const p of parts) {
      assert.equal(p.start, at);
      assert.equal(p.end, at + p.text.length);
      at = p.end;
    }
  }
});

test("kinds follow gpu-lexer's rules", () => {
  const kinds = (code: string) => splitParts(code).map((p) => `${p.kind}:${p.text}`);
  assert.deepEqual(kinds("const answer = 42;"), [
    "word:const", "space: ", "word:answer", "space: ", "symbol:=", "space: ", "word:42", "symbol:;",
  ]);
  assert.deepEqual(kinds("a=>b"), ["word:a", "symbol:=", "symbol:>", "word:b"]);
  assert.deepEqual(kinds("x_1$y"), ["word:x_1", "symbol:$", "word:y"]);
  assert.deepEqual(kinds("a\r\nb\rc\nd"), ["word:a", "newline:\r\n", "word:b", "newline:\r", "word:c", "newline:\n", "word:d"]);
  assert.deepEqual(kinds("\t \u000b\u000cx"), ["space:\t \u000b\u000c", "word:x"]);
});

test("non-ASCII, including surrogate pairs, is one word run", () => {
  assert.deepEqual(splitParts("日本🎉x").map((p) => p.text), ["日本🎉x"]);
});

test("only words and symbols are asked", () => {
  const [w, s, sym, nl] = splitParts("a =\n");
  assert.equal(isAskable(w!), true);
  assert.equal(isAskable(s!), false);
  assert.equal(isAskable(sym!), true);
  assert.equal(isAskable(nl!), false);
});
