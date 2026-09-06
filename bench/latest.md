# snypd bench — latest

**Version** 0.1.2 · **Bun** 1.4.0 · **Date** 2026-09-06T09:11:26.353Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `build.cold.100` | 644.5 ms | 2000 ms | ✅ | 113 routes, no dist, no index |
| `build.incremental.100` | 16.6 ms | 300 ms | ✅ | one body edit → 1 rendered, 121 cached |
| `build.noop.100` | 13 ms | — | report | touch only (mtime): stat + one hash, nothing rendered; report-only |
| `lint.100` | 14.8 ms | 100 ms | ✅ | 0 errors · 0 warnings; mdast cache warm |
| `lint.100.cold` | 437.7 ms | — | report | parse (micromark) + lint from an empty cache; report-only |
| `mcp.coldStart.binary` | 37.3 ms | 50 ms | ✅ | the artefact a release ships (`bun build --compile --splitting`), spawn → `initialize`; D2's lane since S18c · median of 15 interleaved rounds |
| `mcp.coldStart` | 36.5 ms | — | report | report-only since S18c: `bun packages/mcp/src/server.ts`, the dev loop, not the thing anyone installs — interleaved with the binary lane, so the delta between the two rows is real even when the box is loaded |
| `serve.ttfb` | 0.18 ms | — | report | static dist/ over Bun.serve — the floor the preview server is measured against |
| `preview.ttfb` | 0.16 ms | 50 ms | ✅ | the preview server (`snypd dev`), unchanged tree, drafts included; review page served |
| `desk.ttfb` | 3.65 ms | — | report | report-only (S19a): `/_snypd` on the same server and the same unchanged tree. The Desk inherits D2's 50 ms rather than owning it, and this is the first session that can say whether it is inside it |
| `tokens.page.md` | 510 tokens | 2500 tokens | ✅ |  |
| `tokens.page.html` | 1510 tokens | — | report |  |
| `tokens.page.reduction` | 66.2 % | — | report | vs this theme's own HTML — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn` | 4522 tokens | 6000 tokens | ✅ | 17 resources |
| `tokens.page.html.editorial` | 1539 tokens | — | report | editorial theme |
| `tokens.page.reduction.editorial` | 66.9 % | — | report | vs this theme's own HTML (editorial) — how thin this theme already is, not what an agent saves; low is good (docs/07 decision 15) |
| `tokens.learn.editorial` | 4648 tokens | 6000 tokens | ✅ | 17 resources · editorial theme |
| `tokens.tools` | 2230 tokens | 3000 tokens | ✅ | 11 always listed (content.* + find_tools); paid every turn, on top of tokens.learn, which docs/05 scopes to config + spec + theme |
| `tokens.tools.full` | 3649 tokens | — | report | the same 14 tools with the catalogue listed rather than found — what deferring it saves a turn (docs/07 decision 38); report-only |
| `surface.completeness` | 100 % | ≥ 100 % | ✅ | 8/8: ✓ llms.txt, ✓ .md twin, ✓ Accept: text/markdown, ✓ link rel=alternate, ✓ JSON API, ✓ feed.xml, ✓ sitemap.xml, ✓ JSON-LD; public MCP joins in S19 |
| `viz.chart.renderMs` | 0.31 ms | 3 ms | ✅ | worst type (lollipop) on the worst shape — bar 0.24 ms / 6.5 KB · line 0.14 ms / 4.3 KB · area 0.14 ms / 4.5 KB · donut 0.28 ms / 6.9 KB · lollipop 0.31 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 1.96 ms | 15 ms | ✅ | worst shape (feedback) at the 40-node cap, layout cache defeated — chain 1.48 ms / 10.5 KB · wide 1.77 ms / 11.9 KB · feedback 1.96 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 1.11 ms | 15 ms | ✅ | worst shape (nested) at the 40-node cap, layout cache defeated — ladder 40 steps 1.02 ms / 13.7 KB · retry loop 38 steps 1.07 ms / 13.2 KB · nested 40 steps 1.11 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |
| `suggest.precision` | 1  | ≥ 0.8  | ✅ | 17/17 suggestions matched a label over 20 posts, 7 of which are labelled with no upgrade |
| `suggest.recall` | 1  | — | report | 17/17 labelled upgrades found; report-only — a miss costs the author nothing, a false positive rewrites their post |
| `suggest.ms` | 5.63 ms | — | report | per post: parse + shapes + score + verify (the verify pass lints each candidate against the document it would land in) |

CI passes at ≤ 80 % of budget (docs/07 §3), except where a row is a counted design statement rather than a clock, which passes at ≤ budget. Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
