# snypd bench — agent

**Version** 0.1.4 · **Bun** 1.4.0 · **Date** 2026-09-15T09:22:25.190Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `agent.goal` | 1  | ≥ 1  | ✅ | 15/15 checks, driver `claude:sonnet` |
| `agent.calls.draft` | 3 calls | 8 calls | ✅ | D1 literally: nothing → a lint-clean draft of the new post |
| `agent.calls` | 22 calls | — | report | upgrade 7 · theme 4 · write 3 · publish 6 · build 2 · +1 final lint — reference route 18, gated exactly at 19 in the test |
| `agent.reads` | 5 reads | — | report | resources and tools/list — free by decision 38, counted so the split stays honest |
| `agent.tokens` | 15842 tokens | — | report | o200k both directions — 1714 sent, 14128 returned |
| `agent.wallMs` | 99921 ms | — | report | spawn → published site, report-only (build and preview dominate) |
| `tokens.learn.kill` | 5654 tokens | 6000 tokens | ✅ | D4 on the site the kill test leaves, all four plugins on (S21): config + spec + primitives + theme, the way `tokens.learn` counts them |
| `agent.model.tokens` | 600651 tokens | — | report | what `claude-sonnet-5`'s own context paid — 591856 in (cache included), 8795 out, 27 turns, $0.5219; ended `success`; report-only |

CI passes at ≤ 80 % of budget (docs/07 §3), except where a row is a counted design statement rather than a clock, which passes at ≤ budget. Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


- ✅ **cold-start carries a `chart`** — :::chart present (a four-row table of one measurement per row)
- ✅ **publishing-a-draft carries a `flow`** — :::flow present (a numbered list that branches and loops back)
- ✅ **why-only-mcp carries a `faq`** — :::faq present (a run of question headings with answers under them)
- ✅ **a new post `the-kill-test` was written** — present
- ✅ **the new post carries a `chart`** — :::chart present
- ✅ **the new post carries a `flow`** — :::flow present
- ✅ **the theme is `editorial`** — theme.use = editorial
- ✅ **at least 2 tokens retuned** — 2 overridden: color.accent, radius
- ✅ **every post is published** — 4/4 published
- ✅ **the site lints clean** — 0 errors, 9 warnings
- ✅ **the site builds** — dist/index.html present
- ✅ **`analytics` put its beacon on the page (a slot)** — plausible script tag in body-end, data-domain from site.url
- ✅ **`autolink` linked the first mention of a term in prose (a transform)** — “benchmarks” in the second paragraph links to /tag/benchmarks/
- ✅ **`changelog` merged its `release` type into the site (YAML only)** — types.release → content/changelog
- ✅ **`indexnow` emitted its key file (an emit)** — dist/indexnow/kill-test-indexnow-key-0001.txt carries the key
