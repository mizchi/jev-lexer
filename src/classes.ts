/**
 * The contract layer: the nine visual classes, the words the model is
 * given for each, and the TextMate scopes a Shiki theme is asked for
 * when a class needs a colour. Everything else in the package is
 * regenerable against this file; its hash is part of every cache key
 * and every recording.
 */
import { createHash } from "node:crypto";

/** gpu-lexer's taxonomy, in its order. */
export const TOKEN_CLASSES = [
  "plain", "comment", "string", "number", "keyword", "type", "function", "constant", "operator",
] as const;
export type TokenClass = (typeof TOKEN_CLASSES)[number];

export function isTokenClass(v: unknown): v is TokenClass {
  return typeof v === "string" && (TOKEN_CLASSES as readonly string[]).includes(v);
}

/** What the model is told each label means. Written for a `choice` question. */
export const CRITERIA: Record<TokenClass, string> = {
  plain:
    "An identifier, variable, parameter, property, label, or any part that none of the other classes names. Also whitespace-like or structural text a highlighter leaves in the default colour.",
  comment:
    "Any part of a comment, including its delimiters (//, /*, */, #, --, <!--) and every word inside it, whatever that word would be elsewhere.",
  string:
    "Any part of a string, character, template or regexp literal, including its quotes, escapes and the words inside it; a keyword or number inside quotes is string.",
  number:
    "A numeric literal or one part of it: 42, 3.14, 0xFF, 1_000, 1e9, the exponent or suffix of a number. Not a digit inside an identifier or a string.",
  keyword:
    "A reserved or structural word of the language: control flow (if, else, for, while, return, match), declarations (const, let, var, fn, def, class, struct, enum, import, export, pub, async, await), modifiers (static, public, mut), and markup tag names.",
  type:
    "A type name where it names a type: a class, interface, struct, enum or alias in a declaration or annotation (String, Vec, Promise, MyError), and built-in type words used as types.",
  function:
    "A function or method name where it is declared or called: the word directly before an argument list, or the name in a function definition.",
  constant:
    "A language constant or an all-caps constant name: true, false, null, nil, None, undefined, self, this, MAX_SIZE, PI.",
  operator:
    "An operator or punctuation character outside strings and comments: + - * / = < > ! & | ^ ~ ? : . , ; ( ) [ ] { } => -> :: and their multi-character forms, split one character per part.",
};

export const TASK =
  "Classify the source part identified below for syntax highlighting. Judge by its role in the surrounding code as a highlighter would: a word inside a string literal or a comment takes that class, not its own. The part is one word run or one symbol character; multi-character operators arrive one character at a time.";

/** The one clause the optional file-name hint adds. Nothing is derived from the name locally. */
export function taskNamed(path: string): string {
  return `${TASK} The file is named ${path}; use the name only as a hint to the language.`;
}

/**
 * Scopes tried, in order, when a Shiki theme is asked for a class's
 * colour. `plain` is the theme foreground.
 */
export const SCOPES: Record<TokenClass, readonly string[]> = {
  plain: [],
  comment: ["comment"],
  string: ["string"],
  number: ["constant.numeric"],
  keyword: ["keyword", "storage.type"],
  type: ["entity.name.type", "support.type"],
  function: ["entity.name.function", "support.function"],
  constant: ["constant.language", "variable.other.constant"],
  operator: ["keyword.operator"],
};

/** Identity of this contract, for cache keys and recordings. */
export const CLASSES_HASH = createHash("sha256")
  .update(JSON.stringify({ TOKEN_CLASSES, CRITERIA, TASK, SCOPES }))
  .digest("hex")
  .slice(0, 16);
