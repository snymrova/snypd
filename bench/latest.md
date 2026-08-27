# snypd bench — latest

**Version** 0.1.0-s4 · **Bun** 1.4.0 · **Date** 2026-08-27T10:05:06.898Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 13.6 ms | 2000 ms | ✅ |  |
| `build.cold.1000` | 167.2 ms | 20000 ms | ✅ |  |
| `build.cold.10000` | 1508.3 ms | 200000 ms | ✅ |  |
| `build.incremental.100` | 6.5 ms | 300 ms | ✅ |  |
| `mcp.coldStart` | 30.3 ms | 50 ms | ✅ |  |
| `serve.ttfb` | 0.15 ms | 50 ms | ✅ |  |
| `tokens.page.md` | 504 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 536 tokens | — | report |  |
| `tokens.page.reduction` | 6 % | — | report | budget 85 % enforced from S7 (stub HTML is the markdown in a <pre>) |
| `tokens.learn` | 4175 tokens | 6000 tokens | ✅ | 16 resources |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
