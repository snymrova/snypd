# 24 — The terminal look: snypd.rocks in the window the agent lives in

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 18 Sep 2026
**Asked for:** *"so the theme is exactly like the studio one, i was thinking to create a new theme specially for our cms snypd"* — and then: *"go with the terminal look, write the brief."*
**Scope:** a design brief for the site's own theme, in the shape of [docs/17](17-the-studio-look.md): what the look is made of, each device mapped to a surface the renderer already owns with its tier, the files, the front page band by band against the copy that is already written ([docs/23 §2](23-the-launch-look.md), rewritten 18 Sep), what the agent's side must not pay for, one session, and the calls. **It decides nothing; §9 asks for six.**
**Constraint, stated first:** the copy stays. The home page was audited and rewritten this morning (the pitch once, "agent" not "harness", the ask last, `og.png`, four defects closed); this brief changes what the words wear, not the words. A theme that needs the author to write a different `home.md` has failed docs/18 §3 before it starts.
**What this is not:** a fifth bundled theme (§9 · 1 says when it becomes one), a CRT pastiche — no scanlines, no glow, no green-on-black, which is `technical`'s `phosphor` already and a costume — a change to any content type, or the film. The reel waits on this the way it waited on the studio look (docs/17's outcome), and R6 re-shoots after.

---

## 1. The stake

The current front page is the studio look wearing snypd's words. It is a good page; it is also, band for band, an agency site — the reference was phenomenonstudio.com and it shows. A visitor from Product Hunt reads *design studio* in the first second and *CMS* only on the second line. The claim the whole product makes is one sentence: **the CMS is wherever your agent is.** The place the agent is, for every user this launch is for, is a terminal with Claude Code, Cursor or Codex open in it. A front page that *is* that window proves the claim without the sentence, and the film (R5, [docs/15](15-readme.md)) is already footage of that window — so the site and the film stop being two looks.

The second stake is the 0 KB reading again (docs/17 §1): a terminal look is the one genre where zero JavaScript is not a constraint to hide but the point. Every landing page in this genre ships a typewriter script and a cursor-blink script; this one ships neither and does both.

---

## 2. The reference, measured

Two references, one of them in the repo.

**The poster frame** — `sites/snypd.rocks/content/media/front-door-poster.png`, 1440 × 900, Claude Code v2.1.273 on the `field-notes` scaffold. What is on it, in order of how much of the feel each carries:

1. **One face, mono, one size.** Everything is the terminal's font at one size; hierarchy is weight, colour and position, never size. The name is bold; the version, the model line and the path are muted; the prompt is the text colour.
2. **A near-black ground with warm greys**, `#1b1b1b` against off-white text; one accent (the mascot's coral, the input caret's amber) and one status colour (the `auto mode on` yellow-green).
3. **The prompt line** — `❯` then the words, a block caret after them — sits at the bottom of the window with a hairline above and below. It is the one element a reader recognises as *type here*.
4. **A status line** under it: `⏵⏵ auto mode on (shift+tab to cycle)` left, `● high · /effort` right. Small, muted, two-sided.
5. **Empty space.** Four fifths of the frame is the ground. The genre is a big window with a little text.

**The genre outside the repo** — the landing pages of the terminals and agent CLIs this audience uses (Warp, Ghostty, the Claude Code page itself): a dark mono hero inside a drawn window frame with the three dots, a typed command that runs, a light section for the numbers, and the same three defects every time — a 40–120 KB script for the typing, a webfont at 80 KB for the mono, and `prefers-reduced-motion` ignored. Not measured to the byte here, because the reference that matters is the one in the poster; the genre is what the visitor will compare against.

**What the studio look has that this keeps:** the `sections` seam (a `##` is a band), `LayoutProps.lists` (decision 200), the ledger part, the one-edge grid (decision 188), the count-up on stats, the motion control, `cover.media` behind the hero. **What it drops:** the dark/light alternation, Bricolage, the pill buttons, the cards with covers, the blurred sticky masthead, the marquee, the numbered eyebrows.

---

## 3. The devices, one by one

Tier letters are docs/14 §3's, as `check.ts` enforces them: **A** Baseline, use anywhere · **B** two engines, under `@supports`, never load-bearing · **C** one engine, only where the fallback is *nothing happens*.

| Device | What the genre does | The CSS-only equivalent | Tier | Surface | Note |
|---|---|---|---|---|---|
| **One mono face** | Ships JetBrains Mono or Geist Mono, 60–120 KB | `font.mono` is the system stack (`technical`'s, already metric-tested on every OS); `font.heading`, `font.ui` and `font.display` all point at it. Font budget 0 KB, `font.budget` passes by construction | A | `theme.yaml` tokens | **Measure before spending.** If the gallery still at 1280 shows the fallback seam — a Menlo on macOS against a Consolas on Windows is a different page — vendor one face at one weight with `scripts/vendor-font.sh console`. A single-weight Latin subset of an OFL mono is ≈ 18–24 KB (decision 118's lane is 40). Two weights is the ceiling; a variable axis is not |
| **The window frame** | A `<div>` with three coloured dots and a title, drawn by the page | The hero band is the window: `.snypd-hero::before` draws the title bar (three dots in `--color-border`, the path in the eyebrow's slot) from the tokens; the band has a hairline ring and `--radius`. The masthead above it is the *OS* bar: name · tagline · `src`, `technical`'s header as it is | A | `theme.css`, `technical/parts/header.tsx` inherited | The frame is decoration and carries no text a reader loses; it is `::before`/`::after` so the `.md` twin and axe never see it |
| **The prompt line** | The headline typed by a script, a cursor blinking by a script | The page's `title` set in mono at `size.display`, preceded by `❯` in the accent as a `::before`; after it a block caret `▍` as `::after` in the accent, blinking on one `@keyframes` (`steps(2)`, 1.1 s), `animation: none` under reduced motion and when the motion control is ticked | A | `theme.css` on `.snypd-hero h1` | The caret is a pseudo-element with `content`, so it is not in the accessibility tree and not in the twin. Blink stops after the count the genre's own terminals use — never; here `animation-iteration-count: 12` so a reader who stays gets stillness |
| **The typed subtitle** | A typewriter script on the second line | `clip-path: inset(0 100% 0 0)` → `inset(0)` in `steps(n)` over 1.2 s, once, on `.snypd-hero .snypd-subtitle` only. No layout changes hands (`clip-path` paints, does not lay out), so `cls` stays 0; text is never below full opacity, so axe's load pass reads it; under reduced motion, none | A | `theme.css` | The one motion device this theme adds. Not on prose, not on bands, not on the ledger (docs/17's rule: cards, stats, steps, never prose — the subtitle is the hero's one line and the exception is stated here) |
| **The clip in the window** | A video of the terminal playing behind or inside the frame | `cover.media` with `poster` and `autoplay=true` (decision 184, rule 15): the front-door session re-cut to the four typed lines, ≤ 8 s, looping, ≤ 1 MB, sitting *inside* the window frame under the prompt line rather than behind it — the studio's scrim is not needed because no text is over the picture | A | `home.md` gains three attributes on the cover; `base`'s shell already swaps the still under reduced motion and the control | The current `front-door.mp4` is 3.4 MB and 50 s: the *figure* in band 02 keeps it (click-to-play, poster). The hero loop is a second file, Sunny's cut (§7 · 3), on `media.snypd.rocks` per docs/23 §6.2 |
| **A light section for the numbers** | One white band for stats | No. One scheme, `color.scheme: dark` committed, the way `phosphor` commits. The numbers band is a hairline-ruled table on the same ground; the stat values in the accent at `size.h1`, mono, `tabular-nums`. The count-up (`--n`, tier B) stays as the studio wrote it | A | `theme.yaml`, `theme.css` | A light variation is a token set, not a session (§9 · 4). The contrast gate reads both sides of every `light-dark()` regardless, so the pairs are still written |
| **Sections as turns** | — | Every `##` band is a *turn*: the heading is set as a prompt — `❯ The numbers` — in the text colour, weight 700, at `size.h2`; no `01`, `02` eyebrows (the counter is `none` on this theme). The body under it is the *output*: prose at the measure, blocks at `wide`. A hairline separates turns, the way the poster's input line is ruled | A | `theme.css` over the studio's `sections` seam — the seam is the renderer's (docs/17), not the studio's | Same markup as today: `<section class="snypd-band"><h2>` |
| **The ledger as a log** | — | The rows as `git log --oneline` reads: the mark (`S29 · R4`, `v0.1.4`) in the accent like a short hash, the title, the description muted on the next line, the date right-aligned in the small size, and the kind as a bracketed word `[shipped]` coloured by term — `shipped` in `viz.5` (green), `refused` in `viz.1`, `decided` in `viz.2`, `measured` in `viz.3` — via a `data-kind` the ledger part sets from the term's slug | A | `parts/ledger.tsx` (the site's, moved), `theme.css` | The colours are the six series the viz palette already declares, so `contrast.*` covers them and no new token exists. A kind with no colour is muted |
| **Posts as a listing** | — | The studio's cards go. Posts are the same rows as the ledger with the category where the mark is: `ls -l` for a blog. Six rows are two screens shorter than six cards at 390 | A | `parts/entries.tsx` — the ledger part registered as `entries` too, so `/posts/`, a term page and an author page read the same | A post with a `cover.image` shows it on its own page, never in the list; this theme has no picture in a list |
| **The status line** | — | The footer opens with one two-sided line in the small size: left `built in public · MIT`, right `0 KB JS · 18 rules` — the `footerNote` setting on the left, a `statusNote` setting on the right (§4). Under it the footer menu as a plain listing, then the name set large in mono, the one brand moment kept from the studio | A | `parts/footer.tsx` (own) | Nothing in it is computed at build; both notes are settings, so the numbers are the site's claim and the bench page is where they are proven |
| **The masthead** | Sticky, blurred | `technical`'s title bar as it is: not sticky, not blurred, `name · tagline · src`. A terminal has no chrome that follows you | A | inherited | The genre's sticky bar is the one device this brief refuses on taste rather than cost |
| **Buttons** | Pills, gradients | A `cta` button is a bracketed command: `[ Install from npm ]` — square, one hairline, the accent on hover, mono, `--radius: 4px`. The arrow goes | A | `theme.css` | |
| **Scanlines, glow, phosphor, ASCII art** | Some do | **Refused up front.** Text-shadow glow reads as blur at 390; scanlines are an overlay that axe cannot see and a reader can; green-on-black is `phosphor`. The look is the poster's: warm near-black, off-white, one coral, one amber, a lot of room | — | — | Stated so the session does not spend an hour on them the way S29 spent one on the blend |

---

## 4. The theme — `sites/snypd.rocks/themes/console/`

Site-local, the way `public` is (decision 179's rule: a site-local theme lands with the config that names it); it replaces `public`, which is deleted in the same session. Named for what it is, not for the launch.

```
theme.yaml          extends: technical · css: ./theme.css · color.scheme: dark · font: none
                    layouts: [post, page, index, term, author, home, release, log, log-index]   (arrays replace — restate)
                    parts: { ledger, entries: ./parts/ledger.tsx, footer }   (header and toc are technical's)
                    settings: technical's eight + statusNote (text, Footer) + caret (boolean, Front page, default on)
theme.css           one sheet, in this order: tokens' use · the window (hero) · turns (bands) · the prompt and caret ·
                    the typed subtitle · the ledger rows and their kinds · the status line · the button · @supports (count-up)
layouts/home.tsx    the transcript: the window, then every `##` as a turn, then the lists as rows, then the closing
                    turn (the cta) last — the ordering the site's home already does
layouts/log.tsx     a session entry: the mark as the prompt, the facts strip as a status line, technical's toc
layouts/release.tsx the version as the prompt, `breaking` bracketed in viz.1, prev/next as two rows
layouts/log-index.tsx  the rows, headed by one prompt line
parts/ledger.tsx    the site's ledger with `data-kind` and the date moved right; registered as `entries` too
parts/footer.tsx    the status line, the listing, the name
```

What is inherited and why: `technical` because its bones are already mono — the header with `tagline` and `src`, the contents list on a post, tables and code that take the width they need, the wide measure (44 rem) that a log entry with a facts strip wants. `base` alone would mean rewriting a header and a toc to arrive where `technical` starts. What `technical` has that is overridden: its blue accent, its `light dark` scheme, its `h1`–`h3` sizes (mono headings on a front page want the display size back), and its `index` for `/posts/` (rows, not `base`'s list).

**Tokens, the ones that differ from `technical`:**

| Token | Value | Why |
|---|---|---|
| `color.scheme` | `dark` | the terminal is dark; the film is dark; the reader's preference is honoured by the light variation, later |
| `color.bg` | `light-dark(#f4f1ec, #141312)` | the poster's warm near-black, one step darker than the studio's `#101010` so the window frame's `#1b1b1b` reads as *raised* |
| `color.surface` | `light-dark(#ebe7e0, #1b1b1b)` | the window's ground, from the poster |
| `color.text` | `light-dark(#1a1917, #ece8e1)` | off-white, warm |
| `color.muted` | `light-dark(#6a655d, #9a948a)` | the version line's grey |
| `color.accent` | `light-dark(#b8410f, #ff8a4c)` | snypd's orange, unchanged from the studio and the `og.png` |
| `color.viz.3` | `light-dark(#8a6d00, #e0b84a)` | the caret's amber, also *measured* |
| `color.viz.5` | `light-dark(#3f6b3a, #9bcf8f)` | the status line's green, also *shipped* |
| `font.heading`, `font.ui`, `font.display` | `var(--font-mono)` | one face |
| `size.display` | `clamp(2rem, 1rem + 4.2vw, 4.5rem)` | mono sets wide: the studio's 6.75 rem headline is four lines of 12 ch at 1440; 4.5 rem is three |
| `leading.tight` | `1.1` | between the studio's 1.0 and technical's 1.25; mono at display size wraps and must not touch |
| `measure` | `44rem` | technical's; kept |
| `radius` | `4px` | a terminal's corners |

`font:` is absent, so `font.budget` reports 0 and `font.fallback` is not checked — the same as `technical` today. The eighteen rules run unchanged: `snypd check theme console --root=sites/snypd.rocks`.

---

## 5. The front page, turn by turn — against the copy as written

`home.md` as rewritten on 18 Sep, unchanged except for three attributes on the cover. What each band becomes:

| Band | Today (studio) | Console | Content change |
|---|---|---|---|
| Hero | dark band, eyebrow, 100 px headline, subtitle, "In short" | the window: title bar `~/field-notes — claude`, the eyebrow as the first muted line, the headline as the prompt with the caret, the subtitle typed once, the clip in the window's body under it, "In short" as the first output block | `cover` gains `media="…/front-door-loop.mp4" poster="/media/front-door-poster.png" autoplay=true` |
| 01 The numbers | light band, three big stats, a paragraph | a turn: `❯ The numbers`; the three values in the accent on a hairline table; the paragraph as output | none |
| 02 The front door | dark band, the wide figure, a paragraph | a turn; the 50 s figure stays click-to-play with its poster and caption (it is the long take; the hero holds the loop) | none |
| 03 Refused | light band, three bullets | a turn; the bullets stay plain — the *kind* colour is the ledger's, not the prose's, so a band never has to know which term it is about | none |
| Log · Changelog · Posts | rows, then cards | rows, rows, rows; kinds bracketed and coloured; "Log archive" links stay | none |
| 04 Try it | light band, the cta card, a pill | a turn; the cta as the last prompt, the button bracketed | none |
| Footer | wordmark huge, note | the status line, the listing, the name | `statusNote` set in `snypd.yaml` |

The page's outline, headings and the `.md` twin are byte-identical before and after, which is the test: `diff <(snypd build … public) <(snypd build … console)` over `index.md` is empty.

---

## 6. The agent's side — what this must not cost

docs/18 §3's three rules, applied:

1. **No new required attribute.** The spec does not grow. The three cover attributes are the ones rule 15 already knows. `statusNote` and `caret` are settings, which is the theme's side of the line.
2. **Right by context.** The prompt glyph, the caret, the bracketed kinds, the window frame, the coloured terms — every one is the theme reading what the renderer already hands it (`sections`, `lists`, `Entry.terms`). An agent writes the same `home.md` for `console` as for `studio` and gets the terminal.
3. **A mistake is a sentence.** Nothing new to lint; rules 15, 17 and 18 cover the front page. The one new failure mode — a hero loop over a megabyte — is `page.media.kb`'s row, report-only today; §8 · 203 proposes the budget.

And the cheapest token saver: `snypd://spec/home`'s recipe already says *a site with a showreel adds `media`, `poster`, `autoplay`*. The worked example stays Ferrule; this site's `home.md` is the second example, linked from the recipe by URL, not copied into it.

---

## 7. The work — S32, one session, in order of value

| Step | Unit | What | Waits on |
|---|---|---|---|
| 1 | **S32 · T1** | `themes/console/`: `theme.yaml`, tokens, `theme.css` in §4's order, the ledger with `data-kind`, the footer. `check theme console` 18/18. Half the value; a morning | — |
| 2 | **S32 · T2** | the five layouts (§4); `snypd.yaml` moves to `use: console`, `statusNote` set; `public` deleted; the page suite over `/`, `/log/`, one entry, `/changelog/`, one release, `/kind/refused/`, one post at 1280 and 390 — js 0, font 0, axe 0, cls 0 | 1 |
| 3 | — | the hero loop: the front-door session's first eight seconds, ≤ 1 MB, on `media.snypd.rocks` (docs/23 §6.2); until it lands the cover has `poster` and no `media`, and the window shows the still | Sunny |
| 4 | **S32 · T3** | `og.png` redrawn as the window (same words; the card is the hero at 1200 × 630); the themes page's *"the look this site is wearing"* line rewritten; a `console-1280.png` still for the README's gallery row | 2 |
| 5 | **S32 · T4** | the scrolled pass and the stills at 390, 560, 820, 1280, 1440 — docs/18's five widths — with the caret on, off, and under reduced motion; findings closed the same day or listed in §10 | 2 |
| 6 | **R6** | the hero film re-shot on the console site (docs/15's two fixes carried) | 3, 5, 0.1.5 published |

Cost: T1 + T2 one session; T3 + T4 a half. Nothing here moves the launch date; the site switches to `console` when it switches to the released CLI, the same push docs/23 §7 · 5 already plans.

**If a session cannot be found:** T1 alone, with `public`'s layouts left extending it, is the look at 80 %: the window, the prompt, the rows. The layouts are polish; the sheet is the theme.

---

## 8. Decisions proposed

- **202 — the site's theme is its own, and it extends `technical`.** snypd.rocks wears `console`, site-local, over `technical`'s mono bones; `public` (decision 200's first reader) is retired. A bundled fifth theme waits for a second site that wants it (§9 · 1).
- **203 — a hero loop has a budget.** `cover.media` with `autoplay=true` on a `home: true` page is held to 1 MB and 10 s; `page.media.kb` gains a gated row for the front page's autoplay only, at the bound docs/23 §2 already states in prose. Report-only for one measurement, then gated (docs/07's rule).
- **204 — one motion device on prose, named.** The typed subtitle is the one place this repo animates text, under `clip-path`, once, ≤ 1.2 s, hero only, off under reduced motion and the control. docs/17's *never prose* rule stands with this exception written down, so the next theme does not argue it again.
- **205 — a term colours its row.** A list part may set `data-kind="<term slug>"` on a row and a theme may colour by it from the six series tokens and nothing else. No new token, no per-term config; a kind the theme has no colour for is muted.

---

## 9. Calls

1. **Site-local, not bundled** (§4) — *recommended: site-local now.* A bundled theme touches the shelf, the gallery, `bundled.ts`, the README's counts and three docs; a site-local one touches the site. It becomes the fifth bundled theme when a second site asks for it, and `snypd new theme --extends=technical` is already the path for anyone who wants it before then.
2. **Extends `technical`, not `base` or `studio`** (§4) — *recommended: technical.* The header, the toc, the tables and the measure are the terminal's already; from `studio` every device would be an override.
3. **System mono first, a vendored face only if the stills say so** (§3 · 1) — *recommended: system first.* 0 KB is the honest number and the genre's fault is the 80 KB mono. The gallery still at 1280 on macOS and Windows fallbacks decides; if a face is vendored, one weight, under 24 KB.
4. **Dark committed at launch, a light variation later** (§3 · 6) — *recommended: dark.* The terminal, the film and the `og.png` are dark; a `paper` variation is a token set an afternoon after launch, and `check theme` reads both sides of every pair from day one.
5. **The hero loop from the front-door session** (§3 · 5, §7 · 3) — *recommended: yes, Sunny's cut.* Eight seconds of the four lines being typed, looping, under a megabyte. Until it exists the window shows the poster, which is already the right frame.
6. **The caret and the typed line as settings, on by default** (§4) — *recommended: yes.* `caret: false` gives a site the look without the two motions; the control and reduced motion already stop them for a reader.

---

## 10. Outcome — S32, built 18 Sep 2026, the same day as the brief

Sunny's answer to §9 was *"go with your recommendations, build the theme"*, so the six calls are taken as recommended and decisions 202–205 are recorded in docs/11 §8.

**Shipped from §7.** T1 and T2 in one sitting: `sites/snypd.rocks/themes/console/` — `theme.yaml` over `technical` with §4's tokens (short form for the ones that differ, `size.display` declared in full), ten settings (technical's eight restated, because settings replace up the chain like layouts, plus `statusNote`, `tldrLabel`, `caret`), one sheet in §4's order, the ledger part registered as `entries` too with `data-kind` from the term's slug, the status-line footer, and the five layouts — `home` as the transcript with the `cta` drawn after the lists, `log` with the facts as a status strip and technical's contents list, `release` with the version as its prompt, `log-index`. `snypd.yaml` moved to `use: console` with `tagline`, `repo`, `statusNote`; `public` deleted. T3: `og.png` redrawn as the window; the themes page names `console` under `technical`. The header menu loses GitHub — the masthead's `src` is the same link and the footer has it.

**Held to.** `check theme console` passes (16 rules; `font.budget` and `font.fallback` are not checked when no theme in the chain declares a font, which is the honest reading of 0 KB). The page suite over eight routes × 1280/390: js 0, font 0, axe 0 across sixteen pairs and 0 scrolled, cls 0, `page.bytes.kb` 121 worst, `page.media.kb` 73 (the poster). 483 tests, 0 fail; typecheck clean.

**What the day changed in the brief.** §5 promised the copy byte-identical, and it was, until Sunny looked at the built page: *"the home page has too much text."* In mono the same words read twice as heavy — a paragraph the studio's sans carried at 40 rem is a slab at 44 rem in a face where every glyph is the same width. So the front page took the transcript shape the recipe already describes and §5's table did not enforce: one block and one line per turn, three refusals of one sentence each, and the front page's rows as `--oneline` — mark, title, date, kind; the description waits on the archive and the entry. Rule for the next look: a mono theme's front page is measured in lines, not words, and the copy is written to it, not before it.

**Refused, by the sheet rather than the gate.** The two-space indent under the prompt, which read as a stray on the subtitle; the studio's counter, which a transcript has no use for; and the sticky masthead, on taste (§3's last row).

**Owed.** The hero loop under a megabyte (§7 · 3, decision 203) — the window holds the poster until then, and the `cover` gains `media`, `poster`, `autoplay` when it lands. A light variation, `paper`, as a token set. T4's five-width pass with the caret on, off and under reduced motion: done at 1440 and 390 only. The `console-1280.png` still for the README. The post-launch eyebrow. And the film, R6, which now has a site that looks like its own footage.
