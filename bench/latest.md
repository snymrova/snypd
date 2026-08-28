# snypd bench — latest

**Version** 0.1.0-s16 · **Bun** 1.4.0 · **Date** 2026-08-28T13:45:07.899Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 1851.9 ms | 2000 ms | ⚠️ over CI (80 %) | 113 routes, no dist, no index |
| `build.incremental.100` | 25.4 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 44.5 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 70.7 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 1163 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 89.7 ms | 50 ms | ❌ over budget |  |
| `serve.ttfb` | 0.45 ms | — | report | static dist/ over Bun.serve — the floor the preview server is measured against |
| `preview.ttfb` | 0.22 ms | 50 ms | ✅ | serve --preview, unchanged tree, drafts included; review page served |
| `tokens.page.md` | 510 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1381 tokens | — | report |  |
| `tokens.page.reduction` | 63.1 % | — | report | vs this theme's own HTML — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn` | 4573 tokens | 6000 tokens | ✅ | 17 resources |
| `tokens.page.html.editorial` | 1392 tokens | — | report | editorial theme |
| `tokens.page.reduction.editorial` | 63.4 % | — | report | vs this theme's own HTML (editorial) — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn.editorial` | 4777 tokens | 6000 tokens | ✅ | 17 resources · editorial theme |
| `tokens.tools` | 2208 tokens | 3000 tokens | ✅ | 11 always listed (content.* + find_tools); paid every turn, on top of tokens.learn, which docs/05 scopes to config + spec + theme |
| `tokens.tools.full` | 3284 tokens | — | report | the same 14 tools with the catalogue listed rather than found — what deferring it saves a turn (docs/07 decision 38); report-only |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.45 ms | 3 ms | ✅ | worst type (lollipop) on the worst shape — bar 0.28 ms / 6.5 KB · line 0.16 ms / 4.3 KB · area 0.14 ms / 4.5 KB · donut 0.32 ms / 6.9 KB · lollipop 0.45 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 3.58 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 2.76 ms / 10.5 KB · wide 2.12 ms / 11.9 KB · feedback 3.58 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 3.49 ms | 15 ms | ✅ | worst shape (retry loop) at the 40-node cap, layout cache defeated — ladder 40 steps 1.96 ms / 13.7 KB · retry loop 38 steps 3.49 ms / 13.2 KB · nested 40 steps 3.46 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |
| `suggest.precision` | 1  | ≥ 0.8  | ✅ | 17/17 suggestions matched a label over 20 posts, 7 of which are labelled with no upgrade |
| `suggest.recall` | 1  | — | report | 17/17 labelled upgrades found; report-only — a miss costs the author nothing, a false positive rewrites their post |
| `suggest.ms` | 38.28 ms | — | report | per post: parse + shapes + score + verify (the verify pass lints each candidate against the document it would land in) |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
