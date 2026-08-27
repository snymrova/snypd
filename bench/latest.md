# snypd bench — latest

**Version** 0.1.0-s10 · **Bun** 1.4.0 · **Date** 2026-08-27T17:10:47.947Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 704.4 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 6120.2 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 77776 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 22 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 12.5 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 16.7 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 514.6 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 109.4 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 5300 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 31 ms | 50 ms | ✅ |  |
| `serve.ttfb` | 0.15 ms | 50 ms | ✅ |  |
| `tokens.page.md` | 510 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1360 tokens | — | report |  |
| `tokens.page.reduction` | 62.5 % | — | report | vs this theme's own HTML; the 85 % budget applies from S13 (a styled theme) — see docs/07 decision 15 |
| `tokens.learn` | 4450 tokens | 6000 tokens | ✅ | 16 resources |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.22 ms | 3 ms | ✅ | worst type (donut) on the worst shape — bar 0.17 ms / 6.5 KB · line 0.12 ms / 4.3 KB · area 0.12 ms / 4.5 KB · donut 0.22 ms / 6.8 KB · lollipop 0.19 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 1.73 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 1.01 ms / 10.4 KB · wide 1.21 ms / 11.9 KB · feedback 1.73 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 0.81 ms | 15 ms | ✅ | worst shape (nested) at the 40-node cap, layout cache defeated — ladder 40 steps 0.75 ms / 13.7 KB · retry loop 38 steps 0.79 ms / 13.1 KB · nested 40 steps 0.81 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
