# snypd bench — latest

**Version** 0.1.0-s11 · **Bun** 1.4.0 · **Date** 2026-08-27T20:17:29.210Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 495.4 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 4836 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 47379.8 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 15.9 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 10.7 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 18.7 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 387 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 109.1 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 3845 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 29.2 ms | 50 ms | ✅ |  |
| `serve.ttfb` | 0.11 ms | — | report | static dist/ over Bun.serve — the floor the preview server is measured against |
| `preview.ttfb` | 0.16 ms | 50 ms | ✅ | serve --preview, unchanged tree, drafts included; review page served |
| `tokens.page.md` | 510 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1360 tokens | — | report |  |
| `tokens.page.reduction` | 62.5 % | — | report | vs this theme's own HTML; the 85 % budget applies from S13 (a styled theme) — see docs/07 decision 15 |
| `tokens.learn` | 4450 tokens | 6000 tokens | ✅ | 16 resources |
| `tokens.tools` | 1493 tokens | — | report | 8 tools; paid once per session on top of tokens.learn, which docs/05 scopes to config + spec + theme |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.27 ms | 3 ms | ✅ | worst type (donut) on the worst shape — bar 0.17 ms / 6.5 KB · line 0.13 ms / 4.3 KB · area 0.16 ms / 4.5 KB · donut 0.27 ms / 6.8 KB · lollipop 0.24 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 1.48 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 1.21 ms / 10.4 KB · wide 1.22 ms / 11.9 KB · feedback 1.48 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 0.76 ms | 15 ms | ✅ | worst shape (retry loop) at the 40-node cap, layout cache defeated — ladder 40 steps 0.64 ms / 13.7 KB · retry loop 38 steps 0.76 ms / 13.1 KB · nested 40 steps 0.67 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
