# jev-lexer vs gpu-lexer, scored against Shiki

Corpus: 8 files under eval/corpus. Truth: Shiki 4.4.3 with the true language, scopes normalized with gpu-lexer's classFromScopes. Scored over jev-lexer's non-whitespace parts, majority class per part.
jev-lexer recording: model jev-1.13.0, 2026-09-20T10:05:58.952Z, repeat 1. gpu-lexer: promoted checkpoint, int6 weights, CPU via packages/training/src/tree-model.js.

| system | agreement | macro F1 | plain false-colour | wall clock | cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shiki (truth) | 100.00% | 100.00% | 0.00% | - | - |
| jev-lexer (bare) | 84.72% | 79.96% | 36.01% | 38706 ms request time | $0.1056 |
| jev-lexer (named) | 84.80% | 79.95% | 36.90% | 32096 ms request time | $0.1089 |
| gpu-lexer | 90.30% | 87.26% | 20.50% | 179 ms CPU | $0 |

| language | jev bare | jev named | gpu-lexer |
| --- | ---: | ---: | ---: |
| bash | 72.93% | 74.50% | 81.66% |
| css | 71.58% | 70.79% | 86.05% |
| go | 94.57% | 94.77% | 92.83% |
| html | 86.51% | 85.91% | 91.87% |
| json | 84.39% | 86.08% | 97.05% |
| python | 84.59% | 84.92% | 93.13% |
| rust | 94.21% | 93.14% | 91.16% |
| ts | 81.76% | 82.09% | 89.55% |

| class | jev bare F1 | jev named F1 | gpu-lexer F1 |
| --- | ---: | ---: | ---: |
| plain | 68.77% | 68.54% | 78.38% |
| comment | 89.37% | 89.33% | 95.77% |
| string | 85.68% | 86.52% | 94.95% |
| number | 87.88% | 88.78% | 83.33% |
| keyword | 87.39% | 87.25% | 89.44% |
| type | 68.29% | 68.07% | 79.65% |
| function | 83.21% | 83.33% | 84.13% |
| constant | 46.27% | 44.93% | 77.55% |
| operator | 91.59% | 91.40% | 93.28% |
