# snypd bench — latest

**Version** 0.1.0-s14 · **Bun** 1.4.0 · **Date** 2026-08-28T07:37:08.691Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 724.1 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 6981.5 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 61298.1 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 22.3 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 13.3 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 17.5 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 507.4 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 141.5 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 5243.2 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 55.5 ms | 50 ms | ❌ over budget |  |
| `serve.ttfb` | 0.15 ms | — | report | static dist/ over Bun.serve — the floor the preview server is measured against |
| `preview.ttfb` | 0.18 ms | 50 ms | ✅ | serve --preview, unchanged tree, drafts included; review page served |
| `tokens.page.md` | 510 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1381 tokens | — | report |  |
| `tokens.page.reduction` | 63.1 % | — | report | vs this theme's own HTML — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn` | 4450 tokens | 6000 tokens | ✅ | 16 resources |
| `tokens.page.html.editorial` | 1392 tokens | — | report | editorial theme |
| `tokens.page.reduction.editorial` | 63.4 % | — | report | vs this theme's own HTML (editorial) — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn.editorial` | 4639 tokens | 6000 tokens | ✅ | 16 resources · editorial theme |
| `tokens.tools` | 1493 tokens | — | report | 8 tools; paid once per session on top of tokens.learn, which docs/05 scopes to config + spec + theme |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.3 ms | 3 ms | ✅ | worst type (donut) on the worst shape — bar 0.20 ms / 6.5 KB · line 0.14 ms / 4.3 KB · area 0.17 ms / 4.5 KB · donut 0.30 ms / 6.9 KB · lollipop 0.25 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 1.82 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 1.15 ms / 10.5 KB · wide 1.31 ms / 11.9 KB · feedback 1.82 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 0.93 ms | 15 ms | ✅ | worst shape (ladder) at the 40-node cap, layout cache defeated — ladder 40 steps 0.93 ms / 13.7 KB · retry loop 38 steps 0.86 ms / 13.2 KB · nested 40 steps 0.91 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |
| `page.js.kb` | 0 KB | 0 KB | ✅ | editorial: 6 routes × 1280/390 px — /posts/every-primitive-once/, /about/, /authors/sunny/, /, /category/engineering/, /tag/markdown/; worst /posts/every-primitive-once/ @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `page.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 12 route/viewport pairs |
| `page.bytes.kb` | 27.06 KB | — | report | worst /posts/every-primitive-once/ @ 1280: 14.08 KB html + 9.8 KB css + 3.19 KB img, 3 requests — uncompressed, which no host serves; report-only |
| `page.lcp` | 176 ms | — | report | worst /posts/every-primitive-once/ @ 390; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `page.cls` | 0  | 0.05  | ✅ | worst /posts/every-primitive-once/ @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
