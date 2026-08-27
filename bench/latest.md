# snypd bench — latest

**Version** 0.1.0-s8 · **Bun** 1.4.0 · **Date** 2026-08-27T16:05:31.094Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 1281.9 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 5884.2 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 56855.5 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 16.5 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 11.3 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 15.8 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 427.7 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 102.4 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 4064.7 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 75.8 ms | 50 ms | ❌ over budget |  |
| `serve.ttfb` | 0.16 ms | 50 ms | ✅ |  |
| `tokens.page.md` | 516 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1363 tokens | — | report |  |
| `tokens.page.reduction` | 62.1 % | — | report | vs this theme's own HTML; the 85 % budget applies from S13 (a styled theme) — see docs/07 decision 15 |
| `tokens.learn` | 4385 tokens | 6000 tokens | ✅ | 16 resources |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.19 ms | 3 ms | ✅ | worst type (donut) on the worst shape — bar 0.14 ms / 6.5 KB · line 0.11 ms / 4.3 KB · area 0.11 ms / 4.5 KB · donut 0.19 ms / 6.8 KB · lollipop 0.15 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
