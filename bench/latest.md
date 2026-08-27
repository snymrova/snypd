# snypd bench — latest

**Version** 0.1.0-s9 · **Bun** 1.4.0 · **Date** 2026-08-27T16:35:52.338Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 728.4 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 8134.4 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 51103.4 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 17 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 10.7 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 13.9 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 412.4 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 132.3 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 4190 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 57.4 ms | 50 ms | ❌ over budget |  |
| `serve.ttfb` | 0.16 ms | 50 ms | ✅ |  |
| `tokens.page.md` | 508 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1358 tokens | — | report |  |
| `tokens.page.reduction` | 62.6 % | — | report | vs this theme's own HTML; the 85 % budget applies from S13 (a styled theme) — see docs/07 decision 15 |
| `tokens.learn` | 4385 tokens | 6000 tokens | ✅ | 16 resources |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.27 ms | 3 ms | ✅ | worst type (donut) on the worst shape — bar 0.17 ms / 6.5 KB · line 0.14 ms / 4.3 KB · area 0.15 ms / 4.5 KB · donut 0.27 ms / 6.8 KB · lollipop 0.24 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 1.94 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 1.45 ms / 10.4 KB · wide 1.63 ms / 11.9 KB · feedback 1.94 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
