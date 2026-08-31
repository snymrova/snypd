# snypd bench — agent

**Version** 0.1.0-s18c · **Bun** 1.4.0 · **Date** 2026-08-31T11:37:16.326Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `agent.goal` | 1  | ≥ 1  | ✅ | 11/11 checks, driver `scripted` |
| `agent.calls.draft` | 2 calls | 8 calls | ✅ | D1 literally: nothing → a lint-clean draft of the new post |
| `agent.calls` | 18 calls | — | report | upgrade 6 · theme 3 · write 2 · publish 5 · build 2 · +1 final lint — reference route 18, gated exactly at 19 in the test |
| `agent.reads` | 4 reads | — | report | resources and tools/list — free by decision 38, counted so the split stays honest |
| `agent.tokens` | 7350 tokens | — | report | o200k both directions — 899 sent, 6451 returned |
| `agent.wallMs` | 1081 ms | — | report | spawn → published site, report-only (build and preview dominate) |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


- ✅ **cold-start carries a `chart`** — :::chart present (a four-row table of one measurement per row)
- ✅ **publishing-a-draft carries a `flow`** — :::flow present (a numbered list that branches and loops back)
- ✅ **why-only-mcp carries a `faq`** — :::faq present (a run of question headings with answers under them)
- ✅ **a new post `the-kill-test` was written** — present
- ✅ **the new post carries a `chart`** — :::chart present
- ✅ **the new post carries a `flow`** — :::flow present
- ✅ **the theme is `editorial`** — theme.use = editorial
- ✅ **at least 2 tokens retuned** — 2 overridden: color.accent, font.body
- ✅ **every post is published** — 4/4 published
- ✅ **the site lints clean** — 0 errors, 3 warnings
- ✅ **the site builds** — dist/index.html present
