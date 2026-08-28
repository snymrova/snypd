# 05 — Benchmarks

`snypd bench` is a CLI verb, an MCP tool (`bench.run`) and a CI step. Budgets live in `snypd.yaml › bench.budgets`; a breach fails the build. Results are written as Markdown to `bench/latest.md` and exposed as `snypd://bench/latest`. Published on the project site per release with methodology. Corpora: 100 / 1k / 10k synthetic posts, checked in (10k generated on demand). A fourth, `corpora/theme`, is the *fixture* rather than a corpus: two posts, a page, an author, two terms and two rasters, carrying every primitive's own `example:` from the spec — it is what the browser suite and a theme review are run against, and it is far too small to time anything.

## Speed
| Metric | How | Default budget |
|---|---|---|
| LCP, CLS, INP, TBT, Lighthouse perf — every URL | v0.2: Unlighthouse CI (parallel Lighthouse over the crawl). **v0.1 (S13): `snypd bench page`** drives headless Chrome over the DevTools protocol against the built theme fixture — six routes, one per url shape, each measured **at 1280 and 390 px** (S14) with the worst of the two reported — and reports `page.lcp`, `page.cls` and `page.bytes.kb`. LCP off an unthrottled localhost is the shape of the page, not a field number, and is report-only; CLS is theme-caused and *is* comparable, so it is **gated from S14** at the ≤ 0.05 below. The second viewport is not decoration: a chart drawn at 640 px is flawless at 1280 and renders its 12 px labels at 6 px on a phone, which is what shipped for a session while the suite only looked at one width. A composite Lighthouse score comes from `bunx lighthouse` when one is to be published — not from a dependency (docs/07 decision 26) | LCP ≤ 1.2 s · CLS ≤ 0.05 · perf ≥ 98 |
| Client JS per page | **`page.js.kb`** (S13): script bytes over the wire plus inline `<script>` and `on*` handlers, measured in the browser. `application/ld+json` is data and is excluded | **0 KB, gated** on content pages; ≤ 15 KB with client primitives (v0.2) |
| CSS per page | emit stats; `page.bytes.kb` reports it per route beside the HTML and the images, **uncompressed** — no host serves it that way, so read it as a ceiling. The emitted sheet is minified (S14): `editorial` is 12.6 KB of readable source and 10.2 KB on disk, 3.9 → 2.7 KB gzipped. Not inlined into the HTML: that would triple the token cost of every page to save one cacheable request (docs/07 decision 31) | ≤ 30 KB |
| Build, cold / incremental | `snypd bench build` on 100 / 1k / 10k | ≤ 2 s / 100 cold; ≤ 300 ms incremental single-post |
| Markdown engines | remark vs `Bun.markdown` on 10k | report only |
| TTFB, preview/SSR | curl loop against `snypd serve --preview` | ≤ 50 ms local |
| MCP server cold start | spawn → `initialize` response | ≤ 50 ms |
| Chart render / bytes (D3) | `snypd bench` renders every type on the worst shape the spec allows (12 points, long labels, grouped 2-series); worst type reported, not the mean | ≤ 3 ms · ≤ 12 KB per chart |
| Diagram / flow render / bytes (D3) | `snypd bench` lays out three 40-node shapes — a deep chain, a wide bipartite layer, a graph with feedback edges — with the layout cache defeated; worst shape reported (flow joins in S10) | ≤ 15 ms · ≤ 25 KB each |

## Beauty (the parts that are measurable)
| Metric | How | Budget |
|---|---|---|
| Accessibility | **`page.a11y.violations`** (S13): axe-core — which *is* Lighthouse's accessibility category — run in the page on every url shape of the theme fixture at both viewports, which is the only site in the repo that renders all 13 primitives and all 5 layouts | **0 violations, gated** (Lighthouse a11y 100) |
| Typographic invariants | `theme.check`: line length 45–80ch, modular type scale, rhythm on token grid, contrast | pass |
| Visual regression | `Bun.WebView` locally / Playwright in CI: primitive × theme × 3 viewports, pixel diff | 0 unexpected diffs |
| Primitive coverage | `theme.coverage` | 100 % or explicit fallback |
| Human panel | quarterly, 5 designers, blind vs Ghost / Substack / Medium defaults | published, no budget |

## Agent-friendliness (nobody else benchmarks this)
| Metric | How | Budget |
|---|---|---|
| Tokens per page (`.md` twin) | standard tokeniser on the twin every route emits | median ≤ 2,500 — **this is the gated agent-cost metric**: it is what actually lands in a context window |
| Reduction vs this site's own HTML | `1 − tokens(twin)/tokens(html)`, measured on both lanes (`base` and `editorial`) | **report-only, and a low number is good news** — it measures how thin the theme's HTML already is, not what an agent saves (docs/07 decision 15) |
| Tokens to learn the site | size of `config` + `spec/primitives` + `theme` resources | ≤ 6,000 |
| Time-to-first-post | scripted run from a fresh harness with only the MCP: tool calls and seconds to a lint-clean published draft; 3 models | ≤ 8 tool calls |
| First-attempt lint pass rate on `write-post` | 20 topics × 3 models | ≥ 80 % |
| `suggest_blocks` precision | 50 hand-labelled posts | ≥ 0.8 |
| MCP latency p50 / p95 per tool | server timing | reads ≤ 50 ms; `render_preview` ≤ 2 s |
| Agent-read surface completeness | `snypd bench` probes the built corpus and the server: llms.txt, `.md` twin, `Accept: text/markdown`, `link rel=alternate` (markdown + feed), JSON API, feed, sitemap+robots, JSON-LD; public MCP joins in S19 | 100 %, enforced from S7 |

## Tooling
Unlighthouse CI · `bun test --parallel --shard` · `Bun.WebView` / Playwright · `--cpu-prof-md` / `--heap-prof-md` / `--metafile-md` as attachable profiles · a tiny scripted-agent harness in `packages/bench/agent/` that drives the MCP with a fixed prompt and counts calls.
