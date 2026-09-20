import { test } from "node:test";
import assert from "node:assert/strict";
import { classFromScopes } from "../eval/scopes.ts";

test("gpu-lexer's normalization, spot checks", () => {
  assert.equal(classFromScopes(["source.ts", "storage.type.ts"]), "keyword");
  assert.equal(classFromScopes(["source.ts", "keyword.operator.assignment.ts"]), "operator");
  assert.equal(classFromScopes(["source.ts", "comment.line.double-slash.ts"]), "comment");
  assert.equal(classFromScopes(["source.ts", "string.quoted.single.ts", "punctuation.definition.string.begin.ts"]), "string");
  assert.equal(classFromScopes(["source.ts", "constant.numeric.decimal.ts"]), "number");
  assert.equal(classFromScopes(["source.ts", "entity.name.function.ts"]), "function");
  assert.equal(classFromScopes(["source.ts", "entity.name.type.interface.ts"]), "type");
  assert.equal(classFromScopes(["source.ts", "constant.language.boolean.true.ts"]), "constant");
  assert.equal(classFromScopes(["source.ts", "punctuation.terminator.statement.ts"]), "operator");
  assert.equal(classFromScopes(["source.ts", "variable.other.readwrite.ts"]), "plain");
  // template expression: the outer string.template is dropped inside ${}
  assert.equal(classFromScopes(["source.ts", "string.template.ts", "meta.template.expression.ts", "variable.other.readwrite.ts"]), "plain");
  assert.equal(classFromScopes(["source.ts", "string.template.ts", "meta.template.expression.ts", "punctuation.definition.template-expression.begin.ts"]), "operator");
});
