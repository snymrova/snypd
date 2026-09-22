# GitHub Pages as the default host

**Owner:** PM · **Decider:** Sunny · **Written:** 22 Sep 2026 · **Supersedes:** the cloud horizon of "Feature roadmap, scored by steps removed" (same day) — **snypd cloud is parked** on Sunny's word · **Inputs:** `packages/core/src/deploy.ts`, `push.ts`, `render/src/emit.ts`, the GitHub Pages API and limits as documented today.

**The question.** With the cloud parked, can GitHub Pages take the five actions the cloud would have taken — and what does it cost, and what does it break?

**The answer.** Yes, the same five, at the same "three actions" floor the Cloudflare-CLI route reaches — and it gets there **without** changing the principle that snypd never talks to a host, **with** the backup-on-GitHub step for free, and on **one identity** most developers already hold. It costs one real piece of renderer work (a base path) and one real limit (a free account's repo must be public). Recommendation: GitHub Pages becomes the **default** `init` host; Cloudflare and Vercel stay as `--host=` targets exactly as they are.

---

## 1. Why Pages fits this product better than a host CLI

| | Cloudflare / Vercel via their CLI (F2) | GitHub Pages |
|---|---|---|
| Who uploads `dist/` | the binary runs `wrangler deploy` — a new principle (decision 221) | the workflow `init` already writes; **the host watches the repo, snypd never talks to it** — the existing contract, unchanged |
| Identity | a host login per machine, new to most people | `gh auth login` — already there on most developer machines; zero actions for them |
| The URL | learned from the first deploy | **known before any deploy**: `https://<owner>.github.io/<repo>/` — resolves H5 without a round trip |
| Backup / collaboration | a separate later step (F4) | the same step: the repo *is* the host |
| Credential held by snypd | none (wrangler's store) | none (gh's store) |
| Deploy latency | seconds | ~1–2 min (Actions) |
| Private source | yes | **public on a free account**; private needs Pro/Team |
| Server-side control | `_headers`, `_redirects`, real 301s, 404 status | none: `404.html` is honoured, redirects are the meta-refresh pages the build already writes, cache is a fixed 10 min |

The second-to-last row is the trade. For a blog or a portfolio — the site a first user makes — a public content repo is normal and even the point. For a company site with unpublished announcements it is not, and that user takes `--host=cloudflare`.

---

## 2. What the tree already has, and what it lacks

Checked on 22 Sep:

- **Redirects** — `emit.ts` writes `_redirects` **and** one meta-refresh page per entry (line 205–215). Pages ignores the first and serves the second. Works.
- **404** — every build writes `dist/404.html`; Pages serves it with a 404 status. Works.
- **`_headers`** — the S36 cache policy (`/assets/*` immutable). Pages ignores it; assets are already versioned by `?v=`, so the 10-minute default is harmless. Works, slightly less well.
- **The workflow** — `deploy.ts` writes `.github/workflows/snypd.yml` (lint + build + bench on PR and on push to main). It needs a `deploy` job: `actions/configure-pages`, `actions/upload-pages-artifact` from `dist/`, `actions/deploy-pages`, with `pages: write` + `id-token: write`. One function, already the place.
- **Jekyll** — irrelevant on a workflow deploy; no `.nojekyll` needed.
- **The base path — missing.** A project site lives at `/<repo>/`. Every href the build writes is root-absolute (`/posts/x/`, `/assets/theme.css`), `site.url` is checked as a hostname only (`config.ts:645`), and nothing prefixes a path. On `https://owner.github.io/repo/` every internal link 404s. **This is the one piece of real work**, and it is needed for correctness regardless — anyone serving snypd under a subpath hits it.

Two ways around the base path, and I propose both, in this order:

1. **Support it properly.** `site.url` may carry a path; the build prefixes every emitted URL — pages, assets, media, feed, sitemap, JSON-LD, twins, canonical, `_redirects`, the 404's own links — and writes into `dist/` unchanged (Pages mounts the artifact at the path). One helper on the emit path, one bench row that builds under `/repo/` and greps for an unprefixed root-absolute href.
2. **Prefer the root when it is free.** If `<owner>.github.io` does not exist yet, `connect` offers it: the site lands at `https://<owner>.github.io/`, no path, the person's one user site. Most first-time users have none.

A custom domain removes the path anyway (§4).

---

## 3. The flow, on Pages

```
bunx @snypd/cli init my-site && cd my-site && claude
> Write me a first post and put it online.
```

Behind the sentence, `site › connect` (the action; the agent can also run each line itself — none of it is snypd talking to a host):

| Step | Command | Who |
|---|---|---|
| preflight | `gh` present? `gh auth status` ok? — the refusal names the install line and `gh auth login` | binary |
| repo | `gh repo create <name> --source=. --public --push` (private → refuses, says why, offers `--host=cloudflare`) | binary via gh |
| pages | `gh api -X POST repos/{owner}/{repo}/pages -f build_type=workflow` | binary via gh |
| url | `gh api repos/{owner}/{repo}/pages` → `html_url` → `site.url`; commit | binary |
| deploy | `git push` — the workflow builds with the pinned `npx -y @snypd/cli@<v>` and deploys | host |
| answer | "It is at https://owner.github.io/my-site/ — the deploy takes about a minute; say the word for a domain." | agent |

**Human actions: type the line, say the sentence, and `gh auth login` once if it was never done.** Two for most developers; three for the rest. The Cloudflare-CLI route is three for everyone.

Drafts never leave the machine: the workflow deploys `main`; `snypd/drafts` is pushed only on request, and `push.ts` already says what pushing it to a public repo exposes. Preview and approval stay on the Desk, as today.

---

## 4. The domain

`site › domain example.com`:

1. writes `CNAME` into `dist/` on every build (one line in `emit.ts`, host-conditional);
2. `gh api -X PUT repos/{owner}/{repo}/pages -f cname=example.com`;
3. prints the records — four `A` (185.199.108–111.153), four `AAAA`, or a `CNAME` to `<owner>.github.io` for a subdomain — and polls until they resolve;
4. `-F https_enforced=true` once GitHub has issued the certificate;
5. sets `site.url` to the domain, rebuilds; the base path disappears with the subpath.

The purchase stays a purchase. Everything else is a sentence and a wait.

---

## 5. Limits to write down before somebody finds them

- **Public repo on a free account.** The refusal says so at `connect`, not after.
- **100 GB/month bandwidth, 1 GB site, 10 deploys/hour** — soft limits; a blog never sees them; a site with a 45-second hero film per page might. `site › doctor` reports `dist/` size.
- **No `Accept: text/markdown` negotiation** — path-based twins (`index.md` beside `index.html`) are what the build writes anyway; nothing depends on the header.
- **Deploy is not instant** — the agent's answer must say "about a minute", and `site › status` should read the last workflow run (`gh run list`) so "is it up?" has an answer.
- **`gh` is a prerequisite** — there is no `npx` for it. The preflight prints the one line for the platform (brew / winget / apt).

---

## 6. Where this lands on the roadmap

Replaces F2 (host-CLI deploy) as the launch route; F2 and decision 221 are no longer needed for 0.1.x and go to the shelf with the cloud.

| # | Session | Lands | When |
|---|---|---|---|
| 0 | TF proof sitting | `tf-theme-factory` pushed + PR | 22 Sep |
| 1 | docs/30 | this + the two earlier docs, as one numbered doc; decisions 221′ (Pages default), 222 (base path) | 22–23 Sep |
| 2 | **P1** base path | `site.url` with a path; every emitted URL prefixed; bench row `build.basepath` | 23–25 Sep |
| 3 | **P2** `init --host=github` default | the workflow's deploy job; `--host=cloudflare\|vercel` unchanged; the next line printed | 25 Sep |
| 4 | **P3** `site › connect` | preflight, repo, pages, url, push; the `<owner>.github.io` offer; refusals for private / no gh | 26–29 Sep |
| 5 | **P4** `site › domain` + `site › status` | CNAME, records, polling, https; last run read back | 30 Sep – 1 Oct |
| 6 | **P5** bench row `onboard.live` | fresh box → live URL, actions counted; CI against a stub `gh` | 1–2 Oct |
| 7 | **P6** front door | README three lines; docs/08 §2; snypd.rocks home; then the film's new last beat | 2–4 Oct |
| — | buffer | | 5 Oct |

P1–P3 are the story; P4–P5 make the claim honest; P6 makes it visible. If time bites, P4 slips to 0.1.8 and the domain stays "say the word, and here are the records".

---

## 7. Decisions asked

1. **GitHub Pages as the default host for a new site** — yes/no. (Recommendation: yes; Cloudflare/Vercel stay one flag away.)
2. **Base path support in the renderer** — required for project sites; do it, or accept "user site or custom domain only" for launch? (Recommendation: do it — it is a correctness gap independent of Pages.)
3. **Offer `<owner>.github.io` when free** — yes/no. (Recommendation: yes, as an offer, never silently.)
4. **`site › connect` runs `gh` itself, or hands the agent the commands?** (Recommendation: runs them — the same way `push` runs git — so the count is measured by the bench and not by which agent showed up.)
