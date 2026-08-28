# 04 — Runtime and renderer: the Bun way

**Decision (27 Aug 2026):** no framework in core. Snypd runs on **Bun 1.4+** and ships its own renderer. Frameworks are adapters in plugins.

## Why Bun (verified against bun.com/blog and GitHub releases, 27 Aug 2026)

Bun 1.4.0 (20 Aug 2026; core rewritten in Rust) gives us, natively:

| Need | Bun API | Notes |
|---|---|---|
| One-file distribution | `bun build --compile --asset ./spec --asset ./themes --bytecode` | Spec YAML + themes embedded, readable via `node:fs` at `/$bunfs/`. ~60 MB. `curl \| sh` onboarding, no `node_modules` for a YAML+markdown site. |
| Fast stdio MCP start | 5 ms Linux startup + bytecode | Harnesses spawn the server per session. |
| Index | `bun:sqlite` (`node:sqlite` 100 % compat) | No native-module build step. |
| Images | `Bun.Image` | JPEG/PNG/WebP/GIF/BMP; ICC preserved; 1.38× sharp. **No AVIF encode on Linux** → sharp optional. |
| Screenshots for `render_preview` and visual bench | `Bun.WebView` | WebKit on macOS, Chrome via CDP on Linux. Playwright kept for CI. |
| Scheduler | `Bun.cron()` | OS-level, non-overlapping; self-hosted `snypd serve` path. |
| Preview / SSR | `Bun.serve` + hot reload | Fetch-handler shape; same handler can run on Workers via adapter. |
| Templates | native TSX | Themes are TSX rendered to strings; no client React. |
| Profiling for `bench` | `--cpu-prof-md`, `--heap-prof-md`, `--metafile-md` | Already Markdown — returned as resources. |
| Monorepo | isolated linker, `--catalog`, `bun pm diff`, `bun audit fix`, `bun prune` | 7× warm CI installs; supply-chain hygiene for `site.doctor`. |
| Tests | `bun test --parallel --shard --isolate` | Primitive × theme × viewport matrix. |

Constraints: pin `1.4.x`, keep `1.3.14` as known-good in CI until 1.4.2+. Every Bun-native API sits behind `packages/runtime/` interface with a Node fallback (`sharp`, Playwright, `node-cron`, `better-sqlite3`) so `core`/`spec`/`mcp` stay runtime-neutral and a regression is a one-line switch.

## Why not Astro / Next in core

Considered in depth (Astro 7.2 is excellent). Rejected as core because: it breaks the single binary (Vite + Rolldown + `node_modules`); it adds a second component model and a second markdown engine (Sätteri) that agents would have to learn; islands push client JS our budget sets to 0 KB; and our benchmarks would be measuring a framework's decisions. Kept as `snypd-plugin-astro` / `snypd-plugin-next` ("bring your own site" consuming the content index and primitive renderer). Revisit if `snypd bench` shows the own renderer cannot hold budgets or theme authors demand islands — the spec is renderer-neutral, so this is reversible.

## Markdown

- **Core pipeline: remark + `remark-directive`.** We need an AST for lint, `suggest_blocks`, typed primitives and `.md` twins. `Bun.markdown` outputs HTML/React/callbacks with no AST and no directives, so it is *not* the core parser.
- `Bun.markdown` is used where structure doesn't matter: rendering spec examples, tool descriptions, the review diff view, the HTML baseline in the token benchmark.
- `snypd bench markdown` compares remark vs `Bun.markdown` on the 10k corpus every release; if remark's cost ever dominates build time, a Rust directive-capable parser is the next step. **S5 measurement:** micromark ≈ 0.4 MB/s on the corpus in Bun 1.4 and Node 22 alike (`Bun.markdown` ≈ 45 MB/s) — the cost is real and already dominates a cold 1k build, so the parser is the first item of the S12 speed pass (docs/07 §6). Everything downstream is insulated by the hash-keyed mdast cache (`@snypd/core` `MdastCache`): lint, rebuilds and `snypd://lint/*` never re-parse an unchanged file.
- Frontmatter and the YAML bodies of `chart` / `diagram` / `flow` are parsed with `js-yaml`; the `yaml` package stays on the config path only (docs/07 decision 12).

## The renderer (`packages/render`)

Deliberately small. Target: < 1,500 lines.

```
content files ──parse──▶ mdast (+ directive nodes)
              ──validate/transform──▶ typed primitive tree      (spec-checked)
              ──resolve──▶ route, layout, theme, tokens          (02 §1, theme.yaml)
              ──render──▶ HTML string via theme TSX               (renderToString, no hydration)
              ──emit──▶ dist/ + .md twins + llms.txt + feeds + JSON API + sitemap + schema   (S7, emit.ts)
              ──post──▶ Pagefind index, image derivatives (Bun.Image), CSS from tokens
```

- **Static by default.** `snypd build` writes `dist/`. Deploy anywhere.
- **Incremental.** Each route's cache key = hash(content) + hash(theme module graph) + hash(config subset) — list pages (index, term, author) add a hash of the entries they show (route, title, date, description), so a body edit re-renders one route and a title edit re-renders the post plus the lists it appears in. Keys live in the SQLite index (`.snypd/index.sqlite`, disposable, `synchronous = OFF`); a route with a matching key whose outputs exist is skipped outright — nothing is copied. Routes that vanish have their outputs deleted. **S6 measurement:** 100 posts cold (no dist, no index) ≈ 0.65 s in a warm process, one body edit ≈ 18 ms, touch-only ≈ 9 ms. The parsed mdast is cached in the same SQLite file by content hash, so a theme or config change re-renders every route without re-parsing.
- **Theme reload.** `loadTheme` re-imports a changed theme's entry files under a new query string, but static imports inside the theme (`./shell`) stay in Bun's module cache — within one process a theme edit is only fully picked up by a fresh process, which `snypd build` always is. `snypd serve --preview` (S11) bundles the theme dir with `Bun.build` per change instead.
- **Zero client JS.** Themes may declare `client:` scripts per primitive (e.g. `tabs`, `before-after`) as small vanilla modules; each is counted against `bench.budgets.js`. No hydration framework.
- **CSS.** `theme.yaml` tokens → CSS custom properties; theme styles are plain CSS (or a build-time Tailwind pass inside the theme package — the renderer doesn't care). One stylesheet per theme, critical CSS inlined per layout. **S7:** a token is `{ default, customisable, kind, description }` in `theme.yaml` and a scalar override in `snypd.yaml › theme.tokens`; the merged values become `:root { --color-accent: … }` (dots → dashes) at the head of `dist/assets/theme.css`, followed by the theme's own `css:` file. No stylesheet is emitted and none is linked when a theme declares neither (`base`). Critical inlining waits for `editorial` (S13–S14).
- **Emit (S7, `emit.ts`).** The agent-read surface is built from plain data (`SurfaceSite`/`SurfaceEntry`), so the preview server and the bench call the same functions without a build: `llms.txt` (twin URLs, not HTML URLs, grouped by type then taxonomy), `feed.xml` (RSS 2.0, listed types only, `<source>` pointing at the twin), `sitemap.xml` + `robots.txt`, and a JSON API — `/api/site.json` (the entry point), `/api/<type>.json`, `/api/<taxonomy>.json`, `/api/<type>/<slug>.json` (frontmatter + schema + twin URL). Each is a plan item keyed on what it shows, so a body edit rewrites nothing and a title edit rewrites only the lists that name it.
- **JSON-LD.** One `<script type="application/ld+json">` per page: the page's own node (BlogPosting / Person / WebPage / CollectionPage / WebSite) plus whatever the spec's `schema-emit` derives from the blocks actually present — `FAQPage` from `faq` headings, `HowTo` from a `steps` list or a `flow` body, and `tldr` as the description. The spec declares it; the renderer only reads it, so a new primitive with `schema-emit` needs no renderer change.
- **SSR / preview (S11, `preview.ts`).** `snypd serve --preview` is the same incremental build, not a second renderer: `build({ drafts: true })` into `.snypd/preview` against its own index (`preview.sqlite`), so the production route cache is untouched and a preview never writes to `dist/`. `drafts` widens the filter from "public statuses" to "everything but trashed" and joins the route key, so the two builds can never hand each other an output. A watcher on `content/`, `snypd.yaml` and the theme dir sets a dirty flag; only a flagged request rebuilds, which is why TTFB is the static floor (**S11: 0.15 ms, budget 50**) and not a build time. The extra page is `/_snypd/review/{type}/{slug}` — the draft's frontmatter, its diff against the branch it was cut from, and the Approve button that records the approval `content.publish` requires (docs/03). It is rendered by the *theme's* `page` layout, so it inherits whatever the site looks like and no admin UI exists. Hosted SSR (scheduled posts, per-request `/ask`) uses the same fetch handler; a Workers adapter is a plugin.
- **Themes are TSX.** `theme.yaml` maps each primitive to a `.tsx` file exporting `(props, ctx) => JSX`. Rendered to strings. Theme authors (mostly agents) get a strict, tiny contract: props from the spec, `ctx.tokens`, `ctx.slots`, nothing else. `theme.check` type-checks the theme against the spec.

## Viz (`packages/viz`)

Charts, diagrams and flows are rendered to inline SVG **at build time** — no D3, no Mermaid runtime, no client JS (docs/07 decision 3). The package is dependency-free and pure: rows in, one `<svg>` string out, same bytes every run (a chart that reformatted itself per run would change its page's route key and re-render the whole site every build).

**S8 — `chart`.** `renderChart({ type, data, unit, caption, title })` → `{ svg, warnings, rows, series, type }`, or `null` when nothing is drawable, which is the theme's signal to render the spec's declared fallback (a table of the data, not a picture). Geometry lives here so every theme inherits the same decisions:

- `bar` and `lollipop` are **horizontal** — the category axis runs down the left. Chart labels are words, and horizontal rows read them at full size instead of rotating ticks 45°, which is both ugly and hostile to assistive tech.
- `line` and `area` are vertical, x = the rows in order. `area` always includes 0 in its domain (it fills to a baseline); `line` does not (forcing 0 flattens a narrow trend).
- `donut` has no axis: one slice per positive row, legend right with value and share.
- Ticks are nice numbers (1 / 2 / 5 × 10ⁿ) and the domain rounds out to whole steps, so both ends of an axis land on a tick. Value labels are `font-variant-numeric: tabular-nums`.
- A `series` column groups `bar`/`lollipop` and draws one line per series for `line`/`area`, with a legend; a series a category has no row for breaks the line rather than inventing a zero.
- ≤ 12 points is the spec's intent. Past it the chart still renders — labels thin out, dots come off — and both lint (a warning) and the returned `warnings` say so.
- The svg is `role="img"` with a `<title>` (the caption) and a `<desc>` that reads the data out loud, and it carries `max-width:100%;height:auto`, so it is responsive and accessible with zero CSS.

**S9 — `diagram`.** `renderDiagram({ data, direction, caption, title })` → `{ svg, warnings, nodes, edges, ranks, direction }`, or `null` when there is nothing to lay out, which is the theme's signal to render the spec's fallback (the `id → id (label)` edge list). Layout is Sugiyama, in `layout.ts`, and it is the same four phases every layered drawing tool uses:

- **Acyclic.** A DFS marks the edges that close a cycle and reverses them for layout only; the painter puts the arrowhead back on the real target, so a feedback edge points backwards on the page and still layers. A diagram of a review loop is the common case, not the exotic one.
- **Rank.** Longest path from the sources, so every edge points at least one rank forward. `direction: lr` runs the ranks left → right, `tb` top → bottom; the layout works in abstract (`u` along the ranks, `v` across them) and the painter maps the pair, so there is no second code path for `tb`.
- **Order.** An edge that skips ranks is filled with a dummy per rank it crosses, so it turns where the layer is instead of cutting across it. Median-heuristic sweeps then adjacent-swap transposes cut crossings; a swap counts only the two nodes' own edges, because counting the whole layer per candidate swap costs O(edges²) and blew the 15 ms budget at 40 nodes (20 ms → 4.3 ms).
- **Coordinates.** Each layer is pulled to the median of its neighbours, separation enforced by a forward pass, then the layer is recentred on what the medians asked for. Coordinates are whole pixels: a diagram has no sub-pixel geometry to lose, and at 40 nodes the decimals were kilobytes.

Edges are **orthogonal-ish** — out along the rank axis, one turn between the ranks, in along the rank axis, corners rounded. Two refinements make a dense diagram followable: edges leaving one side of a box **fan out** across it instead of starting on one pixel, and the edges crossing one gap each turn in **their own lane**, both ordered by the run's midpoint so the fan introduces no crossings of its own. Arrowheads are drawn as triangles rather than `<marker>`s: two diagrams on one page would collide over a shared marker id, and a marker cannot take the edge's colour without `context-stroke`. An edge label rides the longest straight run of its own edge, clipped to that run, haloed in `Canvas` — the page's own background in light and dark, which is what lets a label sit on its line when three edges share one 54px gap.

The layout is cached, keyed on the *geometry* (direction, node sizes, edges) and not the labels, so two diagrams of the same shape share one layout even when they say different things; paint is string concatenation and is never cached.

**The theme seam.** Every paint is `var(--color-viz-*, <literal>)`: `base` declares no tokens and emits 0 KB of CSS, so the literals do the painting; a theme that declares `color.viz.1 … color.viz.6`, `color.viz.axis|grid|label|tick` (and, for diagrams, `color.viz.node|node-stroke|edge|halo`) in `theme.yaml` recolours every chart and diagram without touching viz. Text and stems fall back to `currentColor`, so charts follow the page into a dark theme with no token at all. The spec owns geometry, the theme owns colour and type — a theme can restyle a chart but never move a point.

**Budgets (D3).** Per primitive, from the spec: `chart` ≤ 3 ms and ≤ 12 KB, `diagram`/`flow` ≤ 15 ms and ≤ 25 KB (S9–S10). `snypd bench` measures them on the worst shape the spec's intent allows (12 points, long labels, and the grouped two-series variant) and reports the worst type, not the mean — a budget only the easy chart meets is not a budget.

**Where the graph comes from.** The `diagram` body is YAML (`nodes:` a list of `{ id, label?, kind? }`, `edges:` a list of `{ from, to, label? }`), parsed by the content pipeline and cached with the post, exactly like a chart's rows. Bare ids (`nodes: [md, build]`) are accepted. An edge pointing at a node that does not exist, a duplicate id or a self-loop is a lint error (rule 2) with the fix in the hint, and the renderer drops it rather than drawing a phantom box.

**Where the rows come from.** The body YAML (`- { label, value, series }`) or `data=` on the leaf form; both are resolved into the block by the content pipeline, so they are cached with the post. `src=` (rows in a separate file) parses but is **not read in v0.1**: a route key hashes the post, so a chart whose numbers live elsewhere would not rebuild when those numbers changed. Lint says so with a warning rather than the renderer failing silently.

## `theme.yaml`

```yaml
theme: snypd-theme-editorial
version: 1.0.0
spec: ^1
extends: snypd-theme-base
tokens:
  color.accent:  { default: "#1a1a1a", customisable: true, description: "Links, buttons" }
  font.heading:  { default: Newsreader, customisable: true, kind: font }
  content.width: { default: 64ch, customisable: true }
layouts: [post, page, index, term, author]
locations: [header, footer]
variants: { callout: [soft, loud], cover: [text-only, image-left, image-full] }
primitives:
  cover:   ./primitives/Cover.tsx
  callout: ./primitives/Callout.tsx
  aside:   { fallback: callout }
client:
  tabs: ./client/tabs.js          # counted against the JS budget
patterns:
  launch-post: [cover, tldr, stat-row, section, faq, cta]
personality: Editorial, serif, wide margins, asides in the gutter. Prefers few callouts.
```

Layout resolution: `frontmatter.layout` → `type.layout` → theme default; `theme.which_layout(slug)` prints it. Child themes via `extends:`; `theme.coverage` shows overridden / inherited / fallback per primitive.

**`extends:` — implemented in S12.** A theme is resolved as a *chain*, child first, each parent found by the
same search as `theme.use` (`themes/<name>`, `node_modules/<name>`, `node_modules/snypd-theme-<name>`).
Resolution is **per slot, not per theme**: a layout or primitive the child does not declare comes from the
nearest ancestor that does, and every path resolves against **the dir of the theme that wrote that line** —
which is the whole reason the chain is carried rather than flattened into one map. Concretely:

- **layouts** — `layouts:` is an array, so the nearest declarer's list replaces (it is the theme's index of
  what it renders). Each named layout then resolves to the nearest ancestor shipping `layouts/<name>.tsx`.
- **primitives** — nearest declarer wins per primitive. A `{ fallback: x }` entry is followed inside that
  theme's map first, then on up the chain. `coverage` reports `own | inherited | fallback | missing`, with
  `via` naming the ancestor or the fallback.
- **tokens** — merge key by key, child overriding, in the config layer (so `snypd://config` shows the
  merged set and collapses it to one line when the site overrides none of it).
- **css** — every `css:` in the chain is emitted, **ancestors first**, so a child's rules cascade over what
  it inherits without `!important`.
- **the route key** — `themeHash` covers every dir in the chain. A child that inherits a primitive must
  re-render when the *parent* changes, and hashing the child's dir alone would silently serve stale HTML.
- A cycle or an unknown parent truncates the chain and reports a diagnostic; it never throws.

`editorial` (S13) is the proof: `theme.yaml` + one stylesheet, **zero `.tsx` of its own**, 13/13 primitives
and all 5 layouts inherited from `base` — which is exactly what `base`'s promise of "one class per
primitive, so a child theme styles it without touching markup" is worth if it is true.

## Package layout

```
snypd/                         monorepo, MIT, Bun workspaces
  packages/
    spec/        YAML: primitives, built-in types/taxonomies/statuses/roles/jobs/budgets; JSON Schema export
    core/        YAML layering → Zod, remark chain, lint, SQLite index, query, git ops, status machine
    render/      the renderer above
    mcp/         the one server (resources/tools/prompts; stdio + streamable HTTP)
    runtime/     interface + bun/ and node/ implementations (image, screenshot, cron, sqlite)
    bench/       snypd bench (05)
    cli/         snypd serve | build | bench | init
  themes/        base/ editorial/ technical/
  plugins/       seo/ newsletter/ comments/ i18n/ agent-analytics/ astro-adapter/ next-adapter/ pocketbase-state/
  corpora/       100 / 1k / 10k synthetic posts, seeded, checked in
```

## PocketBase

Not in core (pre-1.0, Go, and it tempts content into a DB). `snypd-plugin-pocketbase-state` is the self-hosted option for hosted-layer state (users, agent tokens, review queue, audit log). Our own cloud uses SQLite/libSQL inside the same Bun process.
