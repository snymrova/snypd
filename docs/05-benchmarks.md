# 05 — Benchmarks

`snypd bench` is a CLI verb, an MCP tool (`bench.run`) and a CI step. Budgets live in `snypd.yaml › bench.budgets`; a breach fails the build. Results are written as Markdown to `bench/latest.md` and exposed as `snypd://bench/latest`. Published on the project site per release with methodology. Corpora: 100 / 1k / 10k synthetic posts using every primitive, checked in.

## Speed
| Metric | How | Default budget |
|---|---|---|
| LCP, CLS, INP, TBT, Lighthouse perf — every URL | Unlighthouse CI (parallel Lighthouse over the crawl) | LCP ≤ 1.2 s · CLS ≤ 0.05 · perf ≥ 98 |
| Client JS per page | renderer emit stats | 0 KB content pages; ≤ 15 KB with client primitives |
| CSS per page | emit stats | ≤ 30 KB |
| Build, cold / incremental | `snypd bench build` on 100 / 1k / 10k | ≤ 2 s / 100 cold; ≤ 300 ms incremental single-post |
| Markdown engines | remark vs `Bun.markdown` on 10k | report only |
| TTFB, preview/SSR | curl loop against `snypd serve --preview` | ≤ 50 ms local |
| MCP server cold start | spawn → `initialize` response | ≤ 50 ms |
| Chart render / bytes (D3) | `snypd bench` renders every type on the worst shape the spec allows (12 points, long labels, grouped 2-series); worst type reported, not the mean | ≤ 3 ms · ≤ 12 KB per chart |
| Diagram / flow render / bytes (D3) | same, at the 40-node lint cap (S9–S10) | ≤ 15 ms · ≤ 25 KB each |

## Beauty (the parts that are measurable)
| Metric | How | Budget |
|---|---|---|
| Accessibility | Lighthouse a11y | 100 |
| Typographic invariants | `theme.check`: line length 45–80ch, modular type scale, rhythm on token grid, contrast | pass |
| Visual regression | `Bun.WebView` locally / Playwright in CI: primitive × theme × 3 viewports, pixel diff | 0 unexpected diffs |
| Primitive coverage | `theme.coverage` | 100 % or explicit fallback |
| Human panel | quarterly, 5 designers, blind vs Ghost / Substack / Medium defaults | published, no budget |

## Agent-friendliness (nobody else benchmarks this)
| Metric | How | Budget |
|---|---|---|
| Tokens per page, `.md` twin vs HTML | standard tokeniser on both | median ≤ 2,500; ≥ 85 % reduction — the reduction is measured on a styled theme (`editorial`, S13), not on `base`, which has no chrome to save (docs/07 decision 15) |
| Tokens to learn the site | size of `config` + `spec/primitives` + `theme` resources | ≤ 6,000 |
| Time-to-first-post | scripted run from a fresh harness with only the MCP: tool calls and seconds to a lint-clean published draft; 3 models | ≤ 8 tool calls |
| First-attempt lint pass rate on `write-post` | 20 topics × 3 models | ≥ 80 % |
| `suggest_blocks` precision | 50 hand-labelled posts | ≥ 0.8 |
| MCP latency p50 / p95 per tool | server timing | reads ≤ 50 ms; `render_preview` ≤ 2 s |
| Agent-read surface completeness | `snypd bench` probes the built corpus and the server: llms.txt, `.md` twin, `Accept: text/markdown`, `link rel=alternate` (markdown + feed), JSON API, feed, sitemap+robots, JSON-LD; public MCP joins in S19 | 100 %, enforced from S7 |

## Tooling
Unlighthouse CI · `bun test --parallel --shard` · `Bun.WebView` / Playwright · `--cpu-prof-md` / `--heap-prof-md` / `--metafile-md` as attachable profiles · a tiny scripted-agent harness in `packages/bench/agent/` that drives the MCP with a fixed prompt and counts calls.
