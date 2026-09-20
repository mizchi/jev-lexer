/**
 * gpu-lexer's TextMate-scope → nine-class normalization, ported from
 * packages/training/src/classes.js (MIT © Shu Ding,
 * https://github.com/vercel-labs/gpu-lexer). Kept identical so our
 * agreement numbers are on the same scale as gpu-lexer's.
 */
import type { TokenClass } from "../src/classes.ts";

const rules: Array<[TokenClass, RegExp]> = [
  ["comment", /^comment\./],
  ["string", /^(?:string|constant\.other\.symbol|constant\.regexp|markup\.inline\.raw|markup\.underline\.link)\./],
  ["number", /^constant\.numeric\./],
  ["operator", /^keyword\.operator(?:\.|$)/],
  ["keyword", /^(?:keyword(?!\.operator(?:\.|$))|storage|modifier|control|markup\.heading|entity\.name\.tag)(?:\.|$)/],
  ["type", /^(?:entity\.name\.(?:type|class|interface|struct|enum)|support\.(?:type|class))\./],
  ["function", /^(?:entity\.name\.(?:function|method)|support\.function)\./],
  ["constant", /^(?:constant\.(?:language|other)|support\.constant)(?:\.|$)/],
  ["operator", /^punctuation(?:\.|$)/],
];

export function classFromScopes(input: readonly string[]): TokenClass {
  let scopes = normalizeScopes(input);
  if (scopes.some((s) => /^punctuation\.definition\.template-expression(?:\.|$)/.test(s))) return "operator";
  scopes = withoutOuterTemplateString(scopes);
  for (const [name, pattern] of rules) {
    if (scopes.some((s) => pattern.test(s))) return name;
  }
  return "plain";
}

export function normalizeScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes.filter((s) => typeof s === "string").map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

function withoutOuterTemplateString(scopes: string[]): string[] {
  const embedded = scopes.some((s) => /^meta\.(?:embedded|template\.expression)(?:\.|$)/.test(s));
  return embedded ? scopes.filter((s) => !/^string\.template(?:\.|$)/.test(s)) : scopes;
}
