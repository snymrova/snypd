# snypd bench — latest

**Version** 0.1.0-s6 · **Bun** 1.4.0 · **Date** 2026-08-27T11:00:18.321Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 698.6 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 6408 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 61636.7 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 14.3 ms | 300 ms | ✅ | one body edit → 1 rendered, 112 cached |
| `build.noop.100` | 8.9 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 17.4 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 584.3 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 101.3 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 5242.8 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 51.9 ms | 50 ms | ❌ over budget |  |
| `serve.ttfb` | 0.11 ms | 50 ms | ✅ |  |
| `tokens.page.md` | 516 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1081 tokens | — | report |  |
| `tokens.page.reduction` | 52.3 % | — | report | real theme HTML from S6; budget 85 % enforced from S7 (twins + llms.txt) |
| `tokens.learn` | 4385 tokens | 6000 tokens | ✅ | 16 resources |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
