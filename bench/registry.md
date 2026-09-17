# snypd bench — registry

**Version** 0.1.4 · **Bun** 1.4.0 · **Date** 2026-09-17T19:45:03.100Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `registry.steps` | 12 steps | ≥ 12 steps | ✅ | 12/12 answered as docs/20 §2.4 says, driver `scripted` |
| `registry.site` | 1  | ≥ 1  | ✅ | 9/9 checks on the site the run left |
| `registry.calls` | 18 calls | — | report | 1·0 2·2 3·1 4·1 5·2 6·2 7·3 8·1 9·1 10·1 11·1 12·2 · +1 final lint — the reference route is 18 with it, gated exactly in the test |
| `registry.reads` | 4 reads | — | report | resources and tools/list — free by decision 38, counted so the split stays honest |
| `registry.tokens` | 9638 tokens | — | report | o200k both directions — 705 sent, 8933 returned |
| `registry.wallMs` | 4222 ms | — | report | spawn → the site built twice, report-only (three builds, a preview and an explain dominate) |

CI passes at ≤ 80 % of budget (docs/07 §3), except where a row is a counted design statement rather than a clock, which passes at ≤ budget. Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


- ✅ 1. reads `snypd://types` and `snypd://config`
  # 13 more untouched: <inherited from types.post> · snypd://types: work with client required
- ✅ 2. `site` › explain_config `types.work.layout`
  `types.work.layout` = "work" ← snypd.yaml:45, overrides inherited "post" (types.post.layout, @snypd/spec default)
- ✅ 3. `content.create` type `work`, no `client`
  2 error [frontmatter] Frontmatter is missing required field `client`
- ✅ 4. adds `client`, `service: [product, tooling]`, `industry: hospitality`
  update work/the-ledger → /work/the-ledger (draft)
- ✅ 5. `content.suggest_blocks`
  applied 1 of 1 to work/the-ledger → /work/the-ledger
- ✅ 6. `content.publish`
  publishing work/the-ledger needs a human
- ✅ 7. a person approves the review page; the agent publishes again, reads the history, then publishes a note
  landed on main as 1b78422c · landed on main as bbba60bd
- ✅ 8. `content.query` type `work`, `service` = `product`, published
  4 items · published work/the-ledger  The ledger  2026-09-18
- ✅ 9. `content.explain` work/the-ledger
  ✎ autolink stages.transform — changed the tree in place — 1 link added
- ✅ 10. `site` › set_redirect `/posts/the-ledger` → `/work/the-ledger`
  /posts/the-ledger → /work/the-ledger (301)
- ✅ 11. `site` › build
  lists: /posts/ Notes (4 post) · /work/ Work (7 work) · 15 term pages
- ✅ 12. `theme` › set `editorial`, `site` › build
  work renders through `post` — editorial declares no `work` layout

- ✅ the case is on `main`, published, with its client — status published, client "Cooperativa do Bonfim"
- ✅ the case carries the chart the table became — :::chart present
- ✅ the publish commit carries who approved it — Snypd-Approved-By: a human at the review page at 2026-09-17T19:45:00.626Z
- ✅ the note is on `main`, published — status published
- ✅ the redirect is in `site.redirects` — /posts/the-ledger → /work/the-ledger
- ✅ the theme is `editorial` — theme.use = editorial
- ✅ every route the demo names is in `dist/` — 8 present, the redirect page included
- ✅ the feed carries both types — the case, the note
- ✅ the site lints with no errors — 0 errors, 2 warnings
