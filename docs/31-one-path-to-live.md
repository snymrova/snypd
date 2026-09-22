# 31 — One path to live: the stranger's walk on Cloudflare, and the fourteen days that build it

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 22 Sep 2026 · **Launch:** Tue 6 Oct 2026 (14 days)
**Asked for:** *"before we have our own cloud, what path will have least friction in launching a site using snypd"* — then *"so lets focus on one path least friction for a stranger.. and then create a roadmap."*
**Scope:** one path, chosen; the walk a stranger takes on it, action by action; what exists in the tree for each step and what does not; the sessions that close the gap before launch, dated; what is deliberately left off the path until after. This narrows the 22 Sep go-live funnel (seven documents, now in `docs/research/go-live/`) to its critical line. The funnel's "proposed decision 221" collided with the theme factory's 221–227; the decisions here are numbered from **228**.
**Status:** decided — 228–230 taken as recommended (22 Sep 2026, Sunny: *"go ahead"*; docs/11 §8). **L0–L6 all built on 22 Sep** (docs/11 §7b), eight days ahead of the dates below, and all of it is **PR #50** — the five stacked PRs #45–#49 were closed into one branch at Sunny's word, with L5 and L6 on top. Only the publish of 0.1.7 and L7's real account are left. Reading the roadmap: L1–L4 — `init <dir>` and the host default, `site › deploy` over `core/src/host.ts`, what the agent sees, and the number. The two ⚠ in §4 are answered from wrangler's source and still owed a run on Sunny's account (L7). **F1 is 3 against a budget of 5** on the door §2 shows, measured on both the compiled binary and the released launcher (docs/08 §5d). Nothing here needs the cloud (docs on the 22 Sep architecture) and nothing here waits for it.

---

## 1. The path, in one paragraph

A stranger types one line, says one sentence, and clicks *allow* once in a browser tab that opens by itself. Their site is live on a URL they never chose, on a host whose free tier allows commercial use and charges nothing for bandwidth, with no repository, no dashboard and no build command typed anywhere. The line is `bunx @snypd/cli init my-site && cd my-site && claude`. The sentence is *"Write me a first post and put it online."* The click is Cloudflare's own login, held by Cloudflare's own CLI, which snypd runs the way it already runs `git push` and never reads. Everything after that is a sentence to the agent. GitHub is offered afterwards as *"back this up"*, not required beforehand as a gate.

## 2. Why this path and not the other two

The funnel counted a stranger's walk today at about ten human actions across three surfaces, and the hardest ones — create a repo, add a remote, connect it in a dashboard, type the build command — come last and are not in the product. The 18 Sep snypd.rocks deploy showed the shorter road by accident: `wrangler deploy` uploaded `dist/` and the site was up, no repo in the loop. That is the road.

| | Cloudflare, direct | Vercel, direct | GitHub Pages |
|---|---|---|---|
| Human actions on the target walk | **3** | 3 | 2–3 (needs `gh` installed) |
| Free tier allows a commercial site | yes | **no** — Hobby is non-commercial by its terms | yes, public repo only |
| Bandwidth | free | metered past the tier | soft cap |
| Install to deploy | none (`npx wrangler`) | none (`npx vercel`) | `gh` binary |
| Works in the tree today | config written by `init --deploy=cloudflare`; upload by hand | config written; upload by hand | **no** — the renderer has no base path; project sites under `/repo/` break every link |
| Custom domain | one config line + redeploy when the zone is on Cloudflare ⚠ | `vercel domains add`, and `buy` | DNS + dashboard |

Cloudflare is not the most capable of the three; Vercel is. It is the one whose free tier a stranger can stay on, whose CLI needs nothing installed, and whose upload already worked once. One path means Vercel parity and Pages both wait for 0.2 (§7).

## 3. The walk, action by action

**Human actions are in bold. Everything else is the agent or the binary.** The count is what `onboard.handoff` measures, and since **L4 it measures this table** rather than the door decision 178 replaced: **3**, against F1's budget of 5 (docs/08 §5d). `onboard.live` is the row beside it — two uploads, because the URL is learned on the first and the site rebuilt against it.

| # | Who | What | Surface |
|---|---|---|---|
| 1 | **person** | **types** `bunx @snypd/cli init my-site && cd my-site && claude` | terminal |
| 2 | binary | scaffolds, `git init`, first commit, writes `.mcp.json`, writes `wrangler.toml` + the PR workflow (host config is the default now, not a flag), prints nothing that must be pasted anywhere | |
| 3 | harness | opens, reads `.mcp.json`, `initialize` names `get-started` | |
| 4 | **person** | **says** *"Write me a first post and put it online."* | harness |
| 5 | agent | `get-started` branch A → reads config, primitives, theme; writes; `content_lint`; `content_render_preview`; `content_publish` — **no URL refusal**: the placeholder check has moved from publish to deploy (§4 · 3) | |
| 6 | agent | `site › deploy` | |
| 7 | binary | preflight: `npx`/`bunx` present? `wrangler` runs? logged in? — not logged in ⇒ the binary runs `npx -y wrangler login` itself (decision 230), which opens a browser tab | |
| 8 | **person** | **clicks *allow*** in that tab, once per machine | browser |
| 9 | binary | `snypd build` → `wrangler deploy` → reads the URL back from its output (`https://my-site.<account>.workers.dev`) → `site.url` was the placeholder, so it sets it, builds again, deploys again → answers: URL, files, bytes, and one line naming the one thing left — this machine is the only copy of the words, and `site` › push is the backup (L5) | |
| 10 | agent | tells the person the URL | harness |

**Three human actions.** The floor is real: the harness must be opened after `init` because it reads `.mcp.json` at start; the host must see the person once because nobody gets a URL on somebody else's host anonymously; the sentence is the product. Nothing else on the list is a person's.

**What the person can say next**, each one sentence, each already a tool or one session away: *"Publish it"* on a human-gated type (the Desk's review page, today); *"Give it the domain catbook.example"* (§7, after launch); *"Back this up on GitHub"* — **L5, built**: one `site` › push creates the repository through `gh`, private, sends the published branch and leaves the drafts branch here.

## 4. What exists for each step, and what does not

Read against the tree at `tf-theme-factory` (b8efa11) and `main` (245f293).

| Step | In the tree | Gap |
|---|---|---|
| `init <dir>` | `initSite(root, …)` takes a root; the CLI's `init [root]` passes it (`cli/src/index.ts:302–309`) | the README's front door is `mkdir && cd && init`; `init my-site` should create the directory and say `cd my-site && claude` — one line, no flags |
| host config by default | `writeDeploy` writes `wrangler.toml` with `[assets] directory = "./dist"` and `not_found_handling = "404-page"`, plus the workflow; only on `--deploy=` (`deploy.ts:99–160`) | make `cloudflare` the default target; `--host=vercel` keeps the other; `--host=none` for a site that will be served elsewhere. `set_deploy` already adds it to an existing site |
| preflight and login | nothing — "Snypd never talks to a host" (`deploy.ts:1–9`) | new: find a runner (`npx`, else `bunx`), run `wrangler --version` and `wrangler whoami`; not logged in ⇒ run `wrangler login`; no runner ⇒ refuse with the install line for the platform. Every refusal names its next action (F3) |
| upload | nothing in the binary; by hand it was `npx wrangler deploy` on 18 Sep | new: `site › deploy` runs `npx -y wrangler@<pinned> deploy` in the site root, captures stdout, parses the URL ⚠, returns a `DeployState` the way `push` returns a `PushState` (`push.ts:100–140`) |
| the URL | `PLACEHOLDER_URL` and `isPlaceholderUrl` (`config.ts:636–651`); `publishCheck` and `push` both refuse on it | move the refusal: `publish` no longer refuses (a publish is a commit; nothing is served until deploy); `push` keeps refusing (in git mode the host builds what was pushed); `deploy` resolves it — sets `site.url` from the first deploy, rebuilds, deploys again |
| policy | `deploy.push: agent \| human` read in `push.ts:106` | add `deploy.mode: direct \| git`; default `direct` for a site `init` creates from L1 on; a site with a remote and no `mode` key is `git` (snypd.rocks keeps deploying on push). `deploy.push: human` applies to `deploy` exactly as to `push` (decision 229) |
| what the agent sees | `get-started` (`prompts.ts:19`), `site › doctor` rows | `get-started` gains *"…and put it online"*; `doctor` gains rows: host CLI, logged in, last deploy, URL is the host's; `find_tools` words for "deploy", "go live", "put it online". **L3 (22 Sep):** all four, and `init` prints the sentence in §3. The doctor rows read `.snypd/deploy.json`, the record every successful deploy leaves, rather than asking wrangler — "logged in" is answered *as of the last deploy* and says so, because the honest alternative is a package-runner start and a request to Cloudflare on every doctor call for a fact only a deploy changes |
| the number | `onboard.handoff` counts F1 from step 4 of docs/08 §2, ends at publish | new bench row `onboard.live`: fresh box → URL, human actions counted, against a stub `wrangler` in CI (a script that prints a fixed URL) so the 3 is measured. **L2 (22 Sep):** `onboard.live` landed with the walk it measures — 2 uploads, exact. **L4 (22 Sep):** the 3 is measured, and the reason it was not already is that `onboard.handoff` had gone on walking the *second* door while §2 was rewritten around it — both doors are walked now, `handoff` **3 / 5** and `handoff.relay` **5**, and `docker/box clean` walks the first one through the released launcher (S28) |
| back it up | `pushSite` sends the base to a remote somebody added by hand; the refusal names `git remote add` | **L5 (22 Sep):** `core/src/remote.ts` — `gh` found and proved, `gh auth status` read for the login and the scopes, `gh repo create <name> --source . --remote origin --private`, the remote read back from git rather than from stdout, and `deploy.mode: direct` pinned first (231, 232). `site` › push does it on a site with no remote; `doctor` gains the row that says this machine is the only copy |
| custom domain | nothing | after launch (§7) |

**Two things to verify on a real account in L2, marked ⚠ because this box could not reach the docs today:** (a) what `wrangler deploy` prints for an assets-only Worker and whether a brand-new account is prompted to register a `workers.dev` subdomain on its first deploy — if it is, preflight does that step; (b) that a `routes = [{ pattern = "example.com", custom_domain = true }]` line in `wrangler.toml` attaches a domain on redeploy when the zone is on Cloudflare, which is the whole of §7's domain step.

**L2's answer, from wrangler 4.135.0's source rather than a run** (the copy that deployed snypd.rocks on 18 Sep was still in `~/.npm/_npx`; `core/src/host.ts` header quotes the lines). **(a)** `deploy` prints `✨ Success! Uploaded N files (M already uploaded) (t sec)`, then `Deployed <name> triggers (t sec)`, then one indented target per line — `https://<name>.<subdomain>.workers.dev` with the protocol added only for workers.dev, `<pattern> (custom domain)` for a domain — then `Current Version ID: <uuid>`; `parseDeploy` reads exactly that. A fresh account with no subdomain **is** asked, *"Would you like to register a workers.dev subdomain now?"*, and with no terminal the answer is *no* and the exit names `https://dash.cloudflare.com/<account>/workers/onboarding`. Two things keep that off the walk: wrangler detects an agent harness in the environment (`am-i-vibing`, which knows Claude Code, Cursor, OpenCode…) and then registers the subdomain itself from the project directory's name, so the walk in §3 never sees the question; outside a harness, `deployHint` turns the refusal into that one link (F3). **(b)** `{ pattern, custom_domain = true }` is a shape wrangler's config validator accepts and `deploy` publishes under *Custom domains* — §7's domain step is one line in `wrangler.toml`, as hoped. Both still want one run on a real fresh account; that is the day L7 spends.

## 5. The roadmap — fourteen days

Alongside, not instead of: the theme factory proof sitting (needs Sunny, ~1 day) and rampscan (§5 · L7 is where it lands). The film re-take stays last.

| # | Session | Lands | Days | Must / should |
|---|---|---|---|---|
| L0 | **Decisions + push** | §6 answered; `tf-theme-factory` pushed with a PR (ten commits unpushed since 20 Sep) | 22–23 Sep | must |
| L1 | **The front door line** | `init <dir>` creates the directory; Cloudflare host config written by default; `--host=vercel\|none`; the last line printed is `cd <dir> && claude`; `initSite` and the CLI tested for the new default | 23 Sep | must |
| L2 | **`site › deploy`** | preflight (runner, wrangler, login) with F3 refusals; login run by the binary; pinned `wrangler`; deploy, URL parsed ⚠, `site.url` set, rebuild, redeploy; `DeployState` returned; `deploy.mode` read, `deploy.push: human` honoured; the placeholder refusal moves off `publish`; a stub `wrangler` for tests; the two ⚠ items verified against Sunny's account | 24–26 Sep | must |
| L3 | **What the agent sees** | `get-started` says *put it online*; `doctor` rows; `find_tools` words; the `deploy` answer's wording (URL, files, bytes, the back-up hint); docs/08 §2 and §6 rewritten to the three-action walk | 27 Sep | must |
| L4 | **The number** | bench row `onboard.live` in CI against the stub; F1 re-stated for the whole walk, red or green, never claimed; S28's clean-machine check runs the real thing in `docker/box` on a copy of the released launcher. **Built 22 Sep:** `onboard.live` landed in L2 and is in CI; F1 is **3 / 5** on the front door and **5** on the second, both walked, neither claimed (docs/08 §5d — the instrument had been measuring the door decision 178 replaced); `docker/box clean` walks the three actions through `node_modules/.bin/snypd` | 28–29 Sep | must |
| L5 | **Back it up** | `site › push` in a repo with no remote, when `gh` is present: the repository is created (private by default), the remote connected, the published branch sent, and the committed workflow wakes up; without `gh`, today's refusal. **Built 22 Sep:** `core/src/remote.ts`, with three corrections to the line as it was written here — `--push` is not used (it pushes `HEAD`, which is always `snypd/drafts`; decision 231), a backup remote pins `deploy.mode: direct` so it does not silently become a deploy path (232), and the token's `workflow` scope is checked before anything is created, because that failure otherwise arrives from `git push` after the repository exists | 30 Sep | should |
| L6 | **The front door, published** | README *Start here* → the one line and the one sentence; snypd.rocks home says the same; **0.1.7 to npm** (the launcher `init` runs is what a stranger gets) | 1–2 Oct | must |
| | | **Built 22 Sep, except the publish:** the README's *Start here* is the one line, the one sentence and the three actions with the bench row behind them; `## Deploy` says direct-by-default and `deploy.mode`, and GitHub arrives after as *back this up*; the verb list says `--host=`. On the site: `home` and `start` rewritten through the MCP, the 404's signpost, `heroLabel`, and the **launch-day post** — a draft dated 6 Oct that still carried `mkdir field-notes` in its front door and its closing call. The ten version fields are at **0.1.7**; publishing it is a tag on a merged `main`, so it waits for #50. The front-door clip keeps a dated caption rather than a re-shoot: L7 walks the new door on the released launcher, and that is the take | | |
| L7 | **Rampscan, through the stranger's path** | the first client's second site goes live using only §3, on the released 0.1.7, on a fresh checkout; whatever it finds is fixed the same day — this is the proof, and the launch evidence that "we use it for our own sites" means *sites* | 3 Oct | must |
| — | buffer; film's last beat *"put it online"* if L7 was clean | 4–5 Oct | |
| | **Launch** | | **6 Oct** | |

**Where the value is.** L1 + L2 are the path; L3 + L4 make it honest; L6 makes it visible; L7 proves it. L5 is the only "should", and it slips to 0.1.8 without changing the launch claim.

**What this displaces.** Vercel parity, the Desk button running a deploy, GitHub Pages, and `site › domain` — all in the funnel's G3–G6 — move to §7. The cat-guide corpus (docs/30 §6 · 2) moves to after launch too; rampscan is the dogfood run because it is the client's, and one site through the path is enough to measure it.

## 6. Decisions asked

- **228. A new site deploys directly through the host's own CLI; snypd runs it, holds nothing, reads the URL back.** Amends the first line of `deploy.ts` — the contract stays *build `dist/`, serve `dist/`*; what changes is who uploads. `wrangler` holds the credential in its own store, as git holds the SSH key. Git-connected deploy stays as `deploy.mode: git`, and every site that has it today keeps it. Recommendation: yes.
- **229. Cloudflare is the default host, and `deploy.push: human` gates `deploy` as it gates `push`.** `init` asks nothing (decision 178); `--host=vercel` is one flag for a person who wants it, once L2's shape is on a second host. A human-gated site gets the same state back from `deploy` that it gets from `push` today, and the Desk's button is the person's. Recommendation: yes.
- **230. `site › deploy` runs `wrangler login` itself when the host has never seen this machine.** The alternative is a refusal that says *run `npx wrangler login`* — a typed command, which is the fourth action F1 exists to prevent. Decision 57 lets `init` and `dev` open a browser and forbids it to library functions; this is the tool, not the library, and the tab it opens is the host's own consent page. On a headless box the login cannot complete and the refusal names the command, so no dead end. Recommendation: yes, with the refusal as the fallback.

- **231. The backup creates the repository and connects it; the push stays `pushSite`'s.** docs/31 §5 wrote L5's step as `gh repo create --source=. --push`, and that flag cannot be used: in gh 2.97.0's `create.go` its working-tree branch is `Push(ctx, baseRemote, "HEAD")` — gh's own prompt words it *"push commits from the current branch"* — and on a bare repo it is `push --mirror`. The current branch in a snypd site is always `snypd/drafts` (docs/02 §6), so `--push` sends every unapproved word on the site to a remote created one second earlier. `createRemote` therefore creates and connects only, and `pushSite` sends `main:main` with the guarantees it already carries: one ref, never forced, `deploy.push` honoured, the `push` event fired, the drafts refusal intact. Recommendation: yes — the flag saves one call and loses every rule around it.
- **232. A backup remote is not a deploy path, and says so in the file.** `deployMode` reads a remote with no `deploy.mode` key as a site the host builds on push (decision 228) — correct for every site that existed before L1, and wrong the instant somebody backs up a site that has been deploying directly: deploy → live → back it up → the next deploy refuses with *"this site deploys on push"*. So `createRemote` writes `deploy.mode: direct` before it creates anything, when that is what the site was doing and its config did not already say. A declared key is the person's and is never touched. Recommendation: yes; the alternative is a rule that cannot be read off the config.
- **233. `gh auth login` is the person's to run, unlike `wrangler login` (230).** The Cloudflare login is a tab and a click, and the tool can wait on its callback. GitHub's is a device code printed on *this* terminal to be typed into a browser — there is nothing to wait on and nothing we could hand a person mid-tool-call. So this refuses with the command, which is decision 230's own fallback path. Recommendation: yes.

## 7. After launch, in the order they are asked for

1. **`site › domain <hostname>`** — zone on Cloudflare: write the route line ⚠, redeploy, set `site.url`, rebuild, redeploy; zone elsewhere: print the records or the nameserver move and wait. The first thing a paying stranger asks for.
2. **Vercel parity** — the same `deploy` over `vercel deploy --prod --yes`, URL from its output, `vercel domains add|buy`.
3. **The Desk button deploys** on a `deploy.push: human` site.
4. **GitHub Pages** — after the base-path fix in the renderer (2–3 days; every subpath host has the bug).
5. **The cloud** — when the first ten people ask where the site should go; the 22 Sep architecture is ready for that day, and nothing in this document is undone by it: `site › deploy` gains a third mode.

## 8. What this document does not do

It does not change the build, the renderer or the content model. It does not make snypd hold a token. It does not remove the placeholder URL; it moves where the placeholder is resolved from a question to a person into an answer from a host. It does not claim three actions; L4 measures them.
