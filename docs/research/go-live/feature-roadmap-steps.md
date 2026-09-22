# Feature roadmap, scored by the steps each feature removes

**Owner:** PM · **Decider:** Sunny · **Written:** 22 Sep 2026 · **Horizon:** 0.1.x → 1.0 (not the 6 Oct launch alone) · **Replaces the framing of** "Going live: steps, eliminations, roadmap" (same day), which read the problem as a launch fix. This reads it as the product roadmap.

**The method.** Take the eleven human actions between "I want a site" and "it is on the internet under my name". For every candidate feature, count which actions it removes, which it softens, which it adds. Then order features by actions removed per week of work, and by what else each one unlocks. The features that remove the most are not the cheapest; the sequence below is the argument for which to do when.

---

## 1. The eleven human actions

From the walk-through of the tree on 22 Sep (README, docs/08 §2, `deploy.ts`, `push.ts`). Machine steps are left out; only what a person does with hands or a mouth.

| ID | Action | Surface |
|---|---|---|
| H1 | `mkdir` + `cd` | terminal |
| H2 | `bunx @snypd/cli init --deploy=…` | terminal |
| H3 | open the harness (it reads `.mcp.json` at start) | desktop |
| H4 | "Write me a first post." | harness |
| H5 | answer the URL question (publish refuses on the placeholder) | harness |
| H6 | create an empty repo on GitHub | browser |
| H7 | `git remote add origin …` | terminal |
| H8 | push `main` | terminal / harness |
| H9 | host dashboard: create project, connect repo, type the build command | browser |
| H10 | custom domain: buy, point DNS, add it in the host's dashboard | browser × 2 |
| H11 | *(implicit today, explicit in every option below)* identify yourself to whoever serves the site | browser |

H4 is the product. Everything else is friction, and H10 has a purchase in it that no software removes.

---

## 2. Candidate features

| ID | Feature | What it is |
|---|---|---|
| **F1** | `init` one-liner | `init <dir>` as the documented form; host config written by default; the next line printed |
| **F2** | Deploy through the host's CLI | `site › deploy` runs `wrangler deploy` / `vercel deploy`; snypd holds no token. Git-connected deploy stays as a mode |
| **F3** | URL from the host | the first deploy returns the host's URL; snypd sets `site.url`, rebuilds, deploys again. The placeholder refusal moves from `publish` to `deploy` |
| **F4** | GitHub as a verb | "back this up" → `gh repo create --source=. --push`; the committed workflow wakes up |
| **F5** | Global registration, site by cwd | `snypd` registered once in the harness (user scope); the server finds `snypd.yaml` from cwd; a directory with none gets "say the word and I'll scaffold it". `init` becomes something the agent runs, not the person |
| **F6** | Domain as a verb | `site › domain example.com`: attach when the zone is on the host, else print the records and poll until they resolve |
| **F7** | **snypd cloud** | a static host that is ours: `<name>.snypd.site` on first deploy, custom domains, a hosted preview of the drafts branch, approvals from a phone. The binary stays free and complete; the cloud is the paid line |
| **F8** | Claim-later deploy (cloud only) | first deploy needs no account: an anonymous site with a claim link, like a paste. The account comes when the person wants to keep it |
| **F9** | Migrate-from | `migrate-from-*` prompts (markdown folder, Hugo, Astro, WordPress export). Serves the arrival docs/08 §4 names as "not at all" |
| **F10** | Theme factory (TF1–TF6, built) | seeded themes, taste lint, the judge. Removes no step; removes the reason the footage was dull |

---

## 3. The matrix — which feature removes which action

✕ removed · ◐ softened (still a person, but one sentence) · ＋ added · · untouched

| | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | H9 | H10 | H11 | **net** | effort |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 init one-liner | ✕ | ◐ | · | · | · | · | · | · | · | · | · | **−1** | 1 day |
| F2 host CLI deploy | · | · | · | · | · | ✕ | ✕ | ✕ | ✕ | · | ＋ (host login, once per machine) | **−3** | 3–4 days |
| F3 URL from host | · | · | · | · | ✕ | · | · | · | · | · | · | **−1** | 1 day (needs F2 or F7) |
| F4 GitHub verb | · | · | · | · | · | ✕ | ✕ | ◐ | · | · | ＋ (`gh auth`, most devs have it) | **−2** | 1 day |
| F5 global registration | · | ✕ (agent runs it) | ✕ from the second site on; first site still one open | · | · | · | · | · | · | · | · | **−1 to −2** | 2–3 days |
| F6 domain verb | · | · | · | · | · | · | · | · | · | ◐ (purchase stays) | · | **−½** | 1–2 days per host |
| **F7 snypd cloud** | · | · | · | · | ✕ | ✕ | ✕ | ✕ | ✕ | ◐ (attach is ours; purchase stays) | ＋ (our login) → replaces the host's | **−5½** | 6–8 weeks MVP + ops forever |
| F8 claim-later | · | · | · | · | · | · | · | · | · | · | ✕ for the first deploy | **−1** | +1 week on F7 |
| F9 migrate-from | serves a different arrival; removes nothing on this list | | | | | | | | | | | 0 | 1 week per source |
| F10 theme factory | removes nothing on this list; makes H4's result worth showing | | | | | | | | | | | 0 | done, unpushed |

**Reading it.** Two features do almost all the work, and they are alternatives for the same five actions:

- **F2 + F3** remove H5–H9 for **four days**, leave one host login, and depend on Cloudflare's or Vercel's CLI staying stable.
- **F7** removes the same five, owns the login, and costs **two months plus a company** — but it is the only feature on the list that pays for itself, and the only one that unlocks anything past step removal (§4).

They are not exclusive: F2 is how a person leaves for their own host; F7 is where a person lands who has none. Sites that outgrow the cloud take `snypd build` + `wrangler deploy` with them — the no-lock-in claim survives because F2 exists.

---

## 4. What snypd cloud solves beyond the count

The step count undersells F7. The things a zero-JS static binary cannot do on its own, that a host that is ours can:

| Problem today | With the cloud |
|---|---|
| The review URL is `localhost` — a person approves at their own machine, and `mcp.write: draft` only works when the author is the approver | the drafts branch builds to `preview-<site>.snypd.site` (noindex, tokened); approval is a link on a phone; a second person can be the gate |
| No forms. A static page with no JS cannot take a name and an email; every CMS competitor has a contact form on day one | a `form` primitive (the fourteenth) posts to the cloud; zero JS on the page still holds — it is a plain `<form action>` |
| `analytics` plugin ships a slot and a 3 KB client budget for somebody else's script | first-party, cookieless counts from the edge log; 0 KB on the page; a `stat` block that reads its own site's numbers |
| Search is a `.md` twin an agent greps; a reader has nothing | edge search over the twins the build already writes |
| Scheduled publish means the agent has to be awake at 09:00 | the cloud rebuilds at the date in the frontmatter |
| `indexnow` plugin fires from the agent's machine | fires from the deploy |
| Rollback is `git revert` + a push through somebody's dashboard | every deploy is a version; "put back Tuesday's" is a sentence |
| Images are whatever the person committed | resized on the edge; `figure` gains `srcset` for free |
| A second person on a site has no MCP (the committed registration names an absolute path — docs/08 §12.8) | the cloud is the MCP endpoint too: `snypd://` over HTTP, any harness, any machine, one login |

Nine capabilities, none possible in the binary alone, all of them things a person with a website eventually asks for. Six of them are what a paying tier is made of.

**The tension to name.** README: *"A custom domain is never behind a paywall, because there is no paywall in the binary."* That sentence stays true — the binary is complete without the cloud, and F2 is the proof. The cloud sells convenience and the nine rows above, not the domain.

---

## 5. Sequence

Three horizons, by what each one lets us claim.

### 0.1.x — launch, 6 Oct 2026: *"three actions, on Cloudflare"*

F1, F2, F3, F10 (push it). Removes H1, H5–H9; adds one host login. **Ten actions → three** (type a line, say a sentence, allow one login). The claim is measured by a bench row (`onboard.live`, against a stub CLI in CI) before the README says it. The film's last beat becomes "put it online".

Why these: four days of work, the largest count removed per day on the list, and it is the escape hatch the cloud needs to exist first — nobody trusts a host from a project that cannot deploy anywhere else.

### 0.2 — Oct–Nov 2026: *"one sentence, from any harness"*

F5 (global registration), F4 (GitHub verb), F6 (domain verb), F9 (migrate from a markdown folder — the cheapest source, and the one most curious devs arrive with). Removes H2 and H3 for every site after the first, softens H10. **Three → two for a second site: say the sentence, allow the login.**

Why these: F5 makes the pitch literally true — the agent scaffolds, the person never types `init`. F9 opens the arrival we currently turn away.

### 0.3 → 1.0 — Nov 2026 – Jan 2027: *"say it, and it is at a URL"*

F7 cloud MVP: deploy, `<name>.snypd.site`, custom domains, hosted preview + remote approval, versions/rollback. Then F8 (claim-later) and the first two capabilities from §4 that a paying tier is made of — forms and first-party analytics. **Two → one for a first site: say the sentence.** The account comes when the person wants to keep the site.

Why last: it needs the binary to be trusted first (0.1.x), the agent-first flow to be real first (0.2), and it is the only item that needs money, ops and a legal entity. It should start when there are users asking for previews on a phone — that is the signal, and F2's telemetry-free world means the signal is issues and posts, so the launch has to happen first.

---

## 6. The decisions this asks of Sunny

1. **Is the cloud on the roadmap at all?** Everything in §5's third horizon assumes yes. If no, F2+F3 are the terminal state and the nine rows in §4 are a list of things snypd will never do.
2. **Decision 221** (from the earlier doc): the binary may run a host's CLI. Needed for F2 regardless of the cloud.
3. **Default host at `init` when the cloud does not exist yet:** Cloudflare (recommendation) or ask.
4. **Order of 0.2:** F5 first (agent runs `init`) or F9 first (migration)? Recommendation F5 — it changes the front door; F9 changes who can walk through it, and needs the front door to be right.
