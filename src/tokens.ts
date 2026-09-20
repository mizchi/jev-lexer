/**
 * Spans to Shiki's `ThemedToken[][]`: one array per line, tokens with
 * `content`, `offset` (into the whole code) and `color`. Colours are
 * looked up in the theme's `tokenColors` by the class's scopes: for
 * each scope in order, the rule with the longest matching scope prefix
 * wins; the first scope with any match decides; otherwise the theme
 * foreground. Colours are upper-cased, as Shiki's tokenizer emits them.
 */
import { normalizeTheme } from "@shikijs/core";
import type { ThemeRegistrationAny, ThemeRegistrationResolved, ThemedToken } from "@shikijs/core";
import { SCOPES, type TokenClass } from "./classes.ts";
import type { Span } from "./merge.ts";

export type { ThemeRegistrationAny, ThemeRegistrationResolved, ThemedToken };

export function resolveTheme(theme: ThemeRegistrationAny): ThemeRegistrationResolved {
  return normalizeTheme(theme);
}

function selectorsOf(scope: string | string[] | undefined): string[] {
  if (!scope) return [];
  const list = Array.isArray(scope) ? scope : [scope];
  // "a, b" lists and "outer inner" descendant selectors: the last segment is the token's own scope.
  return list.flatMap((s) => s.split(",")).map((s) => s.trim().split(/\s+/).pop()!).filter(Boolean);
}

const colorCache = new WeakMap<ThemeRegistrationResolved, Map<TokenClass, string>>();

export function colorFor(theme: ThemeRegistrationResolved, cls: TokenClass): string {
  let memo = colorCache.get(theme);
  if (!memo) {
    memo = new Map();
    colorCache.set(theme, memo);
  }
  const hit = memo.get(cls);
  if (hit) return hit;
  let found: string | null = null;
  for (const scope of SCOPES[cls]) {
    let best: { len: number; fg: string } | null = null;
    for (const rule of theme.settings ?? []) {
      const fg = rule.settings?.foreground;
      if (!fg) continue;
      for (const sel of selectorsOf(rule.scope)) {
        if (scope === sel || scope.startsWith(`${sel}.`)) {
          if (!best || sel.length > best.len) best = { len: sel.length, fg };
        }
      }
    }
    if (best) {
      found = best.fg;
      break;
    }
  }
  const color = (found ?? theme.fg).toUpperCase();
  memo.set(cls, color);
  return color;
}

/** Line boundaries as [start, end) of content, newline excluded — Shiki's line split. */
function lineRanges(code: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    if (c === 10 || c === 13) {
      out.push([start, i]);
      if (c === 13 && code.charCodeAt(i + 1) === 10) i += 1;
      start = i + 1;
    }
  }
  out.push([start, code.length]);
  return out;
}

export function toThemedTokens(code: string, spans: Span[], theme: ThemeRegistrationResolved): ThemedToken[][] {
  const plain = colorFor(theme, "plain");
  const lines: ThemedToken[][] = [];
  let s = 0;
  for (const [start, end] of lineRanges(code)) {
    const tokens: ThemedToken[] = [];
    let at = start;
    while (s < spans.length && spans[s]!.end <= start) s += 1;
    for (let k = s; k < spans.length && spans[k]!.start < end; k++) {
      const span = spans[k]!;
      const from = Math.max(span.start, start);
      const to = Math.min(span.end, end);
      if (from > at) tokens.push({ content: code.slice(at, from), offset: at, color: plain });
      if (to > from) tokens.push({ content: code.slice(from, to), offset: from, color: colorFor(theme, span.type) });
      at = Math.max(at, to);
    }
    if (at < end) tokens.push({ content: code.slice(at, end), offset: at, color: plain });
    lines.push(tokens);
  }
  return lines;
}
