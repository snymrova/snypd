# snypd bench — agent

**Version** 0.1.0-s16 · **Bun** 1.4.0 · **Date** 2026-08-28T12:20:21.225Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `agent.goal` | 0.273  | ≥ 1  | ❌ over budget | 3/11 — failed: upgrade.publishing-a-draft, upgrade.why-only-mcp, new.exists, new.chart, new.flow, theme.swapped, theme.tokens, published |
| `agent.calls.draft` | 2 calls | 8 calls | ✅ | D1 literally: nothing → a lint-clean draft of the new post |
| `agent.calls` | 18 calls | — | report | upgrade 6 · theme 3 · write 2 · publish 5 · build 2 · +1 final lint — reference route 18, gated exactly at 19 in the test |
| `agent.reads` | 4 reads | — | report | resources and tools/list — free by decision 38, counted so the split stays honest |
| `agent.tokens` | 7478 tokens | — | report | o200k both directions — 899 sent, 6579 returned |
| `agent.wallMs` | 5312 ms | — | report | spawn → published site, report-only (build and preview dominate) |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


- ✅ **cold-start carries a `chart`** — :::chart present (a four-row table of one measurement per row)
- ❌ **publishing-a-draft carries a `flow`** — still plain prose — a numbered list that branches and loops back
- ❌ **why-only-mcp carries a `faq`** — still plain prose — a run of question headings with answers under them
- ❌ **a new post `the-kill-test` was written** — missing
- ❌ **the new post carries a `chart`** — no post to check
- ❌ **the new post carries a `flow`** — no post to check
- ❌ **the theme is `editorial`** — theme.use = base
- ❌ **at least 2 tokens retuned** — none overridden
- ❌ **every post is published** — 3/4 published: cold-start, publishing-a-draft, why-only-mcp
- ✅ **the site lints clean** — 0 errors, 4 warnings
- ✅ **the site builds** — dist/index.html present
