export { TOKEN_CLASSES, SCOPES, CRITERIA, TASK, CLASSES_HASH, isTokenClass, type TokenClass } from "./classes.ts";
export { splitParts, isAskable, type Part, type PartKind } from "./split.ts";
export { lex, type LexOptions, type LexResult } from "./lex.ts";
export { mergeSpans, type Span, type PartLabel } from "./merge.ts";
export { buildPlan, type Plan, type Window, type Batch } from "./plan.ts";
export { Jev, JevError, Pacer, type AskClient, type JevOptions, type Spend } from "./jev.ts";
export { AnswerCache, cacheKey } from "./cache.ts";
export { resolveTheme, colorFor, toThemedTokens, type ThemedToken, type ThemeRegistrationAny } from "./tokens.ts";
export { tokensToHtml } from "./html.ts";
export { tokensToAnsi } from "./ansi.ts";

import { lex, type LexOptions, type LexResult } from "./lex.ts";
import { resolveTheme, toThemedTokens, type ThemeRegistrationAny, type ThemeRegistrationResolved, type ThemedToken } from "./tokens.ts";
import { tokensToHtml } from "./html.ts";
import { tokensToAnsi } from "./ansi.ts";

export interface ThemedOptions extends LexOptions {
  theme: ThemeRegistrationAny;
}

export interface Rendered<T> {
  output: T;
  result: LexResult;
}

async function themed(
  code: string,
  opts: ThemedOptions,
): Promise<{ tokens: ThemedToken[][]; result: LexResult; theme: ThemeRegistrationResolved }> {
  const { theme: raw, ...lexOpts } = opts;
  const theme = resolveTheme(raw);
  const result = await lex(code, lexOpts);
  return { tokens: toThemedTokens(code, result.spans, theme), result, theme };
}

/** Shiki's `codeToTokens` shape: one array of `ThemedToken` per line. */
export async function codeToTokens(code: string, opts: ThemedOptions): Promise<ThemedToken[][]> {
  return (await themed(code, opts)).tokens;
}

export async function codeToHtml(code: string, opts: ThemedOptions): Promise<string> {
  const { tokens, theme } = await themed(code, opts);
  return tokensToHtml(tokens, theme);
}

export async function codeToAnsi(code: string, opts: ThemedOptions): Promise<string> {
  const { tokens } = await themed(code, opts);
  return tokensToAnsi(tokens);
}

/** The same three, returning the LexResult beside the output for callers that need `unanswered` and `spent`. */
export async function renderTokens(code: string, opts: ThemedOptions): Promise<Rendered<ThemedToken[][]>> {
  const { tokens, result } = await themed(code, opts);
  return { output: tokens, result };
}
export async function renderHtml(code: string, opts: ThemedOptions): Promise<Rendered<string>> {
  const { tokens, result, theme } = await themed(code, opts);
  return { output: tokensToHtml(tokens, theme), result };
}
export async function renderAnsi(code: string, opts: ThemedOptions): Promise<Rendered<string>> {
  const { tokens, result } = await themed(code, opts);
  return { output: tokensToAnsi(tokens), result };
}
