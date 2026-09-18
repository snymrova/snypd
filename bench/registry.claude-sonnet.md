# snypd bench — registry

**Version** 0.1.4 · **Bun** 1.4.0 · **Date** 2026-09-17T19:42:19.462Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `registry.steps` | 10 steps | ≥ 12 steps | ❌ over budget | 10/12 answered as docs/20 §2.4 says — missed: 2, 7 |
| `registry.site` | 1  | ≥ 1  | ✅ | 9/9 checks on the site the run left |
| `registry.calls` | 27 calls | — | report | 1·0 2·0 3·1 4·2 5·4 6·2 7·3 8·8 9·2 10·1 11·1 12·2 · +1 final lint — the reference route is 18 with it, gated exactly in the test |
| `registry.reads` | 3 reads | — | report | resources and tools/list — free by decision 38, counted so the split stays honest |
| `registry.tokens` | 13144 tokens | — | report | o200k both directions — 955 sent, 12189 returned |
| `registry.wallMs` | 143174 ms | — | report | spawn → the site built twice, report-only (three builds, a preview and an explain dominate) |
| `registry.model.tokens` | 1000884 tokens | — | report | what `claude-sonnet-5`'s own context paid — 992330 in (cache included), 8554 out, 30 turns, $0.7827; ended `success`; report-only |

CI passes at ≤ 80 % of budget (docs/07 §3), except where a row is a counted design statement rather than a clock, which passes at ≤ budget. Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


- ✅ 1. reads `snypd://types` and `snypd://config`
  # 13 more untouched: <inherited from types.post> · snypd://types/work: work with client required
- ❌ 2. `site` › explain_config `types.work.layout`
  the layout's line and the value it overrode — never called
- ✅ 3. `content.create` type `work`, no `client`
  {"ok":true,"type":"work","slug":"the-ledger","route":"/work/the-ledger","path":"content/work/the-ledger.md","status":"draft","git":{"enabled":true,"branch":"snypd/drafts","base":"main","committed":true,"sha":"4e1110985c568852548b87745e74ac1d7c4b1925"},"lint":{"errors":1,"warnings":0,"diagnostics":[{"file":"content/work/the-ledger.md","rule":"frontmatter","n":0,"severity":"error","line":2,"message":"Frontmatter is missing required field `client`","hint":"Add `client:` — Who it was for. Shown in the facts strip."}]}}
- ✅ 4. adds `client`, `service: [product, tooling]`, `industry: hospitality`
  /work/the-ledger (draft) on snypd/drafts, lint 0 errors
- ✅ 5. `content.suggest_blocks`
  applied: chart
- ✅ 6. `content.publish`
  publishing work/the-ledger needs a human
- ❌ 7. a person approves the review page; the agent publishes again, reads the history, then publishes a note
  the history with the approval on the publish — never called
- ✅ 8. `content.query` type `work`, `service` = `product`, published
  4 published work: the-ledger, kiln-to-table, stem, sela
- ✅ 9. `content.explain` work/the-ledger
  autolink changed the tree in place — 1 link added; outputs work/the-ledger/index.html, work/the-ledger/index.md, api/work/the-ledger.json
- ✅ 10. `site` › set_redirect `/posts/the-ledger` → `/work/the-ledger`
  /posts/the-ledger → /work/the-ledger (301), committed 6718259f → main 63f114b3
- ✅ 11. `site` › build
  lists: /work/ Work (7) · /posts/ Notes (4) · 15 term pages
- ✅ 12. `theme` › set `editorial`, `site` › build
  work renders through `post` — editorial declares no `work` layout

- ✅ the case is on `main`, published, with its client — status published, client "Cooperativa do Bonfim"
- ✅ the case carries the chart the table became — :::chart present
- ✅ the publish commit carries who approved it — Snypd-Approved-By: a human at the review page at 2026-09-17T19:40:40.117Z
- ✅ the note is on `main`, published — status published
- ✅ the redirect is in `site.redirects` — /posts/the-ledger → /work/the-ledger
- ✅ the theme is `editorial` — theme.use = editorial
- ✅ every route the demo names is in `dist/` — 8 present, the redirect page included
- ✅ the feed carries both types — the case, the note
- ✅ the site lints with no errors — 0 errors, 2 warnings
