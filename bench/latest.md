# snypd bench — latest

**Version** 0.1.0-s18c · **Bun** 1.4.0 · **Date** 2026-08-31T15:14:46.376Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 292.4 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.cold.1000` | 2642.6 ms | 20000 ms | ✅ | 1013 routes, no dist, no index |
| `build.cold.10000` | 27000.5 ms | 200000 ms | ✅ | 10013 routes, no dist, no index |
| `build.incremental.100` | 9.8 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 5.7 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 7.7 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 216.5 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `lint.1000` | 66 ms | 1000 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.1000.cold` | 2188.7 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart.binary` | 21.8 ms | 50 ms | ✅ | the artefact a release ships (`bun build --compile --splitting`), spawn → `initialize`; D2's lane since S18c · median of 21 interleaved rounds |
| `mcp.coldStart` | 21.2 ms | — | report | report-only since S18c: `bun packages/mcp/src/server.ts`, the dev loop, not the thing anyone installs — interleaved with the binary lane, so the delta between the two rows is real even when the box is loaded |
| `serve.ttfb` | 0.13 ms | — | report | static dist/ over Bun.serve — the floor the preview server is measured against |
| `preview.ttfb` | 0.15 ms | 50 ms | ✅ | the preview server (`snypd dev`), unchanged tree, drafts included; review page served |
| `tokens.page.md` | 510 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1381 tokens | — | report |  |
| `tokens.page.reduction` | 63.1 % | — | report | vs this theme's own HTML — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn` | 4494 tokens | 6000 tokens | ✅ | 17 resources |
| `tokens.page.html.editorial` | 1392 tokens | — | report | editorial theme |
| `tokens.page.reduction.editorial` | 63.4 % | — | report | vs this theme's own HTML (editorial) — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn.editorial` | 4620 tokens | 6000 tokens | ✅ | 17 resources · editorial theme |
| `tokens.tools` | 2230 tokens | 3000 tokens | ✅ | 11 always listed (content.* + find_tools); paid every turn, on top of tokens.learn, which docs/05 scopes to config + spec + theme |
| `tokens.tools.full` | 3403 tokens | — | report | the same 14 tools with the catalogue listed rather than found — what deferring it saves a turn (docs/07 decision 38); report-only |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.11 ms | 3 ms | ✅ | worst type (bar) on the worst shape — bar 0.11 ms / 6.5 KB · line 0.07 ms / 4.3 KB · area 0.06 ms / 4.5 KB · donut 0.10 ms / 6.9 KB · lollipop 0.09 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 0.95 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 0.66 ms / 10.5 KB · wide 0.74 ms / 11.9 KB · feedback 0.95 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 0.71 ms | 15 ms | ✅ | worst shape (retry loop) at the 40-node cap, layout cache defeated — ladder 40 steps 0.40 ms / 13.7 KB · retry loop 38 steps 0.71 ms / 13.2 KB · nested 40 steps 0.45 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |
| `suggest.precision` | 1  | ≥ 0.8  | ✅ | 17/17 suggestions matched a label over 20 posts, 7 of which are labelled with no upgrade |
| `suggest.recall` | 1  | — | report | 17/17 labelled upgrades found; report-only — a miss costs the author nothing, a false positive rewrites their post |
| `suggest.ms` | 3.58 ms | — | report | per post: parse + shapes + score + verify (the verify pass lints each candidate against the document it would land in) |
| `page.js.kb` | 0 KB | 0 KB | ✅ | editorial: 6 routes × 1280/390 px — /posts/every-primitive-once/, /about/, /authors/sunny/, /, /category/engineering/, /tag/markdown/; worst /posts/every-primitive-once/ @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `page.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 12 route/viewport pairs |
| `page.bytes.kb` | 27.11 KB | — | report | worst /posts/every-primitive-once/ @ 1280: 14.12 KB html + 9.8 KB css + 3.19 KB img, 3 requests — uncompressed, which no host serves; report-only |
| `page.lcp` | 448 ms | — | report | worst /category/engineering/ @ 1280; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `page.cls` | 0  | 0.05  | ✅ | worst /posts/every-primitive-once/ @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |
| `desk.js.kb` | 0 KB | 0 KB | ✅ | desk: 2 routes × 1280/390 px — /_snypd, /_snypd/review/post/a-draft-in-flight; worst /_snypd @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `desk.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 4 route/viewport pairs |
| `desk.bytes.kb` | 17.22 KB | — | report | worst /_snypd @ 1280: 7.4 KB html + 9.83 KB css + 0 KB img, 2 requests — uncompressed, which no host serves; report-only |
| `desk.lcp` | 56 ms | — | report | worst /_snypd @ 1280; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `desk.cls` | 0  | 0.05  | ✅ | worst /_snypd @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |
| `desk.first.js.kb` | 0 KB | 0 KB | ✅ | first run: 2 routes × 1280/390 px — /_snypd, /; worst /_snypd @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `desk.first.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 4 route/viewport pairs |
| `desk.first.bytes.kb` | 18.5 KB | — | report | worst /_snypd @ 1280: 8.67 KB html + 9.83 KB css + 0 KB img, 2 requests — uncompressed, which no host serves; report-only |
| `desk.first.lcp` | 88 ms | — | report | worst /_snypd @ 1280; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `desk.first.cls` | 0  | 0.05  | ✅ | worst /_snypd @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.

