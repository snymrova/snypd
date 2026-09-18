# 25 — The product look: snypd.rocks as a light page with one big sentence

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 18 Sep 2026
**Asked for:** *"the site is ugly.. we have to treat this as greenfield and rethink what we are doing"* — then two references, [glyph-co.framer.website](https://glyph-co.framer.website/) and [conceptzilla.com](https://www.conceptzilla.com/), then *"as you recommended."*
**What was recommended, and is now the brief:** mockup B, the Conceptzilla shape — light, one grotesk headline in sentence case, hairline-ruled sections with the heading left and the content right, one dark button — built as a snypd theme under snypd's budgets, worn by the whole site, with the theme system growing what the shape needs rather than the front page leaving the renderer.
**How this brief differs from docs/17 and docs/24:** the look was chosen by eye before a line of it was written. Two standalone mockups of the front page, no renderer, no constraints, were photographed at 1440 and 390 and Sunny picked one ([`docs/mock/25-home-b.html`](mock/25-home-b.html), captures beside it; A, the Glyph shape, kept as [`25-home-a.html`](mock/25-home-a.html) for the record). This brief maps that page onto the renderer. Where the renderer cannot make the mockup, §4 says what grows; where the mockup should bend to the renderer, §3 says so and why. Nothing here is a taste decision that has not already been made on a picture.

---

## 1. The stake

Three looks in three days — studio, then console, then this — and the two before were approved in prose and disliked on sight. The lesson is not about either look. It is that a brief cannot show a page, and a theme is a page. So the process changes first (§8 · 209): no theme is written before a standalone mockup of its front page has been looked at, and the brief is written *from* the mockup.

The look itself: the CMS field's home pages (TinaCMS, Sanity, Payload, Decap, Keystatic, Strapi, read 18 Sep for S33) are light or light-first, sans, one big sentence, the install command in the hero, and a lot of air. Mockup B is that, with the discipline of the two references: one type family, one hairline between sections, the heading in a left column and the content in a right one, and no boxes inside boxes — the fault docs/24's console page had at every band. It reads as a product in ten seconds, which is what a Product Hunt visitor gives it.

The second stake is that the site stays the proof. A hand-built front page would end *every page on this site was written through snypd's own MCP server*, and that sentence is worth more than any look. So the shape is a theme, the copy is a `home: true` page with `##` bands, and the two devices the renderer does not have — a heading beside its content, a button in the hero — are added to the theme system (§4), where the next site gets them too.

---

## 2. The reference, measured

Both references, then the mockup as built, because the mockup is the reference from here on.

**Conceptzilla** (1440 and 390, 18 Sep): ground `#f9f9f9`, text `#121214`, muted `#919191`, hairline `#e7e7e7`; one sans (Inter-class, medium weight) at ≈ 90 px for the headline in sentence case, tight tracking, three lines in a 1166 px container with 137 px margins; a dark rounded button (`#212121`, 8 px radius) under it; then a two-column split — empty left, a paragraph and a product picture right; every section ruled with a hairline, heading on the left at ≈ 40 px, content on the right; product imagery in rounded cards; a dark closing band. Content fades in on scroll by script, which a full-page capture shows as a mostly blank page: the one thing here to refuse.

**Glyph Co.**: `#050505` and `#fcfcfc`, Clash Grotesk at 250 px in caps edge to edge, 12 px tracked labels at the hero's corners, one hairline, one photograph, three bordered cards, long black gaps. Loved for its nerve; not chosen because it is a poster, and the site has a log, a changelog and posts that need a page under them.

**Mockup B, as built** ([`25-home-b.html`](mock/25-home-b.html)): what §3 and §4 hold the theme to.

| | Value |
|---|---|
| Ground · text · muted · hairline · dark band | `#f9f9f9` · `#121214` · `#6f6f73` · `#e2e2e4` · `#121214` |
| Container | 1166 px centred, 24 px gutter; at 1440 the margins are 137 px |
| Headline | Inter Tight 500, `clamp(44px, 6.6vw, 96px)`, line 1.02, tracking −0.035em, measure 14ch — three lines at 1440, three at 390 |
| Body | Inter 400/500 at 17 px, line 1.5 |
| Section heading | Inter Tight 500, `clamp(28px, 3vw, 40px)`, line 1.1, tracking −0.025em, 14ch |
| Number | `clamp(36px, 4.4vw, 64px)`, tracking −0.035em; label 15 px muted under it |
| Button | `#121214` on white, 8 px radius, 14 × 20 px padding, 17 px medium; the outlined variant is the header's last item |
| Sections | hairline above, 96 px padding, two equal columns with a 40 px gap; at ≤ 760 px one column |
| Lists | rows ruled above and below, title medium + a small muted line, the date right |
| Steps | `01`–`04` in mono, muted, 40 px column |
| Still | 16 px radius, dark, 16:10, the four lines over it bottom-left in mono |
| Close | the dark band: heading and one line left, the four lines and a white button right |
| Fonts as loaded | Inter Tight 500 + Inter 400/500 + JetBrains Mono 400 from Google Fonts — the one thing the theme does not copy (§3, *One face*) |

---

## 3. The devices, one by one

Tier letters are docs/14 §3's, as `check.ts` enforces them: **A** Baseline · **B** two engines under `@supports`, never load-bearing · **C** one engine, only where the fallback is *nothing happens*.

| Device | The mockup | The theme | Tier | Surface | Note |
|---|---|---|---|---|---|
| **One face** | Three families, four files, ≈ 90 KB | **One file: Inter, weight 500, Latin subset**, for the headline, the section headings, the numbers and the buttons — everything that is *set* rather than *read*. Body and lists in the system sans stack (`base`'s), mono in the system mono stack (`technical`'s). Inter Tight is Inter with tighter spacing; `letter-spacing: -0.035em` on Inter 500 is the same picture at display size and one file fewer. Budget ≈ 22 KB against the 40 lane (decision 118) | A | `theme.yaml` `font:`, `scripts/vendor-font.sh folio` | The same rule docs/24 wrote and docs/17 followed: measure before spending. If the gallery still at 1280 shows the body seam — Inter headline over Segoe body on Windows is a different page from Inter over SF — the second file is Inter 400 at ≈ 20 KB, and the lane is asked to move to 48 (§7 · 2). Not before it is seen |
| **The ground** | Light, committed | `color.scheme: light`, committed the way `console` committed dark. A dark variation is a token set later, not this session | A | tokens | The contrast gate still reads both halves of every `light-dark()`, so the pairs are written |
| **The container** | 1166 px, 24 px gutters | `--measure-wide: 1166px`; the page grid `base` already draws with `wide` and `full` tracks; `.snypd-band` content in `wide` | A | `theme.css` | No new grid |
| **The hero** | h1, a button, then lower a right-column paragraph and the still | The `cover`'s `title` as the h1 (14ch); **the button from two settings**, `heroLabel` and `heroHref` (§4.1); the `subtitle` is not used — the paragraph that follows is prose in the lead, drawn in the right column. Then the lead's code block (the four lines) and its `figure` (the still) in the same column | A | `layouts/home.tsx` (own), `theme.css` | The mockup lays the four lines *over* the still. Refused: an overlay is decoration that hides a real caption; the code block sits above the still, both in the right column, and the still keeps its caption |
| **Heading beside content** | Every section: h2 left, body right | The `sections` seam (`##` → `<section class="snypd-band"><h2>`) with one grid rule: `h2` in column 1, everything else in column 2. **No markup change**; the seam the studio and console looks already stand on | A | `theme.css` | At ≤ 760 px one column, heading first — the mockup's own fold |
| **The numbers** | Three big values, labels under, a line and a link | `stat-row` as it is, values in the display face at the number size, labels 15 px muted; the count-up (`--n`, tier B) stays under `@supports` as the studio wrote it | A | `theme.css` | |
| **The four lines as steps** | `01`–`04`, title + line, ruled | `steps` as it is; the counter in mono in a 40 px column, rows ruled | A | `theme.css` | The Start page's own `steps` block is the same markup, so it inherits the look for free |
| **The lists** | Rows: title, small line, date right | The `ledger` part from `console` (S32), registered as `entries` too, restyled: no `[kind]` bracket, the kind as the small line's first word | A | `parts/ledger.tsx` (moved), `theme.css` | `data-kind` stays on the row (decision 205); this sheet colours nothing by it |
| **The still** | 16 px radius, dark, text over it | `figure` with `poster`, click-to-play (decision 181); the radius and the dark ground on the figure | A | `theme.css` | The hero loop (decision 203) still waits on a cut under a megabyte |
| **The close** | A dark band: heading + line left, code + white button right | The last `##` section drawn after the lists (the console layout already does this — `.snypd-home-close`), given `data-tone="dark"` and the two-column rule; its `cta` button inverted | A | `layouts/home.tsx`, `theme.css` | The studio's tone attribute, reused, not the studio's alternation |
| **The masthead** | Name left, four links, an outlined GitHub | `base`'s header as it is (name, the popover menu); the sheet lays the menu inline from 760 px up and draws the **last** menu item as the outlined button | A | inherited, `theme.css` | Which item is last is the menu file's business; today it is GitHub, restored to `header.yaml` |
| **The footer** | One dark line: colophon, links, the status | `console`'s status-line footer, moved and recoloured | A | `parts/footer.tsx` (moved) | The big wordmark goes; the reference has none |
| **Fade-in on scroll** | Conceptzilla does | **Refused.** A page that is blank until scripted is the opposite of the claim; the count-up on the numbers is the one motion, and it is CSS | — | — | |
| **The still's overlay, the caps, the corner labels** | A has them | Not this look. Recorded so the next session does not argue them back in | — | — | |

---

## 4. What a theme cannot do alone

Two things. Both are theme-system growth that the next site inherits, neither is a spec change.

### 4.1 A button in the hero — two settings, not a cover attribute

The mockup's hero is a sentence and a button. The `cover` primitive has `eyebrow`, `title`, `subtitle`, `image`, `media`; a `button` and `href` on it would be a spec minor version for one theme's want, and the locked fourteen (docs/13) stay locked. The studio already solved this shape for the case page's close: `caseCtaTitle` and `caseCtaHref` are theme settings the layout reads. The same here: `heroLabel` (text, group *Front page*, default *Start*) and `heroHref` (text, default `/start/`); the home layout draws `<a class="snypd-button">` under the h1 when both are set, nothing when either is empty. A site with no Start page sets `heroHref` to its docs. Decision 208.

### 4.2 The theme itself — `sites/snypd.rocks/themes/folio/`, over `base`

Site-local, the way `console` was (decision 202's rule), replacing it: `console` is deleted in the same session, its four layouts and two parts carried over with the window markup removed. Over `base`, not `studio` or `technical`: the mono bones were `technical`'s reason and the bands were `studio`'s, and this look wants neither — it wants `base`'s plain header, popover menu and page grid, and a sheet. `studio`'s font would ride the chain if this extended it (the first theme in the chain that declares `font:` ships), which is the other reason.

```
theme.yaml          extends: base · css: ./theme.css · color.scheme: light · font: Inter 500 latin, kb ≤ 24
                    layouts: [post, page, index, term, author, home, release, log, log-index]   (arrays replace)
                    parts: { ledger, entries: ./parts/ledger.tsx, footer }
                    settings: base's + heroLabel, heroHref, footerNote, statusNote, tldrLabel, dateFormat, showDates
theme.css           tokens' use · the container · the masthead · the hero · bands (heading beside content) ·
                    numbers · steps · lists · figure · the close · the footer · @supports (count-up) · ≤ 760 px
layouts/home.tsx    cover title + the settings button; the lead in the right column; every `##` a two-column band;
                    the lists as rows; the last `##` as the dark close
layouts/log.tsx · release.tsx · log-index.tsx · post/page/index/term/author   from console, window removed; posts and
                    pages wear the same face, measure and rules, so the site is one thing
parts/ledger.tsx · parts/footer.tsx   from console, restyled
fonts/inter-latin.woff2 + OFL.txt     scripts/vendor-font.sh folio
```

Named `folio` — a sheet of paper, a page in a portfolio — for what it is, not for the launch; the name a second site would pick off the shelf if this is promoted to the fifth bundled theme (§7 · 4).

---

## 5. The front page, band by band — the copy is rewritten

docs/24 §5 promised the copy byte-identical and the promise lasted until the page was seen. This time the copy was written *into* the mockup and read there, so it is the copy. `home.md`, in full:

| Band | Content | Drawn as |
|---|---|---|
| Hero | `::cover{title="A CMS with no dashboard. Your agent writes it."}` then two paragraphs — *You know how every CMS assumes a person at a screen, filling in fields? The person at the screen now has Claude Code, Cursor or Codex open, and it can write.* / *snypd is the CMS for that. Markdown in a repo you own; your agent writes it through one MCP server; static HTML comes out, and no JavaScript with it. Launching 6 October 2026.* — then the four lines as a code block, then the front-door `figure` | h1 and the settings button left, full width; the paragraphs, the code and the still in the right column below the fold |
| `## Measured in CI, or not claimed.` | `stat-row` (23 ms · 510 · 0 KB), one line on the sixty rows, the link to `/bench/` | heading left, numbers right |
| `## How things will go. Four lines.` | a `steps` block, four steps, one line each — the Start page's, shortened | heading left, steps right |
| Log · Changelog · Posts | the theme's lists, newest six, as rows | heading left (linked), rows right, *The whole log* under |
| `## The gate says no.` | the three refusals, as now, with *Refused* where a date would be | heading left, rows right |
| `## Four lines. First post.` | one line on GitHub and MIT, the four lines again, `::cta{button="Install from npm" href=npm}` | the dark close |

The page's outline is `h1`, five `h2`s from the author and three from the theme. The description stays: *snypd is a CMS with no dashboard. Claude Code, Cursor or Codex writes; markdown lives in your repo; static HTML comes out, zero JavaScript. Built in public.* The tab reads *snypd.rocks - A CMS with no dashboard. Your agent writes it.* (decision 206). `og.png` is redrawn from the hero: the sentence on the light ground, the button, the name — the fourth redraw in three days, which is the cost of deciding looks late, and the last if §8 · 209 holds.

---

## 6. The agent's side — what this must not cost

Nothing. Every device is CSS over markup the renderer already emits; the two settings are two lines in `snypd.yaml`; the `.md` twin of every page is unchanged; the token count of a page read through the MCP does not move. The one file added to the wire is the font, under the lane. The page suite's rows (`page.js.kb` 0, `page.font.kb` ≤ declared, axe 0, `cls` 0) are the gate, as they were for `console`, and `page.bytes.kb` should come *down*: no poster is fetched above the fold at 1440 because the still sits under it.

---

## 7. The work — S34, one session, in order of value

1. **T1 · the face.** `scripts/vendor-font.sh folio`: Inter, `wght` pinned to 500, Latin, WOFF2, the metric-matched fallback block printed into `theme.yaml`. Measure. Gallery still at 1280 and 390 with the system body under it; the seam decides §3's second file.
2. **T2 · the sheet.** `theme.yaml` tokens and settings; `theme.css` in §4.2's order; the ≤ 760 px fold as the mockup has it.
3. **T3 · the layouts and parts.** `console`'s carried over, the window removed, the hero button and the two-column band added to `home`; `console` deleted; `snypd.yaml` → `use: folio`, `heroLabel`, `heroHref`; `header.yaml` regains GitHub as its last item.
4. **T4 · the copy.** `home.md` as §5; `start.md`'s steps shortened to one line each so the front page and the Start page say the same four things.
5. **T5 · the card and the stills.** `og.png` from the hero; `folio-1280.png` and `-390.png` for the themes page, which names `folio` and retires `console`'s paragraph.
6. **T6 · the gate.** `check theme folio` (18 rules — this one *has* a font, so `font.budget` and `font.fallback` are checked); the page suite over the eight routes; lint; tests; typecheck; captures at 1440 and 390 of `/`, `/start/`, a post, a log entry; the log entry `s34-…`; docs/11 row and decisions; this brief's §10.

Two hours if T1 measures clean; a third if the seam sends it back for Inter 400.

---

## 8. Decisions proposed

**207. The site wears `folio`, light, over `base`; `console` is retired.** One display face at one weight for what is set, the system stacks for what is read; every section a heading beside its content; one hairline between sections; a dark close. The whole site, not the front page.

**208. A hero button is two theme settings.** `heroLabel` and `heroHref`, read by a `home` layout, drawn under the cover's title when both are set. The `cover` primitive does not gain a button: a spec attribute is for every theme's every page, and this is one layout's one place. Precedent: the studio's `caseCtaTitle` / `caseCtaHref`.

**209. A look is chosen on a picture before it is written as a theme.** A standalone mockup of the front page — the hero and at least one band, no renderer, no budgets — photographed at 1440 and 390 and approved on sight, *then* the brief, written from the mockup, saying what the renderer must grow and where the mockup bends. Kept in `docs/mock/` with the brief's number. The two looks before this one were approved in prose and refused on sight; that is the whole reason for the rule.

---

## 9. Calls — taken as recommended unless Sunny says otherwise

1. **The font.** One file, Inter 500, system body (recommended); the second file only if the 1280 still shows the seam. *Alternative:* Inter 400 + 500 from the start, ≈ 45 KB, and the lane moves to 48 now.
2. **The lane.** If the second file is needed, `MAX_FONT_KB` 40 → 48 is a decision (118 amended), not a theme's private choice. Recommended: wait for the measurement.
3. **The overlay.** The four lines above the still, not over it (recommended, §3). *Alternative:* keep the mockup's overlay as the figure's caption positioned over the image — tier A, but a caption a reader cannot select as a caption.
4. **Bundled or site-local.** Site-local now (recommended); promoted to the fifth bundled theme after launch if a second site wants it — the shelf has no product-page look and this is one.
5. **The whole site.** Posts, log, releases and the Start page wear `folio` too (recommended). *Alternative:* the front page only, and the rest stays `console`. Refused in §1: a poster stapled to a manual.
6. **The name.** `folio`.

---

## 10. Outcome

*Written when S34 lands.*
