# snypd bench — latest

**Version** 0.1.0-s7 · **Bun** 1.4.0 · **Date** 2026-08-27T15:23:22.020Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 1701.3 ms | 2000 ms | ⚠️ over CI (80 %) | 113 routes, no dist, no index |
| `build.cold.1000` | 13191.8 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 123280.5 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 45.8 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 23.3 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 27.4 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 1016.5 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 457.7 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 13427.6 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 138.3 ms | 50 ms | ❌ over budget |  |
| `serve.ttfb` | 0.18 ms | 50 ms | ✅ |  |
| `tokens.page.md` | 516 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1363 tokens | — | report |  |
| `tokens.page.reduction` | 62.1 % | — | report | vs this theme's own HTML; the 85 % budget applies from S13 (a styled theme) — see docs/07 decision 15 |
| `tokens.learn` | 4385 tokens | 6000 tokens | ✅ | 16 resources |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
