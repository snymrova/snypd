# 19 — The case study, held to the standard: the studio look's second UI/UX pass, on the page every card leads to

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 17 Sep 2026
**Asked for:** *"audit the case study page next"* — the page after the front page ([docs/18](18-the-front-page.md)), under the same standard and the same constraint.
**Scope:** a post on the studio look, audited on the Ferrule specimen (`examples/studio`, branch `s29-studio-specimen`): *Kiln to table* at 390, 560, 820, 1280 and 1440 px, light and dark, reduced motion, keyboard, axe at the top and one viewport down; *Stem* at 1280 for the blocks *Kiln* does not carry (a diagram, an autoplay figure). The studio theme owns no post layout: this page is `base`'s `layouts/post.tsx` under the studio sheet, so every finding below is either the sheet's or `base`'s default. Nine findings, one of them on every page of the site, and one unit of work that closes them.
**Constraint (docs/18):** every fix is a stylesheet rule, a better default, or a lint line. No fix adds an attribute an agent has to know about.
**What this is not:** a redesign, and not a fourth owned file. The page reads well — the column, the type, the blocks in it are right — and nothing found here needs a `layouts/post.tsx` in the theme.

---

## 1. The standard

The same table as docs/18 §1, applied to a reading page. What it bites here:

| Standard | Rule | Where it bites |
|---|---|---|
| **WCAG 2.2 AA** — 1.3.1 info and relationships | headings nest; a block's title is the parent of the block's headings | the `faq` title and its questions are siblings (§2 · 3) |
| — 1.4.3 / 1.4.11 contrast | 4.5:1 for text, 3:1 for graphics, in every reachable state | none — axe 0 at ten captures and ten scrolled passes |
| — 2.5.8 target size | 24 × 24 px, or spacing | none — nav 31 px, term pills 31 px, inline links exempt |
| **One grid** (docs/17 §3, decision 188) | inside one block, one left edge; a caption starts where its picture starts | a chart's caption 192 px left of the chart (§2 · 2) |
| **Rhythm** (docs/09's tokens) | one gap between neighbours, never two tokens stacked | the post's end and the footer's start (§2 · 6); the `faq` title and its first rule (§2 · 3) |
| **The measure** | a line of display type holds 20–30 characters; never one word | the footer's description at 820 and 1280 (§2 · 1) |
| **A mistake is a sentence** (docs/18 §3) | what the renderer cannot resolve, lint says | a category file that does not parse is silent (§2 · 5) |
| **House rules** (docs/14 §3, decision 161) | tier A anywhere; B and C under `@supports`; zero JS | every fix below is tier A except §2 · 9 |

---

## 2. Findings, traced

Numbered by weight. *Cause* names the file. *Kind* is one of the three the constraint allows. Measurements are at 1280 px, light, unless a width is named.

| # | What a reader sees | Cause | Kind | Fix |
|---|---|---|---|---|
| 1 | **The footer's description is a column of single words.** At 820 the lede is 112 px wide and 565 px tall — twenty lines, one word each — beside three link columns that take the row. At 1280 it is 311 px and seven lines at 38 px; at 1440, 301 px. On every page, the front page included. The footer was checked for its edge at those widths (docs/18 §7), not for its measure. | `theme.css` `.snypd-footer-top { grid-template-columns: minmax(0, 1fr) auto }`, `.snypd-footer-lists { gap: … var(--space-6) }`, `ul { min-width: 8rem }`, the stack at 48 rem | stylesheet | The description gets a floor and the lists give up their slack: `grid-template-columns: minmax(min(100%, 26rem), 1fr) auto`, lists at `gap: var(--space-4) var(--space-5)`, `min-width: 6rem`, and the row stacks below 64 rem, not 48. Checkable: at 1280 and 1440 the lede holds ≥ 20 characters a line; at 820 the lists sit under it. |
| 2 | **Two edges inside one figure.** The chart is drawn at 640 and centred on the `wide` track (x = 313), and its caption starts at the track's edge (x = 121). The same on *Stem*'s diagram. Decision 17 is right — the SVG keeps its drawn size — but the figure around it should be the SVG's width, not the track's. | `theme.css` `figure.snypd-chart, .snypd-diagram, .snypd-flow { grid-column: wide }` and `.snypd-scroll > svg { margin-inline: auto }` | stylesheet | The figure shrinks to its drawing: `justify-self: center; width: fit-content; max-width: 100%`. A 640 chart then sits in the reading column with its caption under its own left edge; a 1000 diagram takes the breakout; a phone still scrolls it. |
| 3 | **"FAQ" under "Questions the kitchens asked", with a rule through its tail.** The block's default title renders as an `h3` reading *FAQ* directly under the author's `h2`, the same redundant word docs/18 §2 · 10 removed from `tldr`; the questions are `h3` too, so in the outline the title and its questions are siblings; and the first item's hairline sits flush under the title with no gap. | `spec/primitives/faq.yaml` `title: { default: FAQ }`; `base/primitives/faq.tsx` (questions at the depth written); `theme.css` `.snypd-faq > h3 { margin-top: 0 }` with no space below | default + stylesheet | No default title — a `faq` with no `title` has no heading of its own; the section's is enough. When the author gives one, the questions render one level under it (`h{title + 1}`), so the outline nests. The sheet gives the title `margin-bottom: var(--space-3)`. The `.md` twin and the FAQPage schema are untouched: both read the headings as written. |
| 4 | **The first tag pill sits 8 px above the others.** *product* at y = 6285, *Tooling* and *Hospitality* at 6293. | `theme.css` `li + li { margin-top: var(--space-2) }` reaching `.snypd-terms li` — the footer's lists already zero it; the terms do not | stylesheet | `.snypd-terms li { margin-top: 0 }`. |
| 5 | **A category shows its slug.** *product* in lower case beside *Tooling* and *Hospitality*; the category page is titled *product - Ferrule*. The taxonomy file has a title, *Product*, and a description with an unquoted colon (*Objects that get made: tooling, …*); the YAML fails to parse, the file is dropped, the term falls back to its slug — and `snypd lint` says *14 files · 0 errors* because it reads posts and pages, not taxonomies. | `examples/studio/content/taxonomies/category/product.md` (the specimen); `packages/core/src/content/lint.ts` (the silence) | lint line + content | Rule 19, *frontmatter-unparsed*: a content file of any kind whose frontmatter does not parse is an error naming the line — the sentence an agent needs is *"quote the value on line 4"*. Lint walks taxonomies and authors as it walks posts. The specimen's description gets its quotes. |
| 6 | **Dead space before the footer.** Between the term pills and the footer's rule there are 173 px; between the call-to-action's rule and the pills, 71. The post's bottom padding and the footer's top margin stack. | `theme.css` `main:not(.snypd-home) { padding-block: … var(--space-6) }` and `main:not(.snypd-home) + footer { margin-top: var(--space-5) }` | stylesheet | Drop the `+ footer` margin. One token between the last thing on the page and the footer, the same one the front page's bands use. |
| 7 | **The Markdown twin is a fourth tag.** It wears the pill the tags wear; at 390 it wraps under them and reads as one. On a wide screen only its position on the right tells it apart. | `theme.css` `.snypd-terms a, .snypd-twin a` sharing one rule | stylesheet | The twin is a text link in the idiom the stat source set (docs/18 §2 · 10): muted, dotted underline, no border. Tags stay pills. |
| 8 | **The chart caption's "(source)" is orange with parentheses** one block under three stat sources set muted with a dotted rule — two idioms for the same link on one screen. | `base/primitives/chart.tsx` (and `figure.tsx`) hardcode ` (<a>source</a>)`; the stat got `a.snypd-stat-source` in U9b | default | Captions emit the same class, `a.snypd-source`, on stat, chart and figure; editorial and technical add the parentheses back with `::before`/`::after` as they already do for the stat. One rule in each sheet, no markup an author sees. |
| 9 | **A phone scrolls the chart with no sign it scrolls.** At 390 the 640 px chart sits in a 311 px column; the x-axis ends at *150* and nothing says *400* is to the right. Decision 17 stands; this is the affordance. | `theme.css` `.snypd-scroll` — editorial carries the same rule | stylesheet, tier B | Under `@supports (animation-timeline: scroll())`: a right-edge fade on `.snypd-scroll` driven by its own horizontal scroll, gone at the end. Without the engine, the page is what it is today. Lowest weight; a call, not a must. |

Checked and found right, so not re-litigated: the reading column holds one edge at every width (title, prose, `h2`, summary, callout, steps all at x = 313 at 1280; wide figures and the numbers at the breakout, 121); the masthead goes opaque once stuck on a post as on the front page; the byline and captions measure ≈ 6:1; the focus ring lands on every stop including the chart's scroll region and the lightbox button; every image carries its size, the cover is eager at high priority and the rest lazy; the autoplay figure is muted, looping, postered and paused when off screen; the dark scheme and the reduced-motion path; no horizontal overflow at any width. One standing artefact: stat counters read *0* in any full-page capture (docs/18, owed) — it hits a case study's README still as it hits the front page's.

---

## 3. The agent's side

Nothing here costs an author a word. Two findings make an agent's page right without a look:

- **§2 · 3** removes a heading an agent never asked for. Today a `faq` under a `##` renders *FAQ* between the section title and the questions, and an agent that noticed would try `title=""` and learn nothing from the result. After: write `:::faq` under a heading, get the questions.
- **§2 · 5** turns a silent drop into a sentence. Today a colon in a description costs a term its title on every post and its own page, with no line anywhere saying so; an agent finds it by reading the rendered site, if at all. Rule 19 says *line 4* before the build.

The rest is the sheet. An agent writing a case study after this pass writes exactly what it writes today.

---

## 4. The work — S29 · U10, one session, in order of value

**U10a — the sheet.** §2 · 1, 2, 4, 6, 7 in `themes/studio/theme.css`; `check theme studio` stays green; the footer re-measured on the front page and a post at the five widths.

**U10b — the defaults.** §2 · 3 in `faq.yaml` and `faq.tsx` (one test: no title, no heading; a title, questions one level under); §2 · 8 in `chart.tsx`, `figure.tsx`, `stat.tsx` with the one rule each in editorial and technical; `bundled.ts` regenerated.

**U10c — the rule.** §2 · 5: rule 19 in `lint.ts` with a test over a taxonomy file whose frontmatter fails; the walk widened to taxonomies and authors; the specimen's `product.md` quoted. Over `corpora/100`, `corpora/suggest`, `corpora/theme` and the specimen, rule 19 fires once — on the finding.

**U10d — the affordance (§2 · 9), if called.** Tier B, `@supports`-gated, the page suite's `a11y` rows unchanged.

**Exit:** nine rows closed with a capture each; axe 0 at the top and scrolled on the post at five widths; the footer's lede ≥ 20 characters a line at 1280 and 1440 and stacked at 820, on the front page and a post; 470 + tests green; `check theme` 4/4; a `faq` with no title renders no heading.

---

## 5. Calls

**Call 1 — the `faq` title (§2 · 3).** Recommend **no default**. The word *FAQ* is a blog's label, as *TL;DR* was; the studio look already renamed one, and a block under a heading needs no second heading of its own. The spec's default goes for every theme, not only studio: `base` gains the same behaviour, and a site that wants the word writes `title="FAQ"`.

**Call 2 — questions one level under a given title (§2 · 3).** Recommend **yes**. The renderer knows the title's level; the author keeps writing `###`. The change is HTML only; the twin and the schema read the markdown.

**Call 3 — the scroll affordance (§2 · 9).** Recommend **later**. It is the smallest row and the only tier-B one; it can ride with the next tier-B pass rather than this one.

**Not a call, a note:** the footer squeeze (§2 · 1) is on the front page too and is the one row here a visitor meets on every page. It goes first.

---

## 6. Outcome (S29 · U10, built 17 Sep 2026, same session as the audit)

Calls 1 and 2 taken as recommended, call 3 deferred as recommended; decisions 192–193 recorded in docs/11. Built on the specimen branch over the studio look and re-measured on *Kiln to table* at 390, 560, 820, 1280 and 1440, light and dark, one scrolled pass each; the front page at the five widths; *Stem* at 1280 and 390 for the diagram. Every number below is from this box's headless Chrome through the bench's own CDP helper, not a screenshot read by eye.

**U10a — the sheet.** Rows 1, 2, 4, 6 and 7 closed in `themes/studio/theme.css`. The footer's description holds **28 characters a line, four lines, at every one of the five widths** on the post and the front page alike (was 112 px and twenty lines at 820, seven lines at 1280): a floor of `min(100%, 26rem)` on its column, the lists at the smaller gap with a 6 rem minimum, the row stacking below 64 rem — so at 820 the lists sit under the lede and at 1280 and 1440 beside it. A chart is one figure with one edge: at 1280 the figure, its SVG and its caption all start at **x = 313**, the reading column's own edge, and the figure is 640 wide — the drawing's width, not the track's; at 1440, x = 393; at 820, x = 83 with no scroll; at 390 it scrolls, as decision 17 says it should. It took two rules, not one: `width: fit-content` alone left the figure at 817 because a long caption's max-content *is* the whole track, and `contain: inline-size` on the caption is what takes it out of the figure's intrinsic width (tier A; not on the guarded list). The *Stem* diagram, drawn at 778, takes the breakout at 1280 with one edge at x = 244, shrinks to 741 at 820 and to its 70 % floor at 390 where it scrolls. The three term pills sit on one baseline at every width (`li + li` zeroed on `.snypd-terms li`). The footer's `margin-top` off the front page is gone; the post's padding is the one token. The twin is a text link — no border, dotted rule, the source links' idiom — and at 390 it no longer reads as a fourth tag.

**U10b — the defaults.** Row 3: `faq.yaml` has no default title. A `faq` with none renders no heading of its own — the specimen's three questions sit under "Questions the kitchens asked" as `h3`s with nothing between — and a given title renders at `h{depth + 1}` with the questions at one level under it, so the outline nests; the FAQPage schema and the `.md` twin read the markdown and see none of it. The studio sheet gives a given title `margin-bottom: var(--space-3)` so the first hairline is not flush under it. One render test rewritten for the untitled case and extended with a titled one (`h3` title, `h4` questions, schema entry present). Row 8: `chart.tsx` emits ` <a class="snypd-source">` as `stat.tsx` does; the stat's own class is renamed to the same word; editorial and technical add the parentheses back with one `::before`/`::after` rule each; studio sets both with one rule. `figure.tsx` was named in §2 · 8 and was wrong there — a figure has no `source` prop and emitted nothing; nothing to change. `bundled.ts` regenerated. On the post, four source links now share one idiom: dotted, in the label's colour, in both schemes.

**U10c — the rule.** Row 5. `content/index.ts` walks what the build reads and the types do not declare: every `content/taxonomies/<taxonomy>/*.md`, and `content/authors` only on a site whose config removed the default `author` type (it is a default type, so an author's file always had rule 0 — the audit's "and authors" was already true). A frontmatter that does not parse is **rule 19, `frontmatter-unparsed`**, an error whose message says the file is dropped and the term falls back to its slug, and whose line is the *file's* — the YAML parser's `(3:35)` plus the fence — with the hint the finding needed: *"Quote the value on line 4 — a colon inside an unquoted value starts a nested mapping"*. Rule 0 got the same line and hint for a post's frontmatter (it said line 2 and "fix the YAML" before). Over `corpora/100`, `corpora/suggest`, `corpora/theme` and the specimen with the original file, rule 19 fires **once**, on `category/product.md:4`; with the description quoted, the specimen lints 23 files (up from 14 — the nine term files are in the count now), 0 errors. Two tests: rule 0's line and hint on a colon; a site with a broken term file, a broken author file (rule 0, once, not twice), a clean term file, and the quoted fix.

**U10d — the affordance.** Not built (call 3): the only tier-B row, held for the next tier-B pass.

**Exit, measured:** axe 0 at the top and one viewport down on the post at five widths in both schemes and on the front page at five widths (twenty captures, twenty scrolled passes); horizontal overflow 0 at 390 and 560 (the desktop's −15 is the scrollbar gutter); the footer's lede ≥ 20 characters a line everywhere and stacked at 820; a `faq` with no title renders no heading; `check theme` 4/4 (studio 17 rules, all pass); typecheck clean; **472 tests, 0 fail** — one full run under a load average of 26 timed five git-push tests out at their 5 s limit, and the two files pass on a quiet box (15/15) with nothing in them touched. The standing artefact stands: stat counters read *0* in any full-page capture (docs/18, owed).

**Owed:** the scroll affordance (§2 · 9) with the next tier-B pass; the stat-counter capture artefact; the README stills and everything docs/18 §7 already lists.
