# snypd bench — suggest

**Version** 0.1.4 · **Bun** 1.4.0 · **Date** 2026-09-15T15:21:46.253Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `suggest.precision` | 1  | ≥ 0.8  | ✅ | 36/36 suggestions matched a label over 50 posts, 19 of which are labelled with no upgrade |
| `suggest.recall` | 1  | — | report | 36/36 labelled upgrades found; report-only — a miss costs the author nothing, a false positive rewrites their post |
| `suggest.ms` | 7.44 ms | — | report | per post: parse + shapes + score + verify (the verify pass lints each candidate against the document it would land in) |

CI passes at ≤ 80 % of budget (docs/07 §3), except where a row is a counted design statement rather than a clock, which passes at ≤ budget. Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


```
precision 1.000 (36/36)  ·  recall 1.000 (36/36)  ·  50 posts  ·  3.42 ms/post
```
