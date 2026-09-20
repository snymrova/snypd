# 29 — The theme factory, build plan: what gets written, where, in what order, and one run end to end

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 19 Sep 2026
**Asked for:** *"check the 28 plan about theme factory and work on creating an implementation plan, with the workflow example which one can have to generate themes for snypd that is beautiful and visually appealing and up to the standards."*
**Reads with:** docs/28 (the why and the research). This doc is the how. File references are to `main` at `245f293`.
**Status:** a plan, approved 19 Sep 2026. All five docs/28 §8 calls went as recommended (decisions 221–227, docs/11 §8), so §9 does not apply. S28 needs Sunny's machines, so TF1 starts alongside it. **TF1–TF6 built (19–20 Sep 2026); each section's "As built" says where it landed and what changed on the day. What is left is the sitting (§7.3), which needs Sunny.**

---

## 1. The shape of the build

Six sessions, three layers. Each layer is useful on its own, so the build can stop after any session and still have paid for itself.

| Layer | Sessions | What it gives an agent | Useful alone? |
|---|---|---|---|
| **See** | TF1 hygiene, TF2 camera + specimen | eyes: every route × width × scheme, one contact sheet | yes, every look session from now on |
| **Start well** | TF3 seed, TF4 font shelf | a palette that passes contrast by construction; a face that isn't Inter; fluid type and space | yes, `snypd new theme` gets better starting points |
| **Judge** | TF5 taste lint + DESIGN.md, TF6 the script, memory, advisory judge | a named rut, three candidates, a critique round, a human pick | the factory proper |

Dependencies: TF1 → TF2 → TF6; TF3 and TF4 → TF6; TF5's static half can start any time, and its rendered half needs TF2. **TF3 and TF4 can run in parallel with TF2** (separate worktrees; run tests in a worktree, see the site-basics memory).

```
TF1 ──► TF2 ──────────────┐
        (camera)          │
TF3 ──┐                   ├──► TF6 ──► proof sitting (Sunny picks)
TF4 ──┴► (seed uses shelf)│
TF5a (static lint) ───────┤
TF5b (rendered lint) ◄────┘ needs TF2
```

---

## 2. TF1: contract hygiene (half a session)

| Change | Where | Detail |
|---|---|---|
| Token `kind` becomes an enum | `packages/core/src/schema.ts:43` | `z.enum(["color","keyword","font","size","number"])`. **`length` is accepted and normalised to `size`** at parse, so no third-party theme breaks. `check theme` gains `tokens.kind` at *warn* when it sees `length`. |
| Scaffold writes `size` | `packages/core/src/scaffold.ts:87`, `:89` | `measure` and `size.body` → `kind: size`. |
| Stale counts | `packages/mcp/src/prompts.ts:180` ("13 primitives"), `:89` get-started ("Thirteen") | Not re-typed. The prompt reads the count from the spec (`packages/spec/primitives/`, 14 files) and from `PART_NAMES` / `LAYOUT_NAMES` (`render/src/theme.ts:227`, `:176`). A test in `mcp.test.ts` asserts that the prompt text contains the live counts. |
| `bench gallery --scheme` | `packages/cli/src/index.ts:127` | `GalleryOptions.scheme` already exists (`gallery.ts:70`); the CLI just passes it through: `--scheme=light\|dark\|both`. |
| Export the colour converters | `packages/core/src/color.ts:33`, `:47` | Export `oklabToRgb` and `rgbToOklab`; add `oklchToRgb`, `rgbToOklch` and `inGamut`. TF3 needs them; they're currently private. |

**Proof:** `bun test`; `snypd check theme --all` output is byte-identical on base, editorial, technical and studio, apart from the new `tokens.kind` line.

---

## 3. TF2: the camera and the specimen (one session)

### 3.1 The specimen corpus: `packages/bench/corpora/specimen/`

It is committed, unlike `corpora/theme`, which is generated on demand (`bench/src/index.ts:535`), because a specimen is edited by hand to be hard. Nine routes:

| Route | Built to catch |
|---|---|
| `/` | home with sections (a `home` layout theme gets its bands, others their index) |
| `/posts/every-primitive-once/` | all 14 primitives (reuse `GALLERY_ROUTE`'s post, `gallery.ts:87`) |
| `/posts/long-read/` | 2,500 words of prose, footnotes, a code block, a blockquote, a table: measure, rhythm, leading |
| `/posts/` | an index with 30 entries, a mix of covers and none |
| `/tags/field-notes/` · `/authors/ada/` | term and author layouts |
| `/404` | the default not-found page |
| `/posts/four-words-only/` · `/posts/a-sixty-character-title-that-wraps-at-phone-width-badly/` | title extremes: the hero at its emptiest and at its worst wrap |

### 3.2 `snypd shoot`: `packages/bench/src/shoot.ts`

```
snypd shoot [root] --theme=a,b,c [--route=/x/ …] [--width=390,768,1280,1440] [--scheme=both] [--out=shots/]
```

- **Per candidate:** `loadConfig({ theme })`, then build into `dist-shoot-<theme>` and serve. This is the same loop as `gallery()` (`gallery.ts:93-152`), extracted into a shared `buildAndServe(look)` helper so neither file copies it.
- **Per page:** follow the `cards.ts:90-103` sequence. Set `Emulation.setDeviceMetricsOverride`; set `Emulation.setEmulatedMedia` with `prefers-color-scheme` and `prefers-reduced-motion: reduce`; navigate; wait for `document.fonts.ready`; then `Page.captureScreenshot { captureBeyondViewport: true }`, clipped at 8,000 px tall. A page that is taller gets a `truncated` note, not a giant PNG.
- **Output:** `shots/<theme>/<route-slug>-<width>-<scheme>.png`, `shots/shoot.json` (paths plus `page.cls`, font kb and the rendered taste results from §6.2), and **`shots/contact.html`**.
- **`contact.html`:** static and zero-JS. There is one section per scheme, one row per route and one column per candidate, and each cell shows the 390 and 1280 shots side by side, with 768 and 1440 behind a `<details>`. The candidate name and its direction-card line (from its DESIGN.md) head each column.
- **The camera photographs its own sheet:** `shots/contact-<route>-<scheme>.png` at 1440 wide. These are the images an agent reads and the judge critiques. A handful of pictures fits in context; 216 would not.
- **Budget:** 3 candidates × 9 routes × 4 widths × 2 schemes = 216 shots. With one browser and a fresh page per shot, that should be well under two minutes on this box; measure it and put the number in the report.
- **Front doors:**
  - the CLI verb `shoot` (`cli/src/index.ts`, a new `case`, help text in `default:`)
  - the MCP `bench` catalogue tool gains `action: "shoot"` (`mcp/src/catalog.ts:76`); the result lists the contact PNG paths
- **No Chrome:** `findChrome()` fails, and the error carries the same hint `cards` gives (S28 clean machines).

**Proof:** one contact sheet of editorial, technical and studio from the monorepo, plus folio shot from `sites/snypd.rocks` with `--root`, at all widths and both schemes. The sheet goes to Sunny as the first artefact of the factory.

**Built (19 Sep 2026), and where it differs from the above.** The specimen is `corpora/specimen/`, beside the other corpora, not under `packages/bench/`. The term route is `/tag/field-notes/`, because that's what the build writes. `shoot` defaults to the specimen and to both schemes. On a site that has fewer of the nine routes, the page suite's `pickRoutes` fills up to nine, one per URL shape. Each shot waits for `img.decode()`, not `complete`: at six pages at once, a loaded cover was photographed before it painted. Measured on this box at load average 10–16, so read the numbers as soft: editorial, technical and studio, 216 shots in **129 s** at six pages at once (252 s at four under heavier load); folio on snypd.rocks, 72 shots in 76 s. That is over the two-minute guess. Three long reads go past the 8,000 px cap and are marked `truncated`.

**The sandbox and the continuous preview** (19 Sep 2026, Sunny: *"you have to use docker for a sandbox container.. and i need continuos preview of the work"*). All factory work runs in `docker/`: Bun 1.4, Chromium, Node and a fixed Noto font set, so a shot looks the same on every machine. The repo is mounted at its own path and the container runs as the host's user. `docker/box up` starts two previews that stay up:

- `:4400` is the specimen in `$THEME` under `snypd dev`, which reloads on every edit.
- `:4401` is the contact sheet for `$THEMES` at 390 and 1280 px, in both schemes. It's re-shot within a couple of seconds of any edit to `themes/`, `packages/render/src` or the specimen, and swapped in whole once the run finishes (~90–120 s for three themes).

`docker/box run bun test` runs the suite in the box: 493 pass, 0 fail, the same as on the host.

---

## 4. TF3: seed expansion (one session)

### 4.1 Interface

```
snypd seed <name> --seed="oklch(0.55 0.13 252)" --strategy=restrained|balanced|expressive
                        --scheme=both|light|dark --ratio=1.2:1.25 --base=17:19 [--face=<shelf id>]
```

- **CLI:** a new `case "seed":` (`cli/src/index.ts`). *As built (TF3): the plan said `snypd theme seed`, but the CLI refuses noun verbs on purpose — `theme set`/`theme list` belong to MCP (decision 51, the comment above `case "new"`) — so seeding is a bare verb beside `new`, `check` and `shoot`. It seeds only a theme in the site's own `themes/`.*
- **MCP:** `theme` tool, new `action: "seed"` (`catalog.ts:48` enum, branch in `case "theme"` at `:184`, beside `scaffold` at `:315`).
- **Where the work happens:** `packages/core/src/seed.ts`, a pure `expandSeed(input) → { tokens, css, report }`. The CLI and MCP only write the result.
- **Writing:** `theme.yaml`'s `tokens:` map is written through the `yaml` Document API, the way `core/src/site.ts:40` edits `snypd.yaml`, so comments survive. The seed inputs go under a `## Seed` heading in `DESIGN.md` (theme.yaml is `.strict()` and gains no key), which makes a re-seed reproducible.

### 4.2 The palette solver

All work is in OKLCH; every output is re-checked through `resolveColor` (`color.ts:174`), the function `check theme` itself uses, so "passes by construction" means passing the real gate, not a twin of it.

| Role | Light | Dark | Target |
|---|---|---|---|
| `bg` | L 0.985, seed hue, chroma by strategy (0.004 / 0.010 / 0.022) | L 0.165, same hue, chroma × 1.2 | none |
| `surface` | bg L − 0.035 | bg L + 0.045 (raised by lightness) | none |
| `text` | seed hue, chroma 0.01–0.02, solve L | solve L; stops short of white (L ≤ 0.95) | **≥ 7:1** against the worse of bg and surface |
| `muted` | seed hue, low chroma, solve L | same | ≥ 4.5 + 0.3 margin against both |
| `accent` | the seed's own H and C, solve L | chroma × 0.85 (desaturated 15 %), solve L | ≥ 4.5 + 0.3 margin against both |
| `on-accent` | bg if it clears 4.5 against accent, else text, else solve | same | ≥ 4.5 + 0.3 |
| `border` | bg L − 0.09 | bg L + 0.10 | ungated (docs: `check.ts:61-68`) |
| `viz.1–6` | 6 hues from the seed hue at 60° steps, one shared L, chroma clamped to gamut | L raised for dark | ≥ 3:1 against bg (graphics, WCAG 1.4.11) |

- **Solve L:** a binary search on L with H and C fixed, 24 iterations. If the colour leaves sRGB, chroma is reduced until it fits (`inGamut`). The **+0.3 margin** absorbs rounding: values are emitted as `oklch(L C H)` rounded to three decimals, and are then re-resolved and re-checked. If any role cannot hit its target (a seed hue at a hostile lightness), the solver moves the accent's L the other way and says so in `report`. It never emits a failing pair silently.
- **Strategy** sets how far the hue reaches beyond the accent:
  - `restrained`: neutrals barely tinted, the seed only in the accent
  - `balanced`: tinted neutrals
  - `expressive`: a surface tinted enough to read as a colour, and the accent at full chroma

  Each of these is still one bold place (docs/28 §4.2), not three.

### 4.3 Type and space: Utopia maths

- **Fluid steps:** between 390 px and 1440 px (the camera's own ends), steps −2 … 5 are computed as `size_n = base × ratio^n` at each end. Each step becomes `clamp(min rem, intercept rem + slope vw, max rem)`.
- **Token names:** the names are the set editorial already declares under `size.*`. They are confirmed on day one of TF3 and listed in the report; a theme extending `base` gets the full set declared.
- **Space:** `space.1–6` is step 0 × (0.25, 0.5, 1, 1.5, 2.5, 4).
- **Leading:** `leading.body` comes from the face's x-height (shelf data, §5): 1.5 at x-height 0.50, plus 0.05 per 0.02 above it, capped at 1.7. `leading.tight` is 1.1 to 1.2 by the same rule.
- **Measure:** `measure` is 66ch, pinned. (The taste lint warns outside 45–80ch.)

**Proof:** a property test in `core/src/seed.test.ts`:
- **Inputs:** 1,000 seeds from a fixed-seed PRNG × 3 strategies × both modes.
- **Pairs:** every one of `check.ts`'s seven PAIRS clears its minimum.
- **Stricter bar:** text clears 7:1, and every viz colour clears 3:1.
- **Gamut:** every value is in gamut.

`PAIRS` moves from `check.ts:69` into `@snypd/core`, so the test and the gate read one list. A second test runs `checkTheme` on three seeded scaffolds end to end.

---

## 5. TF4: the font shelf (one session)

The contract carries **one** web font (`ThemeFontSchema`, `schema.ts:210`; `MAX_FONT_KB = 40`, `:173`). So the shelf pairs each face with a **system stack**, not with a second web font. That is a feature: one face, spent well, is the "one bold place" for most themes.

- **Package:** `packages/shelf/` (`@snypd/shelf`), a dependency of the CLI, **never imported on the MCP initialize path** (cold-start memory). `shelf.json` plus `fonts/<id>.woff2` plus `licences/<id>.OFL.txt`.
- **Build script:** `scripts/shelf-build.py`, dev-time only.
  - `pyftsubset --unicodes=U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122 --layout-features='*' --flavor=woff2`, keeping kerning.
  - It reads OS/2 and hhea to compute `xHeight`, `capHeight`, the average width and the metric-matched fallback: `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override` against Georgia, Arial or `ui-monospace` by category.
  - The output is committed; CI checks that nothing drifts.
- **Manifest entry:** `{ id, family, category, file, kb, weight: "400" | "200 800", style, xHeight, fallback: { local, sizeAdjust, … }, suits, pairsWith: <system stack>, licence }`.
- **Seeding with `--face`:** it copies the woff2 and its OFL.txt into `themes/<name>/fonts/` (self-contained, the way editorial and studio already ship theirs) and writes `font:` in theme.yaml. It also puts a `@font-face` fallback block with the overrides at the top of theme.css, so the swap has no layout shift.
- **Starting list** (confirmed against the files on day one; licences are read, not assumed):
  - Instrument Serif, Instrument Sans, Crimson Pro, Young Serif, Gloock, IBM Plex Serif, IBM Plex Sans, IBM Plex Mono, Big Shoulders, Work Sans and Lora, all from `canvas-fonts/`
  - Source Serif 4 and Bricolage Grotesque, already in the binary
  - up to five more, chosen to fill gaps: a humanist sans, a slab and a condensed display
- **Excluded by default** (decision 227): Inter, Roboto, Geist, Fraunces, Space Grotesk and Plus Jakarta. A brief that names one gets it through `--face-file`, and taste lint notes the choice.

**Proof:** a test asserts every face ≤ 40 KB and that `kb` in the manifest equals the file's size. `snypd shoot` over a seeded theme per face shows `page.cls` = 0 at 390 and 1280.

---

## 6. TF5: taste lint and DESIGN.md (one session)

### 6.1 Static rules: in `check theme`, from the CSS and the resolved tokens

These are added through `add(...)` in `check()` (`check.ts:181`), all as `warn`, modelled on `css.enhancement-guarded` (`:290-303`). They reuse the CSS reading `unguardedCss()` already does. The logic lives in `render/src/taste.ts` so the rules can be unit-tested in isolation.

| Rule | Fires when |
|---|---|
| `taste.gradient-text` | `background-clip: text` with a gradient |
| `taste.side-stripe` | `border-left`/`border-inline-start` > 1 px in a colour on a box that also has a background or padding |
| `taste.overused-font` | `font.family` is on the excluded list |
| `taste.untinted-neutral` | `#000`, `#111`, `#fff`, pure grey or `oklch(… 0 …)` in bg/surface/text while the accent has hue |
| `taste.transition-all` | `transition: all` or `transition-property: all` |
| `taste.radius-soup` | more than three distinct `border-radius` values |

### 6.2 Rendered rules: run by `shoot`, in the same `RuleResult` shape

These need layout, so they run in the browser `shoot` already drives (a `Runtime.evaluate` at design time; the page itself still ships no JS). They land in `shoot.json`, are printed by the CLI and are badged on the contact sheet's cells.

| Rule | Fires when |
|---|---|
| `taste.eyebrow` | an element with `text-transform: uppercase` and `letter-spacing > 0.05em` directly precedes an `h1`/`h2` |
| `taste.tiny-text` | body-copy text under 14 px at 390 |
| `taste.measure` | a paragraph's line is > 80ch or < 45ch at 1280 |
| `taste.flat-hierarchy` | the h1:h2 or h2:h3 computed-size ratio is < 1.15 |
| `taste.monotonous-spacing` | more than 80 % of vertical gaps between blocks share one value |

**"The brief wins":** DESIGN.md's `## Chosen` list names rules the brief asks for (for example `taste.eyebrow: the magazine wants kickers`). A named rule still reports, as `warn (chosen)`. The warning is the record of the choice.

### 6.3 DESIGN.md, scaffolded

`snypd new theme` (`scaffold.ts:162`) writes a fourth file:

```markdown
# <name>
<!-- One sentence of this becomes theme.yaml's `personality:`. -->

## Use scene        — who reads this, where, in what light (this picks light or dark, the category never does)
## Visitor mode     — Read | Persuade | Operate | Experience
## References       — urls or screenshots
## The rut          — the page this category always ships
## Boldness goes here — exactly one place
## Safe / Risk      — ≥ 2 of each, each risk with its cost
## Chosen           — taste rules this brief overrides, and why
## Seed             — written by `snypd seed`
## Decisions        — dated, one line each
```

`meta.design` (warn) fires when DESIGN.md is missing or still holds the placeholder, the way `meta.personality` already works (`check.ts:249`).

**Proof:** each rule has a failing and a passing fixture in `render.test.ts` beside the X1 suite (`:2742`). The bundled themes' warnings are listed in the report and each is fixed or written into that theme's `## Chosen`.

### 6.4 As built (19 Sep 2026)

TF5 landed in `render/src/taste.ts`, with the rules tightened where a first run on the bundled themes showed them firing wider than their intent:

- **`taste.side-stripe`** needs a *fill* (`background`), not padding. A padded blockquote with a rule down its side is typography older than any kit; the admonition is the stripe on a tinted box.
- **`taste.radius-soup`** counts corners, not declarations: `0 r r 0` is the radius `r`, and full rounding (`50%`, ≥ 99 px) is one shape however it is written.
- **`taste.overused-font`** reads the face that renders, meaning the webfont and each font token's *first* family. Roboto as a fallback in a system stack is not a choice.
- **`taste.untinted-neutral`** fires below OKLCH chroma 0.0025 on bg, surface or text, and only in a mode whose accent has chroma ≥ 0.04.
- **`taste.tiny-text`** skips footnotes, nav, header, footer, captions and asides.
- **`taste.measure`** is characters per full line, the median over paragraphs of ≥ 180 characters that wrap at least three times, and needs two of them.
- **`taste.monotonous-spacing`** only counts gaps between *unlike* blocks, so paragraph-to-paragraph gaps are excluded (they are equal on every good page). It needs six gaps.
- **Rendered rules** are judged once per route and width, in the first scheme, never on `/404`: `tiny-text` at ≤ 480 px and the rest at ≥ 1024 px. They land on each candidate in `shoot.json` as `taste`, are printed by the CLI and are badged in each column's header on the sheets.
- **`meta.design`** needs five sections filled: Use scene, Visitor mode, The rut, Boldness goes here, and Safe / Risk. The scaffold writes its questions as HTML comments, which don't count as content.
- **Bundled themes.** Each of the four now has a DESIGN.md (`.md` is bundled text now). Every warning that fired is written into its `## Chosen`: eyebrows (the author's `cover.eyebrow`) and technical's 44rem measure are genuine choices. The tldr/callout stripes on editorial, technical and studio, and the untinted neutrals on studio and technical, are marked *held as shipped; revisit on sight*. Those looks are Sunny's to change (decision 209), not the lint's.
- **`shoot` safety.** It refuses unknown flags (`--help` prints usage) and refuses to clear an `--out` that holds anything but a previous shoot. A `--help` read as "no options" once replaced `shots/` wholesale. It also builds into `dist-<purpose>-<slug>-<pid>` with its own index, and `stop` removes both: two shoots of the same look (the sandbox preview and anyone else) used to share one directory, and the first to finish deleted the second's pages, which showed up as 160 HTTP 404s.

---

## 7. TF6: the script, the judge, the memory (one session plus the proof sitting)

### 7.1 `build-theme`, rewritten (`mcp/src/prompts.ts:174-209`)

It is one script of ten steps. Every step names its tool, and the taste rules are inline, so a harness with no design skills still gets them.

1. **Read.**
   - Theme resources: `snypd://theme`, `/coverage`, `/tokens`
   - Taste memory: the site's `DESIGN.md` decisions (§7.3)
   - Installed skills: *if your harness has impeccable or frontend-design installed, load it now; it is a boost, not a requirement.*
2. **Brief.** Fill `themes/<name>/DESIGN.md` from what the owner said. Ask at most three questions, and only if use scene, visitor mode or references are missing.
3. **Three direction cards.** Each card has a world, a face, a palette strategy, a layout approach, where the boldness goes, and SAFE/RISK. Apply the **anti-sibling test**: swap the headlines, and if you can't tell, redo one. Keep off the five AI clusters (cream + terracotta; near-black + acid accent; hairline broadsheet; SaaS-card kit; tracked-caps eyebrow + middot meta + "→" links).
4. **Scaffold and seed each.** Call `theme` › scaffold three times (`<name>-a/-b/-c`), then `theme` › seed with each card's inputs.
5. **Style each.** Write theme.css with `var()` only and `@supports` tiers, and spend the boldness in the one named place. Override a part only when the markup is wrong.
6. **Shoot.** Call `bench` › shoot on all three; read the contact PNGs.
7. **Gates.** Run `check theme` (fails block), `bench page` (fails block) and taste lint (warns: fix, or add to `## Chosen` with a reason). Do one fix round, then at most one more.
8. **One critique round** (§7.2).
9. **Hand the contact sheet to the owner.** Send `shots/contact.html` and each card's one line. Stop and wait.
10. **Polish the pick, then report.**
    - Delete the two losers' directories.
    - Rename the pick.
    - Write the owner's reasons into both DESIGN.md files.
    - Paste the `check theme` line and the shot paths.

### 7.2 The advisory judge

This is not code; it is a step in the script with fixed inputs. The agent reads the contact PNGs against a rubric in `mcp/src/rubric.md`: hierarchy, rhythm, the one bold place, the rut, dark mode as designed, and phone as designed. It names regions and proposes at most five changes. Few-shot pairs (UICrit's method) live in `packages/bench/judge/`. They are three before/after shot pairs taken with `shoot` from git history: `technical` before and after its fixes, studio before and after U10, and the folio mockup against folio as built. It gets two rounds at most, then the choice goes to the human. **It never gates** (decision 224).

### 7.3 Taste memory

A site-root `DESIGN.md` has a `## Taste` log. Step 10 appends the owner's reasons, dated, in their words. The monorepo's copy is seeded from docs/24 and docs/25, with entries like "boxes inside boxes", "too much text in mono" and "centred hero, one column". Step 1 reads it before any card is written.

**Proof: the sitting.** One brief, three themes, one contact sheet, Sunny picks, in one sitting. The pick ships as the fifth bundled theme (call 4): it is added to `BUNDLED_NAMES` (`core/src/bundled.gen.ts:14`), gets a gallery row, and gets a README still.

### 7.4 As built (20 Sep 2026)

The script, the rubric and the memory landed as specified. Four things about *where* they landed were decided on the day:

- **The rubric travels inside the prompt.** `mcp/src/rubric.md` is a document — it is edited by eye and read by a person as often as by a model — and it is imported as text (`with { type: "text" }`, the convention `bundled.ts` already uses) and spliced into step 8, its headings demoted a level on the way in. A *dynamic* import, so it is its own chunk under `--compile --splitting` and never on the `initialize` path: `prompts/get` pays for it and nothing else does. Checked through the compiled binary, the S18a rule — `serve` over stdio answers `build-theme` at 14,676 characters with the six axes, the three candidate names and the stop at step 9 in it.
- **The few-shot pairs do not travel.** `packages/bench/judge/` is read by an agent working *on this repository* — tuning the rubric, or judging whether the judge is any good — and nothing in `packages/` imports it, so the binary carries none of its 1.6 MB. A user's site gets the rubric and the one worked example inside it, which is what the prompt can honestly carry. Three pairs: `technical-u6b` (the three fixes docs/11 §7b records, **reconstructed** — they were made on sight before the theme was first committed, so no "before" commit exists), `studio-u10` (`git archive c0fd84c` against today, one camera), and `folio-s34` (the mockup Sunny picked against the page as built). `pairs.json` carries each finding in the rubric's shape with the fix beside it, and `provenance` on every pair says whether the "before" is history or a reconstruction — a fixture that quietly pretends to be history teaches the model that provenance does not matter.
- **The taste log is a file and a habit, not a surface.** The site-root `DESIGN.md` is read in step 1 and appended in step 10 by the agent, with the filesystem access it needs for `theme.css` anyway. No resource, no tool, no schema: a `## Taste` log that an agent has to call a tool to read is one more thing to forget. The monorepo's own copy is seeded from docs/24 and docs/25 — the nine hero rounds, *"the home page has too much text"*, *"no boxes inside boxes"*, and decision 209's reason, that the two looks before it were approved in prose and refused on sight.
- **Step 9 says "wait" twice.** The first draft ended step 9 with "hand it over"; the failure mode that wording invites is an agent that polishes its favourite while it waits, which makes the choice before the owner sees the sheet. The text now refuses both the pick and the polish, and the test asserts the sentence.

`build-theme`'s old eight steps are all still in here — the contract lessons U6b paid for (a theme is `theme.yaml` plus one stylesheet; every value is a `var()`; zero JavaScript and what the markup does instead; never fork a layout) are now steps 1 and 5, because they are what *styling a candidate* means. What is new is everything around them: the brief, three directions with the anti-sibling test, seed-then-face, the camera, the two gates plus the lint, one critique round, and a human at step 9.

Tests: 557 pass, 1 todo, 0 fail; typecheck clean. The prompt's assertions are in `mcp.test.ts` beside U6b's.

**Not done: the sitting.** It needs Sunny for its middle step, and it is the proof — one brief, three candidates, one contact sheet, a pick, and the fifth bundled theme.

---

## 8. The workflow, end to end: one example run

A worked example of what the finished factory does. The commands are real, as specified above. **The values, file contents and results below are made up for illustration**, not recorded.

### Step 0: the ask

> *"I run a second-hand bookshop. I want a site for our weekly letter: new arrivals, a long essay now and then, events. People read it on their phone on the bus, and at night."*

### Step 1–2: read, then the brief (`themes/marginalia/DESIGN.md`)

```markdown
## Use scene      Phone first, on a bus, often after dark. Evening reading → dark is designed, not an afterthought.
## Visitor mode   Read.
## References     A bookshop's hand-lettered shelf talker; the endpapers of an old Penguin; a library date-due slip.
## The rut        Cream background, terracotta accent, a serif, a hairline under the masthead: "cosy bookshop".
## Boldness goes here   The titles. Everything else steps back.
## Safe / Risk    Safe: a serif for body (reading is the job) · 66ch measure.
                  Risk: titles set very large at phone width (cost: long titles wrap to four lines)
                  · no cream (cost: loses the obvious "books" signal).
```

### Step 3: three direction cards

| | **A · Date-due slip** | **B · Endpaper** | **C · Night shelf** |
|---|---|---|---|
| World | the library card: ruled, stamped, practical | a 1960s paperback's endpaper: pattern, one strong colour | the shop after closing: a lamp on one shelf |
| Face | IBM Plex Serif | Young Serif | Crimson Pro |
| Palette | restrained · seed `oklch(0.52 0.12 250)` ink blue | expressive · seed `oklch(0.62 0.16 145)` Penguin green | balanced · seed `oklch(0.74 0.12 75)` lamp amber, dark-first |
| Layout | single column, dates in the margin at ≥ 1280 | a full-width green band behind each title | a narrow column in a dark room; the title glows in accent |
| Boldness | the stamped date | the band | the lamp colour on titles |

Anti-sibling check: swap A's and C's headlines, and the difference is obvious (a ruled light page against a dark room). All three pass.

### Step 4: scaffold and seed (what the MCP calls do; the CLI equivalents shown)

```
snypd new theme marginalia-a --extends=editorial
snypd seed marginalia-a --seed="oklch(0.52 0.12 250)" --strategy=restrained --ratio=1.2:1.25 --base=17:19 --face=ibm-plex-serif
snypd seed marginalia-b --seed="oklch(0.62 0.16 145)" --strategy=expressive --ratio=1.25:1.333 --base=17:20 --face=young-serif
snypd seed marginalia-c --seed="oklch(0.74 0.12 75)"  --strategy=balanced  --scheme=both --ratio=1.2:1.3 --base=18:20 --face=crimson-pro
```

What the seed step reports (illustrative):

```
marginalia-a · seed oklch(0.52 0.12 250) · restrained
  color.text      light-dark(oklch(0.24 0.015 250), oklch(0.93 0.012 250))   8.9:1 · 8.1:1   (≥ 7)
  color.accent    light-dark(oklch(0.49 0.12 250),  oklch(0.76 0.10 250))    5.3:1 · 5.0:1   (≥ 4.5)
  color.on-accent light-dark(bg, text)                                         5.3:1 · 4.9:1
  size.0 clamp(1.063rem, 1.004rem + 0.24vw, 1.188rem) … size.5 clamp(2.64rem, 2.05rem + 2.4vw, 3.62rem)
  font  IBM Plex Serif · 36 KB · fallback Georgia size-adjust 104.5%
```

### Step 5: style each

The agent writes each theme.css. For B, the one bold move is the band:

```css
.snypd-post > header { background: var(--color-accent); color: var(--color-on-accent); padding-block: var(--space-5); }
```

Everything else takes the chain's defaults.

### Step 6–7: shoot, then gates

```
snypd shoot --theme=marginalia-a,marginalia-b,marginalia-c
  216 shots · 1m38s · shots/contact.html

snypd check theme marginalia-b
  ✓ contrast.text  ✓ contrast.muted  ✓ contrast.accent  ✓ contrast.on-accent  ✓ font.budget (29 KB)
  ⚠ taste.flat-hierarchy  h2:h3 = 1.08 at 390 (/posts/long-read/)
  ⚠ taste.measure         72ch → 84ch at 1440 (/posts/long-read/)
```

Fix round 1: h3 moves up one step, and `measure` is capped with `min(66ch, 100%)`. Everything is clean.

### Step 8: one critique round (advisory)

> **C, dark, 390, `/posts/`:** the entry list's dates in muted amber compete with the titles in accent amber. There are two warm tones at similar weight, and the "one bold place" is split. Drop the dates to the neutral muted.
> **A, light, 1280, `/`:** the margin dates hang in empty space when a post has no date. Collapse the margin column below three entries.

The agent applies both, re-shoots, and stops.

### Step 9: the contact sheet goes to the owner

`shots/contact.html`, with one line per card on top. The owner looks, and picks:

> *"C. The dark one feels like the shop at night — that's us. But the titles are too big on the phone, and I want the green from B somewhere."*

### Step 10: polish, remember, report

- Delete `marginalia-a` and `-b`, and rename `-c` to `marginalia`.
- Title step 5 drops to step 4 at phone width.
- B's green becomes `color.viz.1` (charts, the events calendar) rather than a second accent, which keeps one bold place.
- A re-shoot and all gates are green.
- The site's `DESIGN.md › Taste` gains:

```
2026-10-xx · marginalia · picked "Night shelf" over ruled-light and endpaper-band.
  Why, in the owner's words: "feels like the shop at night". Wanted: smaller phone titles; B's green kept, demoted to viz.
```

The next time this site asks for a theme, step 1 reads that line first.

---

## 9. If a docs/28 call goes the other way

| Call | If the answer is… | This plan changes by |
|---|---|---|
| 1 · When | "all six before launch" | TF1–TF6 by ~1 Oct: TF2/TF3/TF4 run in parallel worktrees on days 1–2, TF5 on day 3, TF6 and the sitting on day 4. It's tight, and only if S28 is clean. |
| 2 · Rendered candidates (221) | "keep mockups" | TF2–TF6 still stand. Step 9 shows a mockup first and the candidates second. |
| 3 · folio's Inter | "revisit folio" | Add a TF6b: run folio's brief through the factory with the shelf, and let Sunny compare on one sheet. |
| 4 · Proof size | "a gallery of six" | Two sittings of three, one brief each. The sessions don't change. |
| 5 · impeccable | "vendor its seeds" | impeccable's SKILL.md frontmatter says Apache 2.0, but no LICENSE file ships. Ask upstream or find the repo's LICENSE first. If it holds, the 128 seeds go into `packages/core/src/seeds.json` with a NOTICE, and `--seed=impeccable:<id>` becomes valid. The detectors stay reimplemented either way. |

---

## 10. Risks

- **Gamut clamping dulls the accent** at some hues (saturated yellows and cyans in dark). Mitigation: the solver reports chroma lost; the direction card can pick a neighbouring hue.
- **One web font per theme** limits pairing. This is accepted: the shelf pairs with system stacks. If the proof shows a second face is truly needed, that is a contract finding for a later decision, not something TF4 does.
- **Shot count and time** grow with candidates × routes. The default is 9 routes; `--route` narrows it for a fix round.
- **The judge's taste drifts toward the few-shot pairs.** It is capped at five proposals and two rounds, and it never gates.
- **Chrome on clean machines** (S28). `shoot` needs a local browser, like `cards`, and must fail with a hint, never hang.

## 11. Definition of done, for any factory-made theme

- `check theme`: no fail, and every taste warning either fixed or in `## Chosen` with a reason.
- `bench page`: `page.js.kb` 0, font ≤ 40 KB, axe 0, CLS ≤ 0.05.
- Shot at 390 / 768 / 1280 / 1440 × light / dark on the full specimen. The shots have been looked at, by the agent, the judge and the owner.
- DESIGN.md complete: brief, seed, chosen, decisions.
- The owner picked it from a contact sheet, and their reasons are in the taste log.
