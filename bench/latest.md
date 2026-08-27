# snypd bench — latest

**Version** 0.1.0-s5 · **Bun** 1.4.0 · **Date** 2026-08-27T10:35:20.976Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 17.2 ms | 2000 ms | ✅ |  |
| `build.cold.1000` | 181.1 ms | 20000 ms | ✅ |  |
| `build.cold.10000` | 1608.5 ms | 200000 ms | ✅ |  |
| `build.incremental.100` | 9.3 ms | 300 ms | ✅ |  |
| `lint.100` | 24.7 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 787.9 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 165.2 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 6938.7 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 45.5 ms | 50 ms | ⚠️ over CI (80 %) |  |
| `serve.ttfb` | 0.18 ms | 50 ms | ✅ |  |
| `tokens.page.md` | 516 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 548 tokens | — | report |  |
| `tokens.page.reduction` | 5.8 % | — | report | budget 85 % enforced from S7 (stub HTML is the markdown in a <pre>) |
| `tokens.learn` | 4175 tokens | 6000 tokens | ✅ | 16 resources |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
