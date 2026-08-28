# snypd bench — latest

**Version** 0.1.0-s13 · **Bun** 1.4.0 · **Date** 2026-08-28T06:03:44.947Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 535.9 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 5152 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 50091.8 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 18.5 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 11.8 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 28.1 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 465.6 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 106.6 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 3996.9 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart` | 28.7 ms | 50 ms | ✅ |  |
| `serve.ttfb` | 0.15 ms | — | report | static dist/ over Bun.serve — the floor the preview server is measured against |
| `preview.ttfb` | 0.13 ms | 50 ms | ✅ | serve --preview, unchanged tree, drafts included; review page served |
| `tokens.page.md` | 510 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1360 tokens | — | report |  |
| `tokens.page.reduction` | 62.5 % | — | report | vs this theme's own HTML — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn` | 4450 tokens | 6000 tokens | ✅ | 16 resources |
| `tokens.page.html.editorial` | 1371 tokens | — | report | editorial theme |
| `tokens.page.reduction.editorial` | 62.8 % | — | report | vs this theme's own HTML (editorial) — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn.editorial` | 4639 tokens | 6000 tokens | ✅ | 16 resources · editorial theme |
| `tokens.tools` | 1493 tokens | — | report | 8 tools; paid once per session on top of tokens.learn, which docs/05 scopes to config + spec + theme |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.24 ms | 3 ms | ✅ | worst type (donut) on the worst shape — bar 0.17 ms / 6.5 KB · line 0.12 ms / 4.3 KB · area 0.15 ms / 4.5 KB · donut 0.24 ms / 6.8 KB · lollipop 0.21 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 1.37 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 1.06 ms / 10.4 KB · wide 1.14 ms / 11.9 KB · feedback 1.37 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 0.75 ms | 15 ms | ✅ | worst shape (nested) at the 40-node cap, layout cache defeated — ladder 40 steps 0.62 ms / 13.7 KB · retry loop 38 steps 0.62 ms / 13.1 KB · nested 40 steps 0.75 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |
| `page.js.kb` | 0 KB | 0 KB | ✅ | editorial: 6 routes — /posts/every-primitive-once/, /about/, /authors/sunny/, /, /category/engineering/, /tag/markdown/; worst /posts/every-primitive-once/ (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `page.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 on 6 routes (worst /posts/every-primitive-once/) |
| `page.bytes.kb` | 27.83 KB | — | report | worst route /posts/every-primitive-once/: 13.99 KB html + 10.66 KB css + 3.19 KB img, 3 requests; report-only |
| `page.lcp` | 104 ms | — | report | worst route /posts/every-primitive-once/; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `page.cls` | 0  | — | report | worst route /posts/every-primitive-once/; layout shift is theme-caused and *is* comparable off localhost; report-only until the editorial pass lands (S14) |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
