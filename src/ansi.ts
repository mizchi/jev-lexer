/**
 * Truecolor ANSI for terminals: every token gets `38;2;r;g;b`, every
 * line ends with a reset. Only colour is carried; a theme's font
 * styles are a later concern.
 */
import type { ThemedToken } from "@shikijs/core";

const RESET = "\x1b[0m";

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

export function tokensToAnsi(tokens: ThemedToken[][]): string {
  return tokens
    .map((line) => {
      if (line.length === 0) return "";
      const body = line
        .map((t) => {
          const c = t.color ? rgb(t.color) : null;
          return c ? `\x1b[38;2;${c[0]};${c[1]};${c[2]}m${t.content}` : t.content;
        })
        .join("");
      return body + RESET;
    })
    .join("\n");
}
