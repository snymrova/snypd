# 16 — L2, the second half: snypd.rocks as a product page, the progress posts, and the Product Hunt campaign

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 16 Sep 2026
**Input:** [docs/10 §7–8](10-plugins-and-launch.md) (Gate D, D12–D13, the tagline, the sixty seconds, the first comment), [docs/11 §7](11-hardening-and-themes.md) (the session order; L2 is row 13), [docs/15](15-readme.md) (the README and every picture and clip it made), [docs/13 §3](13-landscape-actions.md) (the copy edits owed to L2), decision 97 (one post per gate), decision 146 (the tagline order), decision 178 (the front door).
**Scope:** everything a Product Hunt visitor meets after the tagline — the site they click through to, the posts that prove the build is real, the assets on the launch page — and the plan for the day. Sunny's words, 16 Sep: *"start working on product hunt launch campaign, we have to work on our website snypd.rocks as well uploading all the update we did, and the main page about the cms."*
**Where it sits:** docs/15 was the first half of L2 and is done bar the video URLs. This is the second half. Gate D (D13) is still the gate; the date (Tue 6 Oct 2026, 00:01 Pacific · 12:31 IST) is still a target.

---

## 1. Where we stand, honestly

| Surface | State on 16 Sep 2026 | What is missing |
|---|---|---|
| **snypd.rocks, live** | A post list at `/`, four posts from 6 Sep, `/themes` · `/plugins` · `/bench` answering 200 | **No nav, no tagline, no plugins, no front page** — the host builds with `bunx @snypd/cli@0.1.3`, and everything since S19 needs ≥ 0.1.4. `git log` on the site repo has it all; the visitor sees none of it |
| **The release** | v0.1.4 tagged, unpublished; the tree is 0.1.5-to-be | **The npm token** (expired; Sunny). Nothing on this page is visible to anyone until it turns |
| **The posts** | 4 published + `plugins-five-tiers` in the tree | Decision 97 owes three: the **U-series post** (after U6b — six looks, `check theme`, the Desk), the **P-series post** (`plugins-five-tiers`, written 12 Sep, **still `status: draft`** — never published), and the **maker post** (L2) |
| **The README** | Rewritten, 34 pictures, three clips cut (docs/15 §9 R4) | The MP4 URLs (Sunny drops them into a PR comment) |
| **PH assets (D13)** | The clips and stills exist under `.github/readme/`; the tagline and first-comment shape are in docs/10 §8 | `docs/launch/` does not exist; no gallery set, no first comment, no FAQ, no clean-machine transcripts |
| **The front door** | `mkdir · bunx @snypd/cli init · claude` (decision 178) — recorded working, from an empty directory | A clean machine that is not this one (D13 wants three platforms) |

**The one thing that gates all of it is the npm token.** Every session below produces something that is only visible on snypd.rocks once the host builds with a release that has it. The order of work assumes the token turns this week; if it does not, S25–S27 still land in the site's repo and go live the minute it does.

---

## 2. The front page — a product page, not a feed

A Product Hunt visitor arrives at `/`. Today `/` is `base`'s `index` layout: a title and the post list. It has to say what the product is before it lists what was written about it.

**The product answer, not a special case:** a page in `content/pages/` becomes the front page. `pages/home.md` with `home: true` in its frontmatter renders at `/` with a new `home` layout — the `page` layout's body (every primitive available: `tldr`, `stat-row`, `figure`, `steps`, `cta`) followed by the `entries` part with the latest posts — and the post list moves to `/posts/`. One frontmatter key, one layout in `base` (which every theme inherits — decision D8's contract holds), `/posts/` in the sitemap, the `WebSite` JSON-LD unchanged on `/`. Sites without a `home` page keep today's behaviour exactly. This is the feature that makes snypd a CMS for a *product site* and not only a blog, and the front page of snypd.rocks is its first user — written through the MCP like every other page.

**What the page says** (docs/10 §8 and decision 146, in that order):

1. **Hero:** the wordmark, *Publish a website from the harness you already have open.*, *Your CMS is wherever your agent is.*, the four-line front door as a `steps` block, the hero clip (V1) as a `figure` — see §2.1.
2. **What you get:** the README's six bullets, as a `stat-row` of the three numbers that link to `/bench` (cold start, tokens per page, 0 KB JS) and one paragraph.
3. **Six looks:** the phone strip, linking to `/themes`.
4. **Thirteen primitives:** four crops in a row, linking to the primitives post.
5. **A person in the loop:** the Desk picture, one paragraph.
6. **The WordPress table** (docs/10 §3, five rows) — the comparison every visitor makes, made first.
7. **`cta`:** the front door again, and GitHub.
8. Below it, the latest posts — the build in public is the proof the page is not marketing.

### 2.1 The clips need a way onto a page

The thirteen primitives place images (`figure`) and nothing places a video. The clips are the strongest thing the README has, and the site cannot show them. **Recommendation: `figure` accepts a video** — `src` ending `.mp4` or `.webm` renders `<video controls preload="metadata" playsinline>` with `poster=` (a new optional prop, an image) and the same `alt` and `caption`; `lightbox` is ignored for video; the twin's fallback is a link. No JavaScript, native controls, 0 KB holds. The vocabulary stays at thirteen: a figure is *a thing the text refers to*, and a clip is one. The alternative — a fourteenth primitive, `video` — is more honest to the spec's "one primitive, one job" and costs a spec file, a lint rule, a base implementation, a twin fallback and every "thirteen" in the copy. Thirteen is in the README's headings and on the live site; `figure` grows.

The MP4s live in the site's `content/media/` (V1 3.4 MB, V2 2.6 MB, V4 — §4) and are served by the host like any media; no third-party player, nothing loaded from anywhere else.

---

## 3. The posts — "uploading all the update we did"

Decision 97: one post per gate, three good ones. Two are overdue and the third is L2's.

| Post | Gate | What it carries | Source |
|---|---|---|---|
| **Six looks, one contract** (U-series) | U6b, 13 Sep | Style variations; `technical` built from the contract with no forked layout; `snypd check theme`'s 17 rules; the gallery lane; the Desk (S23); CSS as the runtime (docs/14) | docs/11 §7b rows U1–U7, S23; `.github/readme/looks/*`, `terminal/check-theme.png`, `desk-*.png` |
| **Four plugins, five tiers** (P-series) | P4, 12 Sep | The contract, the tiers, the byte-diff test, what was refused (no sandbox, said plainly) | `plugins-five-tiers.md`, 12 Sep, `status: draft` on the drafts branch — a re-read against P4's final shape, then publish |
| **What the harness did while I watched** (the maker post, L2) | Gate D | The launch post: what snypd is in one paragraph, the front door, the WordPress table, the three numbers, what it is not, what is next. Drafted as `mcp.write: draft` so Sunny reads it on the review page before it lands; it publishes on launch day | docs/10 §8's first comment — the post and the comment are one text in two lengths |

Written through the MCP from this checkout (`.mcp.json` → `sites/snypd.rocks`, the path memory records), previewed, published, pushed. No new mechanism.

---

## 4. Product Hunt — the campaign

**The asset list is D13's, and most of it now exists.** What is left is packaging and the parts that are Sunny's.

| Asset | PH wants | We have | To do |
|---|---|---|---|
| Tagline (≤ 60) | one line | docs/10 §8: *The CMS whose only interface is your AI agent.* (52) | Confirm; alternatives there |
| Description (≤ 260) | one paragraph | decision 146's three sentences (≈ 210) | Write it once, use it everywhere |
| Video | ≤ 60 s, the first gallery slot, plays on the launch page | **V1, 50.7 s** — one command, Claude Code, a post with a chart and a flow, the built page | Upload; PH accepts a YouTube/Loom URL for the top slot, so it goes to a YouTube unlisted upload too (Sunny's account) |
| Gallery images | 3–8, 1270×760 | the README set at 1280×800 | Five: `editorial-paper-light` fold · the phone strip on a plate · four primitives on a plate · `check-theme.png` · the Desk. `packages/bench/readme/gallery.py`, 1270×760 exactly, from the existing PNGs |
| Thumbnail | 240×240 | the wordmark | Render the `.` on the oxblood at 240 |
| Maker's first comment | the shape in docs/10 §8 | — | Write it with the maker post (§3): one paragraph, the WordPress table, three numbers with links, what it is not, what is next. No telemetry, said |
| FAQ | PH's "ask the makers" | — | Ten questions, from the README's `<details>` and the bench: *is it a static site generator?*, *why no dashboard?*, *what about WordPress?*, *what does it cost?*, *what data leaves my machine?* (nothing; there is no telemetry), *Windows?*, *my own theme?*, *plugins — a marketplace?* (npm), *is there a sandbox?* (no, said plainly), *what is next?* |
| Topics | 3 | — | Developer Tools · Open Source · Artificial Intelligence (a fourth if allowed: Content Management) |
| Coming-soon page | 2–3 weeks before, collects followers | — | Set up **by 22 Sep**; the README, the site footer and the three posts link it |
| Hunter | optional | — | **Self-hunt.** A hunter with a following is worth something on a Tuesday and nothing on a launch page that says "your CMS is your agent" in someone else's words. Sunny's call |
| Clean-machine runs (D13) | three platforms | this box | macOS arm64 (Sunny's Mac?), Windows x64, Linux x64 in a fresh container — three transcripts into `docs/launch/`; **needs 0.1.5 on npm first** |

**The day.** 00:01 Pacific is 12:31 IST — a working afternoon, not a night, which is a better draw than docs/10 §7.2 assumed. The maker post publishes at 12:31 (`content.publish` from the review page — the one approval a person makes that day). The first comment goes up within the minute. Show HN the same day at ~15:00 IST (07:30 Pacific, when HN's US morning starts), titled *Show HN: Snypd – a CMS whose only interface is MCP*; the README is the landing, not the PH page. Replies for twelve hours; every reply that names a number links `/bench`. Nothing is scheduled in advance that needs a person: the site is built by the host on push, and the post is the only push that day.

**What to measure** (docs/10 §8, unchanged): `@snypd/cli` weekly downloads before and after; stars; issues by people who are not us; `snypd-theme-*` / `snypd-plugin-*` on npm; sites that link back. No telemetry.

---

## 5. Sessions

| # | Session | Produces | Gate |
|---|---|---|---|
| **S25** | **The front page is a page** | `home: true` on a `page`; `home` layout in `base`; `/posts/` index; `figure` accepts video with `poster`; tests (a site with and without a home page; the twin's fallback for a video); `check theme` unchanged (the layout is inherited, D8) | D12 |
| **S26** | **snypd.rocks, the content** | `pages/home.md` written through the MCP with the four clips and five stills in `content/media/`; the U-series and P-series posts published; the maker post as a draft (`mcp.write: draft` on `post` for that one item, or a `launch` type with the draft policy); nav gains Home; pushed | D12 |
| **S27** | **`docs/launch/`** | the five gallery PNGs at 1270×760 and the 240 thumbnail (a script, not Figma); tagline · description · first comment · FAQ as one markdown file; the PH checklist with owners; the Show HN text | D13 |
| **S28** | **Clean machines** | three transcripts of `mkdir · bunx @snypd/cli init · claude · "Write me a first post."` on three platforms, against **0.1.5 on npm** | D13 · **Gate D** |

S25 and S27 need nothing from anyone. S26 lands in the site's repo whether or not the host can build it yet. S28 is the one that waits on the token.

---

## 6. The calls that are Sunny's

1. **The npm token.** Until it turns, nothing on snypd.rocks moves for a visitor and S28 cannot start. This is the launch's critical path and it is one setting on npmjs.com.
2. **`figure` grows video, or a fourteenth primitive?** Recommendation: `figure` (§2.1). Say so or say otherwise; S25 is written either way.
3. **Self-hunt?** Recommendation: yes (§4).
4. **The coming-soon page** goes up under Sunny's PH account by 22 Sep — that and the YouTube upload are the two things I cannot do from here.
5. **The MP4s into the README PR** — drag three files into a comment; I paste the URLs (docs/15 Q2, unchanged).

---

## 7. What is not in this plan

`migrate-from-wordpress` (the first post-launch session, docs/10 §7.2), a newsletter, `og-image` (decision 105), a PH "launch kit" of social posts for other people to share (nobody shares a CMS launch; the posts are the sharing), paid promotion, and a Discord. Comments on the site (Giscus is the first community plugin, not ours).
