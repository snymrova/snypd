# C — Craft: making pieces beautiful on any token set

Research stream C for docs/37 §3 ("the bar"). Researched 25 Sep 2026. Everything below is written for a
piece that may read only the theme contract (`packages/spec/defaults/theme-contract.yaml`) and may type
only `em ch % fr lh cqi vmax`, 1–3px and `0`. Every snippet keeps to that rule. Where the craft needs
something the contract doesn't have, it becomes a proposed optional token in §7.

Contents: §0 what the repo does today (and three shelf findings that matter more than any snippet) ·
§1 typography · §2 colour · §3 layout and rhythm · §4 motion and detail · §5 slot by slot, with
exemplars · §6 where to find references · §7 proposed tokens · §8 rules for a robust piece · sources.

---

## 0. The repo today, and three findings

I read `packages/core/src/seed.ts`, `packages/shelf/shelf.json`, `scripts/shelf-build.py` and
`packages/pieces/prose/*`. Seed: OKLCH, bg L 0.985 / 0.165, text/muted/accent solved to WCAG 2 ratios by
binary search on L with chroma refitted to gamut, strategies `restrained | balanced | expressive`, fluid
type from `ratio [1.2, 1.25]` and `base [17, 19]` at 390/1440 px, `measure: 66ch`, `space.1–6` fluid
multiples of the base. That is a sound base. Three shelf findings block craft that pieces would
otherwise use:

1. **The shelf has no italics.** All 16 faces are `style: normal`. Every `em`, `<cite>`, blockquote
   (`prose/book` sets `font-style: italic`) and caption gets a **synthesised oblique**. That is the single
   most visible sign of "not typeset" in long-form prose. Butterick, Standard Ebooks and Tufte all
   lean on a true italic. Instrument Serif's italic is half of why that face is chosen at all.
   *Recommendation:* ship an italic for every `role: text` face and for Instrument Serif. Budget it as a
   second file (~25–30 KB latin), loaded only when the page contains an `em`/`i`/`cite`/`blockquote`
   (the renderer knows). Until then, pieces should prefer `font-synthesis-style: none` plus a colour
   or weight change over a fake slant (see §8).
2. **Figure sets are stripped.** `FEATURES = "kern,liga,clig,calt"` (to save ~6 KB/face). So
   `font-variant-numeric: tabular-nums | oldstyle-nums` and `font-variant-caps: small-caps` do
   **nothing**, or worse, `small-caps` is synthesised (scaled caps, too light). Dates in a list, a
   changelog's version column, a stat row and a table all need `tnum`. *Recommendation:* keep `tnum`
   and `lnum` on every face (cheap: a second digit set, ~1–1.5 KB); keep `onum` + `pnum` + `smcp` +
   `c2sc` on the text serifs only (Source Serif 4, Crimson Pro, EB Garamond, Literata, Newsreader all
   have them); keep `ss01…` only where a kit names them. Record the kept features per face in
   `shelf.json` so a piece's `needs:` can say "tabular figures" and the generator can see if the face
   has them.
3. **Optical size is pinned.** Source Serif 4 is instanced at `opsz 16`, Bricolage at `opsz 96`. A
   pinned text opsz makes display headings look heavy-footed and blunt; a pinned display opsz makes
   captions spindly. *Recommendation:* for faces with an opsz axis keep the range (or at least two
   instances: text and display) and let `font-optical-sizing: auto` pick it. If the 40 KB cap forbids
   it, ship two instances as two `@font-face` rules on the same family with `size-adjust`-free
   `font-variation-settings` — or simply raise the cap for opsz faces (Newsreader, Literata, Fraunces,
   Source Serif 4, Bricolage, Inter).

A fourth, smaller one: **IBM Plex Serif is 400 only** and `prose/book` sets `font-synthesis-weight: none`
with headings at `600` — so a Plex Serif heading silently renders at 400. Pieces cannot know which
weights a face has; that is why §7 proposes `weight.heading` / `weight.strong` tokens written from the
shelf.

---

## 1. Typography

### 1.1 The canon, condensed to rules a piece can obey

**Butterick, *Practical Typography* — key rules** (<https://practicaltypography.com/summary-of-key-rules.html>)
- Body 15–25 px on the web; line spacing **120–145 %**; line length **45–90 characters**.
- Bold *or* italic, as little as possible, never together; never underline except links.
- All caps for less than a line only, with **5–12 % extra letterspacing** (→ `tracking.caps ≈ 0.06–0.1em`).
- First-line indent *or* space between paragraphs, not both.
- Kerning always on; hyphenation with justified text; minimise centred text.
- Headings: don't use more than 2–3 levels; make them distinct by space before them more than by size.

**Tufte CSS** (<https://edwardtufte.github.io/tufte-css/>)
- Body ~1.4 rem ET Book, off-white paper (`#fffff8`) and near-black text; the text column takes ~55 % of
  the width and the right ~45 % is the **margin for sidenotes and margin figures**.
- Sidenotes: number via CSS counters, a hidden checkbox toggles them inline on narrow screens; the note
  `float: right; clear: right; margin-right: -60%; width: 50%` — i.e. a negative margin puts it in the
  gutter. (§3.5 gives a grid-based version that needs no negative literal.)
- `.newthought` — the first words of a new section in small caps instead of a heading.
- Epigraphs, full-width figures, `font-variant-numeric: oldstyle-nums` in running text.

**Standard Ebooks Manual of Style** (<https://standardebooks.org/manual>, §8 Typography)
- Real quotes, real dashes (em-dash with no spaces; en-dash for ranges), ellipsis character with
  non-breaking spaces, `&nbsp;` in "Mr. Smith", "p. 7", after section numbers.
- Roman numerals and abbreviations in small caps (`<abbr>` → `font-variant-caps: all-small-caps`).
- Their CSS (open source, <https://github.com/standardebooks/tools> `core.css`) hyphenates, uses
  `text-indent: 1em` between paragraphs with zero margin, `hanging-punctuation` where available, and
  sets headings in small caps rather than bold.

**Robin Rendle, Craig Mod, Frank Chimero** — on web type specifically
- Rendle (<https://robinrendle.com>, *The Cascade* <https://css-tricks.com/author/robinrendle/>) — a
  site is a publication: typographic hierarchy by *size and space*, not ornament; "the details are
  the design" — underline offsets, `text-wrap`, real numerals; their own site is a single serif at a
  generous size with muted metadata in the UI face.
- Craig Mod (<https://craigmod.com/essays/>, "Fast Software, the Best Software", "Hyper Text") — the page
  as a book spread: huge margins, one generous serif at large size, images full-bleed, *speed* as part
  of the feel. Also "Subcompact Publishing" — small, fast, scrolling, clear edges.
- Frank Chimero, "The Web's Grain" (<https://frankchimero.com/blog/2015/the-webs-grain/>) and "Everything
  Easy is Hard Again" — design with the web's grain (edgelessness, fluidity) rather than against it;
  layouts that flow rather than jump at breakpoints — exactly the Utopia argument below.

### 1.2 Scales: Utopia fluid type and space

Utopia (<https://utopia.fyi/type/calculator>, <https://utopia.fyi/space/calculator>,
blog: <https://utopia.fyi/blog/designing-with-fluid-type-scales/>): pick a **min viewport** and **max
viewport**, a **base size** at each, and a **ratio** at each (small-screen ratio smaller, e.g.
1.2 → 1.333). Each step `n` is `base × ratio^n` at each end; the browser interpolates:

```
slope     = (maxSize − minSize) / (maxVW − minVW)
intercept = minSize − slope × minVW
step      = clamp(minSize/16 rem, intercept/16 rem + slope×100 vw, maxSize/16 rem)
```

This is what `seed.ts` already does (`ratio [1.2, 1.25]`, `base [17, 19]`). Craft notes:

- **Display wants a steeper large-screen ratio than body.** With 1.25 at 1440 the h1 is ~2.4× body; the
  "better page" in docs/37 §1 uses a display figure 4–6× body. Utopia's answer is that `size.display`
  is *several steps up* (step 5–6), not `h1 × 1.6`. Proposal: derive
  `size.display` from the same scale at step 5 (≈ 3.05× at 1.25, 4.2× at 1.333) and let kits choose
  `ratio` pairs from the classic modular set: 1.125 (major second, docs), 1.2 (minor third, notebook),
  1.25 (major third, editorial), 1.333 (fourth, magazine), 1.5 (fifth, studio/poster). References:
  <https://www.modularscale.com>, Tim Brown's "More Meaningful Typography" (A List Apart, 2011).
- **Space pairs.** Utopia's space scale is base × {0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6} with *pairs*
  (`--space-s-l`: s at 320, l at 1500) for a gutter that grows *faster* than the type. Our
  `space.1–6` are fluid singles; a piece can make a pair with `clamp(var(--space-3), 5cqi, var(--space-6))`
  (§3.1). A `space.gutter` token (§7) would make that the theme's decision, not each piece's.
- **Leading tightens as size grows.** 1.5–1.6 for body, ~1.2 for h2/h3, **1.0–1.1 for display**.
  `leading.tight` covers h1–h3; display needs its own (§7 `leading.display`). A robust formula a piece
  can use without a token: `line-height: calc(1em + 0.35rem)`-style — but rem is not allowed; the
  allowed equivalent is `line-height: calc(1.1em + 0.5ex)` … still `ex` is not on the list. So: token.

### 1.3 Vertical metrics: Capsize and `text-box`

- **Capsize** (<https://seek-oss.github.io/capsize/>) trims the space above cap height and below the
  baseline using the font's metrics, so a 32 px heading occupies exactly its cap height — spacing then
  means what it says. The shelf already records `capHeight`, `xHeight`, ascent/descent overrides —
  Capsize's inputs.
- **CSS `text-box`** is now the native version — **Baseline, newly available August 2026** (MDN,
  <https://developer.mozilla.org/en-US/docs/Web/CSS/text-box-trim>):

```css
/* A title on a cover, an eyebrow, a button: trim to cap height and baseline so optical space = CSS space. */
.snypd-cover h1, .snypd-eyebrow, .snypd-button {
  text-box: trim-both cap alphabetic;
}
```
Use it on single-line UI text (buttons, pills, eyebrows, masthead brand) and on display titles.
Don't use it on body paragraphs — it collapses the half-leading that keeps multi-line prose airy.

### 1.4 Line breaking

```css
h1, h2, h3, .snypd-subtitle, figcaption, .snypd-pullquote { text-wrap: balance; }
p, li, dd, blockquote { text-wrap: pretty; }
p { hyphens: auto; hyphenate-limit-chars: 6 3 3; }   /* needs <html lang>; Chromium honours the limit */
```
`balance` is Baseline 2024. `pretty` is Chrome 117+, Safari 26+; Firefox not yet (falls back to
normal wrapping, harmless). `hyphens: auto` only works with a correct `lang` — the renderer must emit it.
Don't hyphenate headings, UI text, or `prose/docs` (code identifiers).

### 1.5 Hanging punctuation

```css
.snypd-post { hanging-punctuation: first allow-end last; }   /* Safari only; harmless elsewhere */
/* Portable: hang the opening quote of a pull quote by its own width. */
.snypd-pullquote p:first-child::before { content: "“"; margin-inline-start: -0.45em; }
/* Hang list markers into the margin, as books do (Tufte, Bringhurst). */
.snypd-post ul, .snypd-post ol { padding-inline-start: 0; list-style-position: outside; }
```
The last rule needs the column to have room on its left (it does in a centred measure ≥ 390 px wide at
the gutter), otherwise keep `padding-inline-start: 1.35em` as `prose/book` does.

### 1.6 OpenType features (once the shelf keeps them — §0.2)

| Where | Feature | CSS |
|---|---|---|
| Running serif text | oldstyle proportional figures | `font-variant-numeric: oldstyle-nums proportional-nums` |
| Dates in lists, version columns, tables, stat values | tabular lining | `font-variant-numeric: tabular-nums lining-nums` |
| Headings, display | lining proportional | `font-variant-numeric: lining-nums proportional-nums` |
| Abbreviations, eyebrows, labels, `.newthought` | small caps | `font-variant-caps: all-small-caps` (with `font-synthesis-small-caps: none` so a face without `smcp` falls back to full caps rather than fake small caps — pair with `tracking.caps`) |
| Fractions in recipes/specs | `frac` | `font-variant-numeric: diagonal-fractions` |
| Face personality (Inter `ss01` open digits, `cv11` single-storey a; Instrument Sans `ss01`; Fraunces `WONK`) | stylistic sets | a **token** (`font.features.display`) — never typed in a piece |
| Code | disable ligatures unless the kit wants them | `font-variant-ligatures: none` on `code` (JetBrains Mono's ligatures are a taste call per kit) |

Always: `font-kerning: normal`. Never: `text-rendering: optimizeLegibility` on long pages (old Chrome
cost; with the features explicit it adds nothing). `font-synthesis-weight: none` is right — but then
the weight token must match what the face has (§7).

### 1.7 Optical sizing and axes

- `font-optical-sizing: auto` (default) maps `opsz` to the used px size — only if the axis ships.
- Axes worth exposing as **tokens**, not piece literals:
  - `wght` — `weight.body`, `weight.heading`, `weight.display`, `weight.strong` (§7). In **dark mode**,
    light text on dark halates and reads ~20–30 units heavier; a variable face lets the theme drop
    `weight.body` from 400 to ~370 in dark (a dark-mode-only token value, the way colour tokens have two).
  - `wdth` — Bricolage (75–100), Instrument Sans (75–100), IBM Plex Sans (85–100), Mona Sans /
    Hubot Sans (75–125): a condensed display (`width.display: 80`) is a large part of the "poster" look.
  - `opsz` — never a token; `auto`. Exception: a display face used *small* (a masthead brand at 1 em in
    Fraunces) looks better with its display opsz forced: `font-variation-settings: "opsz" 144` is a
    literal number; propose `font.display-variation` token so the kit decides.
  - Face-specific (Fraunces `SOFT` 0–100, `WONK` 0/1; Recursive `CASL`, `MONO`) — the same string token.

### 1.8 Pairing principles

1. **Contrast one axis, share another.** A high-contrast display serif (Instrument Serif, Gloock,
   Fraunces @ opsz 144) over a neutral text serif or a grotesque; share x-height ratio and era.
2. **Match x-heights.** The shelf records `xHeight`: Source Serif 0.475, Instrument Serif ≈ 0.45,
   Inter 0.545. Where text and UI faces sit on one line (a byline in the UI face next to prose),
   `font-size-adjust` with the body's x-height aligns them — a `font.body-xheight` token (§7):
   `.snypd-byline, code { font-size-adjust: ex-height var(--font-body-xheight); }` — inline code in a
   serif paragraph stops looking too big, the classic tell.
3. **Superfamilies are safe defaults**: IBM Plex (Sans/Serif/Mono), Source (Serif 4/Sans 3/Code Pro),
   Geist (Sans/Mono), Atkinson Hyperlegible (Next/Mono), Space (Grotesk/Mono).
4. **One display voice per page.** docs/37 §1: the better page used a second face for display. The rule
   is *one* extra — display face for h1/cover/numbers, body face for h2–h3 or display face for h2 but
   never a third.
5. **Mono is a third voice, keep it quiet**: slightly smaller (0.9em) or x-height-matched, `muted`
   syntax colours, no ligatures by default.

### 1.9 The face shelf — what it should contain (OFL, 2025–26)

Current 16: Source Serif 4, Crimson Pro, Lora, IBM Plex Serif, Instrument Serif, Young Serif, Gloock,
Bitter, Instrument Sans, Work Sans, IBM Plex Sans, Source Sans 3, Bricolage Grotesque, Big Shoulders,
Barlow Condensed, IBM Plex Mono. Gaps: no italics, one mono at one weight, no neo-grotesque workhorse
(Inter/Geist), no opsz-capable editorial serif besides Source Serif, no Garamond (book), no
high-legibility option.

Proposed shelf (~26 faces; ★ = add; axes = keep variable):

| id | role | axes / weights to keep | italic | why |
|---|---|---|---|---|
| source-serif-4 | text serif | opsz 8–60, wght 400–700 | ★ | Keep; un-pin opsz. Workhorse, has onum/smcp |
| ★ newsreader | text serif | opsz 6–72, wght 300–700 | ★ | Production Type's news serif; the most "designed" free text serif of 2024–26; display opsz is lovely |
| ★ literata | text serif | opsz 7–72, wght 300–800 | ★ | Google Play Books' face; long reading, dark-mode sturdy |
| ★ eb-garamond | text serif | wght 400–800 | ★ | The book kit; real smcp/onum — Standard Ebooks register |
| crimson-pro | text serif | wght | ★ | Keep (Garamond-ish, compact) |
| lora | text serif | wght | ★ | Keep (calligraphic, friendly) |
| ibm-plex-serif | text serif | ★ wght 400/600 | ★ | Needs a bold for headings |
| instrument-serif | display serif | static 400 | ★ **italic is essential** | The 2024–26 editorial display face |
| ★ fraunces | display serif | opsz 9–144, wght 300–900, SOFT, WONK | ★ | "Old-style soft" — the magazine/warm kit |
| gloock, young-serif | display serif | static | — | Keep |
| ★ playfair (2.0) | display serif | opsz, wght | ★ | High-contrast Didone that holds at huge sizes (verify axes on GF before adding) |
| ★ inter | text/UI sans | opsz 14–32, wght 400–700 | ★ | Inter 4: opsz axis gives "Inter Display" for free; `cv11`, `ss01`, tnum |
| ★ geist | text/UI sans | wght 400–700 | — | Vercel's, OFL; technical kit |
| ★ hanken-grotesk | text sans | wght | ★ | Warmer neo-grotesque; pairs with serif display |
| instrument-sans | text sans | wdth 75–100, wght | ★ | Keep; expose wdth |
| ibm-plex-sans | text sans | wdth 85–100, wght | ★ | Keep |
| work-sans, source-sans-3 | text sans | wght | ★ | Keep |
| ★ space-grotesk | display/UI sans | wght 300–700 | — | Quirky-technical kit |
| bricolage-grotesque | display sans | opsz 12–96, wdth 75–100, wght | — | Keep; expose wdth |
| big-shoulders, barlow-condensed | display sans | wght | — | Keep (loud kit) |
| ★ atkinson-hyperlegible-next | text sans | wght 200–800 | ★ | Accessibility kit (2025, Braille Institute) |
| ibm-plex-mono | mono | ★ 400/600 | ★ | Keep, add bold+italic |
| ★ jetbrains-mono | mono | wght 400–700 | ★ | Best code legibility; optional ligatures |
| ★ geist-mono | mono | wght | — | Pairs with Geist/Inter |
| ★ commit-mono | mono | wght (OFL, github eigilnikolajsen/commit-mono) | ★ | Neutral, "smart kerning" — the quiet mono |
| ★ martian-mono or space-mono | mono | wdth, wght | — | A mono with character for display/labels |

Suggested **pairings** (text + display + mono), each a candidate kit face line:

| Kit feel | body | display/heading | mono | notes |
|---|---|---|---|---|
| notebook (light, paper, calm) | Newsreader | Instrument Serif (+ italic) | Commit Mono | the docs/37 trial winner shape |
| book | EB Garamond | EB Garamond small caps headings | IBM Plex Mono | Standard Ebooks register; onum, smcp |
| magazine | Literata | Fraunces opsz 144, SOFT 50 | JetBrains Mono | warm, big drop numbers |
| reference / docs | Inter | Inter @ opsz 32 (Inter Display) | JetBrains Mono / Geist Mono | tnum everywhere |
| product / changelog (dark sans) | Geist | Geist 600, tracking −0.03em | Geist Mono | Vercel/Linear register |
| studio | Instrument Sans | Bricolage Grotesque wdth 75–85 | Commit Mono | poster headlines |
| ledger | IBM Plex Sans | IBM Plex Serif | IBM Plex Mono | superfamily |
| loud | Hanken Grotesk | Big Shoulders / Barlow Condensed | Space Mono | accent-as-ground kits |
| accessible | Atkinson Hyperlegible Next | same, 700 | Atkinson Hyperlegible Mono | |
| quirky tech | Space Grotesk | Space Grotesk 700 | Space Mono | |

Where to check pairings in use: Typewolf (<https://www.typewolf.com>, "Google Fonts" and "Free Font"
lists, per-face "in use"), Fonts In Use (<https://fontsinuse.com>), Google Fonts' own pairing pages
(<https://fonts.google.com/knowledge>).

---

## 2. Colour

### 2.1 Tools and what to take from each

- **oklch.com** (Evil Martians, <https://oklch.com>) — the picker; shows the sRGB/P3 gamut boundary per
  L/H. Their article "Better dynamic themes in Tailwind with OKLCH"
  (<https://evilmartians.com/chronicles/better-dynamic-themes-in-tailwind-with-oklch-color-magic>)
  gives fixed L steps for an 11-step scale — `97.78 93.56 88.11 82.67 74.22 64.78 57.33 46.89 39.44 32
  23.78` — and a *fixed* chroma curve `0.0108 0.0321 0.0609 0.0908 0.1398 0.1472 0.1299 0.1067 0.0898
  0.0726 0.054` chosen so every hue fits the gamut: **constant chroma per step across hues** gives
  palettes that look equally saturated whatever the seed. "Max chroma" instead gives uneven brightness.
- **Harmonizer** (<https://harmonizer.evilmartians.com>, <https://github.com/evilmartians/harmonizer>) —
  OKLCH + **APCA**: each level has a fixed *APCA contrast* against the background rather than a fixed L,
  so "level 7 on any hue has the same text contrast". Their calculator APCACH
  (<https://github.com/antiflasher/apcach>) solves L for a target Lc at a given C/H — the APCA analogue of
  what `seed.ts` does with WCAG ratios.
- **Radix Colors** (<https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>,
  custom generator <https://www.radix-ui.com/colors/custom>) — 12 steps with *semantics*:
  1 app bg · 2 subtle bg · 3 element bg · 4 hovered element bg · 5 active/selected bg · 6 subtle
  borders/separators · 7 element border & focus ring · 8 hovered border · 9 solid bg (the "brand" step)
  · 10 hovered solid · 11 low-contrast text · 12 high-contrast text. Dark scales are designed, not
  inverted: step 1 is near-black but tinted, step 9 stays the same brand colour in both.
- **Adobe Leonardo** (<https://leonardocolor.io>, <https://github.com/adobe/leonardo>) — you ask for
  *target contrast ratios* (e.g. 1.05, 1.25, 1.5, 3, 4.5, 7, 12) and it solves colours; the whole theme
  moves with a single "brightness"/"contrast" slider, which is exactly how light/dark are one theme.
- **Huetone** (<https://huetone.ardov.me>, Alexey Ardov) — edit a palette as a hue × step grid, see APCA
  per cell; shows the lesson that **L per step should be equal across hues** (perceptual lightness
  lines up) while chroma follows each hue's gamut.
- **APCA** (<https://apcacontrast.com>, <https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell>) —
  Lc values: **90** preferred body text, **75** minimum body, **60** minimum for other content text
  (≥ ~24 px or bold ≥ 16), **45** large headings/icons, **30** minimum for any non-text that must be seen
  (placeholder, disabled), **15** the "invisible" threshold (hairlines ≥ 15 to exist). APCA is polarity
  aware: light-on-dark gets less contrast for the same WCAG ratio, which is why dark-mode muted text
  that passes WCAG 4.5:1 often looks too faint, and mid-tone orange on white that fails WCAG looks fine.
  *Recommendation:* keep WCAG 2.2 as the legal gate (it is), **add APCA as a second, taste gate** in
  `seed.ts`: text Lc ≥ 75, muted ≥ 60, accent-as-link ≥ 60, border ≥ 15 (so hairlines never vanish), and
  flag (not fail) a dark theme whose text Lc > 100 (too harsh; pure white on near-black).

### 2.2 Formulas for one seed → a beautiful palette

Notation: seed = (Ls, Cs, H). `Cmax(L, H)` = most chroma sRGB (or P3) shows at L, H (already in
`seed.ts` as `fit`).

1. **Relative chroma is what stays beautiful.** Take `k = Cs / Cmax(Ls, H)` (how saturated the seed is
   *for its lightness and hue*). Every accent-family step uses `C = k × Cmax(L_step, H)` —
   yellows then stay yellow at dark L, blues don't clip at high L. (This is OKHSL's idea; Huetone and
   Harmonizer both converge on it.)
2. **Tinted neutrals.** Neutral steps take the **seed hue** at tiny chroma: bg 0.004–0.022 (as now),
   border ~1.5× bg chroma, text 0.01–0.02. Two refinements that make neutrals look intentional:
   - **Hue shift toward warm in light, cool in dark** — very small (±8–15° towards 70° warm or 250° cool)
     only when the seed hue is far from both; paper feels warm, night feels blue. Optional per strategy.
   - **Chroma rises as L falls toward the middle and falls at the ends** — near-white and near-black
     cannot carry chroma without looking dirty; `C_neutral(L) = c0 × 4 × L × (1 − L)` (a parabola that
     is 0 at L=0 and L=1, c0 at L=0.5) keeps tints clean at the extremes.
3. **The ladder (Radix semantics on our tokens).** Suggested light / dark L targets, solved against the
   contrast gates as `seed.ts` does:

| Radix step | our token | light L | dark L | note |
|---|---|---|---|---|
| 1 | color.bg | 0.985 | 0.165 | as now |
| 2 | color.surface | bg − 0.02…0.035 | bg + 0.035…0.05 | dark: elevation is *lighter* |
| 3–4 | ★ color.tint (accent @ low C) | 0.95 | 0.24 | callout, selection, highlight, hover row |
| 6 | ★ color.hairline | bg − 0.06 | bg + 0.07 | table rules, list separators (APCA Lc ≥ 15) |
| 7 | color.border | bg − 0.09 | bg + 0.10 | inputs, cards, focus ring fallback (3:1 for non-text UI) |
| 9 | color.accent | seed L if passes | seed L raised to pass, C × 0.85–0.9 | dark: raise L, *drop* C a little — saturated colour vibrates on black (Helmholtz–Kohlrausch) |
| 10 | ★ color.accent-hover | accent L − 0.05 | accent L + 0.05 | hover state without a piece doing colour maths |
| 11 | color.muted | solved to 4.5:1 / Lc 60 | same | |
| 12 | color.text | 0.22 (Lc ≥ 90) | 0.93 (never 1.0) | as now |

4. **Dark mode that isn't inverted** (checklist): bg not black (L 0.14–0.18); text not white (L ≤ 0.94);
   surfaces go *up* in L; accent L up and C down; shadows become *lighter borders* or disappear;
   images slightly dimmed (`filter: brightness(0.92)` is not a length — allowed) and never on a pure
   white card; body weight a hair lighter (§1.7).
5. **Accent strategies** (our `restrained | balanced | expressive`; docs/37 speaks of restrained /
   committed / loud):
   - **Restrained** — accent only on links, focus, one mark per view; neutrals nearly grey (C ≤ 0.005).
     Links may even be `color.text` with an accent underline (Butterick, Rendle).
   - **Committed / balanced** — accent on links, headings' marks, rules, eyebrow, active nav; neutral
     tint visible (C ~0.01).
   - **Loud / expressive** — accent **as a ground**: a masthead band, a cover, a CTA band, the selection;
     text on it is `color.on-accent`. Needs `color.accent` solved so on-accent reaches 4.5:1 *both* ways
     (it does today). Area rule: the accent ground should be ≤ ~1/3 of any viewport or it becomes the
     background and every other colour is wrong.

### 2.3 CSS: derived colours a piece may compute (no literals)

```css
/* Tints and hairlines from tokens only. color-mix in oklch keeps hue; in oklab avoids hue drift on mixes
   with near-neutrals — prefer oklab for mixing toward bg, oklch for lightening an accent. */
.snypd-callout { background: color-mix(in oklab, var(--color-accent) 8%, var(--color-bg)); }
.snypd-entries li + li { border-block-start: 1px solid color-mix(in oklab, var(--color-border) 60%, var(--color-bg)); }
::selection { background: color-mix(in oklab, var(--color-accent) 28%, var(--color-bg)); color: var(--color-text); }
a:hover { color: color-mix(in oklch, var(--color-accent) 85%, var(--color-text)); }
```
Caveat: 8 % accent on bg is a very different tint on a loud accent vs a restrained one — this is why
`color.tint` should be a seed-solved token (§7), with the `color-mix` above as its derive default.

---

## 3. Layout and rhythm

### 3.1 The page grid with named-line breakouts

Sources: Josh Comeau, "Full-Bleed Layout Using CSS Grid" (<https://www.joshwcomeau.com/css/full-bleed/>);
Ryan Mulligan, "Layout Breakouts" (<https://ryanmulligan.dev/blog/layout-breakouts/>) — named lines
`full / feature / popout / content`, gap `clamp(1rem, 6vw, 3rem)`, content `min(50ch, 100% − gap×2)`,
popout `minmax(0, 2rem)`, feature `minmax(0, 5rem)`; Kevin Powell's variant; Bramus's subgrid notes.
Rewritten on our tokens (no rem, no vw):

```css
.snypd-post {
  /* cqi with no container ancestor resolves against the small viewport — a vw that is allowed. */
  --gutter: clamp(var(--space-3), 5cqi, var(--space-6));
  --wing: calc((var(--measure-breakout) - var(--measure)) / 2);
  display: grid;
  grid-template-columns:
    [full-start] minmax(var(--gutter), 1fr)
    [wide-start] minmax(0, var(--wing))
    [content-start] min(var(--measure), 100% - var(--gutter) * 2) [content-end]
    minmax(0, var(--wing)) [wide-end]
    minmax(var(--gutter), 1fr) [full-end];
}
.snypd-post > * { grid-column: content; }
.snypd-post > :is(.snypd-figure, .snypd-chart, .snypd-diagram, table, pre) { grid-column: wide; }
.snypd-post > :is(.snypd-cover, .snypd-still, .snypd-marquee) { grid-column: full; }
```
Details: a `wide` figure's **caption stays at content width** (`figcaption { max-inline-size:
var(--measure); margin-inline: auto }`) — the image breaks out, the words don't. Tables/code in `wide`
get `overflow-x: auto` with a `.snypd-scroll` shadow cue.

### 3.2 Every Layout primitives (<https://every-layout.dev/layouts/>) in token form

Stack, Box, Center, Cluster, Sidebar, Switcher, Cover, Grid, Frame, Reel, Imposter, Icon, Container.
The ones our slots need:

```css
/* Stack — flow space from tokens; the owl selector. */
.snypd-post > * + * { margin-block-start: var(--flow, var(--space-3)); }
.snypd-post > :is(h2, h3) { --flow: var(--space-5); }            /* space before > space after */
.snypd-post > :is(h2, h3) + * { --flow: var(--space-2); }

/* Cluster — tags, meta rows, footer links. */
.snypd-terms, .snypd-social { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); align-items: baseline; }

/* Sidebar — date in a margin column that collapses to a line when narrow (entries/rows). */
.snypd-entries li { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); }
.snypd-entries time { flex-basis: 8em; flex-grow: 1; }
.snypd-entries a    { flex-basis: 0; flex-grow: 999; min-inline-size: 60%; }

/* Switcher — stat row / post-foot: all in a row until each would be narrower than 14em. */
.snypd-stat-row { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.snypd-stat-row > * { flex-grow: 1; flex-basis: calc((28em - 100%) * 999); }

/* Grid — cards that never go below a readable width and never overflow. */
.snypd-entries.cards { display: grid; gap: var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(min(18em, 100%), 1fr)); }

/* Cover — a hero whose title sits in the optical centre. */
.snypd-cover { display: flex; flex-direction: column; min-block-size: 70vmax; padding: var(--space-5); }
.snypd-cover > h1 { margin-block: auto; }

/* Frame — media at a fixed ratio, cropped. */
.snypd-still { aspect-ratio: 16 / 9; overflow: hidden; }
.snypd-still > img { inline-size: 100%; block-size: 100%; object-fit: cover; }

/* Reel — horizontal scroller for a logo wall on phones. */
.snypd-logo-wall { display: flex; gap: var(--space-5); overflow-x: auto; scroll-snap-type: x proximity; }
```
(`min-block-size: 70vmax` — vmax is on the list; `vh`/`svh` are not. Consider allowing `svh`/`dvh`: a
cover wants "most of the first screen", and on phones `vmax` = height — works, but on a 1280×800 desktop
`70vmax` = 896 px > the viewport. See §7 on units.)

### 3.3 Subgrid

Cards in a row whose titles, excerpts and dates line up across cards:
```css
.snypd-entries.cards > li { display: grid; grid-row: span 3; grid-template-rows: subgrid; gap: var(--space-2); }
```
Baseline 2023. Also for a definition-list "ledger": `dl { display: grid; grid-template-columns: max-content 1fr }`
with `div { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid }`.

### 3.4 Container queries and `cqi`

- Make `main`, the home bands and cards containers: `container-type: inline-size`. Then a piece's
  layout reacts to **its own box**, not the viewport — essential when the same entries piece sits in a
  wide band and in a narrow sidebar.
- **Gotcha: container/media query conditions cannot read `var()`.** `@container (width > var(--measure))`
  is invalid. Breakpoints must be literals — and `em` there means the *initial* font size (16 px), not
  the token. So a piece writes `@container (width > 40em)`; that's within the literal rule.
- `cqi` for fluid sizes inside a component: `font-size: clamp(var(--size-h3), 6cqi, var(--size-display))`
  makes a card title or a cover title scale with its card. Keep a token at both ends so the theme's
  scale still bounds it.

### 3.5 Vertical rhythm with `lh`, and margin notes

- `lh` (Baseline 2023) = the element's computed line height. `margin-block: 1lh` on paragraphs gives a
  true baseline-ish rhythm; `padding-block: 0.5lh` on a callout keeps it on the beat. Headings have a
  different `lh`, so use **`rlh`** (root line height) for space around headings — `rlh` is not on our
  list; **propose adding `rlh`** (and `svh`/`dvh`, §7).
- **Sidenotes on grid** (Tufte look without negative margins). snypd renders footnotes as `.footnotes`
  plus `.snypd-fn-card`; a sidenote piece moves them into a margin track at wide containers:

```css
@container post (width > 62em) {
  .snypd-post { grid-template-columns:
      [full-start] minmax(var(--gutter), 1fr)
      [content-start] min(var(--measure), 100%) [content-end]
      var(--space-5)
      [margin-start] minmax(0, calc(var(--measure) * 0.45)) [margin-end]
      minmax(var(--gutter), 1fr) [full-end]; }
  .snypd-fn-card { grid-column: margin; font-size: var(--size-small); line-height: var(--leading-tight);
                   color: var(--color-muted); align-self: start; }
}
```
Gwern's sidenotes.js (<https://gwern.net/sidenote>, design notes <https://gwern.net/design>) solves
collisions (two notes too close) by pushing later notes down — a JS step; CSS alone can't. Acceptable
for most prose; note it in the piece's `line:`.

---

## 4. Motion and detail

### 4.1 View transitions (cross-document)

Chrome/Edge 126+, Safari 18.2+; **Firefox not on by default** (Nightly/flag as of mid-2026) — pure
progressive enhancement, which is the right posture for an SSG.
```css
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
}
::view-transition-group(.snypd-title) { animation-duration: var(--motion-duration); animation-timing-function: var(--motion-ease); }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: var(--motion-quick); }
```
Put the `@view-transition` rule *inside* the reduced-motion query rather than overriding it outside.
Name only one or two things (`view-transition-name` on the title and the cover image): too many named
elements = a jittery, slow page. Unique names per page: `view-transition-name: match-element` (Chrome
137+, Safari 18.4?) or the renderer writes `style="view-transition-name: t-<slug>"`.

### 4.2 Scroll-driven animations

Chrome 115+, Safari 26 (Sept 2025); Firefox behind a flag as of 152. Always inside `@supports` and the
motion query:
```css
@supports (animation-timeline: scroll()) {
  @media (prefers-reduced-motion: no-preference) {
    .snypd-masthead::after {                      /* reading progress hairline */
      content: ""; position: absolute; inset-inline: 0; inset-block-end: 0; block-size: 2px;
      background: var(--color-accent); transform-origin: 0 50%;
      animation: snypd-grow linear both; animation-timeline: scroll(root);
    }
    .snypd-figure { animation: snypd-rise linear both; animation-timeline: view(); animation-range: entry 0% entry 60%; }
  }
}
@keyframes snypd-grow { from { scale: 0 1; } to { scale: 1 1; } }
@keyframes snypd-rise { from { opacity: 0; translate: 0 1lh; } }
```
Taste: animate **opacity + a small translate (≤ 1lh)**; never scale text, never animate layout. Entrance
effects on every block read as a template; reserve them for figures and the home bands.

### 4.3 `@starting-style` and discrete transitions (Baseline 2024)

Menu, details, lightbox, `popover`:
```css
#snypd-menu {
  transition: opacity var(--motion-quick) var(--motion-ease), translate var(--motion-quick) var(--motion-ease),
              display var(--motion-quick) allow-discrete, overlay var(--motion-quick) allow-discrete;
}
#snypd-menu:popover-open { opacity: 1; translate: 0 0; }
@starting-style { #snypd-menu:popover-open { opacity: 0; translate: 0 -0.5em; } }
details::details-content { transition: content-visibility var(--motion-quick) allow-discrete, block-size var(--motion-quick); block-size: 0; overflow: clip; }
details[open]::details-content { block-size: auto; }   /* needs interpolate-size: allow-keywords on :root (Chromium) */
@media (prefers-reduced-motion: reduce) { *, ::before, ::after { transition-duration: 0s !important; animation: none !important; } }
```
(`0s` — a time literal; the contract bans times. Either allow `0s`/`0ms` as "no time", like `0` for
lengths, or write `transition: none`.)

### 4.4 The micro-details (designed vs generic)

- **Links**: `text-underline-offset: 0.18em; text-decoration-thickness: from-font` (or `1px`);
  `text-decoration-skip-ink: auto`; underline colour at ~35 % until hover (as `prose/book` does). In
  headings and nav, no underline, colour change on hover. Visited colour is a restrained-kit nicety:
  `a:visited { text-decoration-color: color-mix(in oklab, var(--color-muted) 50%, transparent) }`.
- **Focus**: `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` — and on
  a loud accent ground switch to `var(--color-on-accent)`. WCAG 2.4.13 wants ≥ 2 CSS px and 3:1 against
  adjacent colours; a `color.focus` token (§7) lets the seed guarantee it.
- **Hairlines**: 1px in `color.hairline` (Radix 6) for separators, 1px `color.border` (Radix 7) for
  boxes. On dark themes hairlines should be *lighter* than bg, not darker (they are, via tokens).
- **Figure captions**: `size.small`, `color.muted`, `leading.tight`, `text-wrap: pretty`, left-aligned to
  the text column, **a caption label in small caps or the UI face** ("Fig. 3"), gap `var(--space-2)`.
  Tufte puts captions in the margin beside the figure — the sidenote grid above allows it.
- **Tabular dates**: `time { font-variant-numeric: tabular-nums lining-nums; }` in lists; dates in
  `color.muted`, UI face, `size.small`; right-aligned in a fixed `ch` column. Format "25 Sep 2026" or
  "2026-09-25" — never both on one site.
- **Small-caps labels / eyebrows**: `font-variant-caps: all-small-caps; letter-spacing: var(--tracking-caps)`
  — or with a face without `smcp`: `text-transform: uppercase; font-size: 0.78em; letter-spacing: 0.08em`
  (all allowed literals). Use the **UI face** for labels, not the body serif.
- **Display tracking**: large sizes want negative tracking (−0.01 to −0.03em); tiny sizes and caps want
  positive. Never letter-space lowercase body text.
- **Numbers as a feature** (stats): display face, lining figures, `tnum` only if in a column.
- **Image treatments**: inner hairline so a white image on a white page has an edge —
  `img { outline: 1px solid color-mix(in oklab, var(--color-text) 8%, transparent); outline-offset: -1px; border-radius: var(--radius); }`
  (Vercel/Apple docs do this). Dark theme: `img:not([src$=".svg"]) { filter: brightness(0.92); }`.
  Placeholder while loading: `background: var(--color-surface)` and `aspect-ratio` from the renderer.
- **Selection**: tinted, text colour kept (snippet §2.3).
- **Scrollbars**: `scrollbar-color: var(--color-border) transparent; scrollbar-gutter: stable`.
- **Rules between sections**: `hr` as `1px` hairline at content width, or a centred "⁂" / "* * *"
  asterism (Standard Ebooks) in `color.muted` for a book kit.
- **Quotes & dashes**: rendering concern (smartypants in the renderer), but the piece should set
  `quotes: "“" "”" "‘" "’"` per `lang`.
- **Print**: `@media print` — black text, no backdrop, links followed by URL; Tufte and Butterick both do.

---

## 5. Slot by slot — what excellent looks like, with exemplars

For each slot: the bar in one or two lines, what a piece must survive, and 2–3 real pages worth
learning from. (URLs are sites I know by reputation and structure; each should be re-opened and noted in
`refs:` when drawing — the pages change.)

| slot | what excellent looks like | exemplars |
|---|---|---|
| **masthead** | Brand set small and exact (UI face, weight contrast or display face at text size), nav as a quiet cluster, one hairline or none; sticky only if it shrinks; reading progress as a 2px line. Survives: a long site name, 7 nav items at 390, a loud accent band. | Works in Progress <https://worksinprogress.co> (nameplate + issue), Linear <https://linear.app> (quiet bar, blur), Robin Rendle <https://robinrendle.com>, Standard Ebooks <https://standardebooks.org> |
| **home** | A point of view in the first screen: one display statement or one featured item, then a rhythm of bands of *different* densities (not three equal card rows). Survives: 0, 1 and 40 entries. | Stripe Press <https://press.stripe.com>, Klim Type Foundry <https://klim.co.nz>, Are.na <https://www.are.na/editorial>, Paco Coursey <https://paco.me> |
| **list** (index/archive) | A ruled index: date in a margin column (tnum), title in body face, optional one-line dek in muted; grouped by year with the year as a hanging label. | Frank Chimero blog <https://frankchimero.com/blog/>, Craig Mod essays <https://craigmod.com/essays/>, Rauno <https://rauno.me> |
| **entries** (cards/rows on home) | Cards only when there is an image; otherwise rows. Subgrid alignment; the whole card is the link (`::after` inset), hover moves a hairline or tints, never lifts with a shadow on a dark theme. | Vercel blog <https://vercel.com/blog>, Linear changelog <https://linear.app/changelog>, Maggie Appleton garden <https://maggieappleton.com/garden> (growth-stage badges) |
| **cover** | Title on its own picture = a cover (docs/37 commit 0ac6ad3): text on image only with a solved scrim; otherwise title *beside* or *below*. Display face, balanced, trimmed with `text-box`. | Stripe Press book pages <https://press.stripe.com>, Pentagram case studies <https://www.pentagram.com/work>, The Pudding story heads <https://pudding.cool> |
| **prose** | 60–72ch, body 17–21 px, leading 1.5–1.6, pretty wrap, hyphenation, true italics, onum in serif, hung punctuation, headings distinguished by space; wide figures break out. | Craig Mod <https://craigmod.com>, Tufte CSS <https://edwardtufte.github.io/tufte-css/>, Butterick <https://practicaltypography.com>, Increment (archive) <https://increment.com> |
| **code** | Block: surface ground or hairline frame, mono x-height-matched, `tab-size: 2`, horizontal scroll with fade, filename/label tab, line highlight in `color.tint`; syntax colours from accent family + muted (≤ 4 hues). Inline: slight surface pill, no border. | Josh Comeau <https://www.joshwcomeau.com>, Expressive Code <https://expressive-code.com>, Vercel docs <https://vercel.com/docs>, Shiki themes <https://shiki.style> |
| **blocks** (callout, stat, faq, steps, pullquote) | One visual idea across all blocks (ruled / surface / ink); callouts tinted not bordered-all-round; stats as display numerals with small-caps labels; FAQ with `details` + animated disclosure; steps with hanging numerals. | Stripe docs <https://docs.stripe.com>, Every Layout <https://every-layout.dev>, The Pudding <https://pudding.cool> |
| **feature** | The one place a page gets loud: full-bleed band, display type at `size.display`, an image or chart that breaks the grid; everything else yields. | Bartosz Ciechanowski <https://ciechanow.ski>, The Pudding <https://pudding.cool>, Works in Progress features <https://worksinprogress.co> |
| **post-foot** | End-of-article furniture in *one* ruled band: tags as a cluster, prev/next with direction words ("Older", "Newer"), author line; a sign-off, not a sidebar dump. | Robin Rendle <https://robinrendle.com>, Craig Mod (newsletter sign-off) <https://craigmod.com>, Maggie Appleton (backlinks) <https://maggieappleton.com> |
| **footer** | A colophon: typeset like the masthead's twin, small UI face, the faces used, licence, feed; generous space above, no four-column mega-footer on a personal site. | Frank Chimero <https://frankchimero.com>, Rauno <https://rauno.me>, Stripe <https://stripe.com> (mega-footer done right for a product) |
| **notes** (footnotes/sidenotes) | Sidenotes in the margin ≥ ~62em container, inline toggles below; footnote refs as superscript tnum in accent; back-links; notes in `size.small`, muted. | Gwern <https://gwern.net> (+ <https://gwern.net/design>), Tufte CSS, Maggie Appleton (hover previews) |
| **toc** | Sticky "on this page" in the right margin at wide, `details` at top when narrow; current section indicated by a hairline/accent tick via scroll-driven `view()` or IntersectionObserver; levels by indent not size. | Tailwind CSS docs <https://tailwindcss.com/docs>, MDN <https://developer.mozilla.org>, Every Layout |
| **wall** (logo wall, marquee) | Logos flattened to `currentColor` / monochrome (`filter: grayscale(1)` + opacity on dark), equal optical size (by area, not width), a reel on phones; marquee pauses on hover & reduced motion. | Vercel customers <https://vercel.com/customers>, Linear customers <https://linear.app/customers>, Resend <https://resend.com> |
| **motion** | Durations 150–300 ms, ease-out for entrances, one named view-transition, reduced-motion honoured by *removing* not shortening. | Emil Kowalski <https://emilkowal.ski> (and "animations.dev"), Rauno "craft" <https://rauno.me/craft>, Linear <https://linear.app> |
| **backdrop** | Quiet: a paper grain, a faint grid of hairlines, or a single radial of `color.tint` behind the hero — built from tokens so it re-colours; never behind body text at more than Lc 5 difference. | Vercel home (grid lines) <https://vercel.com>, Linear (glow) <https://linear.app>, Stripe (mesh gradient) <https://stripe.com> |

---

## 6. Gallery sources for references

- **Minimal Gallery** <https://minimal.gallery> — restraint, typography-led personal sites.
- **Siteinspire** <https://www.siteinspire.com> — filter by type (blog, portfolio, editorial).
- **Godly** <https://godly.website> — high-craft, motion-heavy; good for studio/loud kits.
- **Hoverstat.es** <https://www.hoverstat.es> — curated editorial/art-direction sites.
- **Typewolf** <https://www.typewolf.com> — site of the day with fonts named; free-font pairings.
- **Fonts In Use** <https://fontsinuse.com> — search by face (e.g. Instrument Serif) to see real pairings.
- **Refero** <https://refero.design> — UI screenshots by page type (changelog, pricing, docs).
- **One Page Love** <https://onepagelove.com> — single-page sites, home/landing slots.
- **Land-book** <https://land-book.com> — landing pages by category/style.
- Also: **Awwwards** (typography category), **Brutalist Websites** for the loud kit, **Personal Sites**
  (<https://personalsit.es>) and **Minimal Gallery "blog"** tag for notebook/editorial kits.

---

## 7. Proposed optional tokens

Each follows the contract's `optional:` shape — a derive default from the 40, so a theme that doesn't set
it still works. Grouped by what the craft above needs.

```yaml
optional:
  # ── type
  weight.body:        { derive: "400",                                   description: "Body weight; a variable face may set ~370 in dark mode." }
  weight.heading:     { derive: "600 (clamped by the shelf to a weight the heading face has)", description: "h2–h3. Written from the shelf so a 400-only face never asks for 600." }
  weight.display:     { derive: "var(--weight-heading)",                 description: "Hero, cover title, stat value." }
  weight.strong:      { derive: "700 (clamped by the shelf)",            description: "<strong> in prose." }
  leading.display:    { derive: "1.05",                                  description: "Line height at size.display; tighter than leading.tight." }
  tracking.display:   { derive: "-0.02em",                               description: "Letter-spacing for display sizes." }
  tracking.caps:      { derive: "0.08em",                                description: "Letter-spacing for caps/small-caps labels (Butterick 5–12 %)." }
  figures.body:       { derive: "normal",                                description: "font-variant-numeric in running text; a serif kit sets 'oldstyle-nums proportional-nums' when the face keeps onum." }
  figures.data:       { derive: "tabular-nums lining-nums",              description: "Dates, versions, tables, stats. Requires tnum on the shelf." }
  font.features.display: { derive: "normal",                             description: "font-feature-settings string for display (Inter 'ss01', 'cv11')." }
  font.display-variation: { derive: "normal",                            description: "font-variation-settings for display (Fraunces '\"SOFT\" 50', Bricolage '\"wdth\" 80')." }
  font.body-xheight:  { derive: "from the shelf's xHeight",              description: "For font-size-adjust so mono/UI text matches body x-height inline." }
  size.label:         { derive: "calc(var(--size-small) * 0.9)",         description: "Eyebrows, caps labels, figure numbers." }
  size.display:       { derive: "scale step 5 (was h1 × 1.6)",           description: "Change the derive to a scale step so display scales with the ratio." }

  # ── colour (seed-solved; derive is the fallback)
  color.tint:         { derive: "color-mix(in oklab, var(--color-accent) 10%, var(--color-bg))", description: "Radix 3–4: callout ground, selection, highlight, hovered row." }
  color.hairline:     { derive: "color-mix(in oklab, var(--color-border) 55%, var(--color-bg))", description: "Radix 6: separators; seed holds APCA Lc ≥ 15." }
  color.accent-hover: { derive: "color-mix(in oklch, var(--color-accent) 85%, var(--color-text))", description: "Radix 10." }
  color.focus:        { derive: "var(--color-accent)",                    description: "Focus ring; seed guarantees 3:1 against bg and surface." }
  color.link:         { derive: "var(--color-accent)",                    description: "A restrained kit sets var(--color-text) and underlines in accent." }
  color.shadow:       { derive: "color-mix(in oklab, var(--color-text) 12%, transparent)", description: "The only way a piece gets a shadow colour; dark themes set transparent." }

  # ── space & layout
  space.gutter:       { derive: "clamp(var(--space-3), 5cqi, var(--space-6))", description: "Page side gutter, grows faster than type (Utopia space pair)." }
  measure.narrow:     { derive: "calc(var(--measure) * 0.6)",           description: "Captions, sidenotes, deks." }
  radius.small:       { derive: "var(--radius)",                          description: "Already used as a need by prose/display — promote it." }
  radius.large:       { derive: "calc(var(--radius) * 2)",                description: "Cards, covers." }

  # ── motion
  motion.ease:        { derive: "cubic-bezier(0.2, 0, 0, 1)",             description: "Standard ease-out (emphasised decelerate)." }
  motion.ease-in-out: { derive: "cubic-bezier(0.65, 0, 0.35, 1)",         description: "For things that move and stay (menus, disclosures)." }
```

**Literal vocabulary additions** worth deciding (they are scale-with-the-page units, the contract's own
criterion): `rlh` (root line height — rhythm around headings), `svh`/`dvh` (covers that fill the first
screen; `vmax` is wrong on landscape desktops), `ex`/`cap` (optical alignment, e.g. an icon sized to cap
height), and time `0s` (only as "off" in reduced-motion). Easing keywords (`linear`, `ease-out`) are
already fine; cubic-bezier numbers should go through `motion.ease`.

Shelf additions (not tokens, but the craft depends on them): italics for text faces; `tnum`, `lnum` on
all faces and `onum pnum smcp c2sc` on text serifs; opsz ranges kept; per-face `weights`, `features`,
`axes` recorded in `shelf.json` so the generator can write `weight.*` and refuse a `figures.*` the face
cannot honour.

---

## 8. Rules for a piece that holds on any token set

A checklist the generator or the board can partly enforce:

1. **Never assume polarity.** Mix toward `var(--color-bg)` or `transparent`, never "lighten"/"darken";
   shadows only via `color.shadow`; a dark set must look right with no piece-side `prefers-color-scheme`.
2. **Never assume weights, italics or features.** Use `weight.*` and `figures.*` tokens; set
   `font-synthesis: none` only where a token guarantees the real style exists, otherwise express
   emphasis another way (the quote in `prose/book` could use colour + rule and drop the italic when the
   face has none).
3. **Accent is a budget.** Restrained kits: one accent mark per view. A piece that paints the accent over
   more than a band should read `color.on-accent` for everything on it, including focus rings and links.
4. **Size relative to tokens, tracking in em, spacing in `space.*` or `lh`.** Only breakpoints may be
   literal `em` (and they mean 16 px).
5. **Text on images needs a solved scrim** or doesn't happen (docs/37 0ac6ad3: "what is behind a text is
   what is painted under it").
6. **Test the three board sets at 390 and 1280, in states** (docs/37 §3.3–4) — add a fourth set that is
   *pathological*: a 400-only display face, a yellow seed (L 0.85, hard for text-on-accent), `ratio`
   1.5, dark. Most breakage appears only there.
7. **Motion is removable.** Every animation lives inside `prefers-reduced-motion: no-preference` and
   `@supports`; a page with none of it is complete.

---

## Sources

- Butterick, Practical Typography, key rules — https://practicaltypography.com/summary-of-key-rules.html
- Tufte CSS — https://edwardtufte.github.io/tufte-css/
- Standard Ebooks Manual of Style — https://standardebooks.org/manual
- Utopia — https://utopia.fyi/blog/designing-with-fluid-type-scales/ · https://utopia.fyi/type/calculator · https://utopia.fyi/space/calculator
- Modular Scale — https://www.modularscale.com
- Capsize — https://seek-oss.github.io/capsize/
- MDN text-box-trim (Baseline Aug 2026) — https://developer.mozilla.org/en-US/docs/Web/CSS/text-box-trim
- MDN text-wrap — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-wrap
- Inter (opsz 14–32) — https://rsms.me/inter/
- Fraunces axes — https://github.com/googlefonts/fraunces
- Geist Mono (OFL) — https://fonts.google.com/specimen/Geist+Mono · https://vercel.com/font
- Commit Mono — https://commitmono.com
- Evil Martians, OKLCH dynamic themes — https://evilmartians.com/chronicles/better-dynamic-themes-in-tailwind-with-oklch-color-magic
- Evil Martians, OKLCH ecosystem — https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools
- Harmonizer — https://harmonizer.evilmartians.com · https://github.com/evilmartians/harmonizer
- Radix Colors scale — https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Adobe Leonardo — https://leonardocolor.io
- Huetone — https://huetone.ardov.me
- APCA — https://apcacontrast.com · https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell
- Every Layout — https://every-layout.dev/layouts/
- Ryan Mulligan, Layout Breakouts — https://ryanmulligan.dev/blog/layout-breakouts/
- Josh Comeau, Full-Bleed — https://www.joshwcomeau.com/css/full-bleed/
- Gwern sidenotes/design — https://gwern.net/sidenote · https://gwern.net/design
- Cross-document view transitions support — https://css-tricks.com/cross-document-view-transitions-part-1/
- Scroll-driven animations (MDN) — https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations
- Frank Chimero, The Web's Grain — https://frankchimero.com/blog/2015/the-webs-grain/

Browser-support facts checked 25 Sep 2026: `text-box` Baseline (Aug 2026); `text-wrap: pretty` Chrome 117+
and Safari 26, not Firefox; cross-document view transitions Chrome 126+ and Safari 18.2+, Firefox behind a flag;
scroll-driven animations Chrome 115+ and Safari 26, Firefox behind a flag in stable 152.
