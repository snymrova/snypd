# snypd bench — latest

**Version** 0.1.0-s3 · **Bun** 1.4.0 · **Date** 2026-08-27T07:46:45.239Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 15.1 ms | 2000 ms | ✅ |  |
| `build.cold.1000` | 141.3 ms | 20000 ms | ✅ |  |
| `build.cold.10000` | 1613.4 ms | 200000 ms | ✅ |  |
| `build.incremental.100` | 6.1 ms | 300 ms | ✅ |  |
| `mcp.coldStart` | 38.2 ms | 50 ms | ✅ |  |
| `serve.ttfb` | 0.18 ms | 50 ms | ✅ |  |
| `tokens.page.md` | 504 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 536 tokens | — | report |  |
| `tokens.page.reduction` | 6 % | — | report | budget 85 % enforced from S7 (stub HTML is the markdown in a <pre>) |
| `tokens.learn` | 3931 tokens | 6000 tokens | ✅ | 16 resources |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
