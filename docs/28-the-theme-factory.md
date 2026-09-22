# 28 — The theme factory: a system that turns a brief into a beautiful theme

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 19 Sep 2026
**Asked for:** *"lets just focus on themes, setting up such a system that it can output beautiful themes, we can integrate great agent skills for ui ux that can output themes based on best practices, amazing visuals and flow."*
**Scope:** a research read and a proposed build. It inventories what the theme contract already gives an agent, what the best UI/UX agent skills and 2025–26 practice add, and designs the pipeline between them. **§8's five calls were answered on 19 Sep 2026, all as recommended; decisions 221–227 are in docs/11 §8.** Nothing here moves S28 (clean machines), which stays next.

---

## 1. The opinion in one paragraph

snypd already has the two ends of a theme factory: a strict contract that an agent can write into (`snypd new theme`, `build-theme`, `check theme`'s 18 rules, the page gates), and a human who can tell a good page from a bad one on sight. What it lacks is the middle. The last three looks show the gap. `studio` and `console` passed every gate and were disliked on sight. `folio` only landed because decision 209 put a picture in front of Sunny before any theme was written. The gates are blind to beauty. The prompt asks the agent to "look at it" but hands it no camera. And every theme starts from a blank page, which is how agents drift to the same Inter-on-white default (Anthropic calls this "distributional convergence").

The factory closes that gap with four parts:
- **A small seed that code expands.** The agent makes the taste choices: seed colour, strategy, scale ratio, face, and where to be bold. Deterministic code turns those into palette, type and space tokens that pass contrast by construction.
- **A camera.** Every route × width × scheme is photographed on a specimen that exercises all 14 primitives.
- **A taste lint.** Mechanical anti-slop rules sit beside the existing gates.
- **Three real, rendered candidates** that Sunny picks between by eye.

The LLM judges only as an adviser. The research is clear that vision models miss fine-grained defects.

---

## 2. What exists, and where it falls short

From the contract survey (file references are to `main` at `245f293`):

| Piece | What it gives | Gap for a factory |
|---|---|---|
| `theme.yaml` (`core/src/schema.ts:221`) | Strict schema; tokens, variations, settings, one font, parts, layouts; arrays replace and maps merge up the chain (`render/src/theme.ts:381`) | Token `kind` is a free string that nothing validates; the scaffold writes `length`, the themes write `size` |
| `snypd new theme` (`core/src/scaffold.ts:162`) | yaml + css + package.json; 12 starter tokens that pass contrast when extending `base` | Starts from one fixed palette, so every theme begins in the same place |
| `build-theme` prompt (`mcp/src/prompts.ts:174`) | Eight steps, the last being "look at it" at phone and desktop, light and dark | Stale counts ("13 primitives and 5 parts"; there are 14 and 6). No taste guidance at all: no ban list, no direction, no seed |
| `snypd check theme` (`render/src/check.ts:157`) | Coverage, meta, tokens, font budget, `css.enhancement-guarded`, 4.5:1 contrast for four pairs over every variation × scheme | Checks correctness, not quality; sees nothing a screenshot would show |
| `bench page` | `page.js.kb` 0, font exact, axe 0, CLS ≤ 0.05 | Measures, never photographs |
| `bench gallery` (`bench/src/gallery.ts:93`) | The only lane that photographs: one route, two fixed viewports (1280, 390), viewport-only | No `--scheme` flag though the API has one; one route; no full-page shots; iterates bundled looks, not a theme in progress |
| Decision 209 | A look is chosen on a picture before it is written | The picture is a hand-made standalone mockup, so it costs a session and bends when the renderer draws it (docs/25 §3) |

The last row matters most. A mockup was the right tool when a theme cost a day. Once a theme costs an hour, the picture Sunny picks from should be **the theme itself, rendered by snypd**. Nothing then bends between approval and build.

---

## 3. What the best practice says

### 3.1 The skills worth borrowing from (all installed on this machine)

| Skill | Take | Leave |
|---|---|---|
| **impeccable** (`~/.claude/skills/impeccable`, v4.0.4) | 129 curated OKLCH seed colours with a mood and strategy line (`scripts/palette.mjs`); the 5-role palette; mechanical anti-pattern detectors (`scripts/detector/registry/antipatterns.mjs`: `gradient-text`, `overused-font`, `kicker-above-heading`, `side-tab`, `cream-palette`, `tiny-text`, `line-length`, `flat-type-hierarchy`, `monotonous-spacing`…); "name the rut", then roll which of 7 directions to build; "the brief wins" over any warning; bounded verification (one batched round, at most one more) | The PRODUCT.md/DESIGN.md ceremony, the decision-page server, live mode's injected JS |
| **frontend-design** (Anthropic plugin) | The plan-before-code step (a token plan of 4–6 named values, type roles, an ASCII layout); the five named AI clusters to avoid (cream + terracotta; near-black + acid accent; hairline broadsheet; SaaS-card kit; tracked caps eyebrow, middot meta, "→" links); **"Spend your boldness in one place"** | Nothing: it is prose and fits as the taste half of a prompt |
| **design-consultation** (gstack) | The SAFE/RISK card (≥2 safe category choices, ≥2 deliberate risks, each with its cost); the anti-convergence rule; the specimen-page idea | Google Fonts `<link>`, the JS light/dark toggle, its OpenAI image binary |
| **design-shotgun** (gstack) | The anti-sibling test: variants differ in face, palette and layout approach, *"if you could swap the headline between two variants without noticing, they're too similar"* | Raster mockups (we render real themes) |
| **design-review** (gstack) | Phase 2 extracts the design system the page actually renders (fonts, colours, heading scale) as a conformance check; the typography and dark-mode items (type ratio 1.25–1.333, body line-height 1.5, off-white dark text, accent desaturated 10–20 % in dark, no `transition: all`, visited ≠ unvisited) | Landing-page rules that fight restraint ("no flat single-colour backgrounds", "2–3 motions minimum") |
| **web-design-guidelines** (Vercel) | A checklist pass: focus-visible rings, tabular numbers, curly quotes, `scroll-margin-top` | It fetches its rules at run time; we would pin a copy |
| theme-factory, canvas-design, design-html | canvas-design's `canvas-fonts/` (about 29 OFL families) as a starting pool for the font shelf | theme-factory's 4-hex presets (no roles, no dark, no contrast); design-html's runtime JS |

### 3.2 Practice, 2025–26

- **Every theme generator collapses the choice to a small seed**: Material 3 (one source colour to HCT tonal palettes to fixed-tone roles), Relume, tweakcn, v0 themes, Google Stitch's `DESIGN.md`. The seed is expanded by algorithm into scales, the scales are mapped to roles, and **the human picks between previews rather than editing values**. [m3.material.io/styles/color/system](https://m3.material.io/styles/color/system/how-the-system-works) · [tweakcn.com](https://tweakcn.com/) · [v0 design systems](https://v0.app/docs/design-systems-2)
- **Contrast by construction.** Radix gives each of 12 steps a job (text steps meet APCA Lc 60/90 on step 2). Adobe Leonardo solves each swatch for a target ratio against the background. Gate on WCAG 2 ratios: APCA left the WCAG 3 drafts and WCAG 3's contrast method is still undecided as of April 2026. [radix-ui.com/colors](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) · [adobe/leonardo](https://github.com/adobe/leonardo) · [Roselli, Apr 2026](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)
- **OKLCH** is the palette space: lightness is perceptually even across hues, and Tailwind v4 moved its whole palette to it. snypd's tokens already use `light-dark()` and relative `oklch(from …)`.
- **Fluid type and space** (Utopia): a min and max viewport, a base size and a ratio at each end produce `clamp()` steps; the space scale multiplies step 0. [utopia.fyi](https://utopia.fyi/type/calculator/)
- **Fonts:** WOFF2 only; subset with pyftsubset/glyphhanger and keep `--layout-features='*'` or kerning breaks; pair within a superfamily or match x-height and width. [glyphhanger](https://github.com/zachleat/glyphhanger)
- **DTCG 2025.10** is the first stable design-tokens format, with a resolver module for light/dark and brand modes. We don't need it inside snypd, but an export later would let a theme travel to Figma or Penpot. [designtokens.org/tr/2025.10](https://www.designtokens.org/tr/2025.10/)
- **Judging.** Research does not support a vision model as the gate. *MLLM as a UI Judge* (arXiv 2510.08783) finds models track human ratings on some dimensions and diverge on others. *PRISM* (arXiv 2606.00592) finds GPT-4o has "global awareness without fine-grained disentanglement" and smaller models barely notice targeted contrast or alignment damage. *UICrit* (arXiv 2407.08850) raised critique quality 55 % with few-shot examples and boxed regions. WebDev Arena's ~580K pairwise votes show that **generating several candidates and picking pairwise** is the robust method. So: deterministic gates decide, the model advises, a human picks.
- **CSS available to a zero-JS theme** (Sep 2026):
  - **Baseline:** `color-mix()`, `light-dark()`, relative colour, `@property`, container size queries, container style queries (Firefox 151, May 2026), anchor positioning (Jan 2026), `text-wrap: balance`.
  - **Enhancement only, under decision 161's tier rule:** `text-wrap: pretty` (no Firefox), scroll-driven animations, cross-document view transitions (Firefox behind a flag).
  - Recheck caniuse before fixing the support floor.

---

## 4. The factory

```
 brief ──► direction cards (×3) ──► seed expansion ──► three real themes
   │         SAFE/RISK, the rut,        palette · type ·      scaffolded, tokens
   │         where the boldness goes    space · font          written, css styled
   │                                                              │
   │                         ┌────────────────────────────────────┘
   │                         ▼
   │                  the camera: routes × widths × schemes → contact sheet
   │                         │
   │                         ▼
   │         gates: check theme · bench page · taste lint · (judge: advisory)
   │                         │   one fix round, at most one more
   │                         ▼
   └──────────────► Sunny picks one on the contact sheet ──► polish ──► ship
                     (reasons recorded as taste memory)
```

### 4.1 The brief: `themes/<name>/DESIGN.md`

A short file beside theme.yaml, which stays strict and untouched. It follows the convention impeccable and Stitch already use, so any design skill in the user's harness can read it. Sections:
- **Use scene:** who reads this, where, in what light. This picks light or dark; the category never does.
- **Visitor mode:** Read, Persuade, Operate or Experience. snypd sites are mostly Read.
- **References:** URLs or screenshots.
- **The rut:** the page this category always ships, named so it can be avoided.
- **Boldness goes here:** exactly one place.
- **SAFE / RISK:** at least two of each, with costs.
- **Decisions log.**

The `personality:` line in theme.yaml becomes the one-sentence summary of this file.

### 4.2 Direction cards and the anti-sibling rule

The agent writes three direction cards from the brief, each naming a different world, face, palette strategy and layout approach. The shotgun test applies: if the headline could swap between two cards unnoticed, one is redone. Directions are chosen by the agent, not rolled at random: impeccable's dice suit a designer's sketchbook, while a site owner's brief should steer.

### 4.3 Seed expansion: deterministic code, new in `@snypd/core`

`snypd seed` (and the same thing as an MCP call) takes the taste inputs:
- **seed:** one OKLCH colour, from impeccable's 129 or the brief's brand colour
- **strategy:** restrained, balanced or expressive
- **scheme:** light, dark or both
- **ratio:** 1.2 to 1.333, with separate ends for phone and desktop
- **base size** and **face** (from the shelf, §4.4)

It writes the tokens the chain already declares:
- `color.bg / surface / text / muted / accent / on-accent / border` as `light-dark()` pairs, each **solved for its target ratio** (text ≥ 7:1, muted and accent ≥ 4.5:1 on both bg and surface), Leonardo-style. Dark is designed, not inverted: text a touch off-white, accent desaturated 10–20 %, surfaces raised by lightness.
- `color.viz.1–6` spaced in hue at matched lightness, so charts stay one family.
- `size.*` as Utopia `clamp()` steps, `space.1–6` from step 0, `leading.*` from the face's x-height.

`check theme`'s four contrast rules then pass by construction, not by luck. The agent stays free to hand-edit any token afterwards; the seed is a starting point, not a cage.

### 4.4 The font shelf

A curated set of 12–20 OFL faces, each pre-subset to Latin WOFF2 under 40 KB, with its licence file, its measured x-height and a metric-matched fallback (`size-adjust`, `ascent-override`). It is shipped as data the seed step can reference. It starts from `canvas-fonts/` (Instrument Sans/Serif, Crimson Pro, Young Serif, Gloock, IBM Plex, Big Shoulders, Work Sans, Lora…), plus the two already in the binary (Source Serif 4, Bricolage Grotesque). Each face carries a note on what it suits and one on what it pairs with inside its superfamily. Overused faces (Inter, Roboto, Geist, Fraunces, Space Grotesk, Plus Jakarta) are not on the shelf. A brief may still name one; see §8 call 3.

### 4.5 The camera: `snypd shoot`

Built from the CDP pieces `bench/src/cdp.ts` already has (`setDeviceMetricsOverride`, `setEmulatedMedia`, `captureScreenshot` with `captureBeyondViewport`):
- **routes:** the specimen's (§4.6) by default, or `--route` repeated
- **widths:** 390, 768, 1280, 1440
- **schemes:** light and dark
- **reduced motion:** on

It writes PNGs plus a static `contact.html` sheet: one row per route, candidates side by side, zero JS. It serves two readers:
- **The agent:** it sees its own theme at every width, which is what `build-theme`'s step 7 asks for today.
- **Sunny:** he picks from the sheet.

`bench gallery` keeps its job and gains `--scheme`.

### 4.6 The specimen

A fixture corpus (in `packages/bench`, beside the existing corpora) built to be hard:
- a home page with sections
- a post using all 14 primitives
- a prose-only long read with footnotes and code
- an index with 30 entries
- a term page and an author page
- the 404
- a post with a four-word title and one with a sixty-character title

That covers every layout, every primitive and the two title extremes. The `technical` fixes and docs/25's "23 ms doesn't fit" were both found this way, by accident. The specimen makes finding them routine.

### 4.7 The taste lint: new rules in `check theme`, all at *warn*

A port of the detectors that apply to a zero-JS content site, run on the theme's CSS and on the specimen's built HTML. Written in our own code, credited to impeccable and frontend-design:
- `taste.gradient-text`, `taste.side-stripe` (coloured left border > 1 px on a box)
- `taste.eyebrow` (tracked uppercase line directly above a heading)
- `taste.overused-font`
- `taste.untinted-neutral` (pure grey or #000/#111 where the palette has a hue)
- `taste.tiny-text` (< 14 px body-sized text at 390)
- `taste.measure` (body line > 80ch or < 45ch)
- `taste.flat-hierarchy` (h1/h2/h3 ratios below 1.15)
- `taste.monotonous-spacing`, `taste.transition-all`, `taste.radius-soup` (more than three radii)

They warn and never fail, because "the brief wins": a brief that asks for an eyebrow gets one, and the warning is the note that it was chosen. This matches why `css.enhancement-guarded` warns.

### 4.8 The judge: advisory only

After the gates, one critique pass. A vision model reads the contact sheet against a fixed rubric of hierarchy, rhythm, the one bold place, the rut and the dark mode. It uses UICrit-style few-shot examples: our own before/after pairs from `technical`, `console` and `folio`. It names regions, proposes at most five changes, and the agent applies what it agrees with. **At most two rounds, then it goes to Sunny.** It never gates, because the research says it cannot see what the deterministic rules see.

### 4.9 The prompt: `build-theme` becomes the factory's script

It is rewritten, not added to, so the agent has one script:
1. Brief
2. Three direction cards
3. Seed each
4. Style each
5. Shoot
6. Gates + taste lint
7. One critique round
8. Contact sheet to the human
9. Polish the pick
10. Report

The taste rules are distilled into the prompt text: frontend-design's clusters and "one bold place", impeccable's colour and type floors, design-review's dark-mode items. They sit in snypd so a user whose harness has no design skills still gets them. The prompt also says: *if your harness has a design skill installed (impeccable, frontend-design), load it*. Those skills make it better and are never required. The stale counts are fixed in the same change.

### 4.10 Taste memory

Sunny's picks and his reasons in words ("boxes inside boxes", "too much text in mono", "centred hero, one column") are appended to the site's `DESIGN.md` decisions log. The next run reads it before writing cards. docs/24 and docs/25 already hold the first entries; the factory writes them down where an agent will read them.

---

## 5. What this does not do

- **No runtime anything.** Every step runs at design time. `page.js.kb` stays 0 and the font budget stays 40 KB.
- **No new primitive, part or layout seam.** The factory writes into the contract as it stands, and anything it cannot express is logged as a contract finding, the way U6b found decisions 135–136.
- **No image-model mockups.** The picture is always the rendered theme.
- **No theme marketplace.** Distribution stays npm (docs/10 §5.4).
- **No dependency on third-party skills at runtime.** We credit them and borrow ideas and rule lists. Before copying any detector *code* rather than reimplementing it, check impeccable's licence: the local copy carries no LICENSE file.

---

## 6. Sessions

| Session | Work | Proof |
|---|---|---|
| **TF1** | Contract hygiene: validate token `kind` (`color, keyword, font, size, number`); scaffold writes `size`; fix the stale counts in `build-theme`, `get-started`, `theme/coverage`; `bench gallery --scheme` | tests; `check theme --all` unchanged on the four bundled themes |
| **TF2** | `snypd shoot` + the specimen corpus + `contact.html` | a contact sheet of `editorial`, `technical`, `studio` and `folio`, all widths and both schemes |
| **TF3** | Seed expansion (`theme seed`, MCP call), contrast-solved palette, Utopia scales | property test: 1,000 random seeds × three strategies, every one passes the four contrast rules in both schemes |
| **TF4** | Font shelf: 12–20 faces subset, licensed, metric fallbacks computed | every face ≤ 40 KB and no layout shift against its fallback (`page.cls` 0) |
| **TF5** | Taste lint (§4.7) in `check theme`; `DESIGN.md` scaffolded by `snypd new theme` | each rule has a failing and a passing fixture; the four bundled themes' warnings listed and either fixed or accepted with a reason |
| **TF6** | The `build-theme` rewrite (§4.9), taste memory, the advisory judge | **the proof:** one brief → three themes → contact sheet → Sunny picks, in one sitting |

TF1 and TF2 are cheap and pay off at once: every future look session gets a camera. TF3–TF6 are the factory proper.

---

## 7. Proposed decisions (numbering continues at 221)

221. **A factory theme is picked from rendered candidates, not a mockup.** Amends 209 for theme work: three real themes on the specimen replace the hand-made mockup. A standalone mockup is still the tool when the renderer cannot yet draw what is wanted.
222. **The palette is solved, not guessed.** Seed expansion writes colour tokens that meet their contrast targets by construction; `check theme`'s contrast rules remain the gate.
223. **Taste is linted at warn, never fail.** The brief wins; a warning records a choice.
224. **The judge advises, the gates decide, a human picks.** No model score is ever a gate.
225. **The taste rules live in snypd.** They are distilled and credited, so a harness without design skills still gets them; installed skills are an optional boost.
226. **`DESIGN.md` beside `theme.yaml` holds the brief and the taste memory**; `theme.yaml` stays strict.
227. **The font shelf excludes overused faces by default**; a brief can still name one.

---

## 8. Calls that are Sunny's

**Answered 19 Sep 2026:** *"our focus is speed accuracy and good feel process, follow as you recommended."* All five go as recommended below.

1. **When.** Recommendation: TF1 + TF2 straight after S28. They are small and every look session needs the camera. TF3–TF6 after launch, unless you want a factory-made theme gallery for launch day (6 Oct). That would mean TF3–TF6 by about 1 Oct, which is tight but possible if S28 goes clean.
2. **Rendered candidates instead of mockups (221).** Recommendation: yes. Nothing bends between the picture you approve and the theme that ships.
3. **folio's Inter.** Both skill lists flag Inter as the most overused face, and the shelf would leave it off. folio was chosen on sight and stays; decision 227 only affects new themes. Say if you want folio revisited once the shelf exists.
4. **How many themes the proof makes.** Recommendation: three candidates from one brief, of which one ships as a bundled theme (the fifth). A gallery of six is a later goal, not the proof.
5. **Borrowing from impeccable.** Recommendation: reimplement the detectors in our own code and credit impeccable and frontend-design in the theme docs and the prompt. If you'd rather vendor its palette seeds or detector code as they are, I check the licence first.
