# Going live: the steps, what removes them, and the roadmap

**Owner:** PM · **Decider:** Sunny · **Written:** 22 Sep 2026 · **Launch:** Tue 6 Oct 2026 (14 days) · **Inputs:** README on main, docs/08 §2, `packages/core/src/deploy.ts`, `packages/core/src/push.ts`, the 18–19 Sep snypd.rocks deploy.

**Status:** proposal. One principle decision (§3) gates all of it. The hero-film voice fix is parked behind this work (22 Sep).

---

## 1. The path a user walks today

The README says "one command, then the harness." That is true until the site has to leave the machine. Counted honestly, by who acts and on which surface:

**A. Scaffold — terminal**

| # | Step | Human action |
|---|---|---|
| 1 | `mkdir my-site && cd my-site` | type |
| 2 | `bunx @snypd/cli init --deploy=cloudflare` (or `vercel`) — writes `snypd.yaml`, content dirs, `.mcp.json`, host config, the PR workflow; `git init` + first commit. Without `--deploy` no host config is written, and the README's "Start here" block does not show the flag | type |

**B. Write — harness**

| # | Step | Human action |
|---|---|---|
| 3 | open Claude Code / Cursor / Codex in the directory (it reads `.mcp.json` at start) | open |
| 4 | "Write me a first post." Agent reads config, primitives, theme; writes; lints; previews | say |
| 5 | optional: switch the look, add a home page | say |

**C. Publish — harness**

| # | Step | Human action |
|---|---|---|
| 6 | `content.publish` refuses once: `site.url` is still the localhost placeholder (feed, sitemap, JSON-LD are absolute) | — |
| 7 | person answers with the URL; agent sets it and publishes to `main` | answer |

**D. Connect a host — GitHub, terminal, host dashboard. Nothing in the product walks this part.**

| # | Step | Human action |
|---|---|---|
| 8 | create an empty repo on GitHub | browser |
| 9 | `git remote add origin …` — the push refusal says this, but only after the push was tried | type |
| 10 | push `main` (agent via `site › push`, or by hand) | — / type |
| 11 | in the Cloudflare or Vercel dashboard: create a project, connect the repo, type the build command `npx -y @snypd/cli@0.1.6 build` and output dir `dist/` — by hand, though `deploy.ts` knows the exact string | browser |
| 12 | first deploy runs; site is live on `*.pages.dev` / `*.vercel.app` | — |
| 13 | custom domain: buy or point DNS, add it in the host's dashboard | browser |

**E. Every publish after that** — one sentence to the agent; the host rebuilds on push. This part is good.

**Count.** docs/08 F1 measures from step 4 onward and reads 5. Counting D, a stranger's number is about **ten**, and the hardest ones come last, across three surfaces the product does not own. D is the only stretch of the journey where a first-time user is dropped back into the world snypd says it replaces.

---

## 2. What removes each step

| Today | Mechanism that removes it | Who acts afterwards |
|---|---|---|
| 1–2 `mkdir` + `init --deploy=…` | `init <dir>` already takes a root. Make the host config the **default** (Cloudflare; `--host=vercel` for the other); always write the workflow; print the one line to type next | person types one line |
| 3 open the harness | cannot — the harness reads `.mcp.json` at start. **Floor.** | person opens it |
| 4 "write me a first post" | that is the product | person says one sentence |
| 6–7 the URL refusal and the answer | **The URL comes from the host, not the person.** A first deploy to Cloudflare returns `<name>.<account>.workers.dev`; snypd sets `site.url`, rebuilds, deploys again. The placeholder check moves from `publish` to `deploy`, where it can resolve itself | nobody |
| 8–10 GitHub repo, remote, push | **Direct deploy replaces git-connected deploy for going live.** `wrangler deploy` uploads `dist/` — it is what put snypd.rocks live on 18 Sep. No repo, no remote, no push. GitHub becomes the optional second step ("back this up") | nobody |
| 11 dashboard: connect repo, type build command | gone with 8–10 | nobody |
| 12 first deploy | agent-driven, from the same sentence | nobody |
| 13 custom domain | DNS is a purchase, but attaching a domain is one `wrangler`/API call when the zone is on Cloudflare — "give it the domain example.com" | person says a sentence, later, optional |
| *(new)* host login | `wrangler login` opens a browser once per machine. **Floor** — you cannot own a URL on somebody's host without identifying yourself to it once | person clicks "allow" once |

### The target front door

```
bunx @snypd/cli init my-site && cd my-site && claude
> Write me a first post and put it online.
```

Human actions: type a line, say a sentence, approve one browser login. **Ten → three.** The live URL appears in the agent's reply without anyone having chosen one.

### What stays a floor, and why

- **Opening the harness after `init`.** The harness registers MCP servers at start. Not ours to change.
- **One host login per machine.** Cloudflare's `wrangler login` (or Vercel's `vercel login`) is a browser OAuth. The credential lives in the host CLI's own store; snypd never sees it.
- **Buying a domain.** A purchase; the attach is automatable, the purchase is not.

### What this is not

- **Not a hosted snypd preview service.** It would make the URL question vanish entirely, and it would be a paywall in disguise plus an operations burden; "there is no paywall in the binary" is a README sentence. Out.
- **Not dropping git-connected deploy.** Existing sites (snypd.rocks among them) deploy on push through the host's build. That stays as `deploy.mode: git`; direct becomes the default for a new site.
- **Not GitHub Pages as a launch target.** Attractive — one login most developers already have, `gh repo create --source=. --push`, a predictable URL — but subpath URLs break absolute links and private repos need a paid plan. A candidate for 0.2.

---

## 3. The decision that gates all of it

`deploy.ts`, line one: *"Snypd never talks to a host. It writes files and git; the host's whole job is: on push, run `snypd build`, serve `dist/`."*

Direct deploy means the binary **runs the host's own CLI** — `npx -y wrangler deploy`, `vercel deploy --prod --yes` — the way it already runs `git push`. The argument that this keeps the spirit:

- snypd holds no token and speaks no host API; wrangler holds the credential exactly as git holds the SSH key today;
- the contract is still "build `dist/`, serve `dist/`" — only who uploads it changes;
- the refusal on a missing or logged-out CLI says exactly what to run, the same shape as today's "no remote" refusal in `push.ts`.

The counter-argument: it is a dependency on a third party's CLI and its output format (the URL is parsed from `wrangler deploy`'s stdout, or read back with `wrangler whoami` + the project name). Pinned like the launcher, and tested against a stub in CI.

**Proposed decision 221:** a site deploys directly through the host's CLI by default; snypd runs it, holds nothing, and reads the URL back. Git-connected deploy stays as a mode.

Sunny decides.

---

## 4. Roadmap — 14 days

| # | Session | What lands | When | Must / should |
|---|---|---|---|---|
| 0 | TF proof sitting | `tf-theme-factory` pushed + PR (TF1–TF6 sit unpushed since 20 Sep) | 22 Sep | must |
| 1 | **docs/30** — the go-live funnel | this document as a numbered doc in the tree: the measured count, decision 221, the target flow, F-row spec | 22–23 Sep | must |
| 2 | **G1** — `init` one-liner | `init <dir>` as the documented form, host default Cloudflare, workflow always written, the next line printed | 23 Sep | must |
| 3 | **G2** — the URL from the host | `site › deploy`: preflight (wrangler present? logged in? — the refusal names the command), first deploy, read the URL, set `site.url` if placeholder, rebuild, deploy again; the placeholder check moves from `publish` to `deploy` | 24–26 Sep | must |
| 4 | **G3** — Vercel parity | same action over `vercel deploy`, URL from its output | 27 Sep | should |
| 5 | **G4** — the Desk button deploys | `deploy.push: human` → the Desk's button runs the deploy; `deploy.mode: direct \| git` keeps today's sites working | 28 Sep | should |
| 6 | **G5** — GitHub as step two | "back this up" → `gh repo create --source=. --push`; the committed workflow wakes up; `git` mode becomes a choice, not a prerequisite | 29 Sep | should |
| 7 | **G6** — custom domain | `site › domain`: attach when the zone is on the host, else print the DNS records and wait | 30 Sep | nice |
| 8 | **G7** — bench row `onboard.live` | fresh box → live URL, human actions counted, in CI against a stub wrangler so the number is measured, not stated (principle 9; F1 is finally green or honestly red) | 1 Oct | must |
| 9 | **G8** — the front door | README "Start here" → the three lines; docs/08 §2 rewritten; snypd.rocks home; **then the film re-take** — it gains a last beat, "put it online" | 2–3 Oct | must |
| — | buffer | | 4–5 Oct | |

**Where the value is.** G1 + G2 are the whole story; G3–G6 are the same story on more surfaces. If time bites, G4–G6 slip to 0.1.8 and the launch claim stays honest at *three actions, on Cloudflare*.

**What this displaces.** The hero-film voice fix (vo-03, vo-10) and site-footage re-record — parked 22 Sep; they return as the last step of G8 with a better film to make. S28 clean-machine checks fold into G7.

---

## 5. Open questions for Sunny

1. Decision 221 — yes or no. Nothing after session 1 starts without it.
2. Cloudflare as the default host, or ask? (Recommendation: default; `--host=vercel` is one flag, and decision 178 says `init` asks nothing.)
3. Should `site › deploy` on a human-gated site (`deploy.push: human`) refuse the agent the same way `push` does today? (Recommendation: yes — same policy, the Desk button is the person's.)
4. The hero film: is "put it online" the new last beat, or does the current 44.8 s cut stay and a second clip covers going live?
