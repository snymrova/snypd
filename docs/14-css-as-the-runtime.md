# 14 — CSS as the runtime: what the platform does for free in 2026, and what snypd should take

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 14 Sep 2026
**Asked for:** *"recently CSS has gained a lot of JS-equivalent features — see if those can be used to give an amazing UI/UX."*
**Scope:** a research read, not a session. It catalogues what CSS and HTML now do declaratively that a site used to buy with a script, checks every claim against the browsers shipping in September 2026, maps each one onto a snypd surface — a primitive, a part, a layout, the renderer — and proposes one session. **It decides nothing; §7 asks for three calls.**
**Constraint, stated first:** nothing here moves docs/11 §7's order. F1 is next, then S19d/S20, S21, S22/L1, L2. This document exists so that the gallery (E9) and the launch screenshots show a site that *moves*, not a site that is merely correct — and so that nothing added for that reason moves `page.js.kb` off 0.

> **Outcome, 14 Sep 2026 — built the same day as U7 (docs/11 §7b, decisions 160–165).** Sunny's answer to §7 was *"enter into coding"*, so calls 1 and 3 are taken: the tier rule is decision 161 and `check theme` enforces it as `css.enhancement-guarded`; U7 ran as session 8b, before F1, not after. Call 2 (no reader-side theme toggle) is docs/11 §10 question 7, still Sunny's. Shipped from §4: **4.4** the title morph, **4.1** sidenotes and hover cards, **4.2** the lightbox, **4.3** the accordion (with the `sections` affordance, decision 163), **4.6** the phone menu, **4.5** scroll-spy and the reading-progress line, and from §4.7 `scrollbar-gutter`, `text-box-trim` and the menu-item fix a screenshot found. **Not shipped, with the reason:** the sticky TOC rail (a grid row can't be spanned without a layout owning the column — U6b's objection stands), `content-visibility` on the entry list (it moved `page.cls` to 0.004 on the index; the gate caught it), the `view()` reveal on pullquotes (starts text at a fraction of its opacity and axe reads that as seven contrast failures; the gate caught it), the `sibling-index()` stagger (it fights the cross-document transition), `lh` rhythm and the `pre` scroll fade. One thing §4 did not anticipate: **`base` now ships a stylesheet** — behaviour only, in the `snypd.base` layer — because a `<ul popover>` is hidden everywhere and a fixed grey box when open unless *something* says otherwise, and that something could not be every theme (decision 160). Verified in Chrome 145 and Firefox 155 at 390 and 1280: sidenote, hover card, lightbox, accordion, phone sheet.

---

## 1. The stake

snypd's strongest claim is enforced by its own build since H2: **`page.js.kb` is 0 by default and the build refuses a page that breaks it** (E6). Every competitor in docs/12 ships a runtime — a hydration bundle, a theme's `main.js`, a cookie banner's worth of listeners — and every one of them uses it for the same eight things: page transitions, tooltips and footnote previews, accordions, lightboxes, carousels, a scroll-spied contents list, a reading-progress bar, and a menu that opens on a phone.

In 2026 the platform does all eight declaratively. Some are Baseline, some are two engines of three, some are Chrome alone. The question this document answers is not *can we* — it is **which ones, on which snypd surface, at what browser cost, and how the bench sees it**. The answer is the strongest form of the 0 KB claim: not *zero JS and therefore a plain site*, but **zero JS and a site that behaves like the ones that ship 200 KB to do the same**.

Two things make snypd unusually well placed. The renderer owns the markup — `base`'s primitives and parts are the only HTML there is, so a change to `figure.tsx` reaches every theme (D8). And the page suite already measures the three numbers that decide whether an enhancement was free: `page.js.kb` (0), `page.a11y.violations` (0, axe in the page), `page.cls` (0). Nothing proposed below may move any of them.

---

## 2. Where the themes stand today

What `themes/` already uses, counted:

| Feature | Uses | Where |
|---|---|---|
| `light-dark()` | 48 | every colour token, both themes (U6a) |
| `oklch()` incl. relative colour | 23 | both themes; X1's contrast gate reads it |
| `text-wrap: balance` / `pretty` | 6 | both themes |
| `@view-transition { navigation: auto }` | 4 | both themes, `none` under reduced motion (U6b, decision 138) |
| `@layer` | 1 | emitted by the build, not the theme (H0) |
| `color-scheme` | 1 | `editorial`, from a token |

Nothing else. No container queries (docs/11 §5 said why: nothing wanted one), no `popover`, no `<details>`, no `<dialog>`, no anchor positioning, no scroll-driven animation, no `@starting-style`, no `content-visibility`. The markup in `base` is deliberately plain: `faq` is `<section><h2>` + the body's `###` headings; `steps` is an `<ol>` with a counter; `toc` is an in-flow block (`technical` chose it over a rail because a rail needs a second column); footnotes are `<sup><a href="#fn-n">` and a `↩` back-link; `figure` is an `<img>` in a `<figure>`; `chart`/`diagram`/`flow` are SVG. `entries` is an `<ol reversed>` of title, date, description.

That plainness is the asset. Every proposal in §4 is a change to one of those files, and every theme inherits it.

---

## 3. The catalogue, by what it costs in browsers

Checked 14 Sep 2026 against the web.dev Baseline digests (Jan–May 2026), Chrome's CSS Wrapped 2025, MDN and caniuse. Three tiers, and the tier is the rule (§7, call 1):

- **A — Baseline.** All three engines, stable. May be used anywhere, including for something the reader needs.
- **B — Two of three.** Chrome and Safari, Firefox behind a flag or in progress. Use under `@supports`, and never for anything the reader needs to reach content — the fallback must be *the page as it is today*.
- **C — Chrome only.** Use only where the fallback is *nothing happens* and the reader cannot tell. Never load-bearing. The bench's page suite runs in Chrome, so a tier-C feature is **measured but not universal** — the number it produces says nothing about Firefox.

### 3.1 Tier A — Baseline, ship anywhere

| Feature | Since | Replaces (in JS) | snypd surface |
|---|---|---|---|
| `popover` attribute, `::backdrop`, `:popover-open` | Baseline 2024 / 2025 | every dropdown, menu, toast, hover card | header menu on a phone; footnote card |
| `@starting-style` + `transition-behavior: allow-discrete` | Baseline 2024 | "add class on next frame" entry animations | anything that opens: popover, details, dialog |
| **Invoker commands** — `<button commandfor command="show-modal|toggle-popover|close">` | Baseline late 2025 (Chrome 135, Firefox 144, Safari 26) | every `onclick` that opens a thing | lightbox, menu, footnote |
| `<dialog>` + `closedby="any"` | dialog Baseline 2022; `closedby` Chrome 134, Firefox 137, Safari reported — *verify at the session* | modal + focus trap + Esc + backdrop click | `figure` lightbox |
| `<details name="…">` exclusive accordion | Baseline 2024 | accordion libraries | `faq` |
| `::details-content`, `:open` | 2025 / 2026 | animating the accordion body | `faq` open animation |
| **Anchor positioning** — `anchor-name`, `position-anchor`, `position-area`, `position-try-fallbacks` | **Baseline 2026** (Chrome 125, Firefox 147 Jan 2026, Safari 18.2) | Floating UI, Popper, every tooltip library | footnote card anchored to its mark; TOC "you are here" marker |
| `:has()` | Baseline 2023 | class toggling from state | "a post with a cover", "an FAQ with one open", checkbox-driven state |
| Container size queries, `cqi` units | Baseline 2023 | ResizeObserver | sidenotes only when the column is wide enough; entry cards |
| Container **style** queries `@container style(--x)` | **Baseline May 2026** (Firefox 151) | variant props | a part that reads a token, not a class |
| `@scope` | **Baseline 2026** | BEM discipline | a stranger's theme scoping a part without touching `@layer` |
| `content-visibility: auto` + `contain-intrinsic-size` | Baseline 2024 (Firefox 125) | virtualised lists | long index pages, `entries`, big tables and `pre` |
| `@property` | Baseline 2024 | animating a gradient or a number via JS | reading progress as a registered `<percentage>`; animated counters in `stat` |
| `linear()` easing | Baseline 2023 | spring libraries | every transition here |
| `light-dark()`, `color-scheme` | Baseline 2024 | theme toggles (the reading half) | already shipped |
| `contrast-color()` | **Baseline Apr 2026** | "is this text readable on this fill" in JS | `on-accent` tokens; X1's gate must learn it or report *not checked* |
| `text-wrap: balance` | Baseline 2024 | balance-text.js | already shipped |
| `:user-invalid`, `<search>`, `field-sizing` | 2023 / 2026 / 2026 | form JS | **no snypd surface** — the site has no forms (decision 145 territory) |
| `lh` / `rlh` units | Widely available May 2026 | — | vertical rhythm in both themes (free) |
| `view-transition-class`, `:active-view-transition` | 2025 / Jan 2026 | — | styling the page *during* a transition |
| `backdrop-filter`, `scrollbar-gutter`, `text-decoration-skip-ink: all` | 2024 / 2024 / 2026 | — | masthead blur; no layout shift when a scrollbar appears |

### 3.2 Tier B — Chrome and Safari; Firefox flagged or in progress

| Feature | Chrome | Safari | Firefox | Replaces | snypd surface |
|---|---|---|---|---|---|
| **Cross-document view transitions** | 126 | 18.2 | same-document since 144; cross-document **in progress** | every SPA router's reason to exist | already shipped; §4.4 names the elements |
| **Scroll-driven animations** `animation-timeline: scroll() / view()` | 115 | 26 | flag only, **Interop 2026 priority** | IntersectionObserver reveals, progress bars, parallax | reading progress; masthead condensing; `pullquote`/`stat` reveal |
| **CSS carousels** `::scroll-marker`, `::scroll-button()`, `scroll-marker-group` | 135 | 26 | flag (138) | every carousel library | a gallery, *if* a gallery primitive ever exists (§5) |
| `text-box-trim` / `text-box-edge` | 133 | 18.2 | shipped 2026 (reported; verify at the session) | optical alignment hacks | headings and `stat` figures — likely tier A by the time it ships |
| `text-wrap: pretty` | 117 | 26 | not shipped | — | already shipped; degrades to `wrap` |
| `hidden="until-found"` | 102 | Technology Preview; stable pending | 139 | expand-on-find | `faq` closed answers findable with ⌘F — `<details>` already does this in Chrome and Firefox |

### 3.3 Tier C — Chrome only, September 2026

| Feature | Chrome | What it would do here | Verdict |
|---|---|---|---|
| `scroll-target-group: auto` + `:target-current` | 140 | **scroll-spy for the TOC in one declaration** | ship under `@supports` — the fallback is a TOC with no highlight, which is today |
| `@container scroll-state(stuck|snapped|scrollable)` | 133 | masthead that knows it is stuck; a "more below" shadow on a scrolling `pre` | ship the `pre` shadow under `@supports`; nothing else |
| `interpolate-size: allow-keywords` / `calc-size()` | 129 | animate `<details>` to `height: auto` | ship under `@supports`; Firefox/Safari snap open, which is today |
| `sibling-index()` / `sibling-count()` | 138 | staggered reveal of `entries` and `steps` without nth-child ladders | ship under `@supports`, purely decorative |
| `if()`, `@function` | 137 / 139 | ergonomics | **no** — nothing a theme author would thank us for yet |
| `corner-shape` (squircle, scoop) | 139 | a look | **no** — a theme's own business, not `base`'s |
| Customizable `<select>`, `interestfor`, `popover=hint`, `reading-flow`, typed `attr()` | 135–137 | forms, hover cards, focus order | **no surface**, or tier A does it (`interestfor` is the nicer footnote card; `:hover`/`:focus-within` + anchor is the Baseline one) |
| `display: masonry` | not shipped anywhere as of this check | a gallery layout | **watch** |

**What is not on any list, and why:** a reader-side theme toggle. `light-dark()` follows the OS, and a toggle that outlives the page needs storage, which needs a script. It is the one "amazing UX" item every CMS theme has and this one will not, and it should be a decision rather than an omission (§7, call 2).

---

## 4. What it buys snypd, by surface

Each of these is one file in `base` plus a few lines in each theme, inherited by every theme (D8), and each keeps the three numbers at 0.

### 4.1 Footnotes become sidenotes, and a card on narrow screens — `html.ts`

Today: `<sup><a href="#fn-n" id="fnref-n">n</a></sup>` and a `<section class="footnotes">` at the end. The reader jumps, reads, jumps back.

The renderer already holds every definition (`footnotes` map in `html.ts:47`). Emit the definition a second time, inline, beside its mark:

```html
<sup class="snypd-fnref"><a href="#fn-1" id="fnref-1" style="anchor-name: --fnref-1">1</a>
  <small class="snypd-fn-card" role="note" style="position-anchor: --fnref-1">…definition…</small></sup>
```

- **Wide column** (container query on the article, `@container (inline-size > 60rem)`): the card is a **Tufte sidenote** in the margin, always visible — `position: absolute; position-area: inline-end; ` and `position-try-fallbacks: flip-inline`. `editorial`'s 34 rem measure inside its `--breakout` track already leaves the margin.
- **Narrow column:** the card is hidden and appears on `:hover` / `:focus-within` of the mark, anchored above it, `position-try-fallbacks: flip-block` so it never leaves the viewport, `@starting-style` fade. Tap-to-open on touch is `:focus-within` because the mark is a link.
- The `<section class="footnotes">` stays — it is the accessible, printable version, and the one an older browser reads.

Cost: ~15 lines in `html.ts`, ~25 lines of CSS per theme, +the footnote's bytes once more per reference. A11y: `role="note"`, the mark stays a link, axe is quiet. This is the single change with the highest "how did they do that with no JS" per line.

### 4.2 `figure` gets a lightbox — `figure.tsx`

```html
<figure class="snypd-figure">
  <button class="snypd-figure-open" commandfor="lb-<hash>" command="show-modal" aria-label="View larger">
    <img src loading="lazy" decoding="async" width height>
  </button>
  <figcaption>…</figcaption>
  <dialog id="lb-<hash>" class="snypd-lightbox" closedby="any">
    <img src alt width height>
    <button commandfor="lb-<hash>" command="close">Close</button>
  </dialog>
</figure>
```

Zero script, Baseline since late 2025, focus trap and Esc for free from `<dialog>`, click-outside from `closedby="any"` (Chrome and Firefox; a Safari without it still closes on Esc and the button, which is the fallback rule). `::backdrop` blurs the page; `@starting-style` scales the image in; the same `view-transition-name` on both `<img>`s makes the small one *become* the large one in Chrome and Safari. The `<dialog>` costs bytes only when the page has a figure. Opt-out is a prop (`::figure{lightbox=false}`), not a setting — it is the author's call per image.

### 4.3 `faq` becomes an exclusive accordion — `faq.tsx`, one renderer affordance

`faq`'s body arrives rendered, so today the primitive cannot wrap each `###` question. It needs the split the way `toc` needed `page.headings` (decision 136): the renderer hands a primitive whose body is `###`-sectioned an array of `{ heading, html }` beside `body`. With it:

```html
<details name="faq-<id>" class="snypd-faq-item">
  <summary><h3>Question</h3></summary>
  <div class="snypd-faq-answer">…answer…</div>
</details>
```

`name=` makes it exclusive (one open at a time, Baseline 2024), `::details-content` + `@starting-style` animate the open, `interpolate-size` (tier C) animates to `auto` where it can and snaps where it cannot. Find-in-page opens the right answer in Chrome and Firefox. FAQPage schema unchanged. `open` on the first item is a prop. The `.md` twin is untouched — it is the source, and the source is `###` headings.

### 4.4 The cover morphs across the navigation — `entries.tsx`, `post.tsx`, `cover.tsx`

`@view-transition` is shipped, and today it cross-fades the whole page. The effect a reader remembers is the **shared element**: the title in the entry list *becomes* the `<h1>`, the cover thumbnail *becomes* the hero. That is one property on two elements — `view-transition-name: post-<slug>` on the entry's link and the post's title, `cover-<slug>` on the two images — emitted as a `style=""` attribute by the part (CSS in an attribute is not JavaScript; rule 13 does not see it, nor should it). Chrome and Safari animate; Firefox navigates as it always has. `view-transition-class: snypd-title` lets a theme set the timing for every title in one rule. **Cost: four lines of TSX, zero CSS required, and it is the launch video's opening shot.**

Two cautions from the field guides: a name must be unique on the page, so the *index* names only what is above the fold or the transition is a mess of 40 groups (the entry list names its first six); and `prefers-reduced-motion` already sets `navigation: none`.

### 4.5 The contents list learns where you are — `toc.tsx`, `technical/theme.css`

- **Scroll-spy** (tier C): `scroll-target-group: auto` on the `<ol>` and `a:target-current { color: var(--color-accent) }`. One rule, and in Chrome 140+ the current heading's entry is lit as the reader scrolls. Firefox and Safari: today's TOC.
- **A reading-progress line** (tier B) under the masthead: `@property --progress`, `animation: progress linear; animation-timeline: scroll(root)`, one `::after` scaled by `--progress`. Two engines; the third shows no line.
- **A sticky rail** at wide widths for `technical` is a container query away now (`@container (inline-size > 72rem)` on the article's wrapper) — the reason it was refused in U6b was the second column, and a container query is how a part earns the column only when it exists.

### 4.6 The masthead menu on a phone — `header.tsx`

Both themes pass overflow at 390 today because a menu of three to five items wraps. A site with nine items does not. `<button popovertarget="snypd-menu" class="snypd-menu-button">Menu</button>` shown only under `@media (max-width: 34rem)`, and `<ul popover id="snypd-menu">` — light-dismiss, Esc, focus management, all from the platform; `@starting-style` slides it in; `::backdrop` dims the page. On wide screens the theme overrides the UA's `[popover]:not(:popover-open) { display: none }` inside the same `@media` and the `<ul>` is the plain list it is today. Baseline 2024.

### 4.7 The small ones, free

- `content-visibility: auto; contain-intrinsic-size: auto 20rem` on `.snypd-entries > li`, `pre`, `table`, `.snypd-chart` — a 1,000-post index paints in the time of a 30-post one. (F1's `build.cold.1000` should have a page to look at.)
- `scrollbar-gutter: stable` on `html` — no 15 px shift when a long page appears.
- `lh` for every vertical space in `technical` — a theme whose measure is set in `ch` should have its rhythm in `lh`.
- `text-box: trim-both cap alphabetic` on `stat`'s number and on `h1` — the number sits on the baseline the designer meant; tier B today, A soon.
- `sibling-index()` stagger on `entries` and `steps` under `@supports` — decorative, Chrome only, costs nothing elsewhere.
- `@container scroll-state(scrollable: right)` on `pre` — a fade that says *there is more code to the right*; tier C, and exactly the fallback rule: without it, today's scrollbar.
- `pullquote` and `stat-row` reveal on `animation-timeline: view()` — a 200 ms opacity/translate as they enter the viewport. Tier B. This is the one to be careful with: it is the effect every marketing site over-uses. One primitive, one rule, `translate` ≤ 0.5 rem, never on prose.

---

## 5. What is *not* worth building

- **A gallery/carousel primitive.** The CSS carousel API is the first no-JS carousel that is accessible (`::scroll-marker` is a real tablist), and it is exactly what a `gallery` primitive would be. But docs/01's thirteen primitives have no gallery and nobody has asked; docs/07 principle 9 refuses a feature added to say a word. Recorded here so that *when* it is asked for, the answer is `scroll-snap` + `::scroll-marker`, two engines, zero JS.
- **A reader theme toggle** — needs storage (§3.3, §7 call 2).
- **Search** — a client-side index is JS by definition. Out, and `<search>` with it.
- **Sticky, condensing masthead** — `scroll-state(stuck)` is Chrome only and a masthead is load-bearing; `animation-timeline: scroll()` can shrink it in two engines, but a header that changes height under the reader's pointer is the kind of motion docs/11 §5 calls a screenshot-only bug. Not in `base`; a theme may.
- **Anything that changes the `.md` twin.** Every proposal above is HTML or CSS; the source is untouched (docs/01 §2).
- **Masonry.** Not shipped anywhere.

---

## 6. How the bench sees it, and what a stranger's theme is held to

- `page.js.kb` stays **0** — the point. A `style=""` attribute and a `<dialog>` are markup. If rule 13 or `scriptSites` ever flags `commandfor`/`popovertarget` as executable, that is a bug in the scanner, and the property tests (H4) would be the place to pin it: *an invoker attribute is never a script site.*
- `page.a11y.violations` stays **0** — every mechanism proposed is the platform's accessible one (`<dialog>`, `<details>`, `popover`, a `<button>` with a name). axe runs in the page and would say otherwise.
- `page.cls` stays **0** — `@starting-style` transitions move `opacity` and `transform`; `content-visibility` needs `contain-intrinsic-size` or it *causes* shift, which is why the two go together in §4.7.
- `page.bytes.kb` moves by the footnote duplication and the dialogs — a few hundred bytes on a page that has them; report, not budget.
- **A new `check theme` rule** is cheap and worth it: `css.enhancement-guarded` — any tier-B/C property used outside an `@supports` block is a finding, naming the line. The tier list lives in `render/src/check.ts` as data, revised when Baseline moves. It turns this document's rule into a machine's (E8's whole idea), and it is what stops a stranger's theme from hiding a menu behind `scroll-state()`.
- **`snypd://spec/primitives` and `build-theme`** should say what `base` now does — the lightbox and the accordion are affordances a theme's CSS is expected to style, and a theme author reading the prompt should learn `::backdrop` and `::details-content` are theirs to paint.

Interop: the page suite runs Chrome. That is fine for the three numbers, which are about *absence* (no script, no violation, no shift). It says nothing about whether Firefox shows the sidenote, and it should not pretend to. A screenshot pass at 390 and 1280 in Firefox belongs in the session's exit, by hand, the way U6b's did in Chrome.

---

## 7. Proposal — one session, and three calls

**U7 — the runtime pass.** After F1 and before S22/L1, so the gallery screenshots and the launch recording show it. One session, six items in §4, in this order of value per line: **4.4 cover morph → 4.1 sidenotes → 4.2 lightbox → 4.3 accordion → 4.6 phone menu → 4.5 TOC**, then §4.7 as the tail. The renderer affordance in 4.3 is the only non-trivial engineering; everything else is markup and CSS. Exit: `page.*` and `tech.*` unmoved at 0/0/0, `page.font.kb` unmoved, both themes screenshotted at 390 and 1280 in Chrome **and Firefox**, `check theme` passing all three themes with the new rule, docs/09's primitive contract updated, and one property added to H4's corpus: *an invoker attribute is not a script site.*

If a session cannot be found: **4.4 alone is a fifteen-minute change and the most visible thing on the shelf.** Ride it in S22.

**Call 1 — the tier rule.** Baseline → anywhere; two-engine → `@supports` and never load-bearing; Chrome-only → only where the fallback is *nothing happens*. Recommend: **mint it**, and make `check theme` enforce it (§6). It is the rule a stranger's theme will be judged by, and it is better written down before the first one arrives.

**Call 2 — no reader-side theme toggle, as a decision.** `light-dark()` follows the OS and a variation is the *site's* choice, not the reader's. A toggle needs storage, storage needs a script, and the claim comes first. Recommend: **decide it**, in the spirit of 145 — it is the second most common piece of well-meant advice we will get.

**Call 3 — U7's slot.** Recommend: **session 9b, after F1.** It costs one session against a calendar that has a week of slack (docs/11 §7). The alternative — 4.4 alone in S22 — costs nothing and is the recommendation if the slack is spent by then.

---

## 8. Sources

Browser status checked 14 Sep 2026: [web.dev Baseline digest, Jan 2026](https://web.dev/blog/baseline-digest-jan-2026) · [Apr 2026](https://web.dev/blog/baseline-digest-apr-2026) · [May 2026](https://web.dev/blog/baseline-digest-may-2026) · [modern.css — new on the Baseline](https://modern-css.com/whats-new/baseline/) · [Chrome CSS Wrapped 2025](https://chrome.dev/css-wrapped-2025/) · [Firefox intent to ship anchor positioning](https://groups.google.com/a/mozilla.org/g/dev-platform/c/B71NFNrZ8Lo/m/e1ZMg8fjCAAJ) · [caniuse: anchor positioning](https://caniuse.com/css-anchor-positioning) · [Firefox 148 release notes](https://developer.mozilla.org/Firefox/Releases/148) · [CSS-Tricks: cross-document view transitions](https://css-tricks.com/cross-document-view-transitions-part-1/) · [Bag of Tricks: view transitions in all major browsers](https://events-3bg.pages.dev/jotter/in-all-major-browsers/) · [Chrome: what's new in view transitions 2025](https://developer.chrome.com/blog/view-transitions-in-2025) · [MDN: view-transition-name](https://developer.mozilla.org/en-US/docs/Web/CSS/view-transition-name) · [Chrome: carousels with CSS](https://developer.chrome.com/blog/carousels-with-css) · [SitePoint: scroll-driven CSS carousels 2026](https://www.sitepoint.com/scrolldriven-css-in-2026-building-carousels-without-javascript/) · [MDN: scroll-target-group](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-target-group) · [caniuse: scroll-target-group](https://caniuse.com/mdn-css_properties_scroll-target-group) · [MDN: animation-timeline](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline) · [Mozilla Connect: scroll-driven animations](https://connect.mozilla.org/t5/ideas/implement-css-scroll-driven-animations-animation-timeline/idi-p/116931) · [MDN: interpolate-size](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/interpolate-size) · [web-features: interpolate-size](https://web-platform-dx.github.io/web-features-explorer/features/interpolate-size/) · [HTMHell: invoker commands](https://www.htmhell.dev/adventcalendar/2025/7/) · [CSS-Tricks: invoker commands](https://css-tricks.com/invoker-commands-additional-ways-to-work-with-dialog-popover-and-more/) · [MDN: container scroll-state queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Conditional_rules/Container_scroll-state_queries) · [caniuse: scroll-state stuck](https://caniuse.com/mdn-css_at-rules_container_scroll-state_queries_stuck) · [web-features: dialog closedby](https://web-platform-dx.github.io/web-features-explorer/features/dialog-closedby/) · [CSS-Tricks: hidden=until-found](https://css-tricks.com/covering-hiddenuntil-found/) · [caniuse: hidden until-found](https://caniuse.com/mdn-html_global_attributes_hidden_until-found_value) · [caniuse: text-box-trim](https://caniuse.com/mdn-css_properties_text-box-trim) · [caniuse: text-wrap pretty](https://caniuse.com/mdn-css_properties_text-wrap_pretty) · [MDN: sibling-index](https://developer.mozilla.org/docs/Web/CSS/sibling-index).

Where a row says *verify at the session*, a secondary source said it and a primary one was not fetched; nothing in §4 depends on such a row.
