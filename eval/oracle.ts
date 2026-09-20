/**
 * Shiki as the oracle: tokenize with the true language and
 * github-dark-default (the theme gpu-lexer labelled with), take each
 * token's scope stack through gpu-lexer's normalization, and spread
 * the class over the token's characters. Newlines are plain.
 */
import { createHighlighter, type BundledLanguage, type BundledTheme, type Highlighter } from "shiki";
import type { TokenClass } from "../src/classes.ts";
import { classFromScopes } from "./scopes.ts";

export const ORACLE_THEME = "github-dark-default";
let highlighter: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();
const loadedThemes = new Set<string>([ORACLE_THEME]);

async function get(lang: string): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: [ORACLE_THEME], langs: [] });
  const h = await highlighter;
  if (!loadedLangs.has(lang)) {
    await h.loadLanguage(lang as BundledLanguage);
    loadedLangs.add(lang);
  }
  return h;
}

export async function oracleChars(code: string, lang: string): Promise<TokenClass[]> {
  const h = await get(lang);
  const { tokens } = h.codeToTokens(code, { lang: lang as BundledLanguage, theme: ORACLE_THEME, includeExplanation: "scopeName" });
  const out: TokenClass[] = new Array(code.length).fill("plain");
  for (const line of tokens) {
    for (const token of line) {
      let at = token.offset;
      for (const ex of token.explanation ?? []) {
        const cls = classFromScopes(ex.scopes.map((s) => s.scopeName));
        for (let i = 0; i < ex.content.length; i++) out[at + i] = cls;
        at += ex.content.length;
      }
    }
  }
  return out;
}

/** Shiki's own tokens for the "correct" pane of --compare. */
export async function oracleTokens(code: string, lang: string, theme: string) {
  const h = await get(lang);
  if (!loadedThemes.has(theme)) {
    await h.loadTheme(theme as BundledTheme);
    loadedThemes.add(theme);
  }
  return h.codeToTokens(code, { lang: lang as BundledLanguage, theme: theme as BundledTheme }).tokens;
}
