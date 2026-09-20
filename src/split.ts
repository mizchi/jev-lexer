/**
 * The mechanical pass, identical to gpu-lexer's `prepareTreeSource`:
 * a word run, a horizontal-space run, one newline (`\r\n` together),
 * or one symbol code unit. Offsets are UTF-16 code units. Anything
 * above 0x7F is a word character, so a surrogate pair never splits.
 */
export type PartKind = "word" | "space" | "newline" | "symbol";

export interface Part {
  start: number;
  end: number;
  text: string;
  kind: PartKind;
}

function isWord(c: number): boolean {
  return c > 127 || c === 95 || (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isSpace(c: number): boolean {
  return c === 9 || c === 11 || c === 12 || c === 32;
}

export function splitParts(code: string): Part[] {
  const parts: Part[] = [];
  let i = 0;
  while (i < code.length) {
    const start = i;
    const c = code.charCodeAt(i);
    let kind: PartKind;
    if (c === 10 || c === 13) {
      kind = "newline";
      i += 1;
      if (c === 13 && code.charCodeAt(i) === 10) i += 1;
    } else if (isSpace(c)) {
      kind = "space";
      do i += 1; while (i < code.length && isSpace(code.charCodeAt(i)));
    } else if (isWord(c)) {
      kind = "word";
      do i += 1; while (i < code.length && isWord(code.charCodeAt(i)));
    } else {
      kind = "symbol";
      i += 1;
    }
    parts.push({ start, end: i, text: code.slice(start, i), kind });
  }
  return parts;
}

/** Whitespace is never asked about; it is always plain. */
export function isAskable(part: Part): boolean {
  return part.kind === "word" || part.kind === "symbol";
}
