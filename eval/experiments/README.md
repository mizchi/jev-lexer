# Experiments

Recordings that are not the baseline. Each replays with
`jev-lexer eval --replay --out eval/experiments/<file>`; no key needed.

## Question style (2026-09-20, jev-1.13.0, bare arm, 3,940 parts)

Where the class definitions travel. `full` repeats the criteria in every
question; `compact` says the same rules in fewer words; `legend` and
`lean` move the definitions into the request's state (sent once) and
leave a one-line or few-word criterion in the question.

| style | agreement | macro F1 | plain false-colour | input tokens | USD | tokens / question |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| full (baseline) | 91.95% | 89.45% | 17.11% | 4,230,616 | $0.178 | ~1,070 |
| compact | 89.90% | 87.56% | 17.47% | 2,929,861 | $0.123 | ~740 |
| legend | 86.50% | 84.67% | 25.67% | 1,677,915 | $0.071 | ~425 |
| lean | 86.32% | 82.43% | 24.42% | 926,384 | $0.039 | ~235 |

What it says: the definitions are read from the question's `criteria`
and not from the state. `legend` and `lean` score the same although
`legend` keeps a one-line criterion and `lean` a few words — once the
rules leave the criteria, the model answers from its own sense of the
labels and loses exactly the reference conventions the criteria carry
(quotes and `${VAR}` inside shell strings, TypeScript's plain call
parens, `<` as operator in HTML, docstrings as strings). Shortening the
prose while keeping the rules (`compact`) costs two points for 30% off.
Roughly, every $0.035 of criteria on this corpus buys two points of
agreement; there is no free lunch in the state.

`full` stays the default. `--style compact` is the one to pick when the
price matters more than the last two points.
