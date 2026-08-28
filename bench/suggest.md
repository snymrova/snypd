# snypd bench — suggest

**Version** 0.1.0-s15 · **Bun** 1.4.0 · **Date** 2026-08-28T08:08:37.533Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `suggest.precision` | 1  | ≥ 0.8  | ✅ | 17/17 suggestions matched a label over 20 posts, 7 of which are labelled with no upgrade |
| `suggest.recall` | 1  | — | report | 17/17 labelled upgrades found; report-only — a miss costs the author nothing, a false positive rewrites their post |
| `suggest.ms` | 20.09 ms | — | report | per post: parse + shapes + score + verify (the verify pass lints each candidate against the document it would land in) |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


```
precision 1.000 (17/17)  ·  recall 1.000 (17/17)  ·  20 posts  ·  7.29 ms/post
```
