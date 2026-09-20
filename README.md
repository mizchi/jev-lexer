# jev-lexer

A language-agnostic syntax highlighter built on the idea behind
[gpu-lexer](https://github.com/vercel-labs/gpu-lexer): split source
mechanically into word runs and single symbols, classify every part into
one of nine visual classes, merge equal neighbours into spans. Where
gpu-lexer runs a 41k-parameter model on WebGPU, jev-lexer asks
[Jev](https://typesafe.ai) — the same model and client that
[jev-lint](https://github.com/mizchi/jev-lint) uses — one `choice`
question per part, with the whole file sent once as shared state.

The output is Shiki-compatible on two layers — the `ThemedToken[][]`
of `codeToTokens` and the HTML of `codeToHtml`, rendered by Shiki's own
renderer — plus truecolor ANSI for terminals. No language id is taken;
an optional file name is the only hint, and the eval measures what it
is worth.

```
$ jev-lexer src/split.ts --html > out.html
6 request(s), 335,799 input tokens, $0.01410, 9103 ms; 0 unanswered
```

## Install

```bash
pnpm add jev-lexer
export TYPESAFE_API_KEY=...
```

Node ≥ 24. The key is read from the environment only.

## Library

```ts
import githubDark from "@shikijs/themes/github-dark";
import { codeToHtml, codeToTokens, codeToAnsi, lex } from "jev-lexer";

const html = await codeToHtml(code, { theme: githubDark });
// <pre class="shiki github-dark" style="background-color:#24292e;color:#e1e4e8" tabindex="0"><code><span class="line">…

const lines = await codeToTokens(code, { theme: githubDark });
// ThemedToken[][]: [{ content: "const", offset: 0, color: "#F97583" }, …] per line

const ansi = await codeToAnsi(code, { theme: githubDark, filename: "src/app.ts" });
```

Themes are Shiki theme objects; anything from `@shikijs/themes` works.
Under the three renderers is `lex()`:

```ts
const { spans, unanswered, spent } = await lex(code, {
  filename: "src/app.ts",   // optional hint; nothing is inferred from it locally
  minConfidence: 0,         // below this a part is plain
  cache,                    // an AnswerCache, so a re-run of the same code costs nothing
});
// spans: [{ type: "keyword", start: 0, end: 5, confidence: 0.98 }, …]
```

`type` is one of `plain | comment | string | number | keyword | type |
function | constant | operator` — gpu-lexer's taxonomy. `unanswered` is
the number of parts that got no usable answer; they are painted plain,
and the count is there so a failed request never looks like clean
output. `spent` is requests, input tokens, USD and request time.

`renderHtml` / `renderTokens` / `renderAnsi` return the output together
with the `LexResult`.

## CLI

```
jev-lexer <file>                 ANSI when stdout is a TTY, HTML otherwise
  --html | --ansi | --json       force a format (json = spans)
  --theme <name>                 a @shikijs/themes name; default github-dark
  --no-filename                  do not pass the file name as a hint
  --style full|compact           how much of the criteria each question carries (default full)
  --dry-run                      print the plan and the estimated price, send nothing
  --cache <path> | --no-cache    answer cache; default .jev-lexer-cache.json
  --compare [--lang <id>]        three panes: Shiki (needs --lang), jev-lexer, gpu-lexer
jev-lexer eval [--replay] [--repeat N] [--arms bare,named] [--style …] [--out path]
jev-lexer bench [--replay]
```

Exit codes: `0` ok, `2` configuration error (no key, unknown theme,
unreadable file), `3` some parts got no answer.

## How it works

1. **Split** (`src/split.ts`): gpu-lexer's rule, byte for byte — a run of
   `[A-Za-z0-9_]` or anything above 0x7F is a word, `[ \t\v\f]+` is
   space, `\r?\n` is a newline, every other code unit is one symbol.
   Offsets are UTF-16 code units.
2. **Ask** (`src/questions.ts`, `src/plan.ts`, `src/jev.ts`): every word
   and symbol becomes one `choice` question over the nine classes,
   carrying its text, line, column and up to 24 units of same-line
   context. The file is the request's `state`, sent once. Jev's ceilings
   are 32Ki tokens for the state and 64Ki for the request; a large file
   is cut into windows on line boundaries with 40 lines of overlap, and
   the questions are packed into as many requests as the budget needs.
   The client is jev-lint's, with its pacer and its halving on
   `max_tokens_exceeded`.
3. **Merge** (`src/merge.ts`): adjacent equal classes fold into one span;
   whitespace between two equal neighbours joins them; a newline always
   cuts.
4. **Render** (`src/tokens.ts`, `src/html.ts`, `src/ansi.ts`): each class
   maps to a short list of TextMate scopes (`keyword`, `storage.type`,
   `entity.name.type`, …) and the theme's `tokenColors` are searched by
   longest prefix. The HTML is produced by `@shikijs/core`'s
   `tokensToHast` + `hastToHtml` over our tokens, so the markup is
   Shiki's by construction.

The nine classes, the sentence the model is asked with and each class's
criterion live in `src/classes.ts`. The criteria are written to the
conventions of the reference labelling rather than to a linguist's
taxonomy: `this` is plain, a Python docstring is a string, a CSS property
name is a type, the round brackets of a TypeScript call are plain. That
is what the eval scores against, so that is what the model is asked
for; the hash of that file is part of every cache key and recording.

**Cost.** Each question carries the full criteria text, so a question is
about 1,100 input tokens. `eval/corpus/ts/session.ts` (72 lines, 603
parts) plans at ~693k tokens ≈ $0.029 with `--dry-run`; the 50-line
`src/split.ts` billed 336k tokens, $0.014, 9 s. That is roughly three
orders of magnitude above gpu-lexer's cost of nothing, and it is the
price of asking a general model instead of training a small one. The
answer cache makes a repeated highlight free.

The cost lever is what each question carries, and it trades directly
against accuracy — see [Question styles](#question-styles).

## Numbers

`eval/` scores against Shiki 4.4.3 tokenizing each corpus file with its
true language, scopes collapsed to the nine classes with gpu-lexer's own
`classFromScopes` (ported in `eval/scopes.ts`), over jev-lexer's
non-whitespace parts. `bench/` adds gpu-lexer's promoted checkpoint, run
on the CPU through its own training code from a pinned submodule, on the
same corpus and the same reduction. Recorded 2026-09-20, model
`jev-1.13.0`, 8 files, 3,940 supervised parts:

| system | agreement | macro F1 | plain false-colour | wall clock | cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shiki (truth) | 100.00% | 100.00% | 0.00% | - | - |
| jev-lexer (bare) | 91.95% | 89.45% | 17.11% | 54.8 s request time, ~8 s wall | $0.178 |
| jev-lexer (named) | 92.23% | 89.03% | 16.04% | 40.2 s request time | $0.181 |
| gpu-lexer | 90.30% | 87.26% | 20.50% | 179 ms CPU | $0 |

Per language and per class in [`bench/report.md`](bench/report.md);
confusion matrices from `pnpm eval:replay`.

Read these with three caveats. The corpus is small — one file per
language, written for this project, with strings that contain keywords,
comments that contain code, template literals and the other traps. The
criteria in `src/classes.ts` were tuned by looking at this corpus's
confusion matrix (two rounds: 84.7% → 90.6% → 91.9%), so the numbers are
in-sample; an unseen file is the next thing to measure. And gpu-lexer's
own published figure, 83.02%, is on its held-out corpus of 1,929 files,
which is not this one — on these eight files it scores 90.30%.

The file-name hint is worth about a quarter of a point. It changes
where the errors fall more than how many there are.

### Question styles

`--style` (CLI) / `style` (`lex()`) chooses how much of the class
definitions each question carries. Measured on the same corpus, bare
arm, model `jev-1.13.0`, 2026-09-20; the last column is `--dry-run` on
`eval/corpus/ts/session.ts` (72 lines, 603 parts):

| style | what a question carries | what the state carries | agreement | macro F1 | plain false-colour | tokens / question | 8-file corpus | 72-line file |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `full` (default) | the full criteria, ~2,900 chars | source | **91.95%** | **89.45%** | 17.11% | ~1,070 | $0.178 | $0.029 |
| `compact` | the same rules in ~1,800 chars | source | 89.90% | 87.56% | 17.47% | ~740 | $0.123 | $0.020 |
| `legend` | a one-line reminder per class | source + the full criteria as `legend` | 86.50% | 84.67% | 25.67% | ~425 | $0.071 | $0.013 |
| `lean` | a few words per class | source + `legend` + the task sentence | 86.32% | 82.43% | 24.42% | ~235 | $0.039 | $0.006 |

Read down the table: each step saves 30–45% and costs two to five
points, and the price is paid in exactly the conventions the criteria
spell out — quotes and `${VAR}` inside shell strings, TypeScript's
plain call parens, `<` as operator in HTML, docstrings as strings all
revert to the model's own reading. `legend` and `lean` score the same
although one keeps a sentence per class and the other a few words,
which says the definitions are read from the question's `criteria` and
not from the state: parking them there is not a saving, it is a
removal. `compact` is the one to pick when price matters more than the
last two points; below it the agreement falls under gpu-lexer's.

Recordings for all four replay without a key from
[`eval/experiments/`](eval/experiments/README.md).

## What it is not

Display only. It is not a parser and it does not know the language; a
wrong label costs a wrong colour and nothing else. It is not
deterministic across model versions, and a label near a decision
boundary can move between runs — commit the cache if the output must
not change under you. It needs a network and a key.

## Development

```bash
pnpm install
pkf run test            # node:test, no key needed
pkf run typecheck
pnpm eval               # records eval/baseline.json (needs the key, ~$0.36 for both arms)
pnpm eval:replay        # the same table from the recording, no key
pnpm bench              # rewrites bench/report.md from the recording + gpu-lexer on the CPU
pkf run ci              # typecheck + test + build + both replays
```

`bench/vendor/gpu-lexer` is a git submodule pinned to
`07f3e56c`; `git submodule update --init` after cloning, or the gpu-lexer
column is skipped and `--compare` shows two panes. `pkf hooks install`
(run by `.envrc`) installs a pre-push hook that runs secretlint,
typecheck and the tests.

Design and plan: `docs/superpowers/specs/2026-09-20-jev-lexer-design.md`,
`docs/superpowers/plans/2026-09-20-jev-lexer.md`.

## License

MIT. `eval/scopes.ts` is a port of gpu-lexer's
`packages/training/src/classes.js` (MIT © Shu Ding); `src/jev.ts` is
jev-lint's client (MIT).
