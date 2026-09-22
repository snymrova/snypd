# 15 — The README: what it shows, what it proves, and how the pictures get made

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 16 Sep 2026
**Input:** `README.md` as it stands (55 lines, written for a contributor), [docs/13 §3](13-landscape-actions.md) (the three README edits owed to L2), [docs/11 decision 146](11-hardening-and-themes.md) (the tagline order), [docs/10 §9](10-plugins-and-launch.md) (launch copy), `bench/gallery.md`, `bench/latest.md`, `bench/writes.md`.
**Scope:** the README is the first thing a Product Hunt visitor, an npm visitor and a Hacker News reader see, and today it reads like a contributor's notebook: no picture, no video, the command block above the fold, the plugin contract explained before the product is. This document plans the rewrite as **one session in four blocks (R0–R3)** with the assets made *by the project's own tools wherever a tool exists* — the pictures are evidence, not decoration. It asks Sunny for six calls.
**Where it sits:** this is the first half of **L2** (docs/11 §7 row 13). Nothing here moves the queue in front of it: the npm credential (Q-1) is still the thing that makes the install line true.

---

## 1. What the README is for, in one sentence each

| Reader | Arrives from | Gives it | Must leave knowing |
|---|---|---|---|
| Launch visitor | Product Hunt, HN | ~4 seconds, then maybe 40 | *what it is*, *that it is real*, *what it looks like* |
| Harness user | "how do I start" | 1 minute | `bunx @snypd/cli init`, then open the harness — the whole install is the command (decision 178) |
| Theme author | snypd.rocks/themes | 5 minutes | `new theme` → `check theme`, that `base` brings all 13 primitives, that a look is measured |
| Agency owner | docs/12's arithmetic | 2 minutes | one binary, twenty git repos, $0; check the no-lock-in with `ls` |
| Contributor | the code | as long as they like | where `docs/` is, and that every number links to a bench row |

The current README serves only the last reader. The rewrite serves the first four **in that order down the page** and keeps the fifth by moving, not deleting: the command block, the plugin contract and the packaging note go into `<details>` and links, unchanged.

**The rule that keeps it honest (docs/00 principle 9):** every claim in the README either links to a file in the tree, a row in `bench/*.md`, or a picture the tree produced. A **claims audit** is the first task of R0 — the current README already carries one sentence that is not true of the tree (docs/00 §One paragraph's "a public read-only MCP"; `corpora/100/dist` has `llms.txt`, `feed.xml`, `sitemap.xml`, `api/*.json`, `.md` twins — and no MCP). Nothing like that survives the rewrite.

---

## 2. The shape of the page

Top to bottom, with what each block *shows* and what it *proves*. Copy is short; the pictures carry it.

| # | Block | Shows | Proves it with |
|---|---|---|---|
| 1 | **Masthead** | wordmark (§4 A), the tagline in decision 146's order, five badges (CI · npm · MIT · Bun ≥ 1.4 · "0 KB JS") | badges read CI and npm; the JS badge links `bench/page.md` |
| 2 | **The hero video** (45 s) | `bunx @snypd/cli init` in a terminal → `claude` → "write me a first post" → a post with a chart, a flow and an FAQ → build → the site, in `editorial` | a real session, recorded (§4 B) |
| 3 | **Start here** | `bunx @snypd/cli init my-site && cd my-site && claude`, then *"Write me a first post and put it online."* — **one line, one sentence, one click**, and the three actions linked to the row that counts them (L6, docs/31 §5; `init` made the directory at L1 and the walk reached a URL at L2, so decision 178's four lines are three commands shorter and one host login longer). The five platforms by name (docs/10 §9: every Bun platform) | `bench/onboard.md` · `packaging/` |
| 4 | **What you get** — six lines, one link each | one binary · zero JS by default · primitives → SVG at build · the agent-read surface (`.md` twins, `llms.txt`, feeds, JSON API) · benchmarks that fail CI · a git repo you own | `bench/latest.md` rows, `dist/` listing |
| 5 | **Thirteen primitives** — the capability block | a grid: each primitive's source on the left, its render on the right, cropped from one page (§4 C) | `packages/spec/primitives/*.yaml` — the vocabulary is closed, and this is all of it |
| 6 | **Three themes, six looks** — the flexibility block | the same post photographed in every look, light/dark pairs via `<picture>`; under each: personality line, `font.kb`, `js.kb`, axe count | `bench/gallery.md`, live at snypd.rocks/themes |
| 7 | **Write a theme** | `snypd new theme` → `snypd check theme` terminal capture (17 rules, the contrast table); `extends: base`, variations, settings, one webfont ≤ 40 KB | `render/src/check.ts`; the `build-theme` prompt |
| 8 | **The MCP surface** | a compact table: resources · tools (`content.*` + `find_tools`) · prompts (`get-started`, `write-post`, `build-theme`); `tokens.tools` 2 230, `tokens.learn` < 6 000 | `bench/latest.md`; docs/03 |
| 9 | **A person in the loop** | the Desk (S23) with a draft awaiting approval; branch previews (`snypd/drafts`, noindex); `mcp.write: draft`, `deploy.push: human` | a Desk screenshot; docs/08 |
| 10 | **Plugins** | four tiers, four bundled (`changelog` · `analytics` · `autolink` · `indexnow`); a ten-line manifest; "experimental through 0.x" | `plugins/*/snypd.yaml`; snypd.rocks/plugins |
| 11 | **Speed** | one chart: `build.cold` at 100 / 1 000 / 10 000, `build.incremental` 13 ms, `mcp.coldStart.binary` 23 ms — **rendered by snypd's own `chart` primitive** (§4 D) | `bench/latest.md`; snypd.rocks/bench |
| 12 | **The agent test** | 15/15 across haiku · sonnet · opus; first-attempt lint 0.70 / 0.95 / 0.95 | `bench/agent.*.md`, `bench/writes.md` |
| 13 | **Deploy** | `init --deploy=cloudflare\|vercel\|netlify\|github`; a build is `snypd build`, nothing else | `core/src/deploy.ts` |
| 14 | **Who it is for** | the ownership line (docs/13 §3.3, "check it with `ls`"); the agency line — **the half that never ages** (§5 Q3) | docs/00, docs/12 |
| 15 | **WordPress for the agent era** | one two-column table, kept / refused (docs/10 §9's maker comment, verbatim) | — |
| 16 | `<details>` **Every verb** · **The plugin contract** · **Packaging** | the current README's three long blocks, moved | unchanged |
| 17 | Footer | docs · site · themes · plugins · bench · CONTRIBUTING · SECURITY · MIT | — |

Length target: **≤ 220 lines outside `<details>`**, and nothing above block 3 that a phone cannot show in two screens — GitHub's mobile view is where a Product Hunt tap lands.

**One diagram, dogfooded.** Block 4's "one binary" wants a picture: MCP server · renderer · spec · themes · SQLite · image pipeline, in one box, with a harness on the left and `dist/` on the right. It is drawn by snypd's own `diagram` primitive and committed as the SVG the build wrote — the caption says so. A README that shows a diagram the product rendered is a stronger claim than any sentence about the primitive.

---

## 3. The pictures — made by the tree, not by hand

Every asset has a script that regenerates it, in `packages/bench/readme/` beside the gallery lane, so a theme change or a new primitive re-shoots the README the way it re-runs the bench. Nothing is retouched.

### 3.1 A fixture that is fit to photograph

`corpora/theme`'s cover is a flat oxblood raster on purpose ("dimensions, not art") and every gallery picture is 40 % rectangle. The README cannot use that. **R0 adds `corpora/readme/`**: the same every-primitive-once post, with a real cover (an SVG the corpus generator draws — a typographic plate, deterministic, a few KB), a real author, a real second post so `entries` has two cards, and a `nav`. It is a corpus like the others (`bun run corpus readme`), so it is honest the way they are, and `bench gallery --root corpora/readme` photographs it without a new lane.

### 3.2 Stills

One script, `readme shots`, over Chrome via CDP (the gallery lane's own `shot.ts`), emulating `prefers-color-scheme` per frame the way S22 learned to:

| Set | Frames | How |
|---|---|---|
| Six looks × light/dark × 1280 | 12 | full page, then a 1280×800 fold crop for block 6 |
| Six looks × 390 | 6 | one composite strip of phones |
| Thirteen primitives | 13 pairs | `DOM.getBoxModel` on `.snypd-<name>` → clipped screenshot; source snippet cut from the fixture's markdown by the same name |
| The Desk | 2 | `snypd dev corpora/readme` with one draft, light and dark |
| `check theme` | 1 | the terminal, captured as SVG (§4 E) |
| `snypd.rocks` | 1 | the live home once the pin moves — until then the local build of `sites/snypd.rocks` |

Output: `.github/readme/` — PNG through `oxipng`, **≤ 150 KB a frame, ≤ 6 MB the folder** (§5 Q1). Light/dark pairs are wired with `<picture><source media="(prefers-color-scheme: dark)">`, which GitHub honours.

### 3.3 Video

GitHub plays inline video only from its own asset host (a file dragged into an issue or PR comment). A repo-relative `.mp4` renders as a link. So: **MP4 is the artefact, Sunny uploads it once** (§5 Q2), and a **GIF ≤ 4 MB of the hero only** is committed as the fallback that npm and forks see.

| Clip | Length | Content | Recorder |
|---|---|---|---|
| **V1 hero** | 45 s | a terminal: `bunx @snypd/cli init`; then Claude Code: `write-post` with three primitives, `build`; the page in the browser | `vhs` (§4 B) driving a real interactive session; the browser half is a CDP capture stitched by `ffmpeg` |
| **V2 six looks** | 15 s | "make it technical › phosphor" in the harness → `theme` › set → rebuild → the same page, six looks in a row | same |
| **V3 a person approves** | 20 s | a `mcp.write: draft` type; the agent stops at the review URL; the Desk; approve; push | same |
| **V4 a theme from nothing** | 30 s | `new theme` → edit two tokens → `check theme` green → the look on the shelf | `vhs` only |

Every clip is a real run — nothing typed into a fake prompt, no transcript replayed as if live. If V1 cannot be recorded interactively (vhs and Claude Code's TUI have not met yet), the fallback is the S21 lane's real `claude -p` transcript, rendered as a scrolling transcript beside the browser — labelled as a transcript.

**Cost:** each interactive clip is one Claude Code session on Sunny's rate window (S21: ≈ $0.2–0.9 a run). Budget three takes a clip.

---

## 4. The five things that do not exist yet

| | Asset | Made how | Falls back to |
|---|---|---|---|
| **A** | **Wordmark.** None exists — no logo, favicon or OG image anywhere in the tree or the site | typographic, the editorial serif, `snypd` lowercase, one SVG, dark/light pair; no mark, no mascot (§5 Q4) | the name in `<h1>` |
| **B** | **A terminal recorder.** Neither `vhs` nor `asciinema` is installed; `ffmpeg` and Chrome are | `vhs` from its release binary into `~/.local/bin` (needs `ttyd`); `.tape` files committed under `packages/bench/readme/tapes/` | `asciinema` + `agg` for GIF-only |
| **C** | **Per-primitive crops** | the `readme shots` script (§3.2) | the full-page shot with numbered callouts |
| **D** | **The speed chart as a snypd `chart`** | a `chart` block in `corpora/readme`'s second post, sourced to `bench/latest.md`; the build's SVG copied out | the same numbers as a table |
| **E** | **Terminal-as-SVG** for `check theme` | `vhs` `Screenshot` → PNG, or `ansi-to-svg` for a crisp vector | a code block with the plain output |

---

## 5. Six calls for Sunny

| # | Question | Recommendation | Why |
|---|---|---|---|
| Q1 | **Where do the stills live?** committed under `.github/readme/`, or hosted on snypd.rocks and hot-linked | **Committed.** ≤ 150 KB a frame, ≤ 6 MB total | the README is forked, mirrored and vendored; a picture that lives on a domain we might stop paying for breaks in every copy. Videos are the exception (Q2) |
| Q2 | **Video hosting** | **GitHub's asset host** — Sunny drags each MP4 into a comment on the README PR; I paste the URLs. One hero GIF ≤ 4 MB committed as fallback | the only way GitHub plays video inline; nothing to host |
| Q3 | **The agency arithmetic** (docs/13 §3.2, left open) | **The README carries the half that never ages** — *one binary, twenty git repos, $0*; the competitor's price with its date goes in the launch post and docs/12 | a stale price in a README ages into looking dishonest |
| Q4 | **Wordmark** | typographic only, made in R0, a dark/light SVG pair | a mark is a brand decision; the launch does not need one; decision 145's instinct (no visual anything we do not need) applies |
| Q5 | **Merge gate** | **Hold the README PR until 0.1.5 is on npm**, then merge both the same hour | the first line of block 3 is `bunx @snypd/cli init`, which resolves today to 0.1.3 (§8) — a version without menus, previews, the Desk as photographed, or `check theme`; a README whose pictures are of 0.1.5 must not go live in front of 0.1.3 |
| Q6 | **The hero clip's harness** | Claude Code | it is the one on the box, the S21 lane already proves the MCP against it, and the maker comment names it first |

---

## 6. The session, in four blocks

| Block | Does | Exit |
|---|---|---|
| **R0 · ground** | claims audit of the current README against the tree (every sentence → a file or a row, or it goes); `corpora/readme` (§3.1); wordmark (A); install `vhs` (B); `.github/readme/` with the pipeline script skeleton | a list of every claim with its address; the fixture builds and lints clean |
| **R1 · stills** | `readme shots`: 12 look frames + 6 phones + 13 primitive pairs + Desk + `check theme`; the `diagram` and `chart` SVGs out of the fixture's build | `.github/readme/` under 6 MB; each frame's script named in a manifest |
| **R2 · motion** | V1–V4 recorded; MP4 + the hero GIF; the fallback transcript clip only if V1 fails twice | four MP4s in the scratchpad for Sunny to upload; the GIF committed |
| **R3 · the page** | the README in §2's order; decision 146's tagline; docs/13 §3.1–3.3; packaging's npm README synced (absolute image URLs, because npm does not serve the repo); the current three blocks into `<details>`; a phone-width read; a link check | PR opened, held for Q5 |

**Verification that counts:** the README rendered by GitHub on the PR branch, read once at phone width and once at desktop; every image loads; every link resolves; `bun test` unchanged (the fixture is a corpus, so `site.test.ts` covers it); the pipeline re-run from clean reproduces every still byte-for-byte except the timestamps.

---

## 7. What would make this wrong

- **The pictures outrun the pin.** The live site still runs 0.1.3's launcher (E3). Block 6's "live at snypd.rocks/themes" and the site screenshot are true of the tree and false of the URL until Q-1 clears. The README is held for it (Q5); the maker post should be too.
- **A video that is not a run.** If a clip is composed from a transcript, its caption says so. The kill test's whole point is that the run is real.
- **Weight.** A README that pulls 20 MB of PNG is a README nobody on a phone finishes. The 6 MB ceiling is a budget, and R1 records the folder size the way `page.bytes.kb` is recorded.
- **Copy that ages.** Numbers in the README are the ones in `bench/latest.md` at the moment of the PR and link to it; the text says "as of" nothing — the link is the date.

---

## 8. The claims audit (R0) — every sentence of the current README, with its address

Read on 16 Sep against `main` at `4cde5c4`. *Keeps* carries into the rewrite with the link named; *goes* does not survive; *fix* survives with the number corrected.

| README line | Verdict | Address |
|---|---|---|
| "only interface is MCP" | keeps | `packages/cli` has seven verbs and none writes content — `snypd --help` says so |
| "Markdown + YAML in a git repo you own" | keeps | `corpora/readme/content/`; `packages/core/src/write.ts` |
| "one Bun binary" | keeps | `packaging/npm/build.ts`, `bench/latest.md` › `install.binary.mb` |
| "static HTML with zero JS by default" | keeps | `bench/page.md` › `page.js.kb` 0 / 0; `render/src/budget.ts` (H2) |
| "charts, diagrams and flows rendered to SVG at build time" | keeps | `.github/readme/blocks/*.svg` are the build's own output |
| "Every speed claim links to `bench/latest.md`" | keeps | the rule for the rewrite too |
| "The sentence reads `bunx @snypd/cli init` from the first published release … until that first publish the line above is a checkout" | **fix** | **`@snypd/cli@0.1.3` is on npm** — 0.1.1, 0.1.2 and 0.1.3 published from CI on 31 Aug and 6 Sep. The install line has been true for ten days; what is stale is the *version* behind it (U2 onward is not in 0.1.3). §5 Q5 is softened accordingly: the README can go live before 0.1.5 as long as no picture shows a feature 0.1.3 lacks — and the pictures are of the tree, so it is held anyway |
| "npm declined the bare `snypd` as too close to `snyk`" | keeps, into `<details>` | `packaging/npm/cli/bin/snypd.js` header |
| "sixteen named rules" (`check theme`) | **fix → seventeen** | `snypd check theme editorial` prints `passes — 17 rules`; U7 added `css.enhancement-guarded` (decision 161) after the README line was written |
| "Four ship in the binary — `changelog`, `analytics`, `autolink`, `indexnow` — one per tier" | keeps | `plugins/`, `core/src/bundled.gen.ts` › `BUNDLED_PLUGIN_NAMES` |
| "plugin tools land next, and a manifest that names them parses now and says so" | **goes** | P4 shipped tier 4 (`core/src/speak.ts`, `mcp/src/plugintools.ts`); the README is a session behind its own tree |
| "The contract is experimental through 0.x" | keeps | docs/10 §4; the launch risk register |
| "Five human actions, one of them friction" | keeps | docs/08; `bench/onboard.md` |
| "`dev` … writes nothing" | keeps | `render/src/preview.ts`, decision 51 |
| "`tools/list` stays small on purpose — `content.*` plus `find_tools`" | keeps | `bench/latest.md` › `tokens.tools` 2 230; `mcp.test.ts` asserts `CORE_TOOLS` |
| docs/00 §One paragraph: "a public read-only MCP" | **not in the README — and not in the tree** | `corpora/100/dist/` has `llms.txt`, `feed.xml`, `sitemap.xml`, `api/*.json`, `.md` twins; no MCP endpoint. The README's block 4 names the four that exist. docs/00 is a design intent and is left as written; docs/06's roadmap is where that row belongs |

## 9. Session log

| Block | Date | What landed | Found on the way |
|---|---|---|---|
| **R0 · ground** | 16 Sep 2026 | `corpora/readme` (`generateReadme` in `bench/src/corpus.ts` — the theme fixture plus typographic SVG plates for its three images, a name a masthead can carry, and two posts whose blocks the README lifts: `how-fast` reads `build.cold.*`, `build.incremental.100` and `mcp.coldStart.binary` out of `bench/latest.md` into a `chart` and a `stat-row`, `one-binary` is the architecture as a `diagram`); `packages/bench/readme/shots.ts` — five sets, 33 files, **1.03 MB** against the 6 MB budget, `manifest.json` with every frame's look/route/viewport/scheme/bytes; `packages/bench/readme/optimise.py` (256-colour palette + oxipng, 129 → 43 KB a look frame); `packages/bench/readme/wordmark.py` — `snypd.` in Source Serif 4 at 600 from the theme's own woff2, outlines as paths with GPOS kerning applied, one file per scheme, the full stop in the accent; `vhs` 0.11.0 + `ttyd` 1.7.7 in `~/.local/bin`; the claims audit above | (1) **`vhs` 0.12.0 records and then silently writes nothing** on this box — strace shows `ffmpeg` resolved on PATH and never exec'd, the frames dir removed; 0.11.0 works, so that is the pin. (2) CDP's `clip.scale` multiplies *on top of* `deviceScaleFactor` — the first frames were 5120 px wide. (3) The plate clipped its own title at `height × 0.19`; the size is now bounded by the width at 0.52 em a glyph. (4) **The Desk of the fixture is a first-run Desk** — no repo, no `.mcp.json`, no heartbeat — so the shot is taken from a copy under `.scratch/` with a bare repo beside it as `origin`, a heartbeat naming the shots process (alive for the run), and `deploy.push: human`; the six rows go green and the say-card and Push card are what the README shows. (5) `.github/readme/` is the asset home (Q1 taken as recommended); the folder's size is the manifest's `totalBytes`. (6) `@snypd/cli@0.1.3` is on npm — the audit's one correction to the plan |
| **R1 · stills** | 16 Sep 2026 | `terminal/check-theme.png` (vhs over the compiled binary, run from a *site* directory, 17 rules green with the contrast columns); `phones/strip.png` (`strip.py`, six phones on one ground, 178 KB); `themes/base/theme.css` gains `img, svg, video { max-width: 100%; height: auto }`; 34 files, **1.09 MB** | (1) **A 1200 px cover was 1200 px on a 390 px phone under `base`** — the strip showed it; base's sheet is behaviour, and a page that scrolls sideways is a behaviour, so the rule is base's. (2) The compiled binary, run *inside this repo*, loads `themes/<name>/` off the cwd and fails on base's TSX (`Cannot find package 'react'`) — the S18a rule again: judge a theme from a directory that has no `themes/`, which is where every user runs it. (3) `packages/bench/smoke/smoke.test.ts` fails while a `snypd` is on `PATH` — `init` registers the bare command when it can (docs/08 §12.8), and the test expects the binary's own path; `~/.local/bin/snypd` is the R2 binary and comes off after the retakes. `push.test.ts` timed out once at load average 15 and passed alone |
| **R2 · motion** (first take) | 16 Sep 2026 | `tapes/v1-hero.tape` (one sentence per session; every wait is `Wait+Screen` for `done HH:MM`); `scroll.ts` (a built route scrolled once, CDP frames → H.264); `compose.sh` (`mpdecimate` folds the waits — a frame is dropped when under 1.5 % of it changed, kept whenever text arrives — then the two halves concatenated). **V1 take 1: a real 272 s session folded to 61.4 s, 4.4 MB.** The run: `snypd init` → restart → "write the first post … then build it" → the agent read config, primitives, the post type and the bench, wrote a post with a cover, a `tldr`, a `stat-row`, a three-series `chart`, a `flow` and a five-question `faq`, lint 0/0, previewed it, checked the twin by `curl`, published, landed it on `main`, built. Its own closing summary is the hero's script. `tapes/v2-looks.tape` and `tapes/v4-theme.tape` drafted, not run | (1) **The take is not the one to ship**: Claude Code's *"You've used 94 % of your session limit"* banner is in frame at minute two — the recording shares Sunny's five-hour window with this session (S21's trap, from the other side) — and the auto-update notice is in frame at minute one. Retake after the window resets (14:30 IST), with V2 and V4 in the same window. (2) **`snypd init` did not `git init`** — `shouldInitRepo` wants an *empty* directory and this one held `.claude/settings.json` (the pre-approved permissions); the agent ran `git init` itself, on `master`, left the scaffold uncommitted, and the CMS refused to branch over it, so the agent committed and renamed to `main` — recovered, but by Opus. For the retake the permissions ride the command line (`claude --allowedTools …`) and the directory is empty. For docs/08: a directory that is not empty and not a repo gets no repo and no sentence saying so; `init` should say *"not a repo and not empty, so I did not `git init` — run `git init -b main`"*, or accept a directory whose only entries are dotfiles. (3) **vhs's parser reads a leading `/` as a regex** — `Output /home/…` fails to parse; outputs are relative to the tape's cwd. (4) The 61 s GIF fallback is 17 MB at 960 px / 12 fps; a GIF cannot carry the hero. R3 decides between a 15 s cut and a poster still that links the MP4. (5) `editorial`'s `stat-row` wraps a two-word value (`4605 tokens`) onto two lines in a three-up row at 1440 — a theme note for `folio`/L2, not this session |
| **R3 · the page** (draft) | 16 Sep 2026 | `README.md` rewritten in §2's order — 245 lines outside `<details>` of which 60 are the generated primitives table; `packages/bench/readme/primitives.ts` writes that table from the spec's own `example:` fields beside the crops; branch `r0-readme-ground` pushed and the page read on GitHub at 1280 px in the dark theme: 31 images, none broken, the `<picture>` pairs switching with the viewer's scheme | (1) **A blank line inside a `<pre>` ends a CommonMark HTML block** — `faq`'s example carries one, and *"### What does help?"* rendered as a heading of the README on the first push; newlines inside the cell are `&#10;` now. (2) **GitHub's table is `width: max-content`**, so a `<pre>` holding a 120-character directive pushed the picture column off the right edge behind a scrollbar; the source is inline `<code>` (`white-space: break-spaces`), which wraps. (3) The hero slot is a poster until the MP4 is uploaded (Q2); the phone strip at 2600 px reads at 1280 but the 390 px column is small — leave, it is a strip. Still owed for R3: the video URL, `packaging/npm/cli/README.md` with absolute image URLs, a phone-width read, the retakes (V1 clean, V2, V4), and a call on V3 (the approve click needs a driver `scroll.ts` does not have) |
| **R4 · the front door, and the takes** | 16 Sep 2026 | **Decision 178** (docs/08): the front door is `mkdir · bunx @snypd/cli init · claude · "Write me a first post."` — Sunny's call, on the observation that whoever runs `init` decides whether the harness start is an open or a restart; README, the npm README, `init`'s printout (rewritten for a person, wrapped at 100 columns, the one relay sentence kept for an agent that ran it), the two smoke tests, §1–§3 of this document. **V1 take 3: 237 s of session folded to 50.7 s, 3.4 MB** — `init` from an empty directory (git-inits, commits, prints), `claude`, one brief; the agent read the site and the bench, set the URL, wrote a post with a tldr, a stat-row, a three-bar chart, a flow with two decisions and a six-question FAQ, lint 0/0 on the first write, previewed, published, landed on `main`, built — "Baked for 4m 52s". **V2: 38.5 s, 2.6 MB** — `theme › set technical › phosphor`, the shelf described, then the same post in all six looks (`looks.sh` + `build-look.ts`: each look built from the site's `main` into a scratch copy, the fold and one screen). `tapes/shell.zsh` carries the two staged parts of every take: `bunx` routed to the tree's binary (npm has 0.1.3), and the permissions a person grants by clicking *allow* once, written after `init` and kept out of the tree by `.git/info/exclude`. **V4: see the row below.** `scroll.ts` gains `--max` | (1) **Take 2 committed `.claude/settings.json` into the site** — untracked, the CMS's clean-tree check refused to branch, and the agent committed it to get past; hence `info/exclude`. (2) **vhs dropped a keystroke** in take 2 ("twi" for "twin") at 35 ms; 40 ms since. (3) **After a landing the checkout stays on `snypd/drafts`**, so the agent's `snypd build` there is a preview build and it says so — correct, and worth one sentence in `theme › set`'s reply. (4) **The rate window held**: three sessions, 14 minutes of model time, no banner |
| **R4 · V4, and decision 179** | 16 Sep 2026 | **V4 take 1 timed out at 600 s and found a defect**: the agent ran `snypd new theme slate` in a shell (committed on `snypd/drafts`, the checkout), wrote the stylesheet and committed it with git, passed `check theme`, and `theme › set slate` landed `snypd.yaml` on `main` — where `themes/slate/` did not exist, so `main` could not build, and the agent spent its remaining minutes cherry-picking. **Decision 179** (docs/11): a theme in the site's own `themes/` lands with the config that names it — `theme › set` adds the theme directory's tracked files to the commit and the landing. `mcp.test.ts` "S24" reproduces the by-hand path (scaffold, edit, `git commit` on drafts, switch) and asserts the edit is on `main`; it fails without the fix. Binary recompiled; V4 retaken | **V4 take 2: 208 s of an 11m 27s session folded to 64.8 s, 4.6 MB** — scaffold, `theme.yaml` with 14 tokens and two looks (`night`, and a `day` the agent added so the checker could judge both sides), a full stylesheet over `base`'s markup, `check theme slate` 14 ✅ 1 — (no webfont, unchecked), the site switched — by editing `snypd.yaml` directly this time, so decision 179's path was not the one exercised on camera; the test is. The browser half is `slate › night` scrolled, then `day`'s fold. **The weekly-usage line.** All three takes carry Claude Code's *"You've used 82 % of your weekly limit · resets Sep 21"* above the prompt for 1–3 s while it is typed — the account's state, and it will be on every take until the 21st. `mask.py` paints the rows that carry it, in that band, in those seconds, the terminal's own background; the raw takes sit beside the masked clips in `.scratch/readme-video/` and the README's pictures note says it was done. The alternative was a retake on the 21st; Sunny can still ask for that. The V4 wait is 1200 s: a theme that passes the rules is a ten-minute job for the model, and the fold makes it a minute of clip. **Clips:** `v1.mp4` 50.7 s · 3.4 MB, `v2.mp4` 38.5 s · 2.5 MB, `v4.mp4` 64.8 s · 4.6 MB |
