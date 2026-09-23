# 36 — Themes from pieces: the bricks are in the four sheets, the studs are the tokens, and the sockets need work

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 23 Sep 2026 · **Launch:** Tue 6 Oct 2026 — unchanged by this document
**Asked for:** *"completely focus on theme generation like lego, by building reusable components structure and then audit again."*
**Replaces, for the theme track:** docs/32 V3 (the chrome shelf), docs/33 G1–G3 (the backdrop), docs/34 K1–K5 (the genome), and docs/35's order for all of them. The rest of docs/32 (Z, T1–T2, V1–V2) is **parked**, not withdrawn (§10).
**Scope:** what a reusable theme piece is, measured against the five sheets in the tree; the contract that lets a piece sit on any theme, and the three places the tree does not yet honour it; how pieces compose at build time, down to precedence; how an agent assembles a theme in a few hundred tokens; the agent's eyes on what it builds (§5a); the extraction that proves it; sessions. Two audits: §8 checks docs/32–35 against the code, §9 records the independent audit of this document's first draft and what changed because of it. Decisions from **266** (docs/35 claims 260–265).
**Status:** proposed; second draft, after audit.

---

## 1. What the tree says, measured on 23 Sep

Five sheets: `base` (behaviour only, U7), `editorial`, `technical`, `studio`, and `folio` (site-local, `sites/snypd.rocks/themes/folio`). Comments stripped, split into leaf rules; measured twice, independently, agreeing within three rules:

| Theme | Sheet (raw) | Rules | Copied verbatim from another sheet | Copied, as share of the raw file | Comment share |
|---|---|---|---|---|---|
| editorial | 26.3 KB | 141 | 84–85 | ~28 % | 42 % |
| technical | 22.1 KB | 158 | 85 | ~30 % | 25 % |
| studio | 42.3 KB | 248 | 65–68 | **~14 %** | 34 % |
| folio | 33.3 KB | 219 | 60 | **~17 %** | 28 % |

Only **20 rules** are in all four; 16 in three; 83 in exactly two, and the pair that shares most is editorial ↔ technical (67). So copying is real for the two reading themes and modest for the two expressive ones. The case for pieces is not mainly de-duplication — it is that **each sheet's own sections are the variants a stranger's theme should be able to pick**, and today they can only be had by forking the whole sheet.

What holds the design up:

1. **The studs exist.** All four declare the same **40 tokens** (21 colour, 4 font, 5 size, 2 leading, `measure`, `space.1–6`, `radius`); studio adds `font.display`, `size.display`; folio those and `size.number`, `measure.wide`. `expandSeed` (`packages/core/src/seed.ts:236-263`) writes **35** of the 40 from one colour; `writeSeed` adds the `font.*` when given a shelf face; nothing writes `radius`.
2. **The sockets mostly exist.** All four style the same **35 `snypd-*` classes**; 34 are emitted by `base`'s primitives, parts or the renderer. But **48 further classes** the themes style are emitted by no `base` file — `snypd-masthead`, `snypd-brand`, `snypd-tagline`, `snypd-logo`, `snypd-card*`, `snypd-ledger*`, `snypd-hero`, `snypd-band`, `snypd-close`, `snypd-toc-label`, `snypd-repo`, `snypd-work*` — they come from theme-owned parts and layouts. §3 deals with this.
3. **The baseplate exists.** Every sheet is wrapped in a cascade layer — `@layer snypd.tokens, snypd.base, snypd.theme, snypd.site` (`packages/render/src/tokens.ts:40`), each theme in the chain a sublayer of `snypd.theme` (`theme.ts:509-515`). `snypd.site` is declared but nothing emits into it yet (`tokens.ts:34`).

**The mastheads differ mostly in CSS — and in markup in four places.** The five `parts/header.tsx` are 1.5–2.0 KB and share their shape, but: header class (none in base/folio, `.snypd-masthead` in the other three); brand wrapper (none; `div.snypd-brand > a`; `a.snypd-brand`); tagline element (`<p>` under in editorial, `<span>` beside in technical, none in studio/folio); logo (absent in base); technical's `repo` item and its `items.length || repo` condition. One part with switches is achievable, **after `base`'s header adopts the masthead classes** — an HTML change to base, folio and (in wrapper shape) studio. It is a small change, and it is a change.

## 2. The brick — a piece

A piece is one answer to one question a theme must answer:

```
packages/pieces/masthead/title-bar/
  piece.yaml     # what it is, what it reads, emits, switches and offers
  piece.css      # rules over the class contract, reading tokens
  sticky.css     # a switch: included when `sticky: true`
  still.png      # base + the default seed, 1280 light — how it is picked
```

```yaml
piece: masthead/title-bar
from: technical                    # provenance (decision 267)
line: One line — name, rule, tagline, menu. A path, not a nameplate.
reads: [font.mono, color.border, color.muted, space.2, space.3, size.small]
needs: {}                          # tokens beyond the contract, with derived defaults (§3)
emits: []                          # classes this piece's own part/layout emits (§3)
switches:                          # build-time; reach CSS as files, markup as ctx.pieces (§4)
  sticky:  { default: false }
  tagline: { default: beside, of: [beside, under, none] }
settings:                          # site-facing choices, merged into the chain's declarations (§4)
  - { id: repo, type: url, description: "A `src` link to the repository, last in the menu." }
part: null                         # base's header; a piece ships a .tsx only when markup must differ
pairs: {}                          # constraints on other slots, for the sampler (§5)
kb: 1.1                            # minified, counted into the theme's cssKb
```

**Slots**, with each first variant carved from a sheet already judged on sight. Where the audit found a variant tangled with another slot, the coupling is written as a `pairs:` constraint now rather than discovered later:

| Slot | Variants (carved from) | Kind | Coupling |
|---|---|---|---|
| `column` | `three-track` — every sheet; breakout width (`+12rem` technical, `+24rem` studio) becomes a token `measure.breakout` | CSS | — |
| `masthead` | `plain` (base/folio) · `nameplate` (editorial) · `title-bar` (technical) · `bar` (studio) | CSS + switches on base's header | `bar` reads `--masthead` and `.snypd-hero[data-tone]` → **pairs `home: bands`** |
| `prose` | `book` (editorial) · `docs` (technical) · `display` (folio) | CSS | — |
| `code` | `quiet` (editorial) · `first-class` (technical: bordered inline code, ruled tables) | CSS | — (missing from draft 1) |
| `cover` | `quiet` (editorial) · `path` (technical) · `reel` (studio §1) | CSS | `reel` lives in studio's bands section → **pairs `home: bands`** |
| `blocks` | `surface` (editorial) · `ruled` (technical) · `hairline` (studio, folio) | CSS over the 14 primitives | — |
| `entries` | `list` (base) · `rows` (technical) · `cards` (studio) · `ledger` (folio) | part + CSS | `cards` renames `.snypd-card` → `.snypd-entry-card` (collides with `bench/cards.ts:62`) |
| `post-foot` | `band` (editorial) · `pills` (studio) · `ruled` (technical) · `facts` (folio) | CSS | — |
| `footer` | `line` (base) · `colophon` (studio) · `close` (folio) | part + CSS | `close` needs `.snypd-close` from folio's home → **pairs `home: split`** |
| `home` | `stream` (base) · `bands` (studio) · `split` (folio) | layout + CSS + settings (`bands`, `heroLabel`, `heroHref`) | carries the banding the draft wrongly put in `column` |
| `notes` | `cards` (base) · `sidenotes` (editorial) | CSS | — |
| `toc` | `none` (base) · `block` (technical) | part + CSS + setting `tocDepth` | — |
| `motion` | `still` (folio) · `glide` (editorial, studio 280 ms; technical 240 ms → a token `motion.duration`) · `reveal` (studio tier B) · `count` (folio tier B) | CSS | — |
| `wall` | `row` (editorial, technical) · `marquee` (studio) | CSS | — |
| `house` | the **20** rules in all four sheets — viz keeps its drawn size, block breath, source-link idiom … (list in P1). Reduced motion moves to `base`'s sheet, where the other behaviour already is (`themes/base/theme.css:99`) | CSS, always on | — |
| `backdrop` | `none` · `wash paper air silk bars mist` — docs/33, as a drawn piece | generated SVG + tokens | P7 |

**Sixteen slots, 48 variants** with `backdrop`; fifteen and 41 without. **Not pieces, and staying theme residue:** layouts for a site's own types — studio's `work` / `work-index`, folio's `log` / `log-index` / `release`. They answer a content model, not a look; a theme for a site with those types keeps them as files, exactly as today.

## 3. The contract — and the three places the tree does not honour it yet

A piece **reads** contract tokens and **styles** contract classes. Written down in **`spec/theme-contract.yaml`** (new), generated and tested:

- **Tokens:** the 40, plus optional ones with defaults derived from the 40 — `font.display: var(--font-heading)`, `size.display: calc(var(--size-h1) * 1.6)`, `size.number: var(--size-h2)`, `measure.wide: calc(var(--measure) * 1.5)`, `measure.breakout`, `motion.duration: 280ms`. A piece's `needs:` adds to this list for itself.
- **Classes:** `base`'s emitted classes **plus the classes a piece's own part or layout emits** (its `emits:`). A test fails when a class is emitted and not listed, or listed and not emitted.

Where the tree does not honour it yet, and the session that fixes each:

1. **The masthead classes** — `base`'s header adopts `.snypd-masthead`, `.snypd-brand`, `.snypd-tagline`, `.snypd-logo` and the logo setting (P1). An HTML change to base and folio; editorial and technical keep their markup and drop their header files.
2. **`.snypd-card`** — renamed in studio's entries before it becomes a piece (P3).
3. **Literals.** A strict `piece.literal` (no colour, no length but `0`/`1px`, no font name) would reject **7–10 %** of all declarations (editorial 32/401, technical 29/427, studio 66/688, folio 54/629) — `blur(14px)`, `border-radius: 100px`, `outline: 2px`, `border-left: 3px`, `minmax(9rem, 1fr)` vs `11rem`, `280ms`. So the lint has a vocabulary: lengths in `em`/`ch`/`%`, `0`, `1px`, `2px` (focus and rules) and `100vmax`-style pills pass; a colour or a font name never does; anything else becomes a switch, a token (`motion.duration`, `measure.breakout`) or stays in the theme's residue. Each exception is listed in P1, not decided in a hurry during P3.

`piece.selector` fails a selector naming a class outside `base`'s list plus the piece's own `emits:`.

## 4. Assembly — `pieces:` in `theme.yaml`, and exactly how it resolves

```yaml
theme: marginalia
extends: base
pieces:
  masthead: { use: title-bar, sticky: true, tagline: under }
  prose: book
  code: first-class
  blocks: ruled
  entries: ledger
  footer: line
  home: stream
  motion: glide
  backdrop: { use: paper, grain: 6 }
tokens: { … }                      # from the seed, as today
font: { … }                        # from the shelf, as today
css: ./theme.css                   # the bold move, and only that
```

**Where each step lives** — split between core (config, validation, gates) and render (CSS, parts), because the tree already splits them that way:

1. **Core config** (`packages/core/src/config.ts`): `pieces:` joins `ThemeYamlSchema` (`.strict()`, schema.ts:227) and **`withoutDecls`**, so it neither merges into `config.theme.*` (config.ts:288) nor lands in `snypd://config` and costs `tokens.learn`. It map-merges up `extends:` — a child names only the slots it changes. Pieces' `needs:` tokens and `settings:` are added **here**, before the `cssValue` gate (config.ts:448-453) and the settings validation (config.ts:455-457), so `check theme`'s contrast pairs and `snypd://theme/settings` see them. Core reads piece manifests (`pieces.json`, like `shelf.json`) and nothing else from the package.
2. **Render, CSS** (`theme.ts`): pieces are concatenated into **`@layer snypd.pieces`**, one sublayer per slot in a fixed canonical order — `snypd.pieces.house, .column, .prose, .code, .blocks, .cover, .masthead, .entries, .post-foot, .footer, .home, .notes, .toc, .wall, .motion, .backdrop` — so the order between slots is a stated fact, not an accident of concatenation. Switch files go inside their slot's sublayer. The layer statement becomes `@layer snypd.tokens, snypd.base, snypd.pieces, snypd.theme, snypd.site` (decision 270).
3. **Render, parts:** the chain walk (`declarer`, theme.ts:465) becomes: at each link, nearest first — **that theme's own part file, then the piece its own `pieces:` names for that slot** — then the next ancestor. So a theme that `extends: studio` and sets `entries: ledger` gets the ledger, because its own `pieces:` is nearer than studio's `parts/entries.tsx`.
4. **Render, layouts:** layouts are found by file presence up the chain (theme.ts:453-456), not through `declarer`, and `layouts:` REPLACES up the chain (theme.ts:431; studio theme.yaml:39-43). The same per-link step is added there: a `home` piece's layout counts as that link's `layouts/home.tsx`. `layouts:` keeps its replace semantics; a piece that ships a layout adds its name to the effective list.
5. **Switches reach markup through `ctx.pieces`** — a new, read-only field on the render context (`{ masthead: { use, sticky, tagline }, … }`), set from the merged `pieces:`. A part reads `ctx.pieces.masthead?.tagline`. Settings stay what they are: the site's choices, not the theme's build switches.
6. **Plumbing that must know:** `themeSignature` / the theme hash (theme.ts:294-305) includes the resolved pieces and their bytes, or incremental builds go stale; `partCoverage` gains a `piece` status; `check theme` runs `staticTaste` and `css.enhancement-guarded` over the **expanded** CSS with `piece/<slot>/<name>/piece.css:line` in its locations (check.ts:284-298 reads only the theme's own file today); the `cssKb` budget (`spec/defaults/budgets.yaml:13`) counts pieces; `bundled.gen.ts`'s generator embeds `packages/pieces` beside the four themes.
7. **Variations cannot swap pieces** in v1 — decision 127's line (values, never new declarations) holds. A variation retunes the tokens the pieces read.

**Live, not copied** (decision 268): the theme names pieces, it does not contain them. A fix to `blocks/ruled` reaches every theme on it with the next release, with before/after stills in the changelog. `snypd theme eject <slot>` writes the piece into the theme's own sheet (and part, if any); the slot then reads `own`.

## 5. The agent's path — a few hundred tokens, not a stylesheet

Through the existing `theme` tool — in the deferred catalogue, never in `tools/list` (`packages/mcp/src/catalog.ts:1-20`, `mcp.test.ts:476`) — and one resource:

- **`snypd://theme/pieces`** — every slot, its variants, one line, `pairs:`, the still's path; generated from the manifests. ≤ 1,200 tokens, gated. Replaces docs/34's `theme/genes` and docs/33's `theme/backdrops` (decision 262 carried).
- **`explore { n, lock, prefer, avoid }`** — docs/34 §3.1's mechanism over slots + seed inputs + face: sample (honouring `pairs:`) → express (tokens + concatenation, pure) → static gate (`staticTaste`, contrast, `piece.*`) → farthest-point spread → `n` genome lines. ≤ 600 tokens for six. `avoid` defaults from the site's root `DESIGN.md › ## Taste` (the only `## Taste` in the tree) and, where a theme has one, its `## The rut`.
- **`vary`**, **`cross`** — docs/34 §3.2–3.3, over slots.
- **`compose { id | genome, name, bold? }`** — writes `theme.yaml` (`pieces:`, the seed's tokens, the shelf face, `radius` from a genome gene — the seed does not write it), the genome under `## Genome` in `DESIGN.md`, and `bold` as `theme.css`.
- **`eject { slot }`** — §4.
- **Pictures:** `shoot` already writes a composite per route × scheme (`packages/bench/src/shoot.ts:220-222`) at four widths. `explore { shoot: true }` renders survivors through it.

**Combinations are proven pairwise** (decision 271): a covering array over the slots — every pair of variants in some tested theme, ~25–35 themes after `pairs:` — built on the specimen corpus in CI with `staticTaste`, contrast, axe and `page.cls`. A failing pair becomes a `pairs:` line.

## 5a. Eyes — the agent sees the brick it just placed

**Asked for:** *"can we give ability to the agent to have eyes on the theme it is producing, how gstack and other such skills and mcp do this?"* — then *"add latest, memory efficient and less or zero friction."*

**How others do it (read on 23 Sep from the installed skills).** gstack's `browse` keeps one Playwright Chromium alive behind a localhost daemon (~100 ms a command), writes PNGs the agent then `Read`s, crops to an element, shoots 375/768/1280 in one call, draws labelled boxes over the elements it is talking about, and diffs an accessibility-tree snapshot before/after an action; `design-review` adds an ~80-item checklist, an 11-pattern slop list, letter grades, one commit per fix and a re-shoot that reverts on regression, and sends images to GPT-4o to judge a match. impeccable injects ~50 measured detectors into the page (text overflow, occlusion, first-viewport overflow, rendered contrast, broken images) drawn as overlays, and rations looking: *one batched pass, at most one more*. The Playwright and Chrome MCPs return an image content block and a text accessibility tree with refs.

**What snypd has and lacks.** It has its own CDP client (`packages/bench/src/cdp.ts`), `shoot`'s contact sheets with taste badges (`shoot.ts:217-273`), five in-page taste probes (`taste.ts:257-295`), axe and CLS in `bench page`. It lacks: an image in a tool result (`ToolResult.content` is text-only, `packages/mcp/src/protocol.ts:20` — so an MCP client with no filesystem sees nothing); a warm browser (every `shoot` relaunches Chrome and re-shoots everything); a crop; any state but rest (no hover, focus, open menu); a before/after; taste hits with a place on the page; and layout detectors beyond the five.

**The design — one action, `theme › look`,** in the deferred catalogue (zero tokens per turn):

```jsonc
theme { action: "look", route: "/", slot: "masthead", width: 390, scheme: "dark",
        state: "menu-open", since: "last" }
```

→ **facts first as text, one picture second, the rest as links:**

```
masthead/title-bar · 390 dark · menu-open · 212 ms
✗ layout.overflow-x   nav > ul          +38 px past the viewport        box 1
✗ taste.tiny-text     .snypd-tagline    11.2 px                         box 2
✓ contrast 7.1:1 · tap targets ≥ 44 px · CLS 0 · no console errors
Δ since last: 3.2 % of pixels, all inside the masthead; taste 2 → 2
[image: the masthead crop, 390×140, boxes 1–2 drawn]
[link: snypd://look/7f3a/full.webp — the whole page, fetched only if read]
```

1. **Latest, and already negotiated.** snypd speaks MCP **2025-11-25** (`protocol.ts:7,23`). The result carries an `image` content block (base64 WebP), `structuredContent` for the facts (the field exists at `protocol.ts:20`, unused for this), and a `resource_link` for the full page and the before-shot, which costs nothing unless the agent reads it. The only protocol change is widening `content` to `text | image | resource_link`.
2. **Crops by slot — the lego pays for the eyes.** A piece owns known classes (`emits:` and the contract), so `slot: "masthead"` resolves to a selector, `Runtime.evaluate` returns its box, and `Page.captureScreenshot { clip, format: "webp", captureBeyondViewport: true }` shoots that and nothing else. Image tokens follow pixels (≈ w × h ⁄ 750): a 1280×800 page is ~1,370 tokens, a 1280×140 masthead ~240. The long edge is capped at 1,568 px and the width defaults to the slot's natural size. **The agent sees the brick it changed, not the wall.**
3. **States without a mouse.** `CSS.forcePseudoState` (`:hover`, `:focus-visible`), `showPopover()` for the phone menu, `open` on a `<details>`, `Emulation.setEmulatedMedia` for scheme and `prefers-reduced-motion`, animations paused. Deterministic: the same call draws the same pixels.
4. **Problems drawn where they are.** Every taste row and detector returns `getBoundingClientRect()`; the boxes are drawn onto the crop in-page (one absolutely positioned overlay, removed after the shot), numbered to match the text lines. New detectors, carved from impeccable's list where snypd has no equivalent: `layout.overflow-x` at 390, `layout.text-overflow`, `layout.occlusion`, `layout.broken-image`, `layout.tap-target`, and **rendered** contrast (the solver proves the tokens; this proves the page).
5. **Before/after without a library.** The last look per (route, slot, width, scheme, state) is kept in the artefact cache. `since: "last"` loads both images into a canvas **in the Chrome already running** and compares `getImageData` — changed-pixel share, the changed region's box, and the taste delta. No decoder, no dependency. P3's carving diff is this, run over every route.
6. **A text view, cheaper than a picture.** `look { view: "outline" }` returns `Accessibility.getFullAXTree` folded to landmarks and slot names — ~150 tokens — for "what is on this page and in what order" without an image at all.
7. **Rationed looking** (impeccable's rule, docs/29's rubric): facts come before the image; one image per call; `explore` and `vary` take at most two look passes before `compose`. The factory prompt says so.

**Memory.** One browser for the whole MCP session, started on the **first** `look` and never on `initialize` (the cold-start floor: `packages/bench` is reached by dynamic `import()`), one tab reused across looks, the site served from the preview server already running, and the process killed after **3 minutes idle**. `chrome-headless-shell` is preferred when present — the old headless build, without the full browser's UI layers. No Playwright (its install is a browser download plus a package tree), no second MCP server, no vision API: the agent is the eyes, and snypd only has to put the picture in front of it.

**Friction — zero steps on a machine that has any Chromium.** `findChrome` (`cdp.ts:14-21`) looks in five paths today. It grows to: `SNYPD_CHROME`; Chrome, Chromium, Edge and Brave in their usual places on Linux, macOS and Windows; and the browsers other tools already downloaded — `~/.cache/ms-playwright/*/chrome-linux/chrome`, `~/.cache/puppeteer/chrome*`, the macOS and Windows equivalents. **None found:** `look` still answers, with every fact that needs no browser (the static taste rules, token contrast, `check theme`), and one line: *"no browser on this machine — `snypd eyes install` fetches chrome-headless-shell (~90 MB) to ~/.cache/snypd once."* Opt-in, never silent. `snypd doctor` reports which browser `look` will use.

## 6. The proof — extraction, with a diff tool that does not exist yet

The first shelf is carved from the four sheets, and the four come back:

- editorial, technical, studio and folio rewritten as `pieces:` + tokens + a residue `theme.css`.
- **A shoot diff (new, P3):** before/after at all four widths, both schemes, per-pixel with a threshold, over the specimen plus the routes it lacks today (folio's `log`, `release`, `log-index`; studio's `work`). `shoot` has no diff mode and cuts at 8,000 px; both change.
- **Expected differences, named in advance rather than explained after:** (a) *residue beats pieces* — any rule left in `snypd.theme.X` wins over every piece regardless of specificity, so a generic residue rule (`main > * { grid-column: text }`) can override a piece's `figure.snypd-chart { grid-column: wide }`. Carving rule: **residue may not select a class a piece in the same theme styles**; a lint in P3 enforces it. (b) *order between slots* — fixed by §4.2's canonical sublayer order; a sheet whose later section overrode an earlier one (folio's "9. The fold", the runtime passes) has that rule moved into the later slot's piece. (c) *`!important` inverts across layers* — the reduced-motion rule moves to `base`, where its inversion is already the intended one. (d) *the base header's HTML change* (§3.1). (e) *view transitions and animation* are not in a still; they are checked by reading the expanded CSS, not the picture.
- **Residue targets:** editorial and technical ≤ 25 % of today's comment-stripped bytes; studio and folio ≤ 40 %. Over target means a slot is cut in the wrong place, and it is found before P4.
- **Folio is snypd.rocks' live theme.** Its carve lands on a branch; the site redeploys on the carved theme only after the diff is approved on sight.

## 7. Sessions

| # | Session | Lands | Days |
|---|---|---|---|
| P0 | **The baseline** | `theme.authoring.tokens` from `shoot`; one `build-theme` run split into *CSS written* and *pictures read* (docs/35 T3a, decision 260) | ½ |
| P1 | **The contract** | `spec/theme-contract.yaml` + its test against `base`; the optional tokens; the literal vocabulary; `piece.literal`, `piece.selector`; base's header adopts the masthead classes + logo; reduced motion into `base`; the list of the 20 `house` rules | 1½ |
| P2 | **The brick and the plate** | `packages/pieces` + `pieces.json`; `piece.yaml` schema; `pieces:` in the schema and `withoutDecls`, map-merged; `needs:`/`settings:` in core config; `snypd.pieces` sublayers; parts and layouts precedence per link; `ctx.pieces`; theme hash; `partCoverage: piece`; `check theme` over expanded CSS; `cssKb` counts pieces; the bundled generator; `house` as the first piece; `snypd://theme/pieces` | 3 |
| E1 | **Eyes** | `theme › look` (§5a): MCP `image` + `resource_link` + `structuredContent`; slot crops; forced states; boxes drawn in-page; the six layout detectors and rendered contrast; before/after in the running Chrome; the outline view; one warm lazily-started browser with a 3-minute idle kill; `findChrome` widened to Edge, Brave, Windows and the Playwright/Puppeteer caches; `snypd eyes install` as the opt-in fallback; `doctor` names the browser | 2½ |
| P3 | **Carving** | the diff over every route (E1's before/after); the missing specimen routes; the residue lint; the 41 variants out of the four sheets; the four themes rewritten; residue measured; folio on a branch | 4 |
| P4 | **The genome over slots** | `core/src/genome.ts` (docs/34 K1, genes = slots + seed + face + radius); `compose`, `eject`; `snypd seed` routed through `express` (docs/35 C8) | 1½ |
| P5 | **The search** | `explore`; `tokens.theme.explore`, `tokens.theme.pieces` gated; the pairwise suite in CI | 2 |
| P6 | **Vary, cross, one picture** | `vary`, `cross`, `explore { shoot }` — survivors seen through `look` | 1 |
| P8 | **The factory runs on pieces** | `build-theme`: brief → `explore` → sheet → `vary`/`cross` → `compose` + bold → `check` → contact sheet; P0 re-measured; target ≤ 20 % of the baseline | 1 |
| | **0.2.0 — themes from pieces** | | **17 days: Wed 7 Oct → Thu 29 Oct** |
| P7 | **The backdrop, as a drawn piece** | docs/33 G1–G3: `viz/src/backdrop.ts` and the SVG helpers, ramp from tokens, ink pairs, raster via `cards.ts`; a `backdrop` slot whose CSS reads the `--backdrop` the build draws | 3½ |
| | **0.2.1** | | **Wed 4 Nov** |

## 8. Audit one — docs/32–35 against the tree

| # | Claim | Where | Found | Consequence |
|---|---|---|---|---|
| A1 | Four themes rewrote the same masthead; it wants four patterns as parts | 32 §6.1, 34 §2 | The difference is mostly CSS; markup differs in four small places (§1) | One part with switches after base adopts the classes; four CSS variants. V3 would have shipped four near-copies of one file |
| A2 | `chrome:` its own key (247); `backdrop:` beside `font:` (249) | 32:227, 33:128 | Both are slots of one question | **One key, `pieces:`** (266); their substance carries |
| A3 | A run writes 15k–60k tokens of CSS | 34 §1 | 25–42 % of each sheet is comment | Plausible only if agents write comments as the sheets do; P0 measures it |
| A4 | K3 builds a composite sheet | 34 §6, 35 C5 | `shoot` already writes one per route × scheme; `--sheet <axis>` is not built | P6 is a day |
| A5 | ~12 genes, 4 of them chrome | 34 §2 | 15 slots in the sheets (16 with backdrop) | Genes = slots + seed + face + radius |
| A6 | `patterns:` reserved, deferred | schema.ts:264-268 | still reserved; `variants:` reserved too | New key `pieces:`; this document says *variant* only in prose, never as a key |
| A7 | Layer order fixed by decision 119 | tokens.ts:40; render.test.ts:299, :1984; bench/cards.ts:62; docs/11 | one constant, two exact test strings, one bench file, the decision log | 270 amends 119 |
| A8 | The contract is 40 tokens; the seed writes them | seed.ts:236-263 | the seed writes 35; no `radius` anywhere | `radius` becomes a genome gene; the optional tokens are P1 |
| A9 | Seed `measure: 66ch` | seed.ts:262 | editorial's is `37rem` (theme.yaml:178) | `measure` stays a theme's number; no piece sets it |
| A10 | New `theme` actions cost every turn | 32 §4.1 | `theme` is deferred (mcp.test.ts:476) | They cost `tokens.tools.full` only |
| A11 | `## Taste` feeds `avoid` | 34 §4 | root `DESIGN.md` only; folio has no `DESIGN.md` | `avoid` reads the site's; P3 gives folio one |
| A12 | docs/35's order around K | 35 §4 | the ask is now the theme track | Superseded for the theme track (272) |

## 9. Audit two — this document's first draft, independently checked

The first draft was audited by a second agent with no stake in it, re-measuring every number and reading every cited line. What it found, and what changed:

| Draft 1 said | Audit found | Now |
|---|---|---|
| a theme is "~⅓ copied, ~⅓ comments, ~⅓ its own" | true only for editorial/technical; studio ~14 %, folio ~17 % copied; 20 rules in all four | §1 restated; the case rests on variants, not de-duplication |
| `expandSeed` writes the 40 | writes 35; nothing writes `radius` | §1, A8, `radius` a gene |
| the 35 classes come from `base` | 34 of 35; **48 more** styled classes come from theme parts/layouts | §3: contract = base's + a piece's `emits:`; base's header adopts the masthead classes |
| the masthead is "one part with three switches", no new part | markup differs in four places | §1; P1 changes base's header HTML, named |
| switches reach markup via `settingText(ctx,"tagline")` | that is the tagline's *text*; parts get no switch channel; settings must be declared | `ctx.pieces` (§4.5); `settings:` in `piece.yaml` |
| `column: banded` | studio and folio reading pages are three-track; banding is the home's | `column` has one variant; banding in `home` |
| `motion: glide` in four sheets | three, at two durations | `motion.duration` token |
| `house` = shared rules incl. number trim, scrollbar gutter | those two differ per sheet | `house` = the 20 verbatim rules; reduced motion to `base` |
| slots are clean sections | `masthead: bar`, `cover: reel`, `footer: close` lean on the home; technical's code/tables had no slot | `pairs:` written now; `code` slot added; type layouts stay residue |
| `needs:` tokens added in render | tokens are gated in core config | §4.1 |
| theme file > piece part > base | ignores middle parents; layouts are not in `declarer`; `layouts:` replaces | §4.3–4.4, per link |
| `pieces:` inherits "like tokens" | two merges (render, config) would disagree; key would leak into `snypd://config` | `withoutDecls`, map-merged in both |
| "pixel-identical" | layer precedence, `!important` inversion, header HTML, no diff tool, 8,000 px cut, missing routes | §6: a diff tool, differences named in advance, a residue lint |
| `piece.literal`: no length but 0/1px | would reject 7–10 % of declarations | a literal vocabulary, decided in P1 |
| — | theme hash, `check theme`, `cssKb`, bundling, `partCoverage`, variations, `.snypd-card` collision | §4.6–4.7, the `entries` row |
| "one line" to add a layer | constant + push + two test strings + bench + docs/11 | A7 |
| 12½ days | the above | **14½ days**; 0.2.0 moves from 23 to 27 Oct |

One thing the audit could not check, because it is a policy: that live pieces are safe to change. That is decision 268's to carry, with stills in every changelog entry and `eject` as the way out.

## 10. What waits

Parked, in docs/35's order, to resume after 0.2.1: V1 (aliases — half a day, could ride any week), Z3, T1, Z2, T2, V2, Z1. Decisions 240–246 and 248 stand as proposed. `site › domain` (docs/31 §7 · 1) is Sunny's call; three days ahead of this track if it goes first.

## 11. Decisions asked

- **266. A theme is pieces + seed + face + one bold sheet.** `pieces:` in `theme.yaml`, one slot per question; supersedes `chrome:` (247) and `backdrop:` beside `font:` (249's placement). Recommendation: yes.
- **267. The first shelf is carved, not invented.** Every v1 piece has a `from:`; the four themes re-expressed on pieces pass the shoot diff with every difference named. Recommendation: yes.
- **268. Pieces are live, versioned with the binary, ejectable.** Recommendation: yes.
- **269. The contract is written and linted:** contract tokens plus derived optionals; `base`'s classes plus a piece's own `emits:`; a stated literal vocabulary. Recommendation: yes.
- **270. `@layer snypd.tokens, snypd.base, snypd.pieces, snypd.theme, snypd.site`, pieces in canonical per-slot sublayers.** Amends 119. Recommendation: yes.
- **271. Combinations are proven pairwise.** Recommendation: yes.
- **272. The theme track goes first and alone.** Replaces docs/35's order for V3, G and K. Recommendation: yes, as asked.
- **273. `base`'s header adopts the masthead classes and the logo.** An HTML change to base and folio, landed in P1 with its own stills. Recommendation: yes — without it `masthead` cannot be a piece.
- **274. The agent's eyes are one action that returns facts, one crop and links.** `theme › look` in the deferred catalogue; MCP `image` + `resource_link` + `structuredContent`; crops by slot; forced states; problems boxed where they are; before/after computed in the browser already running; one lazily-started, idle-killed browser found on the machine, text-only facts when there is none, `snypd eyes install` opt-in. No Playwright, no vision API. Recommendation: yes.

## 12. What would make this wrong

Residue over target means the slots are cut in the wrong places — find the missing one before P4. More than a handful of failing pairs means pieces lean on each other's rules and the contract leaks. P0 showing the factory's tokens are mostly pictures moves E1 and P6 to the front — and if `look`'s crops do not cut those picture tokens by more than half against today's full sheets, the crop is the wrong unit. And if Sunny looks at the first `explore` sheet and sees six templates, the shelf is too thin: the answer is another variant carved from a sheet someone judged, not a return to writing the whole sheet by hand.

---

## 13. P1 as built — 23 Sep 2026

**Asked for:** *"our complete focus should be on giving the agent capability to generate themes like people use lego pieces to build amazing stuff."* Decision **272** is taken on that word — the theme track goes first and alone, launch chores included where they compete. 266–271, 273 and 274 are proceeding as recommended and stay open to reversal until 0.2.0.

**Landed** (branch `pieces-p0-p1`, stacked on `s39-editorial-scale` because the carve needs the editorial scale):

- **`packages/spec/defaults/theme-contract.yaml`** — the 40 tokens, seven optional tokens with derived defaults (`font.display`, `size.display`, `size.number`, `measure.wide`, `measure.breakout`, `motion.duration`, `motion.quick` — the last three are new, found as literals in more than one sheet), 60 classes, the `language-` prefix, and the literal vocabulary. Read through `themeContract()` in `@snypd/spec`; not merged into site config, so it costs `snypd://config` nothing. The optional tokens are *not emitted yet* — P2 emits one when a piece reads it, so a theme on no pieces ships no extra bytes.
- **`packages/render/src/contract.ts`** — `cssRules` (leaf rules with their at-rule context and nesting, strings kept in selectors), `ruleKey`, `literalHits` (`piece.literal`), `selectorClasses`, `selectorHits` (`piece.selector`). Unwired to `check theme` until there is a piece to check (P2).
- **`contract.test.ts`** — the class list is held to exactly what `base`'s TSX, the renderer and viz emit (both directions, read statically so every branch counts); the tokens to what the three bundled themes declare; the house count to **20**, the same number §1 measured by hand.
- **`base`'s header adopts the masthead** (decision 273): `header.snypd-masthead > div.snypd-brand > a (img.snypd-logo | name) + p.snypd-tagline?`. `base` now declares `logo` and `tagline`; the tagline is shown only when set. Editorial, technical, studio and folio keep their own header files until P3 — their markup is unchanged. **Studio now inherits a `tagline` setting its header ignores** until the masthead piece lands.
- **Reduced motion moves to `base`**: the `*, *::before, *::after { … 0.01ms !important }` rule every sheet carried is in `base`'s sheet, where a lower layer's `!important` is the precedence it wants. Each theme keeps `@view-transition { navigation: none }` next to its own `navigation: auto` — that at-rule is decided by order in the sheet, not by layer, so it cannot move under the theme's. Folio keeps its copy (the site repo moves in P3).
- Two tests moved with the change: the MCP settings test switches to `base` and now finds two settings where it found none; a render test reads `<header class="snypd-masthead">`. **The "declares no settings" branch** (`catalog.ts:300`, `resources.ts:93`) is now reachable only by a theme that does not extend `base`, and no test reaches it.

**Measured:** 601 pass / 0 fail (595 + 6 new), typecheck clean.

**The literal vocabulary, and where every exception goes.** With `em ch % fr lh cqi vmax`, `0`, `1px 2px 3px` (either sign) and alpha-only masks passing, the four sheets hold **134** literals (editorial 21, technical 13, studio 55, folio 45 — counted with the reduced-motion rule still in place). Each has a destination, decided now so that P3 carves without deciding:

| Literal, sheets | Goes to |
|---|---|
| `0.01ms` reduced motion — e t s f | `base` (done) |
| `240ms` / `280ms` title transition — e t s | `motion.duration` |
| `150ms` / `200ms` transitions — e t s f | `motion.quick` (the 200 ms ones move 50 ms; not in a still — named as expected difference (e)) |
| `400ms` — s | `motion.duration` |
| `28s` marquee — s | `wall/marquee` `needs: motion.marquee: 28s` |
| `--breakout` 12 / 14 / 19 / 24rem — t e f s | `measure.breakout`, the theme's value |
| `--sidenote` 3rem / 9rem / 14rem / 100vw — e | `notes/sidenotes` `needs: measure.sidenote` |
| `max-width` / `width` 30–38rem — e t s f (10 uses) | `measure` (they are prose-width boxes) |
| `max-width` 10–12rem — e t s f | `em` (a logo, an avatar — it scales with the type) |
| `grid-template-columns` 9–34rem — e t s f | the owning piece's `needs:` with the sheet's value as default (`entries`, `footer`, `home`) |
| rem `font-size` / `font` 0.75–4rem — t s f | the nearest `size.*`; where none is near, the piece's `needs:` |
| `vw` in a font clamp — s f | `size.display` |
| rem padding / gap / margin — e t f (mostly folio) | `space.*`, or `em` where it sits on a control |
| heights 1.7–3.875rem — e t s f | `em` |
| `--masthead: 4rem` — s | `masthead/bar` `needs: size.masthead` |
| `border-radius: 100px` — e s f (7) | `100vmax` — the same pill |
| `border-radius` 3–5px — s f | `radius` |
| `blur(14px)` — s | `em` |
| `72vh` / `78vh` hero — s | `home/bands`, a switch |
| `translate: 0 1.25rem` reveal — s | `em` |

**Next: P2** — `packages/pieces`, `piece.yaml`, `pieces:` through config and render, the `snypd.pieces` layer, `house` as the first piece, `snypd://theme/pieces`.
