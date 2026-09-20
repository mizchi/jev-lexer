# jev-lexer — design

Date: 2026-09-20
Status: approved in conversation, pending written review

## Goal

A language-agnostic syntax highlighter built on the same idea as
[gpu-lexer](https://github.com/vercel-labs/gpu-lexer): split source
mechanically into parts, classify every part into one of nine visual
classes, merge adjacent equal classes into spans. Where gpu-lexer runs a
41k-parameter model on WebGPU, jev-lexer asks
[Jev](https://typesafe.ai) — the same model and client shape
[jev-lint](https://github.com/mizchi/jev-lint) uses — one `choice`
question per part, with the whole file as shared state.

Output is Shiki-compatible on two layers: the `ThemedToken[][]` data
structure of `codeToTokens`, and the HTML structure of `codeToHtml`. A
truecolor ANSI renderer is added for terminal demos.

Package name: `jev-lexer`. Node ≥ 24, TypeScript, pnpm, pkfire.

## Non-goals

- Parsing, semantic analysis, or anything a wrong label would make
  dangerous. Display only.
- Language detection. No language hint is accepted (decided: keep the
  gpu-lexer condition so the comparison is fair).
- Browser support. Jev is a remote API with a key; this runs in Node.
- Richer taxonomies than nine classes. Measured first; extended later
  only if the eval says the nine are the ceiling.

## Decisions taken in brainstorming

| question | decision |
| --- | --- |
| Shiki compatibility layer | both: `ThemedToken[][]` and HTML |
| class granularity | gpu-lexer's nine: plain, comment, string, number, keyword, type, function, constant, operator |
| eval oracle | Shiki, scopes normalized with gpu-lexer's `classFromScopes` |
| language hint | never |
| deliverable | npm library + CLI; eval and benchmark commands; no demo page |
| classification strategy | one `choice` question per non-whitespace part, state = whole file (approach A) |
| extra | ANSI terminal output, `--compare` against Shiki and gpu-lexer |

Approaches rejected for now, to be re-measured against A once the eval
exists: (B) classify symbols by a local rule and ask Jev only about word
runs — cheaper, but a `+` inside a comment gets painted as an operator;
(C) two-stage comment/string region detection then classification —
heavier, gain unknown.

## Architecture

```
src/
  split.ts      code -> Part[]                       pure
  classes.ts    the nine classes, choice criteria,
                class -> TextMate scope table         contract layer
  questions.ts  Part[] -> choice Question per part    pure
  jev.ts        Jev client (ported from jev-lint,
                incl. Pacer and askSplitting)          I/O
  plan.ts       (source, parts) -> request plan
                under the 32Ki state / 64Ki request
                ceilings                               pure
  merge.ts      Part[] + answers -> Span[]             pure
  tokens.ts     Span[] -> ThemedToken[][] with theme
                colours resolved                       pure
  html.ts       ThemedToken[][] -> Shiki-shaped HTML   pure
  ansi.ts       ThemedToken[][] -> truecolor ANSI      pure
  cache.ts      answer cache, content addressed        I/O
  index.ts      public API
  cli.ts        CLI
eval/
  oracle.ts     Shiki tokens -> per-character class labels
  metrics.ts    per-part agreement, macro F1, confusion matrix
  corpus/       evaluation sources, several languages
  baseline.json accepted run
bench/
  vendor/gpu-lexer   git submodule, pinned
  gpu-lexer.ts       CPU inference via the vendored tree-model
  run.ts             three-way comparison, writes bench/report.md
```

Only `jev.ts`, `cache.ts` and the single call site inside `lex()` touch
I/O. Everything else is a pure function over plain data and is tested
without an API key. The contract layer is `classes.ts`: the class list,
their criteria text and the scope table are the things a consumer and
the eval depend on; the rest is regenerable.

## Public API

```ts
export type TokenClass =
  | "plain" | "comment" | "string" | "number" | "keyword"
  | "type" | "function" | "constant" | "operator";

export interface Part {
  start: number;      // UTF-16 code unit offsets, like gpu-lexer
  end: number;
  text: string;
  kind: "word" | "space" | "newline" | "symbol";
}

export interface Span {
  type: TokenClass;
  start: number;
  end: number;
  confidence: number; // min confidence over the merged parts; 1 for whitespace
}

export interface LexResult {
  spans: Span[];
  unanswered: number; // parts that fell back to plain because no answer came back
  spent: Spend;       // calls, tokens, usd, ms — same shape as jev-lint
}

export interface LexOptions {
  client?: AskClient;        // default: new Jev() from the environment
  cache?: AnswerCache | null;
  minConfidence?: number;    // below this a part becomes plain; default 0
}

export function splitParts(code: string): Part[];
export function lex(code: string, opts?: LexOptions): Promise<LexResult>;
export function codeToTokens(code: string, opts: LexOptions & { theme: ThemeRegistrationResolved }): Promise<ThemedToken[][]>;
export function codeToHtml(code: string, opts: LexOptions & { theme: ThemeRegistrationResolved }): Promise<string>;
export function codeToAnsi(code: string, opts: LexOptions & { theme: ThemeRegistrationResolved }): Promise<string>;
```

`ThemedToken` and `ThemeRegistrationResolved` are Shiki's types, imported
from `@shikijs/core`. Themes are Shiki theme objects, loaded by the caller
(`import githubDark from "@shikijs/themes/github-dark"`).

## Components

### split.ts

gpu-lexer's rule: a word run is `[\p{L}\p{N}_$]+`, horizontal whitespace
`[ \t]+`, a newline `\r?\n`, and every other single code unit is a
symbol. Surrogate pairs are kept together as one symbol part. Invariant:
concatenating `parts.map(p => p.text)` reproduces the input exactly.

### classes.ts

The nine class names in gpu-lexer's order. For each, a `choice`
criterion sentence written for the model, e.g.

- `keyword`: a reserved word or storage/control word of the language —
  `const`, `if`, `return`, `def`, `fn`, `pub`, `import`.
- `string`: any part of a string, template or regexp literal, including
  its quotes and the words inside it.
- `comment`: any part of a comment, including its delimiters.
- `operator`: an operator or punctuation character — `+`, `=`, `=>`,
  `(`, `;`, `.` — when not inside a string or comment.
- `plain`: an identifier, variable, parameter, property, or anything
  the other classes do not name.

And the scope table used to look colours up in a Shiki theme:

| class | scopes tried, in order |
| --- | --- |
| comment | `comment` |
| string | `string` |
| number | `constant.numeric` |
| keyword | `keyword`, `storage.type` |
| type | `entity.name.type`, `support.type` |
| function | `entity.name.function`, `support.function` |
| constant | `constant.language`, `variable.other.constant` |
| operator | `keyword.operator` |
| plain | none — theme foreground |

Colour resolution: for each scope, the theme's `tokenColors` entry whose
`scope` is the longest prefix match wins; first scope with a match
decides; otherwise the theme's `fg`. This mirrors what Shiki does for a
single-scope token closely enough that the same theme gives the same
colour for the same class.

### questions.ts

One `choice` per part whose kind is `word` or `symbol`. Whitespace and
newlines are never asked; they are `plain`.

```json
{
  "type": "choice",
  "instructions": {
    "task": "Classify the source part identified below for syntax highlighting. Judge by its role in the surrounding code as a highlighter would: a word inside a string literal or a comment takes that class, not its own.",
    "subject": "q0042",
    "line": 12,
    "col": 8,
    "text": "answer",
    "before": "const ",
    "after": " = 42"
  },
  "criteria": { "plain": "...", "comment": "...", "string": "...", "...": "..." }
}
```

`before` / `after` are up to 24 code units of the same line on either
side. Question ids are positional (`q0000`…) so answers map back by
index. The task sentence and criteria are frozen text in `classes.ts`;
their hash is part of the cache key.

### plan.ts

State is `{ source }`. Jev's ceilings: state < 32Ki tokens, whole
request < 64Ki tokens. Token estimation is the same heuristic jev-lint
uses (characters / 4 plus JSON overhead), deliberately approximate,
because the client reacts to the server's `max_tokens_exceeded` by
halving the question set.

- If the source fits the state budget, one state, questions chunked so
  each request stays under the request budget.
- Otherwise the source is cut into windows on line boundaries, each
  under the state budget, overlapping by 40 lines on each side. A part
  is asked against the window that contains it with the most context
  on both sides; `line` in the question is the line within the window
  and the window's first source line is given as `window_starts_at`.

The plan is data: `{ states: [{ text, firstLine }], batches: [{ state: i, questions: [...] }] }`.

### jev.ts

jev-lint's `src/jev.ts` copied and trimmed: `Jev`, `Pacer`, `JevError`,
`AskClient`, `askSplitting`, `mapLimit`, the env-var lookup
(`TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL`, `JEV_LEXER_MODEL`). The
`AskClient` interface is what tests substitute.

### merge.ts

Answers arrive as `{ choice, confidence, probabilities }`. A part with
no answer, or with `confidence < minConfidence`, is `plain` and counted
in `unanswered` (only the missing ones — a low-confidence fallback is
not "unanswered"). Merging: walk parts in order; a whitespace part takes
the class of its neighbours when both sides agree, else `plain`; a
newline always ends the current span. Adjacent parts of equal class
fold into one span whose confidence is the minimum.

### tokens.ts / html.ts / ansi.ts

`tokens.ts` cuts spans on line boundaries into `ThemedToken`
(`{ content, color, offset, fontStyle? }`) per line, resolving colours
through the scope table. `html.ts` emits

```html
<pre class="shiki github-dark" style="background-color:#24292e;color:#e1e4e8" tabindex="0"><code><span class="line"><span style="color:#F97583">const</span>…</span>
<span class="line">…</span></code></pre>
```

— the structure Shiki 1.x/3.x emits for a single theme, so existing
Shiki CSS applies. `ansi.ts` emits `\x1b[38;2;r;g;bm` per token and a
reset per line.

### cache.ts

A JSON file mapping `sha256(model + classesHash + stateHash + questionJSON)`
to the answer. Loaded and saved whole. Used by the CLI (`--cache`,
default `.jev-lexer-cache.json` next to the input) and by `eval` /
`bench` so a recorded run replays without a key.

### cli.ts

```
jev-lexer <file>                 highlight; ANSI when stdout is a TTY, HTML otherwise
  --html | --ansi | --json       force a format (json = spans)
  --theme <name>                 a @shikijs/themes name; default github-dark
  --compare                      three panes: shiki (needs --lang), jev-lexer, gpu-lexer (if vendored)
  --lang <id>                    only for --compare's shiki pane
  --dry-run                      print the plan and estimated cost, send nothing
  --cache <path> | --no-cache
jev-lexer eval [--replay] [--repeat N]
jev-lexer bench [--replay]
```

Exit codes: 0 ok, 2 configuration error (no key, bad theme), 3 requests
failed (any `unanswered > 0`).

## Error handling

- No API key: `lex()` throws before building anything, with the variable
  name to set.
- `auth` errors from Jev stop the run on the first one.
- `transient` and `429` are retried inside the client (backoff, pacer).
- A batch that still fails leaves its parts `plain`; the run completes,
  `unanswered` says how many, and the CLI exits 3. A highlighter that
  silently paints everything white on a failure would look like a
  success, so it must not.
- `too_big`: handled by `askSplitting`; a state that alone exceeds the
  budget is prevented by `plan.ts` windowing.

## Evaluation

`eval/corpus/` holds real-looking files in at least TypeScript, Python,
Rust, Go, Shell, JSON, CSS and HTML — each with strings containing
keywords, comments containing code, template literals, numbers inside
identifiers, and other traps.

Oracle: Shiki tokenizes each file with its known language and
`github-dark-default`; every token's scopes go through gpu-lexer's
`classFromScopes` (vendored from `packages/training/src/classes.js`, with
attribution) to produce a class per character.

Metrics, computed over jev-lexer's own parts on non-whitespace parts
only, like gpu-lexer's "supervised parts":

- per-part agreement with the oracle
- styled macro F1 (F1 per class averaged over the eight non-plain
  classes)
- plain-token false-colour rate
- confusion matrix, and per-language breakdown
- Jev spend: requests, input tokens, USD, wall clock

`eval/baseline.json` records answers, metrics and the class-definition
hash. `jev-lexer eval --replay` recomputes from it without a key; CI
runs the replay. The first KPI is that the numbers exist and are
reproducible; gpu-lexer's 83.02% / 77.73% is the reference to beat, with
the caveat that the corpora differ.

## Benchmark

`bench/` compares three labelings of the same corpus:

1. Shiki with the true language — the oracle, also shown as the "correct"
   rendering
2. jev-lexer
3. gpu-lexer, run on the CPU through its vendored
   `packages/training/src/tree-model.js` and the tracked float
   checkpoint under `packages/training/active/`

All three are reduced to a class per character and aggregated over
jev-lexer's parts, so differences between splitters do not leak into the
numbers. `bench/run.ts` writes `bench/report.md`: the metrics above for
2 and 3 side by side, per language, plus cost and wall clock for
jev-lexer and wall clock for gpu-lexer. `jev-lexer <file> --compare`
renders the three ANSI panes for a demo.

Fallback: if the vendored CPU path cannot be driven from Node (missing
checkpoint, incompatible module shape), gpu-lexer is run through
Playwright + Chromium with WebGPU enabled and the same span output
collected. The report says which path produced the numbers.

## Testing

`node --test` with `--experimental-strip-types`, as jev-lint does; no
test framework dependency. TDD: each pure module gets its failing test
first.

- `split`: round-trip invariant on fixtures incl. CRLF, tabs, emoji,
  CJK; kinds and offsets on a table of cases.
- `questions`: snapshot of one question; `before`/`after` truncation.
- `plan`: every batch under the estimated ceilings; windows cover every
  part; overlap as specified.
- `merge`: table-driven — missing answer, low confidence, whitespace
  between equal classes, newline cuts.
- `tokens`/`html`/`ansi`: for a fixture, Shiki's own `codeToHtml` with
  the same theme is parsed and compared structurally (same element
  nesting, same class names, same colour for tokens whose class maps to
  the same scope).
- `lex`: end-to-end through a fake `AskClient` that answers from a
  table, asserting spans and `unanswered`.
- `cache`: hit/miss, key changes when the class definitions change.
- `eval --replay` and `bench --replay` run in CI from committed
  recordings.

## Repository and tooling

- `package.json`: `type: module`, `exports` for `.`, `bin` for
  `jev-lexer`; deps `@shikijs/core`, `@shikijs/themes`; devDeps `shiki`
  (oracle), `typescript`, `@types/node`, `secretlint` +
  `@secretlint/secretlint-rule-preset-recommend`.
- `Taskfile.pkl`: `test`, `typecheck`, `build`, `eval`, `eval:replay`,
  `bench`, `ci`; hooks: pre-push runs secretlint.
- `.envrc`: `PATH_add ./node_modules/.bin`, `pkf hooks install`.
- Docs and commit messages in English.

## Open risks

- Jev may not read "inside a string" from `before`/`after` plus the
  state as reliably as hoped; the eval will show it on the `string` and
  `comment` rows of the confusion matrix. Approach B/C are the fallback
  experiments, measured against A.
- Cost scales with part count; a 300-line file is roughly 2,000
  questions ≈ 160k input tokens ≈ $0.007. Large files are windowed, and
  `--dry-run` prices any input before sending.
- gpu-lexer's tree-model API may change; the submodule is pinned, and
  the bench imports only two of its modules.
