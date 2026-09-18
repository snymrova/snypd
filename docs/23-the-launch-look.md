# 23 — The launch look: snypd.rocks as a site built in public

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 18 Sep 2026
**Asked for:** *"lets work on a special theme for snypd.rocks a launch and build in public theme"* — and, in the same conversation, *"how a user will manage images and video, where they will be uploaded, how we are going to do that for videos and images we will be sharing in snypd.rocks."*
**Scope:** a plan, not a build. What the launch site should say and how a theme says it; where the theme lives; the two types and one taxonomy it declares; the one renderer gap it hits; media — what exists, what is missing, what snypd.rocks does about its own clips; the sessions; the calls.
**The finding that starts it:** the hero film is parked until the site is worth filming (docs/15 R5, the verdict of 17 Sep), and the site was going to move to `studio` as soon as the host built with 0.1.5. Those are the same session. A site that shows the launch *as it happens* — what shipped, what was decided, what the gate refused, with the numbers beside each — is the footage the film lacks, and it is the registry (docs/20) running on the site that ships it rather than on a fictional studio.
**What this is not:** a fifth bundled theme. Eighteen days before Gate D the shelf stays at four; the launch look is snypd.rocks's own theme in its own `themes/`, which is the thing the front page already promises (*make me a theme*) and decision 179 already lands.

---

## 1. Site-local, not bundled — the call this plan makes first

A bundled theme pays the full gate: a font budget, eighteen `check theme` rules, the corpus and gallery regenerated, docs/09's shelf, and every *four themes* count in the README, the shelf page and the launch copy. `studio` took three sessions to pass it (docs/17–19). A site-local theme that **`extends: studio`** inherits the bands, the display face at 33 KB, the masthead, the cards and the footer, and adds only what the story needs. It is still held to the same rules — `snypd check theme public --root=sites/snypd.rocks` runs the eighteen over it — but nothing on the shelf moves and nothing has to be counted again.

It is also the more honest demonstration. The front page says a theme is *the one thing a terminal makes*; a site running a theme that is not on the shelf, checked by the same gate, extending a bundled one by one line of YAML, is that sentence with evidence. The loader already looks in the site's `themes/` first (`site.ts`, the theme roots — disk, then `node_modules/@snypd`, then the bundled ones), `extends` walks up to the bundled `studio` by name, and decision 179 lands the theme's directory with the config that names it — so nothing in the resolver changes.

**Name.** `public`, not `launch`. The site keeps building in public after 6 Oct; a theme named for one Tuesday reads stale in November. `theme: { use: public }` in `snypd.yaml`.

## 2. What the front page says — six bands, each one thing the repo already produces

The studio look draws each `##` section of the `home: true` page as a full-bleed band (docs/17). The launch look keeps that and gives the bands this order. Nothing here is computed at build time; every band is content, written the way every other page is, by the agent, at the end of a session.

| # | Band | What it is | Where it comes from |
|---|---|---|---|
| 1 | **The hero** | the one-line pitch, the launch date as the eyebrow, the reel behind the headline | `cover` with `media`, `poster`, `autoplay` (decision 184); the reel is short and loops — under a megabyte, under ten seconds, the studio's own bound |
| 2 | **Shipped** | the newest releases, version and date, *breaking* marked | the `release` type the `changelog` plugin declares (§3); its archive at `/changelog/` |
| 3 | **The numbers** | cold start, tokens per page, JS on the page, font against its budget, axe — each linked to its row | `stat-row`; sources are `/bench/` rows, so lint refuses a number with no row behind it |
| 4 | **The ledger** | one entry per session: what was built, what it cost in counts, what was decided | the `log` type (§3), newest first; its archive at `/log/` |
| 5 | **Refused** | what the gate said no to — the masthead that blends, the memory probe, the `Repo.land` a script may not call | the `kind` taxonomy's `refused` term (§3): a term page, `/kind/refused/`, for free |
| 6 | **The story** | the posts, *Building in public* first | `post`, the category that already exists, the four posts written and the maker post drafted for launch day |

The `cta` closes it, as it does today. The two counts the current page gets wrong — *three themes, six looks* and *thirteen primitives* — are fixed by the rewrite, and docs/16's launch copy (PR #36, `docs/launch/copy.md`) is updated to the six bands in the same session.

## 3. The declaration — two types and one taxonomy, in `snypd.yaml`

```yaml
plugins:
  - changelog            # release: extends post · /changelog/{slug} · version, breaking, product (plugins/changelog)
  - autolink
  - indexnow: { key: … }

types:
  log:
    extends: post
    dir: content/log
    urlPattern: /log/{slug}
    layout: log
    taxonomies: [kind]
    fields:
      session:   { type: string, required: true, description: "S29 · R4 — the session log's own name for it (docs/11 §7b)" }
      pr:        { type: string, description: "The pull request, when one carried it" }
      decisions: { type: list, of: { type: number }, description: "docs/11 §8 numbers this session added" }

taxonomies:
  kind:
    attaches: [log]
    urlPattern: /kind/{term}
    # shipped · decided · refused · measured — the four things a session log entry is
```

Three things this buys, none of them new code:

- **`release` is the changelog plugin's**, one file and no code, declared for a site for the first time. `product` gets one term, `cli`. The first entry is `0.1.5`, written the day it publishes; `0.1.4` and `0.1.3` are backfilled from the tags.
- **`log` is the session log made public.** docs/11 §7b has twenty-one rows; the backfill is the eleven from the phase split on (F1 → S29 · R4), the ones with a PR or a bench diff behind them, one file each, written from the rows and nothing else. Every session after this one ends by writing its entry through the MCP — which is the *build in public* claim with a mechanism behind it, and the eleventh use of `content.create` on a custom type.
- **`kind` is where the refusals live.** A term page is an archive the build already draws; `/kind/refused/` costs nothing beyond the term file. The front page's fifth band lists the newest of that term.

The header menu becomes *Log · Changelog · Posts · Themes · Bench · GitHub*; *Why MCP* and *Plugins* move to the footer menu. R1's rule (decision 195) then makes the front page's entries band the `log` — the menu's first link — which is right.

## 4. The theme — `sites/snypd.rocks/themes/public/`

```
theme.yaml        extends: studio · layouts: [post, page, index, term, author, home, release, log, log-index]  (arrays replace — restate)
theme.css         one sheet: the ledger's rows, the release's version mark, the refused band's tone
layouts/home.tsx  the six bands; the studio's home with the second and fourth bands added (§5 · G1)
layouts/log.tsx   a session entry: session name as the eyebrow, counts as a facts strip (the work layout's strip, reused), decisions as a list of links into docs/11 §8 on GitHub
layouts/release.tsx  version set in the display face, `breaking` as a pill, the body, prev/next release (`LayoutProps.adjacent`, decision 198)
layouts/log-index.tsx  the ledger as rows, not cards: date · session · one line · kind
```

No new font, no new part, no `work` — `studio`'s `work` and `work-index` are declared but the site has no `work` type, which `coverage.layouts` reports and nothing refuses. The masthead, footer, cards and entries are inherited. Settings the site sets: `bands: dark-first`, `offices` off, `footerNote` the licence line, `caseCta*` unset.

Held to: `check theme public` 18 rules; the page suite over `/`, `/log/`, one log entry, `/changelog/`, one release, `/kind/refused/`, one post at 1280 and 390 — js 0, font ≤ 33 KB, axe 0, cls 0, one edge (decision 188), `page.media.kb` reported. The banded layouts need the `main:not(.snypd-home, .snypd-work)` exclusion (docs/21's trap) — `log-index` and `release` are reading pages and do not; `home` is already excluded.

## 5. The one renderer gap

**G1 — the front page lists one type (decision 195), and this one needs three.** `LayoutProps.entries` is the newest six of the menu's first archive; the second band (releases) and the sixth (posts) have nothing to draw from. Two ways:

- *(a) Content.* Bands 2 and 6 are written by hand in `home.md` — a list of releases the agent edits on each release. No renderer change; the front page goes stale the moment someone forgets, which is the failure mode a CMS exists to remove.
- *(b) Renderer.* `LayoutProps.lists`: for every dated type, its archive and newest N entries, keyed the way `entries` already is (a term's title is in the key; a new release re-renders `/`). `BuildResult.lists` already computes the archives (R4); this hands the same to the layout. `entries` stays what 195 made it, so no existing theme changes. ~40 lines in `build.ts`, one test in the two-type fixture, decision 200.

**Recommended: (b).** It is the registry's next honest step — an archive per type was R1, a front page that can show more than one is what a site with three dated types is for — and it is smaller than the band it feeds.

## 6. Media — how it works, what is missing, what snypd.rocks does

**What exists (checked in the tree, 18 Sep 2026).** There is no upload because there is no server: a file goes in `content/media/` by whatever the harness has (a file write, `cp`, a screenshot tool), the page names it as `/media/name.png`, the build copies the directory to `dist/media/` byte for byte (`build.ts:148`) and writes `width`/`height` from the file's header so nothing shifts (`media.ts`, five formats and SVG, no library), the host uploads `dist/`. Video is the same path: `figure` and `cover` take `.mp4`/`.webm`, one autoplay per page with a poster (rule 15), nothing fetched until asked (181). `page.media.kb` reports what the first load fetches (187). The file is committed with the post; the no-lock-in claim covers pictures too. For pictures under a few hundred kilobytes this is the right pipeline and stays so.

**What is missing, with where it stands.**

| Gap | Stands | Plan |
|---|---|---|
| `media.upload` tool (docs/03) | not built; the harness writes the file itself | v0.2 — convenience, not a blocker |
| media manifest: alt, credit, licence, where-used, orphans (docs/02 §7) | not built; an unreferenced 8 MB PNG passes lint | v0.2 (docs/06) |
| derivatives: resize, webp, posters | not built; `Bun.Image` on 1.4 resizes and encodes and draws nothing (decision 105) | v0.2, behind the manifest — bytes nobody asked for otherwise |
| **a publish lands the item's path and not the media it names** | `tools.ts:364` lands `[t.path]`; media added by hand rides `snypd/drafts`; a published post on `main` can name a picture `main` does not have — the 23 site files on the drafts branch today are this | **H5, this plan, before launch** — *built, §10* |
| a size row per media file | nothing | **H5**: lint rule 20, report-only — *built, §10* |
| video in git | three clips, 10.5 MB, in the site's history; the hero film is 7.6 MB before a re-shoot | **the site's clips move to object storage (§6.2)**; a user's answer is one sentence (§6.3) |

### 6.1 H5 — two small things, one session's half

1. **A publish lands what the page names.** `content.publish` walks the document's media references (`figure.src`, `figure.poster`, `cover.image`, `cover.media`, `cover.poster`, `logo-wall` images, inline `![]()` under `/media/`), maps each to `content/media/…`, keeps the ones tracked on the drafts branch and not identical on `main`, and hands them to `repo.land` with the item's path in the same commit. Same shape as decision 179's rule for a theme: a page that names a file and a branch that lacks it is not a state the product should produce. One test in `write.test.ts`: a post with a picture, published; `main` has both. Unpublish leaves media where it is (another page may name it).
2. **Lint rule 20, `media-size`, report-only.** Over `content/media/`: a picture over 300 KB warns with its size and the page that names it; a file nothing names warns *unreferenced*. Report-only for one measurement, a budget after, the way `page.bytes.kb` and `page.media.kb` were treated. No manifest, no derivatives — the rule reads the directory and the documents' references, which the build already has.

### 6.2 The site's own clips — object storage, by absolute URL, before the re-shoot

Every media field's schema already accepts an absolute URL (`schema.ts:138`). So the answer for anything big is not a feature: a Cloudflare R2 bucket bound to **`media.snypd.rocks`**, the three clips and the hero film uploaded once, the pages naming `https://media.snypd.rocks/front-door.mp4`. Posters stay in `content/media/` (they are pictures, small, and the still under reduced motion). `page.media.kb` still counts the bytes — it weighs what the browser fetches, not where from — so the gate is unchanged. The site's git history stops growing by a clip per take, which matters the week the film is re-shot twice.

The recipe (Sunny, by hand, ~20 minutes): R2 bucket `snypd-media`, custom domain `media.snypd.rocks`, public read; `wrangler r2 object put` for the four files; the four `src`/`media` values edited; the clips removed from `content/media/` in the same commit (history keeps them; the tree does not). Not a plugin, not a tool, not this month.

### 6.3 What the site tells a user

One sentence on `/docs/` (or the README's media line): *put the file next to your content and name its path; big video goes wherever you host big video, and you give the URL.* That is what WordPress said for twenty years minus the uploads folder nobody owned, and it is true of the product today.

## 7. The work — in order of dependence

| Step | Unit | What | Waits on |
|---|---|---|---|
| 0 | — | `s29-studio-specimen` pushed, PR opened, merged | Sunny |
| 1 | **S31 · G1** | `LayoutProps.lists` (§5 b), the two-type fixture's test, decision 200 | 0 |
| 2 | **S31 · U11** | the declaration (§3), the backfill (eleven log entries, three releases, four kind terms), the theme (§4), the front page (§2), nav, launch copy; `check theme` + page suite; docs/23 §9 outcome | 1 |
| 3 | **S31 · H5** | publish lands named media; lint rule 20 | 0 (independent of 1–2; same session if it fits) |
| 4 | — | R2 bucket and the four clips (§6.2) | Sunny |
| 5 | — | 0.1.5 published; the host's build command moves to `@snypd/cli@0.1.5`; the site pushes with `use: public` | npm token (Sunny) |
| 6 | **R6** | the hero film re-shot on the new site (docs/15 R5's two fixes: the pronunciation, the footage) | 5 |
| 7 | **S30** | the post *The agency look at 0 KB* — now with the site as its own example | 5 |

Cost: G1 + U11 one session; H5 a half. S28 (clean machines) is unchanged and still waits on 5. The launch date does not move.

## 8. Calls

1. **Site-local theme extending `studio`, named `public`** (§1) — *recommended: yes*. The alternative is a fifth bundled theme, three sessions and every count touched.
2. **G1 as a renderer change, `LayoutProps.lists`** (§5) — *recommended: (b)*. The alternative leaves the front page hand-maintained.
3. **`log` backfilled from the eleven sessions in docs/11 §7b, then written by the agent at every session's end** (§3) — *recommended: yes*. The alternative is a ledger that starts on launch day and looks like marketing.
4. **`release` from the changelog plugin as-is** (§3) — *recommended: yes*. A `pr` field on a release would want the plugin changed for one site; the body can link the PR.
5. **H5 before launch** (§6.1) — *recommended: yes*. The publish gap is a 404 waiting for the first post that ships with a picture through the MCP; the lint row is half an hour.
6. **The site's clips to R2 under `media.snypd.rocks`** (§6.2) — *recommended: yes, before R6*. Sunny's hands; a recipe, not a feature.
7. **The header menu** — *recommended: Log · Changelog · Posts · Themes · Bench · GitHub*, Why MCP and Plugins to the footer.

## 9. What this plan does not do

No fifth bundled theme. No media manifest, no upload tool, no derivatives, no `Bun.Image` — v0.2, as docs/06 says. No number computed at build: the ledger is written, and a written number links to the row that measured it. No JavaScript. No change to the six-layout contract, to decision 195, or to the studio theme — the launch look declares beside it and restates its arrays. Nothing on snypd.rocks moves until the host builds on 0.1.5.

---

## 10. Outcome — S31, 18 Sep 2026

**Built:** G1 and U11, the same day the plan was written. Decision 200; the row in docs/11 §7b carries the numbers. The theme is `sites/snypd.rocks/themes/public/` — `theme.yaml`, 49 lines of CSS, four layouts and one part (the ledger, which §4 said would not be needed; the log's rows on the front page and on `/log/` are one file this way and two the other). `check theme public` 18 rules, passes; the page suite over eight routes: js 0, font 32.74 KB, axe 0 across 16 pairs, cls 0.

**Where the plan bent.** (1) The refused band (§2 · 5) is content, not a term's list: `lists` hands the layout dated *types*, not terms, and the newest six of the log would not reliably hold a refusal — so `home.md` names three refusals with links to their entries and to `/kind/refused/`, which is still the archive for free. (2) The list bands come after the author's sections, not interleaved with them: the theme cannot know which `##` a list belongs under, and the menu's order is a rule where an interleave would be a taste. (3) The changelog plugin's `release` inherits `layout: post` through `extends`, so the site says `types.release.layout: release` — one line, and the honest one: the plugin declares the type, the site chooses the layout. (4) The backfill is F1 → R4, the eleven rows with a PR or a bench diff, not *S22 · L1 →* as §3 first said. (5) No reel in the hero: no clip under a megabyte exists; the front-door clip stays a figure in the second band until R6 shoots one.

**H5, the same day** (decision 201; the second S31 row in docs/11 §7b). The walk is one file, `core/content/media.ts`: every `/media/…` *value* a document writes — frontmatter, directive attributes, `![]()` — rather than the field list §6.1 named, so a primitive added later is covered the day it is written. `content.publish` keeps the tracked ones and lands them with the item; the answer says *with 1 media file (still.png)*. Rule 20 over the site's own media folder said more than the plan expected: 22 findings on 35 files — the three clips over the line, one of them (`theme-from-nothing.mp4`, 4.4 MB) named by nothing at all, and nineteen pictures no page shows, 5.6 MB the build copies into `dist/` for nobody. None wrong; what goes is Sunny's call, and §6.2's move to object storage clears the three that matter. `main` has 13 of the 35, which is the gap H5 was for.

**Not done:** the launch copy (§2) lives on `s27-launch-docs` and is updated when that PR is retargeted; the site's clips to R2 (§6.2, Sunny). Everything is uncommitted on the site's `snypd/drafts` and on `s29-studio-specimen` here, and nothing on snypd.rocks moves until the host builds on 0.1.5 (§7 · 5).
