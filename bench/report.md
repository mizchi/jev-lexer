# jev-lexer vs gpu-lexer, scored against Shiki

Corpus: 8 files under eval/corpus. Truth: Shiki 4.4.3 with the true language, scopes normalized with gpu-lexer's classFromScopes. Scored over jev-lexer's non-whitespace parts, majority class per part.
jev-lexer recording: model jev-1.13.0, 2026-09-20T10:10:44.096Z, repeat 1. gpu-lexer: promoted checkpoint, int6 weights, CPU via packages/training/src/tree-model.js.

| system | agreement | macro F1 | plain false-colour | wall clock | cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shiki (truth) | 100.00% | 100.00% | 0.00% | - | - |
| jev-lexer (bare) | 91.95% | 89.45% | 17.11% | 54837 ms request time | $0.1777 |
| jev-lexer (named) | 92.23% | 89.03% | 16.04% | 40221 ms request time | $0.1809 |
| gpu-lexer | 90.30% | 87.26% | 20.50% | 179 ms CPU | $0 |

| language | jev bare | jev named | gpu-lexer |
| --- | ---: | ---: | ---: |
| bash | 85.23% | 83.89% | 81.66% |
| css | 84.21% | 82.89% | 86.05% |
| go | 96.51% | 97.48% | 92.83% |
| html | 88.89% | 89.48% | 91.87% |
| json | 96.62% | 97.89% | 97.05% |
| python | 91.46% | 91.46% | 93.13% |
| rust | 97.87% | 98.02% | 91.16% |
| ts | 92.70% | 94.36% | 89.55% |

| class | jev bare F1 | jev named F1 | gpu-lexer F1 |
| --- | ---: | ---: | ---: |
| plain | 86.51% | 87.55% | 78.38% |
| comment | 96.62% | 96.34% | 95.77% |
| string | 93.32% | 93.76% | 94.95% |
| number | 88.44% | 88.32% | 83.33% |
| keyword | 91.69% | 91.56% | 89.44% |
| type | 85.37% | 84.66% | 79.65% |
| function | 82.31% | 81.23% | 84.13% |
| constant | 84.00% | 82.00% | 77.55% |
| operator | 93.87% | 94.37% | 93.28% |
