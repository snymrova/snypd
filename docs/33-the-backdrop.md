# 33 — The backdrop: a look the build draws from the palette it already solved

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 23 Sep 2026
**Asked for:** *"go through this [feralui.dev/gradients] and see how we can build something like this for our agent to use, not the UI but the underlying capabilities"* — and *"we should try to use bun 1.4 capabilities as well as much as we can."*
**Reads with:** docs/32 (the way forward; this lands inside its beauty track), docs/14 (CSS as the runtime), docs/29 (the factory, decision 209), docs/10 §5 (`og-image`, spiked and stopped), docs/23 §6 (media, not built).
**Scope:** what feralui's generator is underneath its studio, read from its bundle; which of it snypd wants and which it refuses; where each capability lands in the tree, with the file that already does the nearest thing; three sessions. Decisions numbered from **249** (docs/32 claims 240–248).
**Status:** proposed. Nothing before 6 Oct.

---

## 1. What is under the studio

feralui's `/gradients` is a React SPA. Its bundle was read on 23 Sep (`index-ClPsj74W.js` and the `JapaneseGradients` chunk, 861 KB). Underneath the canvas and the sliders there is one data model, and it is small:

```js
{ id: "slk9", k: "青緑", r: "AOMIDORI", e: "Teal",
  stops: ["#083E44","#0E6D75","#1AA2A8","#4CC9CC","#8FE6E5","#D6F8F6"],
  type: "SILK", soften: 0, grain: 0, ink: "#FFFFFF",
  silk: { angle: 38, seed: 29, folds: 6, warp: 74, streak: 50 } }
```

- **A ramp**: six stops, dark to light, with a name in three scripts. 238 presets; a palette of ~1,360 named colours behind them.
- **A type**: one of 32 (`LINEAR IOS AIR SKY SILK WAVE FLOW MIST AURORA SMESH PIXEL LINE CUBE GLINT GLASSY ARCH STRIPE RETRO CIRCLE RING CNOISE BALLS ANGULAR BARS SKYLINE PRISM COLS BEEHIVE SHAPES GLOW …`), each with a parameter object of four to eight numbers — `silk:{angle,warp,streak,sheen,folds,seed}`, `wave:{turns,curl,amp,width,scale}`, `mist:{haze,height,sharp,sun,drift,seed}`, `bars:{count,gap,envelope}`.
- **A seed**: a mulberry32 PRNG (`Math.imul(t ^ t >>> 15, 1 | t)` …), so every render is a pure function of the record above. A preset is ~15 tokens of JSON, not a picture.
- **An ink**: the text colour that reads on it — handed to you, not solved.
- **Grain**: `feTurbulence type="fractalNoise"` + `feColorMatrix` alpha, in the SVG.
- **Exports**: CSS (stacked `radial-gradient(… in oklab)` — and the code's own comment says fade, bloom and grain *"require the SVG or PNG export"*, so the CSS form is lossy), SVG (the full form), PNG/JPG to 4K, MP4 via `MediaRecorder`, Figma as editable layers.

That is the whole capability: **ramp × type × params × seed → SVG**, with CSS as a shadow of it and raster as a screenshot of it. Everything else on the page is a way to move the numbers.

## 2. What snypd already has, and the one line it has against this

More than expected, and none of it named "gradient":

| Need | Exists | Where |
|---|---|---|
| A ramp | The theme's own palette — 21 colour tokens solved from one OKLCH seed, seven contrast pairs at 4.5:1 by construction | `packages/core/src/seed.ts:48,220` |
| Colour maths | `oklch ↔ rgb`, `inGamut`, `contrastRatio`, a CSS colour parser that reads `color-mix`, `light-dark()` and relative colour syntax | `packages/core/src/color.ts:45-197` |
| A place to write a token | `cssValue` already allows all six `*-gradient()` functions; refuses `url()`, `image()`, data URIs; 256-character cap | `packages/core/src/values.ts:20-45` |
| SVG at build time | `viz/src/svg.ts` — `el`, `attrs`, `path`, `arc`, `clip`; **no `defs`, `filter`, `*Gradient`, `feTurbulence`**; `<marker>` rejected for id collisions, which is the rule any `<defs>` must obey | `packages/viz/src/svg.ts`, `diagram.ts:10-11` |
| A generated file in `dist/` | `artefact(path, () => bytes, key)` in the build plan — how `theme.css`, fonts and redirects are written | `packages/render/src/build.ts:470` |
| The same from a plugin | `capabilities.emit: [prefix/]`; core writes, refuses collisions | docs/10 §4.4, `plugins.ts:261-270` |
| SVG → PNG | `cards.ts`: an HTML document on the built site's origin, wearing `theme.css`, screenshotted at 1200×630 by headless Chrome over the hand-rolled CDP client | `packages/bench/src/cards.ts:103` |
| PNG → AVIF/WebP, resize | **`Bun.Image`** — decodes, resizes, encodes `png/webp/avif/jpeg`; draws nothing (decision 105) | docs/10:210 |
| An `og:image` chain | `cover.image` → the card PNG → `site.image` | `themes/base/parts/shell.tsx:36-38` |
| A backdrop in a theme | one scrim: `.snypd-hero::before { background: linear-gradient(to top, var(--color-bg) …) }` | `themes/studio/theme.css:83` |
| A rule about gradients | `taste.gradient-text` fires only on `background-clip: text` + `gradient(` — a bare `background-image` triggers nothing | `packages/render/src/taste.ts:105-109` |

And the line against it — `DESIGN.md:23-25`, *The rut*: **"a gradient blob behind the hero."** Named as the thing the site refuses on sight. There is no lint for it; the brief is the rule. So this document is not arguing with a gate, it is arguing with the owner's eye, and it does that by refusing the blob at the source: §3.2 ships no type that floats coloured discs behind a headline.

## 3. What to build

### 3.1 The model — a backdrop is a record in `theme.yaml`, next to `font:`

```yaml
backdrop:
  type: silk            # wash | paper | air | silk | bars | mist   (§3.2)
  from: tokens          # tokens (default: bg → accent, solved) | a ramp of 2–6 colours
  seed: 29              # any integer; omitted = a hash of the theme name
  grain: 6              # 0–20, feTurbulence alpha; 0 = none
  soften: 0             # 0–100
  silk: { angle: 38, folds: 6, warp: 74 }   # the type's own knobs, all optional
```

`font:` is the precedent for a theme-level declaration the build turns into an asset and a token: `fontFaceCss()` emits `@font-face` from `font:`, and this emits, in the same `snypd.tokens` layer, **`--backdrop: url("/assets/backdrop-<hash>.svg")`** and `--backdrop-ink: <solved colour>`. `cssValue` never sees it — it guards values a person or an agent typed, and this is a value the build wrote to a file the build wrote. The theme's stylesheet uses it or not: `.snypd-hero { background-image: var(--backdrop); color: var(--backdrop-ink); }`. A variation may retune `backdrop.seed` or `backdrop.type` the way it retunes a token (decision 127's line holds: values, never new declarations).

**`from: tokens` is the point.** feralui needs 238 presets because it has no palette to derive from. snypd has one, solved for contrast, in every theme. The default ramp is `color.bg → color.surface → color.accent` in OKLCH, with lightness stepped and chroma fitted to gamut (`inGamut`, `seed.ts:109 fit`) — so a theme that changes its seed colour changes its backdrop with it, and a stranger's theme has a backdrop that is *theirs* before they write a line of CSS.

**The ink is solved, not handed over.** Two rows join `CONTRAST_PAIRS`: `text` against the backdrop's lightest stop and against its darkest. `solveL` (`seed.ts:126`) moves the ramp's ends until both pass 4.5:1, and `check theme` reads the same list it reads today. feralui gives you `ink:"#FFFFFF"` and hopes; this is the one thing the record can promise that the studio cannot.

### 3.2 Six types, not thirty-two

Chosen for a site a person reads, and against *the rut*:

| Type | What it is | SVG form | Refused cousin |
|---|---|---|---|
| `wash` | one gradient, `in oklab`, at an angle | `<linearGradient>` | — |
| `paper` | the page colour with grain and nothing else | `<feTurbulence>` + `<feColorMatrix>` over a `<rect>` | — |
| `air` | two or three soft radial fields, large, off-centre, low chroma | stacked `<radialGradient>` with wide stops | the **blob**: small, saturated, many — `air` caps at three fields, each ≥ 60 % of the frame, chroma ≤ the palette's |
| `silk` | folds — a wash displaced by low-frequency noise | `<feTurbulence baseFrequency≈0.004>` + `<feDisplacementMap>` | — |
| `bars` | *n* vertical bands stepping the ramp | `<rect>` × n | — |
| `mist` | a horizon: dark low, light high, a sun | `<linearGradient>` + one `<radialGradient>` | `aurora`, `skyline` — pictures of things, not surfaces |

Every one is deterministic from `(ramp, type, params, seed)` through one PRNG (mulberry32, twelve lines, in `color.ts`). Animation is out: it is either script or a `@property` hue drift, and docs/14 §4.7 already said what a marketing site does with motion that costs nothing.

### 3.3 Where it is drawn — `packages/viz`, with the four helpers it lacks

`svg.ts` gets `defs()`, `gradient(kind, stops, attrs)`, `filter(id, …)`, `turbulence(freq, octaves, seed)`; ids are minted per document from the backdrop's own hash, which is `diagram.ts:10-11`'s rule kept. `viz/src/backdrop.ts` is ~250 lines beside `chart.ts`, returns `{ svg, warnings, ink }`, and gets its own budget line in `spec/defaults/budgets.yaml` beside the three — **`backdrop: { renderMs: 3, svgKb: 8 }`**. `feTurbulence` is cheap in bytes and not cheap in paint: a full-bleed grain on the hero is measured by Z2's `page.lcp` on the site before it ships, and `grain` defaults to 0 until that number is seen.

### 3.4 Where it is rastered — and this is the Bun 1.4 part

Chrome draws, Bun encodes. The path exists end to end today for cards: an HTML document wearing `theme.css`, screenshotted over CDP to PNG. Three things ride it, none new:

1. **The OG card.** `cards.ts` gets the backdrop under the title. Every post has an on-palette card with nothing typed. This is the `og-image` plugin docs/10 §5 stopped — stopped because *text* cannot be drawn without Chrome, and `cards.ts` already has Chrome and already draws text. The stop rule does not fire here.
2. **The poster.** A clip with no poster gets one: the backdrop, the title. Today the poster is the largest object on snypd.rocks' front page (docs/32 §2).
3. **`Bun.Image`** takes the PNG Chrome wrote and makes the AVIF and WebP the page serves, resized to the `sizes` the theme declares — the same call docs/32's Z1 needs for every other picture, so this is where Z1's encoder is written first and proven on one file. `Bun.hash` keys the artefact; the build's `bun:sqlite` index caches the bytes, so an unchanged theme draws nothing on the next build.

What Bun 1.4 does not do, and this document does not pretend it does: rasterise SVG. `Bun.Image` draws nothing (decision 105). `Bun.WebView` is in docs/06's v0.2 row and needs Chrome on Linux either way. Headless Chrome stays the rasteriser, as it is for `shoot` and `cards`, and a machine without it skips the raster step and ships the SVG — which every browser draws itself.

### 3.5 What the agent sees

- **`snypd://theme/backdrops`** — the six types, a sentence each, read on demand; nothing joins `tokens.learn.floor` (decision 244's rule, and decision 129's precedent).
- **`theme › backdrop`** — an action on the catalogue's `theme` tool: `{ type, from?, seed?, grain?, params? }` → writes `backdrop:` into `theme.yaml`, rebuilds, returns the ink it solved and the byte count. Under `find_tools`, never in `tools/list`.
- **`snypd shoot --backdrop`** — one page under each of the six, and under six seeds of the chosen one, on a contact sheet. The pick is a picture (decision 209). The factory's `build-theme` prompt gains one step between seed and stylesheet: *choose the backdrop from the sheet, or none*.
- **In `seed`**: `snypd seed … --backdrop=silk` writes the record in the same pass as the tokens, so a factory candidate is born with one.

Cost to a session that never restyles: zero tokens.

## 4. What this is not

- **Not a primitive.** Content never says "silk." A `cover` may sit on the theme's backdrop because the theme put it there; the post does not know. A per-post variation — a different seed for every slug, so no two covers match — is a theme *setting* (`backdrop.vary: per-page`), and the seed is `Bun.hash(slug)`.
- **Not a catalogue of 238.** The ramp comes from the tokens. A named shelf of *seeds* may come later, the way the sixteen faces did, if a stranger asks for "something like that one."
- **Not motion.** See §3.2.
- **Not a mesh.** The rut is the rut.

## 5. Sessions

Three, inside docs/32's beauty track, after V3 (the chrome shelf) and beside Z1 (the image pipeline), because G3 writes Z1's encoder:

| # | Session | Lands | Days |
|---|---|---|---|
| G1 | **The drawing** | `svg.ts` gains `defs/gradient/filter/turbulence`; `viz/src/backdrop.ts` with the six types and the PRNG; `backdrop` budget line; property tests that the same record draws the same bytes | 2 |
| G2 | **The declaration** | `backdrop:` in `theme.yaml`'s schema; the artefact and the two `--backdrop*` tokens in the build; two contrast pairs; `theme › backdrop`, `snypd://theme/backdrops`, `shoot --backdrop`; studio's scrim moves onto it; `build-theme` step | 2 |
| G3 | **The raster** | the card and the poster drawn over it; `Bun.Image` encodes AVIF/WebP and resizes; `bun:sqlite` caches by hash; `page.lcp` on the site before and after grain | 1–2 |

## 6. Decisions asked

- **249. A backdrop is a theme declaration the build draws, never a value anyone types.** `backdrop:` beside `font:`; the build writes the SVG and the `--backdrop` token; `cssValue` keeps refusing `url()` from a person. Recommendation: yes.
- **250. The ramp is the palette.** `from: tokens` by default, solved in OKLCH from the tokens the theme already declared; explicit stops allowed; the ink is solved against both ends and joins `CONTRAST_PAIRS`. Recommendation: yes — the alternative is a preset library that goes stale the day the seed changes.
- **251. Six types, and the blob is not one of them.** `wash paper air silk bars mist`; `air` is bounded (≤ 3 fields, each ≥ 60 % of the frame, chroma ≤ palette) so it cannot become the thing `DESIGN.md` names. Recommendation: yes.
- **252. Chrome draws, Bun encodes.** Raster stays on the `cards.ts` path; `Bun.Image` is the encoder and the resizer, first used here and then by Z1 for every picture; a machine without Chrome ships the SVG. Recommendation: yes.
- **253. Zero tokens at session start.** Types on a resource read on demand; the verb under `find_tools`. Recommendation: yes.

## 7. What would make this wrong

If `feTurbulence` on a full-bleed hero moves `page.lcp` on the site by more than the poster re-encode saved (docs/32 Z3), grain ships off by default and the row says why. If the contact sheet shows six looks that are all the same look, the six types are four. If Sunny looks at `air` and sees the rut, `air` goes, and the reason is a line in `## Taste`.
