# Vercel as a host: capabilities, against the same eleven actions

**22 Sep 2026 · companion to "GitHub Pages as the default host" and "Findings: GitHub Pages readiness" · host facts as documented today; the two I am least sure of are marked ⚠ and need one afternoon against a real account.**

## Verdict

Vercel is the **most capable** of the three hosts for what snypd wants to do next — it covers the same five actions the others cover, softens the domain step further than either, and hands over **four of the nine capabilities** the parked cloud was going to provide (hosted previews, rollback, real redirects and `Accept: text/markdown` negotiation, image optimization). It is **not the safest default** for a new site, for one reason that is a sentence in Vercel's terms: the free Hobby plan is for **non-commercial use**. An agency's site — Ferrule — pays $20/month from day one, or breaks the terms.

The honest shape of the answer: the three hosts want to be **one adapter with three implementations**, and the default is a policy choice, not a capability one.

---

## 1. What Vercel does with the eleven actions

| Action | Vercel mechanism | Result |
|---|---|---|
| H5 answer the URL | project name is chosen at `vercel link`/first deploy; the production URL is `https://<name>.vercel.app` from then on; read back from `vercel project ls` or the deploy's output | ✕ removed |
| H6 GitHub repo | not needed — `vercel deploy` uploads `dist/` directly; git is optional (`vercel git connect` later) | ✕ removed |
| H7 remote | not needed | ✕ removed |
| H8 push | `vercel deploy --prod --yes` — seconds, not minutes | ✕ removed |
| H9 dashboard | `vercel.json` (already written by `deploy.ts:149`) carries the build settings; nothing typed in a browser | ✕ removed |
| H10 domain | `vercel domains add example.com` attaches and prints the records; **`vercel domains buy example.com`** buys one on the card on file — the purchase becomes a sentence, though the card is still a person's | ◐ → the smallest of the three |
| H11 identity | `vercel login` — browser or email once per machine; `npx vercel` means **no install** (unlike `gh`) | ＋ one login |

**Two actions for a developer with Vercel already on the machine; three otherwise.** Same floor as the other two.

Requires **decision 221** — the binary runs the host's CLI — exactly as the Cloudflare-CLI route does. Pages is the only route that does not.

---

## 2. Vercel against the nine capabilities the cloud was going to own

| Capability (from the cloud doc §4) | Vercel | How |
|---|---|---|
| Hosted preview of the drafts branch; approval from a phone | **yes** | every non-`--prod` deploy gets its own URL; `vercel deploy` of a drafts build = a tokenless preview. ⚠ Deployment Protection ("Vercel Authentication", viewer must be logged in) is documented as available on Hobby; password protection is Pro |
| Forms | no (needs a function; possible, not zero-work) | — |
| First-party 0 KB analytics | no — Vercel Web Analytics is a script on the page; breaks the 0 KB gate | — |
| Search | no | — |
| Scheduled publish | no on static (crons need functions) | — |
| IndexNow from the deploy | no (from the agent, as today) | — |
| Rollback as a sentence | **yes** | `vercel rollback` — instant, previous production, all plans |
| Edge images / `srcset` on `figure` | **yes** ⚠ | `images` in `vercel.json` enables `/_vercel/image?url=…&w=…` for a static project; Hobby: 1 000 source images/month free |
| MCP endpoint for a second person | no | — |
| *(not on the cloud list)* real 301 redirects, cache headers, **`Accept: text/markdown` → the twin** | **yes** | `vercel.json` `redirects` (301/308), `headers`, and `rewrites` with `has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }]` → `/$1/index.md`. The README's own "serve the twin on Accept" example becomes true on this host without a Worker |

Four yes, one partial, and the last row is the one that makes snypd's agent-read surface complete on a host with no code of ours.

---

## 3. The three hosts side by side

| | GitHub Pages | Cloudflare (Workers + assets) | Vercel |
|---|---|---|---|
| Actions removed | 5 | 5 | 5 (+ the domain purchase softened) |
| Principle change (221) | **none** — the host watches the repo | needed | needed |
| Install | `gh` — no npx; brew/winget/apt | `npx wrangler` | `npx vercel` |
| Identity | GitHub — most devs have it | Cloudflare | Vercel |
| URL known | **before any deploy** | after the first deploy | after link/first deploy |
| Deploy latency | 1–2 min (Actions) | seconds | seconds |
| Private source | paid (Pro) | yes, free | yes, free |
| **Commercial use on free** | yes | yes | **no — Hobby is non-commercial** |
| Free bandwidth | 100 GB/mo soft | unlimited static | 100 GB/mo |
| Hosted previews | no (one Pages site per repo) | ⚠ `wrangler versions upload` preview URLs | **yes**, per deploy, gateable |
| Real redirects / headers | no (meta-refresh, fixed 10-min cache) | `_redirects`, `_headers` — already emitted | `vercel.json` — already written |
| `Accept: text/markdown` negotiation | no | needs a Worker (our JS, on the edge — allowed) | `rewrites` with `has` — config only |
| Rollback | re-run a workflow | `wrangler rollback` | `vercel rollback` |
| Images | no | paid (Images) | `images` config, free tier ⚠ |
| Custom domain | CNAME file + API + DNS, HTTPS auto | `routes` with `custom_domain` if the zone is on Cloudflare, else DNS | `domains add` / `domains buy` |
| Base path needed | **yes** (project sites at `/repo/`) | no | no |
| Git backup | **the same step** | separate | separate (`vercel git connect`) |

---

## 4. What this says about the design

Three hosts, five actions each, and the differences are in a column, not a row. `deploy.ts` already has the seam: `DEPLOY_TARGETS` and a `put()` per target. The work is to widen that seam into an adapter with **five verbs a host may answer**:

`url()` · `deploy(dist, {prod})` · `preview(dist)` · `domain(name)` · `status()`

- Pages answers `url` before deploy and `deploy` through the workflow; `preview` is unsupported and says so.
- Cloudflare and Vercel answer all five through their CLIs (decision 221).
- `site › connect` / `deploy` / `domain` / `status` call the adapter; the bench row `onboard.live` runs against a stub adapter so the count is measured per host.

Then the default is a **policy**: which host does `init` write when nobody says? Three defensible answers:

| Default | For whom it is right | Its cost |
|---|---|---|
| **GitHub Pages** | the curious developer with `gh` on the machine; blogs; open work | public repo; no previews; base-path work (P1) |
| **Cloudflare** | anyone — free commercial, private, fast, `_headers`/`_redirects` already emitted | decision 221; a new identity for most; URL after first deploy |
| **Vercel** | the person who wants previews, rollback and the twin on `Accept` today | decision 221; **Hobby is non-commercial**, so the agency user pays or breaks terms |

**Recommendation.** Build the adapter (it is the same work either way), ship all three as `--host=`, and default to **Cloudflare** — not Pages as I proposed this morning. The reason is the commercial row: snypd's own specimen is an agency, the launch story leans on Ferrule, and a default whose free tier forbids the demo user is the wrong default. Pages stays the choice for a dev who wants git-native and no new principle; Vercel is the choice when previews matter. Decision 221 becomes necessary again — but it was always going to be, the moment the roadmap wanted previews or rollback from a sentence.

If Sunny would rather not take 221 before launch: default Pages, ship Cloudflare/Vercel as git-connected (today's behaviour), and previews wait.

---

## 5. Two things to verify against a real account before writing docs/30

1. ⚠ Vercel Deployment Protection on Hobby for preview URLs — the whole "approve from a phone" claim rests on it.
2. ⚠ `images` in `vercel.json` on a framework-less static output — that `/_vercel/image` answers for a plain `dist/`.

Half a day, one throwaway project each. I can do both today if you want the answer before deciding the default.

## Decisions asked

1. Take decision 221 (binary runs a host CLI, holds nothing) before launch — yes/no. Without it: Pages default, no previews at launch.
2. Default host for `init`: Cloudflare (recommended) / Pages / Vercel.
3. Build the adapter with all three at launch, or one host now and the seam for the rest?
4. Run the two verifications today — yes/no.
