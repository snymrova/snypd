# 17 — The studio look: an agency site's feel at 0 KB, and the bench that proves it

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 17 Sep 2026
**Asked for:** *"what is the way ahead if we want our cms to assist the agent to create site like this using our software https://phenomenonstudio.com/"* — and then, sharper: *"i am more interested in our app providing the visual feel of the link i gave with our benchmarks."*
**Scope:** a research read, not a session, in the shape of [docs/14](14-css-as-the-runtime.md). It measures the reference site, names the devices that make it feel the way it does, maps each one onto a snypd surface with its browser cost under the tier rule (decision 161, `css.enhancement-guarded`), lists the three places a theme alone cannot reach, says how the bench sees it, and proposes one session. **It decides nothing; §7 asks for four calls.**
**Constraint, stated first:** nothing here moves before Gate D. The npm token, 0.1.5, S26, S28 and 6 Oct come first ([docs/16 §1](16-launch-campaign.md)). This is the first post-launch session, and it is also the *"work on the website's capabilities first, then re-record"* item the hero film already owes — so it lands on snypd.rocks and goes into the re-shot footage.
**What this is not:** a plan to build an agency CMS. The content types an agency site needs (a case with taxonomies, a person, a service, a form) are a different question — docs/06's open question on a pages vocabulary — and §4.4 says where the line is. The ask is the *feel*, and the feel is a theme.

---

## 1. The stake

The 0 KB claim has two readings. The weak one: *no JavaScript, therefore a plain site.* The strong one, which docs/14 §1 set and U7 delivered for a reading site: *no JavaScript, and it behaves like the sites that ship a bundle to do the same.* The reference site is the strong reading's next test, because it is what an agency's visitor expects a site to feel like in 2026 — full-bleed bands, display type at a hundred pixels, a marquee, cards that move as you scroll, clips that play by themselves, a masthead that blurs what passes under it.

Every one of those is on the docs/14 catalogue already. What is missing is a theme that uses them together, three small vocabulary touches, and a bench row that stops the one trap the reference fell into (§2: 22 MB of video on first load). If snypd can put a look on the shelf that a Product Hunt visitor reads as *that kind of site*, and the same eighteen gated rows stay green under it, the strong reading is demonstrated rather than argued — and the comparison in §2 becomes the sentence on `/bench`.

---

## 2. The reference, measured

Measured 17 Sep 2026, Chrome via Playwright, 1280 px wide, one load of `/`, then three viewport screenshots (hero, the client-wins grid, the numbered service cards) — in `.playwright-mcp/ph-*.jpg` on this box, not committed.

| | phenomenonstudio.com | snypd, S25 |
|---|---|---|
| JavaScript on load | **390 KB** across 9 scripts (analytics, session recorder, reCAPTCHA, the theme's own) | **0 KB**, the build refuses otherwise (E6) |
| CSS on load | **305 KB** | ≈ 30 KB per theme, one layer |
| Video on load | **22.5 MB** — 26 `<video autoplay muted loop>`, 22 of them below the fold | 0 — a clip is click-to-play with a poster (decision 181) |
| Images on load | 391 KB | per page |
| Page height | 28,837 px, fifteen sections | — |
| Motion engine | WordPress; no GSAP, no Lenis; IntersectionObserver reveals on ≈ 98 elements by class; 4 keyframe animations; 26 `position: sticky` rules; 17 `clip-path`; 4 `backdrop-filter`; a marquee | CSS only, tier-gated by `check theme` |
| Type | Bricolage Grotesque (display, ≈ 100 px, tight tracking) · Albert Sans (body) — both OFL, on Google Fonts | Source Serif 4, 30 KB subsetted (editorial); system stacks (technical) |
| Palette | White body; the page **alternates dark and light full-bleed bands** — dark hero, white wins grid, dark service cards; one orange accent; black pill buttons with an arrow | `light-dark()` tokens, one scheme per page |

**What the feel is made of, in order of how much of it each carries:**

1. **Bands.** The dark/light alternation is most of it. A section owns its scheme; the masthead flips with the band under it.
2. **Type.** One display face, very large, tight, `text-wrap: balance`; small-caps eyebrows above every heading; enormous section padding.
3. **Cards with hairlines.** Numbered (01, 02) cards separated by 1 px rules, not boxes; a clip playing quietly inside each.
4. **Motion, in this order:** the sticky blurred masthead → the logo marquee → reveals on scroll → the hover image swap on a case card → the animated counters → the two carousels (services, testimonials) → the trailing custom cursor.
5. **A showreel behind the hero.**

The fifteen sections in order, for §4.4: hero · value statement · client-logo carousel · numbers · client-wins grid (8 cards) · three problem/solution cards · services in four tabs of four numbered cards · three featured cases · four industry cards · team (6 faces, a count) · four why-us cards · testimonials carousel with rating badges · six awards · a "Let's collaborate" CTA · footer (nav, social, three offices, legal, badges).

---

## 3. The devices, one by one

Tier letters are docs/14 §3's, as `render/src/check.ts` enforces them: **A** Baseline, use anywhere · **B** two engines, under `@supports`, never load-bearing · **C** one engine, under `@supports`, only where the fallback is *nothing happens*.

| Device | What the reference does | The CSS-only equivalent | Tier | Surface | Note |
|---|---|---|---|---|---|
| Dark/light bands | Per-section background and text colour, hand-set | `color-scheme: dark` on a section over the same `light-dark()` tokens — a band is one declaration | A | theme.css; a `band` class the layout puts on alternating `##` sections | Tokens do not change; X1's contrast gate reads both schemes already |
| Display type | Webfont at ≈ 100 px | Bricolage Grotesque subsetted like editorial's Source Serif 4 (`scripts/vendor-font.sh`), `wght` as a range, `opsz` pinned, metric-matched fallback | A | `font:` in `theme.yaml` | **Verify the size at the session** — a variable Latin subset with `wght` + `wdth` may not fit the 40 KB lane (decision 118); drop `wdth` first, then it is one face for display and the body in system sans |
| Sticky blurred masthead | `position: sticky` + `backdrop-filter`; condenses on scroll via JS | Same two properties; condensing via `@container scroll-state(stuck)` | A / C | `parts/header.tsx`, theme.css | docs/14 §5 refused *condensing* in `base` as screenshot-only motion; a theme may. Condense the padding, never the height under the pointer |
| Logo marquee | A JS-driven strip of client logos | One `@keyframes` on a duplicated row, `animation-play-state: paused` under reduced motion and on hover | A | `logo-wall` (§4.3) with `layout="marquee"` — or a theme style on it | A `<ul>` of `<img alt>`; the duplicate row is `aria-hidden` |
| Reveals on scroll | IntersectionObserver adds a class; ≈ 98 elements | `animation-timeline: view()` with `animation-range: entry 0% entry 40%` | B | theme.css on `.snypd-stat`, `.snypd-steps > li`, cards | **U7's finding stands:** an opacity reveal starts text at a fraction of its opacity and axe reads it as contrast failures. So: animate `transform` and `clip-path` only, opacity never below 1, and the reveal range ends *before* the element's top reaches the viewport's centre, so axe's load-time pass sees settled text. Fallback under no `@supports`: the page as it is |
| Hover image swap on a card | JS swaps `src` | Two `<img>` in the card, `:hover` / `:focus-within` crossfade; or one `figure` with `poster` and the clip under it | A | `entries` part — the cards on the front page | `content-visibility` is not needed; a card is one image |
| Animated counters | JS counts `0 → 500` on reveal | `@property --n { syntax: '<integer>' }` + `counter-reset: n var(--n)` + `content: counter(n)`, driven by `view()` | A + B | `stat` — a `data-n` the theme may animate | The displayed value stays in the DOM as text (`92 %`); the counter is a `::before` the theme paints over it, so the `.md` twin, axe and a reader with no animation see the real number |
| Tabs (four service journeys) | JS tablist | Four `steps` blocks under `##` headings; the theme lays sibling `steps` as a `scroll-snap` row with `::scroll-marker` as the tab strip | B | theme.css | The markers are a real tablist (docs/14 §5). Fallback: four stacked lists, which is the phone layout anyway |
| Testimonial carousel | JS slider | `pullquote` × n inside one section; `scroll-snap-type: x mandatory`, `::scroll-button()` for the arrows, `::scroll-marker` for the dots | B | theme.css on `.snypd-pullquote + .snypd-pullquote` | Fallback: stacked quotes |
| Custom trailing cursor | JS follows the pointer with a div | `cursor: url(explore.svg) 16 16, pointer` on the case cards | A | theme.css | The *trailing* blob is JS by definition; the static cursor is most of the affect. **Do not** set it on the body |
| Showreel behind the hero | `<video autoplay muted loop>` under the headline | The same element, under the four conditions in §4.2 | A | `cover` (§4.1) | The one autoplay a page gets |
| Pill buttons with arrows | Markup | `cta`'s button; an arrow is `::after` with `content` | A | theme.css | — |
| Numbered hairline cards | Markup | `steps` renders `<ol>` with a counter already; the theme sets the counter as `01` and draws rules, not boxes | A | theme.css | Nothing to build |
| Cross-page transition | None on the reference | `@view-transition` — already shipped (4.4) | B | — | snypd already does one thing the reference does not |

Everything in the table is CSS or markup the renderer already owns, except the three rows that point at §4. Nothing changes the `.md` twin.

---

## 4. What a theme cannot do alone

### 4.1 `cover` learns a hero — `cover.yaml`, `cover.tsx`

Today a cover is a title block with an optional image. The reference's hero is that plus a full-bleed band and a clip behind the type. One prop: `media` (an image or a `.mp4`/`.webm`, with `poster` when it is a clip), which the theme is free to put behind or beside the title. The `home` layout already puts `p.cover` first. No new primitive; `snypd://spec/primitives/cover` gains one line, so `tokens.learn` moves by a handful.

### 4.2 `figure` learns to play by itself — amends decision 181

Decision 181 (S25): *a clip is a figure; nothing autoplays; 0 KB holds.* The rule was right for a post. The front page needs one exception, bounded so it cannot become the reference's 22 MB:

- `autoplay: true` on a `figure` clip, or on `cover.media`, renders `<video autoplay muted loop playsinline preload="none" poster=…>` — the four attributes are not optional and the renderer writes them, not the author.
- **At most one per page.** Lint rule (next free number) fails the second, naming the first. A card that wants motion gets a poster and a play button, as today.
- Under `prefers-reduced-motion: reduce`, the theme's sheet hides the `<video>` and shows the poster (`base` ships the rule, so no theme has to remember it).
- `page.js.kb` stays 0: autoplay is an attribute, and rule 13's scanner already knows an attribute is not a script site (docs/14 §6).

### 4.3 A fourteenth primitive: `logo-wall`

`::logo-wall{layout="grid|marquee"}` over a list of `![alt](src)` links, each optionally captioned. It is the client logos, the awards row, the trust badges in the footer — three of the fifteen sections, and the one shape none of the thirteen can carry honestly (a row of `figure`s is captions and lightboxes; `stat-row` is numbers). docs/07 principle 9 refuses a feature added to say a word; this one is asked for by name (docs/06's open question already lists it), and the vocabulary being *locked* (docs/13 §5.4) means additions go through a spec minor, not that there are none. Alt text required, as `figure`. Lint: a wall of fewer than three is a finding.

### 4.4 The fifteen sections, mapped — and where the line is

| Reference section | snypd, today | Needs |
|---|---|---|
| Hero with showreel | `cover` + `tldr` + `cta` | §4.1, §4.2 |
| Value statement | a paragraph | — |
| Client-logo carousel | — | §4.3 |
| Numbers | `stat-row`, sources required | counters are theme (§3) |
| Client-wins grid (8 cards) | — | §4.3 with captions carries logo + name + one line; tag and flag do not fit and are not owed |
| Three problem/solution cards | three `callout`s, or `##` + `cta` | — |
| Services in four tabs | four `steps` blocks | tabs are theme (§3) |
| Three featured cases | the `entries` part — cases are posts with covers | hover swap is theme (§3) |
| Four industry cards | `##` + a list each | — |
| Team: six faces, a count | one composed `figure` + a `stat` | **not a primitive here** — a `people` block is the pages-vocabulary question, not this document's |
| Four why-us cards | `##` + paragraphs, or `faq` | — |
| Testimonials carousel | `pullquote` × n with `cite` | carousel is theme (§3) |
| Six awards | §4.3 | — |
| "Let's collaborate" | `cta` | — |
| Footer: nav, social, offices, legal | `footer` part, `footer` nav location, theme settings (`social` exists; `link_list` for offices) | one settings row |

**Refused, on purpose, with the decision that refuses it:** the *Smart Search* multi-step modal (search is JS by definition, docs/14 §5); the trailing cursor (§3); an unmuted showreel (§4.2); the contact form (no forms — decision 145 territory; a `cta` with `mailto:` is today's answer); a filterable case grid (taxonomies on `page`, the pages-vocabulary question). The line is: **the feel is in scope; the agency's data model is not.**

---

## 5. How the bench sees it

- **The three numbers hold, per look** (E9): `page.js.kb` 0, `page.a11y.violations` 0, `page.cls` 0 — the studio look becomes the **seventh look** on `snypd bench gallery`, and its eighteen gated rows are the same eighteen. The reveal rule in §3 is what keeps axe at 0; if it cannot be kept, the reveals go, not the gate.
- **`page.font.kb`** against the 40 KB lane — the row that decides whether Bricolage ships or the display face is a system stack (§3, type).
- **One new row: `page.media.kb`** — bytes of image and video fetched on first load at 1280, before any scroll. Report first, budget after one measurement, the way docs/14 §6 treated `page.bytes.kb`. The reference would read 22,900; a page under §4.2 reads its poster and one clip. This is the row that makes the comparison in §2 a sentence on `/bench`, and it is the row a stranger's theme is held to.
- **`check theme`** gains nothing: `css.enhancement-guarded` already names every unguarded tier-B/C line in §3.
- **`tokens.learn`** moves by `cover.media`, `figure.autoplay` and one primitive — expect ≈ +150, under the budget decision 182 made the line.
- **Firefox and Safari by hand** at 390 and 1280, as U7's exit did: the carousels and reveals are tier B, and the page must read as *designed* without them, not as broken.

---

## 6. Proposal — one session

**S29 · U8 — the studio look.** After S28 (clean machines) and Gate D; the first session that is not launch. Order of value per line:

1. **The theme** — `themes/studio/`: `theme.yaml` (extends `base`, one font, three settings: `accent`, `band`, `showreel`), `theme.css`, one part overridden (`header`, for the band-aware masthead). Bands, type, hairline cards, pill buttons, the marquee, the masthead — the tier-A half of §3 — before any tier-B line is written.
2. **§4.1 and §4.2** — `cover.media`, `figure.autoplay`, the lint rule, the reduced-motion rule in `base`'s sheet.
3. **§4.3** — `logo-wall`, its YAML, `base`'s renderer, `content_suggest_blocks` learns it (a list of image links is a wall), the corpus gains three.
4. **The tier-B half of §3** — reveals, counters, the two carousels, each under `@supports`, each checked against axe before the next.
5. **`page.media.kb`** in the page suite; the gallery to seven looks.
6. **snypd.rocks switches to it** — `pages/home.md` gains a showreel `cover` and a `logo-wall` (the harnesses it works in), and the front page is re-recorded for the hero film (the owed item).

**Exit:** seven looks green on the gallery, `page.media.kb` reported for all seven, `page.font.kb` under the lane, `tokens.learn` under budget, Firefox and Safari screenshots at 390 and 1280, `check theme` passing four themes, docs/01's vocabulary at fourteen, decision 181 amended in docs/11 §8, and one post: *The agency look at 0 KB* — the §2 table, with the seventh look's row linked.

If a session cannot be found: **item 1 alone, with none of §4, is a theme a stranger could write today** — bands, type, hairlines, marquee, masthead — and it is most of the feel. Ride it as a shelf entry.

---

## 7. Four calls

**Call 1 — a fourth bundled theme, or a community one?** Recommend: **bundled.** The claim in §1 is snypd's to make and the bench is what makes it; a community theme proves that a stranger *can*, which is a different and later claim (E8). Bundled means the seventh look is on the gallery and on `/themes` the day it lands.

**Call 2 — amend decision 181 for one autoplay per page (§4.2).** Recommend: **yes, as written** — four attributes the renderer owns, one per page by lint, poster under reduced motion. The alternative is a front page whose hero is a play button, which is not the feel that was asked for.

**Call 3 — `logo-wall` as primitive fourteen (§4.3).** Recommend: **yes.** It is the one honest gap, it is asked for by name, and it is three of fifteen sections. The `people` block and the pages vocabulary stay open (docs/06); this document does not propose them.

**Call 4 — the slot.** Recommend: **S29, first after Gate D**, because the hero film's re-shoot waits on it and because a launch-week post that says *"and here is the agency look at 0 KB"* is the strongest second post the campaign can have. Not before: nothing here is visible until the host builds with 0.1.5, and the token is still the gate.

---

## 8. Sources

The reference measurement is this session's (17 Sep 2026, Playwright, Chrome, 1280 px; `performance.getEntriesByType("resource")` for bytes by initiator; `document.querySelectorAll("video")` for the autoplay count; a walk of `document.styleSheets` for the property counts). Screenshots on this box under `.playwright-mcp/`, not committed. Browser status for every tier letter is [docs/14 §8](14-css-as-the-runtime.md#8-sources), unchanged since 14 Sep; the two rows marked *verify at the session* are the font's subset size and Safari's `::scroll-button()` behaviour on a `scroll-snap` row.
