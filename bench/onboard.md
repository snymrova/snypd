# snypd bench — onboard

**Version** 0.1.6 · **Bun** 1.4.0 · **Date** 2026-09-22T16:56:14.581Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `onboard.handoff` | 3 actions | 5 actions | ✅ | the front door (docs/08 §2): type · say · allow-host — 1 irreducible (decision 65), 1 of 3 established by the product refusing or the file being absent |
| `onboard.handoff.relay` | 5 actions | — | report | the sentence pasted into an open harness: paste · answer · approve-shell · restart · allow-host — the restart and the name question are the two the front door does not pay (decision 178) |
| `onboard.handoff.fresh` | 4 actions | — | report | a machine with no git author identity: git refused the scaffold commit for want of an identity; `init` printed the two lines that fix it, so the agent can run them with one approval |
| `onboard.ttfv` | 2.98 s | 5 s | ✅ | a directory that does not exist yet → `init` → `dev` → the Desk answering 200, against the artefact named at the foot of this file (docs/08 F6) |
| `onboard.ttfp` | 6.74 s | 60 s | ✅ | the typed line → a lint-clean draft with a review URL · driver: reference driver (no model) — no model latency in this number, and S21 substitutes three that have it |
| `onboard.published` | 7.55 s | — | report | …and on to a published post — report-only: it is bounded by how fast a person reads |
| `onboard.live` | 2 uploads | 2 uploads | ✅ | https://ash-and-ember.stub.workers.dev — the first `site` › deploy, against the stub wrangler: login, build, upload, the URL read back, `site.url` set, build and upload again |

CI passes at ≤ 80 % of budget (docs/07 §3), except where a row is a counted design statement rather than a clock, which passes at ≤ budget. Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


## The handoff — 3 human actions

The front door (docs/08 §2): `bunx @snypd/cli init ash-and-ember && cd ash-and-ember && claude`, then the sentence, then the host's page. `init` was given a directory and no flags.

| # | Step | What a person does | Decision 65 | Established by | Why |
|---|---|---|---|---|---|
| 1 | §2.1 | type the one line: `bunx @snypd/cli init ash-and-ember && cd ash-and-ember && claude` | — | `structural` | the front door is the command (decision 178), and it is typed once: `init` made ash-and-ember/ and printed `cd ash-and-ember && claude` as its last line, so the rest of the line is read off the screen rather than remembered |
| 2 | §2.3 | say the sentence `init` printed: *Write me a first post and put it online.* | — | `structural` | nobody was asked for a name (decision 63: it falls back to the directory) or a URL (the host answers it at deploy), so the sentence is the whole of the second action |
| 3 | §2.9 | click allow in the tab `wrangler login` opened | **irreducible** | `refused` | the host had never seen this machine; the tool ran its login and waited — nobody gets a URL on somebody else's host anonymously (docs/31 §3), and the credential lands in the host's own store, never ours |


**On a machine with no git author identity** — a CI runner, a container, a fresh laptop — there is one more: set a git author identity (`git config --global user.name` / `user.email`). git refused the scaffold commit for want of an identity; `init` printed the two lines that fix it, so the agent can run them with one approval.

## The second door — 5 human actions

The Desk's sentence, pasted into a harness that is already open (docs/08 §9, decisions 58–60). Step numbers here are the fourteen-row table decision 178 replaced, which is where they were measured.

| # | Step | What a person does | Decision 65 | Established by | Why |
|---|---|---|---|---|---|
| 1 | §2.1 | paste the Desk's sentence into the harness that is already open | — | `structural` | the second door (docs/08 §9): somebody already inside a session, for whom the README's line would mean closing it |
| 2 | §2.3 | answer what the site is called, in one message | — | `structural` | one question, one answer — "Ash & Ember" |
| 3 | §2.4 | approve the shell command the agent wants to run | **irreducible** | `structural` | a correct security prompt, not friction — decision 65 keeps it out of any optimisation |
| 4 | §2.7 | restart the harness so the snypd tools load | **irreducible** | `absent` | .mcp.json did not exist when the harness started and does now — a harness reads it once, at startup, which is not ours to change |
| 5 | §2.14 | click allow in the tab `wrangler login` opened | **irreducible** | `refused` | the host had never seen this machine; the tool ran its login and waited — nobody gets a URL on somebody else's host anonymously (docs/31 §3), and the credential lands in the host's own store, never ours |

The two the front door does not pay: **the name question** — `init` asks nothing when a person runs it, because the name falls back to the directory (decision 63) — and **the restart**, because the harness is opened after `.mcp.json` exists rather than before. `.mcp.json` on disk when the harness started: front **yes**, relay **no** — the same observation, and the whole of the difference.

## F4 — survives the restart

`.snypd/` deleted under a running `dev`, then `site` › doctor asked again: **15 derived facts, 0 lost**.
Everything is re-derived from git and the config on the request. Doctor's own heartbeat facts did not move, and cannot: the session asking is the harness, and decision 70 has in-process memory outrank the file so a server cannot report itself unspoken-to while answering. The running preview's record of where it bound (deskUrl, dev) went with the directory it lives in, and returns when that process writes it again. The last deploy's note of what the host answered (lastDeploy) went too, and doctor now says *no deploy on record here* — true, and `site.url` is in the config the deploy committed.
The Desk still renders with its cache deleted: yes. Its first-run checklist came back — the heartbeat is the one fact the Desk can only get from the file, so deleting it correctly returns that row to unfinished.

Driver `reference driver (no model)` · binary `/tmp/snypd-onboard-bin-kjdpHN/snypd` · review URL handed back: yes · lint clean: yes
`init` printed `cd ash-and-ember && claude` as its last line and *Write me a first post and put it online.* as the sentence to say; the site ended at https://ash-and-ember.stub.workers.dev.
