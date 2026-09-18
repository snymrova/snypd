# 18 — The front page, held to the standard: the studio look's UI/UX pass, and the rules that make an agent's front page right first time

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 17 Sep 2026
**Asked for:** *"start auditing the studio theme from ui ux perspective, focus just on home page"* — and then: *"create a plan to improve the ui ux as per the standards, and keep in mind that it should make the job of agent easy and save tokens to generate the site."*
**Scope:** the front page of the studio look ([docs/17](17-the-studio-look.md)), audited on the Ferrule specimen (`examples/studio`, branch `s29-studio-specimen`) at 390, 560, 820, 1280 and 1440 px, light and dark, reduced motion, keyboard and pointer. Fourteen findings, each traced to the file that causes it, and one unit of work that closes them. The standard is named in §1 so the fixes are checkable, not tasteful.
**Constraint:** every fix must be one of the three kinds that cost an author nothing — a stylesheet rule, a better default, or a lint line. **No fix may add an attribute an agent has to know about.** §3 says why in tokens.
**What this is not:** a redesign. The look is right (docs/17 §3 delivered what it named). This is the pass a designer does after the first build: alignment, rhythm, states, and the two conformance gaps.

---

## 1. The standard

"As per the standards" means, concretely:

| Standard | The rule this document holds the page to | Where it bites here |
|---|---|---|
| **WCAG 2.2 AA** — 1.4.3 contrast | 4.5:1 for text under 24 px, in every state a reader can reach, including scrolled | the masthead over a light band (§2 · 3) |
| — 1.4.11 non-text contrast | 3:1 for graphics that carry meaning | the wall's marks on a light band (§2 · 11) |
| — 2.2.2 pause, stop, hide | moving content that auto-starts and runs longer than 5 s has a control for everyone, not only under `prefers-reduced-motion` | the reel and the marquee (§2 · 7) |
| — 2.5.8 target size | 24 × 24 px minimum, or spacing that gives it | the masthead's links at 19 px (§2 · 8) |
| — 1.3.1 info and relationships | headings nest; a block's title inside a section is a sub-heading | steps and cta titles (§2 · 2) |
| **One grid** (docs/17 §3, the reference) | everything in a band starts on one left edge; prose is limited by width, never by indent | two edges down the whole page (§2 · 1) |
| **Fluid space** (docs/09's tokens) | a band's padding scales with the viewport; nothing is 7 rem on a phone | band padding (§2 · 4) |
| **No orphans** | a grid of *n* holds *n* across, then *n/2*, then one — never *n − 1* + 1 | steps and stats (§2 · 5) |
| **House rules** (docs/14 §3, decision 161) | tier A anywhere; B and C under `@supports`, never load-bearing; zero JS; the gate refuses the effect, not the rule | every fix below is tier A except the stuck masthead (C, already in the sheet) |

---

## 2. Findings, traced

Numbered by weight. *Cause* names the file. *Kind* is one of the three the constraint allows.

| # | What a reader sees | Cause | Kind | Fix |
|---|---|---|---|---|
| 1 | **Two left edges.** Band titles, the headline and prose start at x = 393; stats, steps, the wide figure, the wall and cards at x = 201. Every band alternates margins; on a tablet the title is indented past its own content. This is the `/posts/` list-title issue seen the same morning. | `theme.css` — `.snypd-band > *` on the `text` track, blocks promoted to `wide` | stylesheet | Bands set every child on the `wide` track and give prose `max-width: var(--measure)`. One edge, the measure kept. The hero's `h1` and the `/posts/` title follow. |
| 2 | **A second headline in every band that holds a titled block.** "How we work" then "Four stages, one room" at the same size; "Start a project" then "Tell us what you make". The outline is one `h1` and five `h2`, one of them nested. | `base/primitives/steps.tsx`, `faq.tsx` emit `<h2>`; `cta.tsx`'s title is set at `h2` size by the theme | default | The renderer passes a block its **depth** (the heading level of the section it sits in; already known — `sections` splits at `##`). `steps`, `faq` emit `h{depth+1}`; the theme sizes a block's title as `h3` inside a band. Posts are unchanged: at top level depth is 1 and the tag stays `h2`. |
| 3 | **A grey masthead over light bands.** 72 % dark over white is `#525252`; the 13 px muted nav text on it measures ≈ 3.1:1. axe never sees it: it exists only at a scroll position. | `theme.css` masthead `color-mix(… 72%, transparent)` | stylesheet | Under `@container scroll-state(stuck: top)` (already in the sheet, tier C) the bar goes opaque `var(--color-bg)`; the unstuck mix rises to 88 % as the tier-A floor. Nav text steps up to `--color-text` at 0.8 opacity. |
| 4 | **Desktop padding on a phone.** `space.6` is a fixed 7 rem; ≈ 300 px of black between the pullquote and the next band at 390 px. | `theme.yaml` `space.6`, `theme.css` `.snypd-band` | stylesheet | `space.6: clamp(3.5rem, 2rem + 6vw, 7rem)`. Tokens stay one value; the bench's `tokens.learn` row is unaffected. |
| 5 | **Orphans.** Steps go 3 + 1 at 820 px; stats go 2 + 1 at 560 px. | `theme.css` `auto-fit` grids | stylesheet | `.snypd-stat-row[data-count="3"]` holds `repeat(3, 1fr)` down to 30 rem, then one column (base emits `data-count` already). Steps: 4 → 2 → 1 by `data-count` the same way; `steps.tsx` gains the attribute. |
| 6 | **The hero is 1.4 phone screens.** Headline, subtitle, summary, three stacked stats, then 7 rem of nothing before band 01. | content — `home.md` puts the stat row in the lead | lint + recipe (§3) | Lint rule 17, *hero-too-tall*: on a `home: true` page, more than one block before the first `##` warns with the move. The Ferrule specimen moves its stats into band 01. |
| 7 | **No pause control.** The reel and the marquee auto-start and run past 5 s. Reduced motion stops them; 2.2.2 wants a control regardless. | `base/parts/shell.tsx` (owns the still), `theme.css` (owns the marquee) | default | One control, zero JS: `base`'s shell renders `<input type="checkbox" id="snypd-motion">` with a visible label ("Motion") only when the page carries an autoplay or a marquee; `body:has(#snypd-motion:checked)` swaps the still in, stops the marquee, and stops the reveals. The theme places and styles it in the masthead. Per page, no persistence — 2.2.2 asks for the mechanism, not memory. |
| 8 | **19 px nav targets.** | `theme.css` `body > header nav a` | stylesheet | `padding-block: 0.5em; margin-block: -0.5em` — the hit area grows, the bar does not. |
| 9 | **The marquee is ragged and cramped.** Marks with a "since" caption sit 14 px higher; on a phone the mask eats half of every mark and "since 2019" reads "e 2019". | `theme.css` `.snypd-logo-wall li { display: grid }`, `.snypd-marquee` at every width | stylesheet | Marks on a shared baseline (`align-items: start`, caption in a reserved row); below 48 rem `data-layout="marquee"` renders as the grid the primitive already has. The author writes `layout="marquee"` once and gets the right thing at every width. |
| 10 | **Words the theme owns are the wrong words.** "TL;DR" is a blog's label on an agency page; "Latest posts" sits under a nav that says "Work"; "(source)" appears three times in orange in the hero. | `base/primitives/tldr.tsx` (hardcoded), `studio/layouts/home.tsx` (hardcoded), `stat.tsx` + `theme.css` | default | `tldr` gains `label` (default "TL;DR"; the theme's default in `theme.yaml` is "In short"). The home layout's heading takes the header menu's label for `/posts/` when one exists, else "Latest posts". The stat source becomes `<a class="snypd-stat-source">`; the theme sets it in the label's colour with a dotted rule, and the hero keeps one accent. |
| 11 | **Marks would fail on a light band.** 0.7 opacity on an already-muted mark measures ≈ 2.2:1 on `#fbfbf9`. Passes here only because the wall is on the dark band. | `theme.css` `.snypd-logo-wall img { opacity: .7 }` | stylesheet | Rest opacity 0.85, hover 1. The specimen's mid-grey fill stays; a black mark on a light band reads at 0.85 as it should. |
| 12 | **The subtitle over the reel.** Muted grey over the lathe's chrome highlights is the weakest text on the page. | `theme.css` `.snypd-subtitle` | stylesheet | In the hero only: `--color-text` at 0.85 opacity, and the scrim's middle stop rises from 35 % to 45 %. |
| 13 | **The card cursor vanishes on dark.** A black disc over a dark cover leaves only the arrow. | `theme.css` `.snypd-card > a { cursor }` | stylesheet | The disc gains a 1.5 px `#fff` ring; one SVG string. |
| 14 | **The band count includes the automatic band.** "04 Latest posts" numbers a section the author did not write. | `theme.css` `counter-increment` on every band | stylesheet | The entries band's title does not increment. Three sections read 01–03 and the cards read as the page's end, which they are. |

Two things the audit checked and found right, so they are not re-litigated: the focus ring (2 px accent, 3 px offset, visible on both schemes at every stop), and the reduced-motion path (still in place of the reel, numbers as written, no rise, no marquee).

---

## 3. The agent's side: what "easy" and "cheap" mean

An agent writes a front page through the MCP: it reads `snypd://spec/primitives` (14 KB, ≈ 3.5 k tokens, once), writes markdown, runs `content_lint`, looks with `content_render_preview`. The expensive step is the last one: a 1280 × 800 screenshot is ≈ 1.4 k tokens *per look*, and a layout mistake costs a look to notice, a guess to fix, and a look to confirm. Every finding in §2 that an agent would have to *see* to fix is a screenshot loop; every one that a lint line or a default closes is not.

So the three rules this pass is held to, and what each saves:

1. **No new required attribute.** The spec grows by one optional prop (`tldr.label`) and nothing else. An agent that learned the vocabulary at S25 writes the same markdown after this pass and gets a better page. *Saves:* the spec re-read (≈ 3.5 k tokens) on every site an agent already knows how to write.
2. **Right by context, not by instruction.** A block's heading level, a grid's column count, the wall's layout on a phone, the words on the summary and the entries band — the renderer or the theme decides from where the block sits. The author never writes `level=3`, `columns=3`, `mobile=grid`. *Saves:* the attribute the agent would otherwise have to discover by looking, per block.
3. **A mistake is a sentence, not a screenshot.** Rule 17 (*hero-too-tall*) and rule 18 (*duplicate-title*: a block's `title` inside a `##` section that repeats or restates the heading) each say the move in one line — *"move `stat-row` under a `##` heading"* — where today the agent renders, sees a long hero, and guesses. *Saves:* two looks per front page, ≈ 3 k tokens, and the guess.

And one addition that is not a fix but is the cheapest token saver on the list:

4. **`snypd://spec/home` — the front-page recipe, one screen.** Today the spec describes fourteen blocks and says nothing about a front page; the agent infers the shape from the theme's `personality` line. The resource says it in ≈ 120 words: *a `home: true` page is a `cover` (with `media` if the site has a reel), one lead paragraph, then three to five `##` sections; each section holds one block and at most one paragraph; the entries band is the theme's; the studio look reads best with `stat-row`, `steps`, `logo-wall`, `pullquote`, `cta` in that order.* The Ferrule home is the worked example, linked. *Saves:* the exploration an agent does now, which is a preview loop per guess; the exit line in §4 measures it.

The `snypd init` example (open from the specimen session) lands here: if Ferrule is the example, the recipe's worked example ships with every install and the agent's first front page is a diff from a right one.

---

## 4. The work — S29 · U9, one session, in order of value

**U9a — the sheet.** §2 · 1, 3, 4, 5, 8, 9, 11, 12, 13, 14. All `themes/studio/theme.css` and two token defaults in `theme.yaml`. Nothing leaves the theme; `check theme` runs at 17 rules unchanged. Half of the session's value, a third of its time.

**U9b — depth and the words.** §2 · 2, 7, 10. `render` passes `depth` into the primitive props (one field on the context the hooks already carry); `steps`, `faq` read it; `tldr` reads `label`; `stat` names its source link; the shell renders the motion control when a page has an autoplay or a marquee; `home.tsx` reads the menu for its heading. Touches `base`, so every theme's fixtures regenerate — **the fixture-regen trap from S29 applies**: regenerate, diff, read the diff, then commit. Decision 188 below.

**U9c — the two lint rules and the recipe.** Rules 17 and 18 in `packages/core/src/content`, each with three corpus posts; `snypd://spec/home` in the MCP catalogue; `content_explain` learns the word "hero". Precision stays 1.0 over the suggest corpus or the rule does not ship.

**U9d — the specimen.** Ferrule's stats move into band 01, the nav loses the two children of "Work", the wall gets its captions on every mark or none. Then the full audit again, same script, same five widths, and the stills for the README's thirteenth theme.

**U9e — the gate learns to scroll.** One scrolled pass in the page suite: the home route at one viewport down, axe once more. It is the pass that would have caught §2 · 3, and it costs one screenshot per look on the gallery. Report-only for one session (docs/07's rule: a new row reports before it gates), then gated.

**Exit:** the audit's fourteen rows closed with a capture each; seven looks green on the gallery including the scrolled pass; `check theme` 4/4; suggest precision 1.0; the Ferrule front page written from the recipe by a fresh agent session in one `content_create` and one lint, no preview loop — measured, and the count goes in the post.

**If a session cannot be found:** U9a alone is three quarters of what a reader notices and ships in a morning; U9b · 7 (the motion control) is the one conformance gap and goes with it.

---

## 5. Decisions proposed

- **188 — one edge.** On the studio look every child of a band starts on the `wide` track; prose is limited by `--measure`, never indented. Amends docs/17 §3's "text, breakout, full" for the front page only; a post keeps the reading column.
- **189 — depth is the renderer's.** A primitive that emits a heading takes its level from the section it sits in. No `level` attribute exists or will.
- **190 — the motion control.** A page with an autoplay or a marquee carries one visible stop control, rendered by `base`, placed by the theme. `prefers-reduced-motion` remains the default for readers who set it; the control is for everyone else.
- **191 — a front page has a recipe.** `snypd://spec/home` is the agent's one-screen answer to "what goes on the front page", with Ferrule as the worked example, and `snypd init` scaffolds it.

---

## 6. Calls

**Call 1 — one edge (188).** Recommend **yes**. It is the reference's grid, it removes the alternating margins the audit ranked first, and it changes no markup.

**Call 2 — depth in the renderer (189).** Recommend **yes**, accepting the fixture regen. The alternative — a `level` attribute — is exactly the kind of thing §3 refuses.

**Call 3 — Ferrule as the `snypd init` example (191).** Recommend **yes**. It is written to the standard already, its media is CC0 with a generated credits page, and it makes the recipe's worked example the thing every install starts from. The `examples/` directory stays top-level for it.

**Call 4 — the slot.** Recommend **S29 · U9 on `s29-studio-look`, before the site switches to the look**, because the switch is what the film re-shoots and the film should not record the two edges. It does not wait on the token; nothing here is published.

---

## 7. Outcome (S29 · U9, built 17 Sep 2026, same session as the audit)

All four calls taken as recommended; decisions 188–191 recorded in docs/11. Built on the specimen branch over the studio look, verified on the Ferrule front page at 390, 560, 820, 1280 and 1440, light and dark bands, reduced motion, the control ticked, and one scrolled pass.

**U9a — the sheet.** All ten rows closed in `themes/studio/theme.css` and one token: every band child on the `wide` track with prose held to the measure (one edge at every width: x = 121 at 1280, 201 at 1440, 32 on a phone); the masthead at 88 % and opaque once stuck (`::after`, because a scroll-state container cannot style itself); `space.6` fluid (the phone hero from 1.4 screens to under one); `data-count` grids for three and four (never 3 + 1, never 2 + 1); 31 px nav targets on a bar that did not grow; the wall on one baseline with a caption row, marks at 0.85, and the marquee stood still as the grid below 48 rem; the hero subtitle in the text colour; a white ring on the card cursor; the entries band unnumbered. `check theme studio` 17 rules, all pass.

**U9b — depth and the words.** `PrimitiveProps.depth`; `steps` and `faq` emit `h{depth + 1}` and `steps` counts itself; `tldr` reads `label`, then the theme's `tldrLabel` setting (studio: "In short"); the stat source is `a.snypd-stat-source`, the label's colour under a dotted rule; the entries band is headed "Work" from the menu; the motion control is `base`'s sixth part. Two tests updated for the sixth part and the count; `bundled.ts` regenerated.

**U9c — the rules and the recipe.** Rules 17 and 18 in `lint.ts` with tests; `snypd://spec/home` with the worked example. Over `corpora/100`, `corpora/suggest`, `corpora/theme` and the specimen the two rules fire exactly once, on the fixture's own front page, which was the finding — its numbers moved into its first section. The `content_explain` touch ("hero") is not done: that tool explains plugins, and the word belongs in the recipe, where it is.

**U9d — the specimen.** Ferrule's stats sit under "How we work"; the masthead is Work and Studio; every mark carries a "since"; re-audited at the five widths, axe 0 at every one, scrolled too.

**U9e — the gate learns to scroll.** `page.a11y.scrolled` and `gallery.<look>.a11y.scrolled`: axe once more, one viewport down, on every route and width the suite already measures. Report-only this session.

**Found on the way, fixed:** the still beside the reel was always shown — `.snypd-cover img { display: block }` reached it and out-ranked `base`'s `display: none` from the higher cascade layer, so the showreel never played on the studio front page in U8. The theme no longer sets `display` on cover media; which of the clip and the still shows is `base`'s decision in both directions.

**After review — the footer (same evening).** Sunny, on the dev server: the footer is a very important part of the whole site and the studio one lacked attention. It did: `base`'s markup — three grey lines and the name — at the viewport's edge, thirty-two pixels in, under bands whose every line started a hundred and twenty; the one edge stopped one element short of the end of the page. The studio theme now has a footer part of its own (`parts/footer.tsx`, its third): a band on the page grid, in the scheme the last band is not, so the alternation runs to the end; the site's description set in the display face with the lists beside it, each a column — the `footer` menu, `social`, and `offices`, the one settings row docs/17 §4.4 foresaw; then the name at up to 12 rem, breaking rather than overflowing; then, under a hairline, the note and the `footer-end` slot, gone together when empty. Markup order is reading order; the sheet never reorders. Verified at 390, 820, 1280 and 1440 on the front page and a post: the footer's first line starts where the band titles start at every width, axe 0, no horizontal overflow; 470 tests, `check theme studio` 17 rules pass (6 parts, three its own).

**After review — the pill (same evening).** Sunny: "in the header there is motion menu we dont need that." Out of the studio masthead it goes: `parts/header.tsx` no longer renders `base`'s `motion` part and the sheet's pill and ticked-state rules are gone with it. The part itself stays in `base` (decision 190 stands for `base`'s own header); on the studio look the reel and the marquee stand still under the reader's reduced-motion setting and by no control on the page — which is the one WCAG 2.2.2 reading this trades away, and it is Sunny's call.

**Owed:** README stills; `snypd init` from the recipe (call 3's second half); the fresh-agent measurement in §4's exit line, once the MCP server is back; a budget on the scrolled row after one CI run.
