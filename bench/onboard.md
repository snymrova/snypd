# snypd bench — onboard

**Version** 0.1.0-s18c · **Bun** 1.4.0 · **Date** 2026-08-31T15:55:22.882Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `onboard.handoff` | 6 actions | 5 actions | ❌ over budget | paste · answer · approve-shell · restart · answer-url · approve-post — 3 irreducible (decision 65), 3 of 6 established by the product refusing or the file being absent |
| `onboard.handoff.fresh` | 7 actions | — | report | a machine with no git author identity: git refused the scaffold commit for want of an identity; `init` printed the two lines that fix it, so the agent can run them with one approval |
| `onboard.ttfv` | 1.91 s | 5 s | ✅ | empty directory → `init` → `dev` → the Desk answering 200, against the compiled binary (docs/08 F6) |
| `onboard.ttfp` | 3.82 s | 60 s | ✅ | the paste → a lint-clean draft with a review URL · driver: reference driver (no model) — no model latency in this number, and S21 substitutes three that have it |
| `onboard.published` | 4.38 s | — | report | …and on to a published post, through both refusals — report-only: it is bounded by how fast a person reads |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


## The handoff — 6 human actions

| # | Step | What a person does | Decision 65 | Established by | Why |
|---|---|---|---|---|---|
| 1 | §2.1 | paste the README sentence into the harness | — | `structural` | the entry point; no binary has run yet |
| 2 | §2.3 | answer what the site is called, in one message | — | `structural` | one question, one answer — "Ash & Ember" |
| 3 | §2.4 | approve the shell command the agent wants to run | **irreducible** | `structural` | a correct security prompt, not friction — decision 65 keeps it out of any optimisation |
| 4 | §2.7 | restart the harness so the snypd tools load | **irreducible** | `absent` | .mcp.json did not exist when the harness started and does now — a harness reads it once, at startup, which is not ours to change |
| 5 | §2.12 | answer where the site will be served | — | `refused` | publish refused: the feed, sitemap and JSON-LD are absolute, so the origin is due here — decision 63 keeps it off step 4, and this is where the debt comes due |
| 6 | §2.12 | read the post on the review page and approve it | **irreducible** | `refused` | publish refused without an approval for this exact version — the product's safety claim, and the second action decision 65 forbids optimising away |


**On a machine with no git author identity** — a CI runner, a container, a fresh laptop — there is a sixth: set a git author identity (`git config --global user.name` / `user.email`). git refused the scaffold commit for want of an identity; `init` printed the two lines that fix it, so the agent can run them with one approval.

## F4 — survives the restart

`.snypd/` deleted under a running `dev`, then `site` › doctor asked again: **12 derived facts, 0 lost**.
Everything is re-derived from git and the config on the request. Doctor's own heartbeat facts did not move, and cannot: the session asking is the harness, and decision 70 has in-process memory outrank the file so a server cannot report itself unspoken-to while answering. The running preview's record of where it bound (deskUrl, dev) went with the directory it lives in, and returns when that process writes it again.
The Desk still renders with its cache deleted: yes. Its first-run checklist came back — the heartbeat is the one fact the Desk can only get from the file, so deleting it correctly returns that row to unfinished.

Driver `reference driver (no model)` · binary `/tmp/snypd-onboard-bin-z4F7Ln/snypd` · review URL handed back: yes · lint clean: yes
