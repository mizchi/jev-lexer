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

/**
 * What the model is told each label means. Written for a `choice`
 * question, and written to the conventions of the reference labelling
 * (Shiki's TextMate scopes, collapsed the way gpu-lexer collapses them)
 * rather than to a linguist's taxonomy: `this` is plain, a docstring is
 * a string, a CSS property name is a type. Those are what the eval
 * scores against, so they are what the model is asked for.
 */
export const CRITERIA: Record<TokenClass, string> = {
  plain:
    "An identifier, variable, parameter, property, label, or anything no other class names. Also: this, self, Self, super; an HTML attribute name (class, type, href); an ALL_CAPS name in TypeScript, JavaScript or Go; a CSS custom property like --gap including its hyphens; and in TypeScript/JavaScript the round and square brackets of a call, a condition, a grouping or an index, e.g. foo(x), if (a), (a + b), T[] — only a declared parameter list's brackets are operator there.",
  comment:
    "Text that follows a comment marker (//, /*, */, #, --, <!--, ;), including the marker and every word inside, whatever the word would mean elsewhere. Not a docstring, heredoc or triple-quoted string: those are string.",
  string:
    "Any part of a string, character, template, regexp, docstring or heredoc literal, including its quotes, escapes and every word inside; a keyword or number inside quotes is string. JSON object keys are strings. In shell, a quoted string is string throughout, including $VAR and ${VAR} inside it. In a JavaScript/TypeScript template literal only the text is string: the ${ and } delimiters are operator and the expression inside them is classified on its own.",
  number:
    "A numeric literal or one part of it: 42, 3.14, 0xFF, 1_000, 1e9, 1rem, the exponent, unit or suffix of a number. Not a digit inside an identifier or a string.",
  keyword:
    "A reserved or structural word of the language: control flow (if, else, for, while, return, match), declarations (const, let, var, fn, def, class, struct, enum, import, export, pub, async, await), modifiers (static, public, mut), Go's built-in type words (int, string, error), an HTML/XML tag name right after < or </ (div, a, p, h1, button, html) and a CSS element selector (body, main, a), and CSS at-rules like @media.",
  type:
    "A type name where it names a type: a class, interface, struct, enum or alias in a declaration or annotation (String, Vec, Promise, MyError), a generic type parameter (T, K, V), and built-in type words used as types in Python, Rust and TypeScript. Also a CSS property name such as display or margin-top, including the hyphens inside it.",
  function:
    "A function or method name where it is declared or called: the word directly before an argument list, or the name in a function definition. Also a shell command name and a CSS function like var or calc.",
  constant:
    "A language constant: true, false, null, nil, None, undefined. An ALL_CAPS constant name in Python or Rust (MAX_ITEMS), a CSS colour like #fff or a CSS keyword value, and a shell option-like literal. Not this, self or an ALL_CAPS name in TypeScript, JavaScript or Go.",
  operator:
    "An operator or punctuation character outside strings and comments: + - * / = < > ! & | ^ ~ ? : . , ; and the brackets [ ] { } and, outside TypeScript/JavaScript, ( ), one character per part. Not the ( ) of a TypeScript/JavaScript call, condition or grouping (plain). Not a hyphen inside a CSS identifier such as margin-top, --gap or .site-header: that hyphen belongs to the word. In shell, $ { } of an expansion outside quotes. In a template literal, the ${ and } delimiters.",
};

export const TASK =
  "Classify the source part identified below for syntax highlighting, the way a TextMate-grammar highlighter (Shiki) would label it. Judge by its role in the surrounding code: a word inside a string literal or a comment takes that class, not its own. The part is one word run or one symbol character; multi-character operators arrive one character at a time.";

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
