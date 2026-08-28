# snypd bench — latest

**Version** 0.1.0-s15 · **Bun** 1.4.0 · **Date** 2026-08-28T08:24:34.576Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 673.1 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 5806 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 56269.8 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 17.8 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 12.6 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 15.5 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 415 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 113 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 4282.5 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 36 ms | 50 ms | ✅ |  |
| `serve.ttfb` | 0.15 ms | — | report | static dist/ over Bun.serve — the floor the preview server is measured against |
| `preview.ttfb` | 0.16 ms | 50 ms | ✅ | serve --preview, unchanged tree, drafts included; review page served |
| `tokens.page.md` | 510 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1381 tokens | — | report |  |
| `tokens.page.reduction` | 63.1 % | — | report | vs this theme's own HTML — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn` | 4450 tokens | 6000 tokens | ✅ | 16 resources |
| `tokens.page.html.editorial` | 1392 tokens | — | report | editorial theme |
| `tokens.page.reduction.editorial` | 63.4 % | — | report | vs this theme's own HTML (editorial) — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn.editorial` | 4639 tokens | 6000 tokens | ✅ | 16 resources · editorial theme |
| `tokens.tools` | 2033 tokens | — | report | 10 tools; paid once per session on top of tokens.learn, which docs/05 scopes to config + spec + theme |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.26 ms | 3 ms | ✅ | worst type (donut) on the worst shape — bar 0.19 ms / 6.5 KB · line 0.13 ms / 4.3 KB · area 0.12 ms / 4.5 KB · donut 0.26 ms / 6.9 KB · lollipop 0.22 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 1.68 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 1.24 ms / 10.5 KB · wide 1.24 ms / 11.9 KB · feedback 1.68 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 0.74 ms | 15 ms | ✅ | worst shape (nested) at the 40-node cap, layout cache defeated — ladder 40 steps 0.67 ms / 13.7 KB · retry loop 38 steps 0.72 ms / 13.2 KB · nested 40 steps 0.74 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |
| `suggest.precision` | 1  | ≥ 0.8  | ✅ | 17/17 suggestions matched a label over 20 posts, 7 of which are labelled with no upgrade |
| `suggest.recall` | 1  | — | report | 17/17 labelled upgrades found; report-only — a miss costs the author nothing, a false positive rewrites their post |
| `suggest.ms` | 6.96 ms | — | report | per post: parse + shapes + score + verify (the verify pass lints each candidate against the document it would land in) |
| `page.js.kb` | 0 KB | 0 KB | ✅ | editorial: 6 routes × 1280/390 px — /posts/every-primitive-once/, /about/, /authors/sunny/, /, /category/engineering/, /tag/markdown/; worst /posts/every-primitive-once/ @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `page.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 12 route/viewport pairs |
| `page.bytes.kb` | 27.06 KB | — | report | worst /posts/every-primitive-once/ @ 1280: 14.08 KB html + 9.8 KB css + 3.19 KB img, 3 requests — uncompressed, which no host serves; report-only |
| `page.lcp` | 172 ms | — | report | worst /authors/sunny/ @ 1280; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `page.cls` | 0  | 0.05  | ✅ | worst /posts/every-primitive-once/ @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
