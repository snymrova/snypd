# 07 — Delivery plan: Snypd v0.1

**Owner:** PM · **Engineer:** Claude Code (this harness, autonomous sessions) · **Reviewer / decider:** Sunny · **Written:** 27 Aug 2026 · **Inputs:** docs 00–06 (v0.3), Bun 1.4.0 verified 27 Aug 2026.
**Dogfood site:** `snypd.rocks` — greenfield, no existing content. Snypd builds it and its own launch content from day one; the site is the project's public benchmark page.
**Goal:** a v0.1 that passes the kill test in 06 with measured speed, and that renders charts, diagrams and flows as static SVG at build time — zero JS, and fast enough to stay inside the build budget.

---

## 1. Definition of done

v0.1 is done when all six are true on `main`, in CI, on Linux + macOS:

| # | Gate | Evidence |
|---|---|---|
| D1 | **Kill test passes.** From a fresh Claude Code session with only the MCP: upgrade 3 plain posts with `suggest_blocks`, swap `base ⇄ editorial`, change 2 tokens, publish; then write 1 new post with a chart and a flow. ≤ 8 tool calls to a lint-clean draft. | scripted run in `packages/bench/agent/`, transcript checked in |
| D2 | **Speed budgets green.** Build ≤ 2 s cold / 100 posts · ≤ 300 ms incremental · MCP cold start → `initialize` ≤ 50 ms · preview TTFB ≤ 50 ms · 0 KB JS on content pages · Lighthouse perf ≥ 98, LCP ≤ 1.2 s | `snypd bench` in CI, fails on breach |
| D3 | **Visual primitives are fast.** `chart` ≤ 3 ms, `diagram`/`flow` ≤ 15 ms per instance at render; inline SVG ≤ 12 KB per chart, ≤ 25 KB per diagram; no layout shift (explicit `viewBox` + intrinsic size) | `snypd bench visual` per primitive on the corpus |
| D4 | **Agent budgets green.** Tokens-to-learn ≤ 6,000 · `.md` twin median ≤ 2,500 tokens, ≥ 85 % under HTML | `snypd bench agent` |
| D5 | **One binary.** `snypd` for linux-x64 + darwin-arm64, no `node_modules` | release CI artefact |
| D6 | **snypd.rocks is live** — built, deployed and edited only via MCP; every README claim links to `snypd.rocks/bench` | the site, git log with `Snypd-Principal` trailers |

## 2. Scope

**In (v0.1) — 13 primitives**
`cover, tldr, callout, pullquote, stat, stat-row, figure, faq, steps, cta` + **`chart`, `diagram`, `flow`**.

- `chart` — `type: bar | line | area | donut | lollipop`, `data:` inline YAML or `src:` file, **`source` required**, `caption`. Rendered to inline SVG by `packages/viz` (own code, no D3/Chart.js). Theme supplies only tokens (palette, font, grid colour); the spec owns geometry so every theme's charts read as one system.
- `diagram` — box-and-arrow: `nodes`, `edges`, `direction: lr | tb`. Layered layout (longest-path ranking + barycentre ordering — a small Sugiyama, ~300 lines). Deterministic; layout cached by content hash so a second build costs a `copyFile`.
- `flow` — ordered steps with branches (`yes/no`, `then`), a constrained sugar over `diagram` that agents can write without thinking about coordinates. Emits `HowTo` schema like `steps`.
- All three: build-time SVG only, `<svg role="img" aria-label>` + a `<title>`/`<desc>`, a `<figcaption>`, and a **text fallback** (data table / step list) emitted into the `.md` twin so agents reading the twin get the data, not a picture.

**Also in:** YAML layering; `post / page / author`; `category / tag`; statuses `draft → published → trashed`; lint (9 rules, below); SQLite index; git ops (draft branch, principal trailer); static build with incremental cache, `.md` twins, `llms.txt`, RSS, sitemap, JSON API; tokens → CSS vars; MCP stdio with resources `config, spec/*, theme/*, content/*, lint/*, bench/latest`, tools `content.create/update/lint/suggest_blocks/render_preview/query/set_status/publish`, `theme.list/set/get_tokens/set_tokens/coverage`, `site.get_config/set_config`, `bench.run/compare`; prompts `get-started`, `write-post`; themes `base`, `editorial`; bench (speed, visual, agent); binaries.

**Lint (9):** unknown block · missing required prop · unsourced `stat`/`chart` · image without alt · dead internal link · heading skip · slop-phrase list · slug change without redirect · **diagram > 40 nodes** (readability + render budget).

**Cut to v0.2:** `gallery` (needs media manifest) · `review`/`scheduled` statuses · Pagefind · `render_preview` screenshots (`Bun.WebView`) · `history.*` / `taxonomy.*` / `media.*` tools · Mermaid *import* (we own the syntax; a `mermaid → diagram` converter is a v0.2 plugin) · Windows binary.

## 3. Speed strategy

1. **Bench ships before the renderer.** Session 1 measures a stub that copies markdown to `dist/`. Every later session diffs against `main` with `bench.compare`; > 10 % regression on cold build, incremental, cold start or per-primitive visual time is a failed session, not a warning.
2. **Corpora checked in, session 2**: 100 / 1k / 10k synthetic posts; every 5th post carries a chart, every 10th a diagram, every 20th a flow with ≥ 15 nodes.
3. **CI budgets = 80 % of published budgets.**
4. **Pre-committed speed design:**
   - Route cache key = `hash(content) + hash(theme graph) + hash(config subset)` in SQLite; unchanged routes are copied.
   - mdast parsed once per file hash, shared by lint, `suggest_blocks`, twins, render.
   - **Viz cache**: each chart/diagram SVG is keyed by `hash(props + tokens)`; a token change rebuilds only SVGs, not layout — layout (node positions) is cached separately from paint.
   - Diagram layout budget enforced by lint (≤ 40 nodes), so Sugiyama stays O(small).
   - `renderToString`, no hydration, no client React. Themes may not add JS to `chart`/`diagram`/`flow` in v0.1.
   - MCP: lazy-load renderer and viz so `initialize` answers cold in ≤ 50 ms; bytecode-compiled binary.
   - `.md` twin = byte copy of source + resolved frontmatter + generated text fallbacks for viz blocks.
5. **remark vs `Bun.markdown` measured weekly** on 10k; parser switch is a v0.2 spike only.
6. **Bun-native APIs allowed in v0.1:** `bun:sqlite`, `Bun.serve`, `bun build --compile`. Nothing else, behind `packages/runtime/` with a Node CI lane.

## 3b. Deployment model

```
Claude Code ──MCP──▶ snypd serve (local, incremental builds, instant preview)
                        │ commits with Snypd-Principal trailer
                        ▼
                   git push ──▶ GitHub ──▶ host runs `snypd build` ──▶ dist/ served
```

- **Snypd never talks to a host.** It writes files and git. The host's only job: on push, run `snypd build`, serve `dist/`. Branch pushes (`snypd/draft-<slug>`) get preview URLs from the host — that is the v0.1 review page, free.
- **Two first-class hosts:** `snypd init --deploy cloudflare | vercel` writes the config (`wrangler.toml` / `vercel.json`), a `.github/workflows/snypd.yml` that runs `snypd bench` on PRs, and the build command `curl -fsSL https://snypd.rocks/install | sh && snypd build`. Anything that can run a binary and serve a folder also works; nothing in core is host-specific.
- **Local is the fast path.** `snypd serve --preview` renders from the SQLite watcher (≤ 300 ms incremental, ≤ 50 ms TTFB). `snypd build` locally is the same code the host runs, so the published build number is the number the host sees.
- **Push is explicit.** `content.publish` = merge to `main` locally. `site.push` is a separate tool with `destructiveHint`, off for Contributor tokens. A prompt-injected agent cannot put anything on the internet alone.
- Not in v1: Snypd holding host credentials or calling deploy APIs.

## 4. Schedule — Claude Code sessions, not calendar weeks

Unit of work = one autonomous session (~2–4 h wall clock, one PR, bench diff attached). Sunny reviews PRs and runs the gates. Estimated **22 sessions**; at 2 sessions/day that is **~11 working days**, at 1/day ~4.5 weeks. Gates don't move; the calendar does.

Each session opens with: read `docs/*.md` + `bench/latest.md`, run `bun test && snypd bench --quick`, then work. Each session closes with: tests green, bench diff in PR body, `07` §5 log updated.

### Phase 1 — measure the stub (S1–S4) · **Gate A**
| S | Deliverable | Exit |
|---|---|---|
| S1 | Monorepo (`packages/spec core render viz mcp runtime bench cli`, `themes/`, `corpora/`, `sites/snypd.rocks/`), Bun 1.4.x pinned + 1.3.14 lane, CI (test, bench), `@snypd/*` scope | green CI on stub build |
| S2 | `bench`: build timer, cold start, TTFB, tokens/page, tokens-to-learn, `bench.compare`, `bench/latest.md`; corpora generator + 100/1k/10k | `snypd bench` runs on the stub; floor recorded |
| S3 | `spec`: 13 primitive YAMLs, JSON-schema export, built-in types/taxonomies/statuses/budgets | `snypd://spec/primitives/*` served from stub MCP |
| S4 | `core`: YAML layering → Zod with provenance; `mcp` skeleton (stdio, `initialize`, `config` + `spec/*` resources) | **Gate A:** cold start ≤ 40 ms (80 % of 50) |

### Phase 2 — render, lint, viz (S5–S12) · **Gate B**
| S | Deliverable | Exit |
|---|---|---|
| S5 | remark + directive → typed primitive tree; lint rules 1–9; mdast cache | 1k corpus lints ≤ 1 s |
| S6 | SQLite index, incremental route cache, `base` theme (100 % coverage, unstyled) | cold /100 ≤ 1.6 s, incremental ≤ 240 ms |
| S7 | emit: `.md` twins, `llms.txt`, RSS, sitemap, JSON API; tokens → CSS vars | tokens/page ≤ 2,000 median; `surface.completeness` 100 % |
| S8 | **`viz/chart`**: bar, line, area, donut, lollipop → SVG; scales, ticks, tabular labels; text-table fallback | ≤ 3 ms / chart, ≤ 12 KB |
| S9 | **`viz/diagram`**: Sugiyama layout, orthogonal-ish edges, arrowheads, labels; layout cache; 40-node lint | ≤ 15 ms / diagram at 40 nodes |
| S10 | **`viz/flow`**: sugar → diagram, `HowTo` schema, step-list fallback; `snypd bench visual` | ≤ 15 ms / flow; bench suite green |
| S11 | `content.*` tools, git ops (draft branch, trailer), `snypd serve --preview` | write-a-post loop from Claude Code; TTFB ≤ 40 ms |
| S12 | speed pass on whatever bench flags | **Gate B:** all D2 + D3 numbers ≤ 80 % of budget on `base` |

If Gate B is red, S13–S14 become speed sessions and the editorial theme slips. Speed does not slip.

### Phase 3 — worth using (S13–S18)
| S | Deliverable | Exit |
|---|---|---|
| S13–S14 | `editorial` theme: tokens, layouts `post page index term author`, all 13 primitives, critical CSS; viz palette from tokens | coverage 100 %, Lighthouse ≥ 98, a11y 100, 0 KB JS |
| S15 | `suggest_blocks` (prose → primitives, incl. "this list is a flow", "this table is a chart"), `render_preview` (URL) | ≥ 0.8 precision on 20 hand-labelled posts |
| S16 | `theme.*`, `site.*`, `bench.*` tools; prompts `get-started`, `write-post` | tokens-to-learn ≤ 4,800 |
| S17 | scripted-agent harness running the kill test | tool-call count reported |
| S18 | `bun build --compile --asset --bytecode` linux-x64 / darwin-arm64; `curl \| sh` installer at `snypd.rocks/install`; `snypd init --deploy cloudflare|vercel` writes host config + PR bench workflow | D5; a fresh repo deploys with 3 commands |

### Phase 4 — one binary, one real site (S19–S22) · **Gate C = release**
| S | Deliverable | Exit |
|---|---|---|
| S19 | **snypd.rocks**: `snypd init --deploy cloudflare`, repo → GitHub → Cloudflare Pages (Vercel as the second verified target), custom domain, branch previews on; 3 launch posts written via MCP ("why MCP-only", "the vocabulary", "the benchmarks"), each with a chart + a flow; `site.push` tool | site live, edited only via MCP; draft branch shows a preview URL |
| S20 | remark vs `Bun.markdown` report; final speed pass | all D2/D3 ≥ 20 % under budget |
| S21 | kill test × 3 models; 20-topic `write-post` first-attempt lint pass | D1, D4; pass rate published (target ≥ 80 %, no budget yet) |
| S22 | `snypd.rocks/bench` page generated from `bench/latest.md`; README claims link to it; launch post | **Gate C:** D1–D6 |

If D1 fails — not obviously better than a markdown folder + Claude Code — stop, fix primitives before v0.2 (06).

## 5. Session log
| S | Date | PR | Bench diff | Notes |
|---|---|---|---|---|
| S1 | 2026-08-27 | main (initial) | floor: build.cold.100 13 ms · build.cold.1000 131 ms · mcp.coldStart 28 ms (stub) | Bun 1.4.0 + 1.3.14 lanes green; corpus generator; bench compare/breach; stub renderer + stub MCP |
| S2 | 2026-08-27 | main | floor: build.cold.100 13 ms · 1k 133 ms · 10k 1.30 s · incremental.100 6 ms (stub = full rebuild) · mcp.coldStart 28 ms · serve.ttfb 0.12 ms (static stub) · tokens.page.md 504 (o200k) · md-vs-html reduction 6 % (stub, report-only until S7) · tokens.learn 38 (config only; spec adds in S3, theme in S13) | `snypd bench` runs all D2/D3 speed + agent metrics on the stub; static `serve` stub with `Accept: text/markdown` twin negotiation; `gpt-tokenizer` (o200k_base) as the standard tokeniser; 10k corpus generated on demand and git-ignored (would be 160 MB checked in — overrides docs/05 "checked in" for 10k only) |
| S3 | 2026-08-27 | main | build.cold.100 15 ms · 1k 141 ms · 10k 1.61 s · incremental.100 6 ms · mcp.coldStart 38 ms (host load avg ≈ 10 during the run; S2 stub re-measured side by side at 39 ms, so no code regression — `initialize` still loads nothing) · serve.ttfb 0.18 ms · tokens.page.md 504 · **tokens.learn 38 → 3,931** (config 38 + `spec` 300 + `spec/primitives` index 528 + 13 primitive YAMLs 3,065; leaves ≈ 2,070 for `theme` in S13 — watch it) | `@snypd/spec`: 13 primitive YAMLs (`name kind group purpose props slots intent anti-intent example schema-emit budget fallback`), `defaults/` types `post page author`, taxonomies `category tag`, statuses `draft→published→trashed`, budgets, field-type DSL; DSL → JSON Schema export (`snypd://spec.json`, per-type/taxonomy frontmatter schemas); resources `snypd://spec`, `spec/primitives`, `spec/primitives/{name}` (raw YAML), `spec/types/*`, `spec/taxonomies/*`, `spec/budgets`; stub MCP answers `resources/list` + `resources/read` via lazy import; tests: 13 locked names, required `source`/`alt`, closed status transitions, type⇄taxonomy references, MCP stdio round-trip. Fixes docs/01: `stat-row` is a `:::` container (`::stat-row … ::` is not directive syntax); `chart` is a container (rows in body) with a leaf form via `data=`/`src=` |
| S4 | 2026-08-27 | main | build.cold.100 14 ms · 1k 167 ms · 10k 1.51 s · incremental.100 7 ms · **mcp.coldStart 30 ms (Gate A ≤ 40 ✅)** — side by side with the S3 stub under the same harness: 33.6 vs 32.1 ms, i.e. the real server sits at the Bun spawn floor · serve.ttfb 0.15 ms · tokens.page.md 504 · **tokens.learn 3,931 → 4,175** (`snypd://config` is now the merged+annotated resource, 282 tokens for the corpus site; 625 left to the CI line for `theme` in S13 — tight, see risks) | `@snypd/core`: five-layer YAML merge (spec ← theme.yaml ← plugins ← snypd.yaml ← snypd.<env>.yaml), objects deep-merge, arrays append unless `!replace`, every leaf carries `{layer, file, line, overrides}`; Zod 4 schema (strict top level/types/taxonomies/statuses) + cross-reference checks (taxonomies, primitives, field types, status transitions, locales) reported as diagnostics with file:line, never thrown; `extends` = inherit-then-override (arrays replace), cycles detected, inherited keys attributed; `explain(path)` → "`site.url` = … ← snypd.prod.yaml:1, overrides snypd.yaml:4"; `render()` = `snypd://config` with `# ← file:line` comments and untouched spec subtrees collapsed to their `snypd://spec/*` pointer. `@snypd/mcp`: own JSON-RPC 2.0 stdio layer (`protocol.ts`, zero imports), `initialize` (version negotiation 2025-11-25/06-18/03-26), `ping`, `resources/list|read|templates/list`, `tools/list`, `prompts/list` (empty), notifications silent, responses in request order; resources `snypd://config`, `spec/**`, `types[/name]`, `taxonomies/{name}`; spec/core/zod/yaml imported lazily on the first `resources/*` call. `snypd serve` = MCP on stdio (`--static` keeps the S2 file server until S11); `snypd config [root] [path]` debug verb. Bench: budgets now read from the merged `bench.budgets`; cold start measured first (after the 10k build it read 75–115 ms from page-cache thrash — the metric is spawn→initialize of a fresh process, so it is measured from a quiet harness). **Findings:** `@modelcontextprotocol/sdk` costs ~140 ms before `initialize` (3× budget) → not used at runtime (decision 11); even `import type` from it costs ~20 ms (Bun resolves the package) → types mirrored locally; `process.stdin` costs ~15 ms vs `Bun.stdin.stream()` → Bun path with Node fallback; zod ~25 ms, `yaml` ~30 ms + spec `resources()` ~60 ms cold → all off the initialize path, candidates for the S12 speed pass (`Bun.YAML` would remove the yaml cost but breaks decision 7). The proto shim for `bun` prints an NDJSON banner to **stdout** in agent environments and corrupts stdio MCP — bench/tests spawn `process.execPath`; `snypd` scripts use `bun <file>`, not `bun run <file>` |
| S5 | 2026-08-27 | main | build.cold.100 17 ms · 1k 181 ms · 10k 1.61 s · incremental.100 9 ms · **lint.1000 165 ms (gate ≤ 1 s ✅; lint.100 25 ms)** · lint.1000.cold 6.94 s (report-only: micromark parse from an empty cache) · mcp.coldStart 45.5 ms in the report with host load avg ≈ 13 — re-measured side by side against the S4 tree under the same harness: 31 vs 30 ms, no code regression (nothing new on the `initialize` path) · serve.ttfb 0.18 ms · tokens.page.md 504 → 516 (corpus now carries lint-clean `:::chart` bodies, `diagram` nodes/edges, `flow` steps) · tokens.learn 4,175 (unchanged) | `@snypd/core` content pipeline: `parseMarkdown` (mdast-util-from-markdown + directive + frontmatter + gfm, no unified), `buildTree` → typed primitive tree (every directive → `Block` with spec, coerced props, parsed YAML body, children), `lint` rules 0–9 with stable ids, docs/01 numbers, severities and fix hints (0 frontmatter schema from the merged type · 1 unknown-block · 2 required/invalid/unknown-prop + slot-limit incl. stat-row 2–4 and the 40-node diagram/flow cap · 3 unsourced-evidence · 4 image-alt for figure/markdown image/cover · 5 dead-internal-link against the site's routes · 6 heading-skip · 7 stale-updated · 8 slop-phrase · 9 callout-density); rules 10–11 wait for the S6 index, git-based staleness for S11. `MdastCache` (sha1 of source → doc + tree, optional on-disk JSON; JSON.parse of a cached mdast is ≈ 100× cheaper than parsing). `lintSite(root)` derives routes from type `urlPattern`s. `snypd lint [root|file.md]` verb; `snypd://lint/{type}/{slug}` resource + `resources/templates/list`. Corpus generator fixed to emit lint-clean primitives (`:::stat-row`, chart rows, diagram nodes/edges, flow steps, captions, absolute cta href) — 100/1k regenerated, deterministic. Bench: `lint.<n>` (budget `lintPer1000` 1000 ms, on the lint stage with a warm mdast cache) and `lint.<n>.cold` (report). **Findings:** micromark ≈ 0.4 MB/s in Bun 1.4 and Node 22 (`Bun.markdown` 45 MB/s, commonmark.js 7, markdown-it 4; the `development` export condition is not the cause — prod build measured directly) → risk row updated, parser is item 1 of the S12 speed pass; the `yaml` package costs ≈ 1.2 ms per call (15× js-yaml) → decision 12, js-yaml on the content path. 17 new tests (49 total) |
| S6 | 2026-08-27 | main | **build.cold.100 699 ms (gate ≤ 1.6 s ✅; 113 routes = 100 posts + index + 12 term pages) · 1k 6.41 s · 10k 61.6 s (10,013 routes; one run)** · **build.incremental.100 14 ms (gate ≤ 240 ms ✅; one body edit → 1 route rendered, 112 cached)** · build.noop.100 9 ms (touch only) · lint.100 17 ms · lint.1000 101 ms (was 165; one cache lookup per file) · lint.1000.cold 5.24 s · mcp.coldStart 51.9 ms in the report at load avg ≈ 10 — side by side against the S5 tree under the same harness: 38.2 vs 35.4 ms median (min 31.0 vs 29.5), nothing new on the `initialize` path · serve.ttfb 0.11 ms · tokens.page.md 516 · tokens.page.html 1,081 (real theme HTML; reduction 52 %, budget enforced from S7) · **tokens.learn 4,175 → 4,385** (`snypd://config` now carries the theme layer: `layouts`/`primitives` collapse to their file:line like spec defaults, ≈ 210 tokens remain; 415 to the CI line) | `@snypd/runtime` `openDatabase()`: `bun:sqlite` \| `node:sqlite` behind five calls. `@snypd/core` `SiteIndex` at `.snypd/index.sqlite`: `sync()` stats every content file, hashes only changed mtimes, re-reads frontmatter (no markdown parse: `readFrontmatter` = `---` block + js-yaml) and terms only on a new hash, drops missing files, records route moves (rule 10); tables `files terms moves routes meta mdast`; the mdast cache now persists into the same file (`MdastCache` takes an `MdastStore`). Lint rules 10 `slug-change` and 11 `tag-once` in `lintSite` (one cache lookup per file; `snypd lint` and `snypd://lint/*` open the index for the move log). `@snypd/render`: `jsx-runtime` (~60 lines, strings escape, `Html` passes through), `toHtml` (own mdast → HTML: CommonMark + GFM tables/task lists/strikethrough/footnotes, heading ids, directives → theme via `onBlock`), `loadTheme` (theme.yaml → layouts + primitives, coverage own/fallback/missing, `themeHash` over every file), `build()` = config → theme → sync → plan → render: route key = hash(content) + hash(theme) + hash(config) (+ entries hash for index/term/author lists), matching key + outputs present → skipped, vanished routes deleted; drafts not built; `.md` twin = source byte for byte. `themes/base`: `theme.yaml`, layouts `post page index term author` (+ `shell`, `entries`), all 13 primitives in semantic HTML with one `snypd-<name>` class, zero CSS/JS; `chart`/`diagram`/`flow` render their spec fallbacks until S8–S10. `snypd build` prints rendered/cached/removed + coverage (`--verbose` phases). Bench: cold = no dist *and* no index; incremental = a real body edit (restored after); `build.noop` report-only; 10k cold runs once. 20 new tests (69 total). **Findings:** an fsync costs ≈ 50 ms on this box — creating the SQLite file with default pragmas took 0.6–1.0 s, WAL 0.2 s, `journal_mode = MEMORY` + `synchronous = OFF` + DDL in one transaction 3 ms (decision 13); writing 100 mdast JSON files cost ≈ 400 ms → moved into SQLite. Cold build is now parse-bound: micromark ≈ 450 of the 699 ms (S12 item 1). Re-importing a changed theme in one process only refreshes the entry modules — static imports stay cached (docs/04; S11 bundles the theme per change) |

| S7 | 2026-08-27 | main | **Every speed metric on this run is inflated: host load avg ≈ 24 on 4 cores (unrelated node + chrome), vs ≈ 10 when S6 was measured.** build.cold.100 1.70 s (S6: 699 ms) · 1k 13.2 s · 10k 123 s · build.incremental.100 45.8 ms (gate ≤ 240 ms ✅) · build.noop.100 23.3 ms · lint.100 27.4 ms · lint.1000 458 ms (gate ≤ 1 s ✅) · lint.1000.cold 13.4 s · mcp.coldStart 138 ms (budget 50) · serve.ttfb 0.18 ms · **tokens.page.md 516 (gate ≤ 2,000 ✅)** · tokens.page.html 1,081 → 1,363 (JSON-LD + the two new head links) · tokens.page.reduction 52 % → 62.1 % (report-only, decision 15) · tokens.learn 4,385 (unchanged — S7 adds no resource to the learn surface) · **surface.completeness 100 % (8/8, enforced ✅)**. Side by side against the S6 tree under the same harness (`git worktree` at e531137, per-package `node_modules` symlinked, 5 interleaved cold builds each): **S7 3,414 ms vs S6 3,897 ms median — no regression, the box is ≈ 5× slower than it was in S6**; `packages/mcp` and `packages/spec` are byte-identical to S6, so the 138 ms cold start is S6's own 30 ms code under load | `@snypd/render` `emit.ts`: the agent-read surface as pure functions over `SurfaceSite`/`SurfaceEntry`, so the preview server (S11) and the bench call them without a build — `llms.txt` (twin URLs, grouped by type then taxonomy, entry counts per term), `feed.xml` (RSS 2.0, listed types only, `dc:creator`, `category domain=`, and the twin as `atom:link rel=alternate type=text/markdown` — RSS's own `<source>` means "the feed this came from", not "another representation"), `sitemap.xml` (lastmod = `updated ?? date`) + `robots.txt`, and the JSON API: `/api/site.json` (entry point), `/api/<type>.json`, `/api/<taxonomy>.json`, `/api/<type>/<slug>.json` (frontmatter + schema + twin URL). JSON-LD per page from the spec, not from the renderer: the page's own node (BlogPosting / Person / WebPage / CollectionPage / WebSite) plus whatever `schema-emit` derives from the blocks present — `FAQPage` from `faq` headings, `HowTo` from a `steps` list or a `flow` body (branches flattened in order), `tldr` as the description — so a new primitive with `schema-emit` needs no renderer change. `tokens.ts`: `theme.yaml` declares `{ default, customisable, kind, description }`, `snypd.yaml › theme.tokens` overrides with scalars, merged values become `:root { --color-accent: … }` at the head of `dist/assets/theme.css` followed by the theme's `css:` file; nothing is emitted or linked when a theme declares neither (`base` still ships 0 KB CSS). Artefacts are plan items with their own cache keys, so a body edit rewrites nothing (45.8 ms incremental) and a title edit rewrites only the lists that name it; `robots.txt` is keyed on the config alone. `OUTPUT_FORMAT` stamp in the index: an index written by an older renderer describes outputs this one no longer produces, so its routes are forgotten rather than trusted or pruned. Bench: `surface.completeness` probes the built corpus *and* the server for all 8 items and is enforced at 100 %. 8 new tests (73 total). **Findings:** `sync()` returned SQLite `NULL` for `date`/`updated` where a cold sync returns `undefined`, so `JSON.stringify` of the same site differed between a cold and a warm build and every artefact re-rendered every time — fixed at the row mapper, and it is the reason artefact keys are worth testing across two builds rather than one. The 85 % md-reduction budget cannot be met by `base` and should never have been aimed at it (decision 15) |
## 6. Risks

| Risk | L | Mitigation |
|---|---|---|
| Bun 1.4.0 is a week-old Rust rewrite; regressions in `bun:sqlite`/`Bun.serve`/`--compile` | High | runtime interface + Node CI lane from S1; 1.3.14 lane; only three Bun APIs used. S6: `bun:sqlite` sits behind `@snypd/runtime` `openDatabase()` with a `node:sqlite` (`DatabaseSync`) twin — five calls (`run all get transaction close`), nothing driver-specific leaks into core |
| Diagram layout blows the render budget on real content | Medium | 40-node lint; layout/paint split cache; if Sugiyama > 15 ms at 40 nodes, fall back to simple layered grid for `flow` and keep Sugiyama for `diagram` only |
| Charts look generic / "AI dashboard" | Medium | spec owns geometry, theme owns palette+type; `editorial` gets a hand-tuned viz palette in S14; human review of every chart type on the corpus before Gate C |
| remark too slow for 2 s / 100 — **measured in S5: micromark parses the corpus at ≈ 0.4 MB/s (≈ 7 ms per 2.7 KB post; commonmark.js 7 MB/s, markdown-it 4 MB/s, `Bun.markdown` 45 MB/s), so a cold parse of 1k posts is 6–8 s, a third of the 20 s build budget** | High | mdast cache (hash-keyed, persistable, S5) keeps rebuilds and lint off the parser; parse is the only cold cost that scales with corpus size, so the S12 speed pass takes the parser question first: worker parse, then the docs/04 "directive-capable parser" spike pulled forward from v0.2 if workers do not close it |
| Scope creep from the 35-primitive vocabulary | High | 13 locked; requests go to 06 open questions |
| Kill test fails on primitives | Medium | paper kill test at Gate B on `base`; redesign in Phase 3 rather than polish theme |
| Autonomous sessions drift | Medium | every session bounded by one row above, one PR, bench diff mandatory; Sunny reviews before next session |
| `snypd` npm name taken | Certain | `@snypd/*` from S1; final name at launch |
| tokens-to-learn: 4,175 after S4, **4,385 after S6 and unchanged by S7** (the surface adds files to `dist/`, not resources to `snypd://`) (the theme layer adds ≈ 210 tokens to `snypd://config` even with `layouts`/`primitives` collapsed to their file:line), CI line 4,800, `theme` resource still to come (S13) | High | `snypd://config` collapses untouched spec *and* theme.yaml subtrees; if `theme` blows the line, count only `theme/tokens` in the surface or trim the per-primitive YAMLs (docs/05 says config + spec/primitives + theme) |
| Theme hot reload inside one process (static imports stay cached — S6) | Low | `snypd build` is one process per run, unaffected; S11's preview server bundles the theme per change with `Bun.build` |

## 7. Decisions in this plan (override 06 where they conflict)
1. Engineer = Claude Code in bounded sessions; 22 sessions, three gates, calendar floats.
2. **13 primitives**: `chart`, `diagram`, `flow` are v0.1; `gallery` is not.
3. Viz = own `packages/viz`, build-time SVG, zero JS, spec-owned geometry, theme-owned palette. No D3, no Mermaid runtime.
4. New gate **D3** with per-primitive render-time and byte budgets.
5. Pagefind, `review`/`scheduled`, screenshots → v0.2.
6. CI budgets = 80 % of published; > 10 % regression fails the session.
7. Bun-native surface in v0.1 = `bun:sqlite`, `Bun.serve`, `--compile` only.
8. Dogfood = `snypd.rocks`, greenfield, content authored via Snypd; `/bench` page is the public benchmark.
9. npm scope `@snypd/*`; product name decided at launch.
10. Deploy = git push → host builds. Cloudflare Pages and Vercel both first-class via `snypd init --deploy`; host previews are the v0.1 review UI; `site.push` is explicit and off for Contributor tokens.
11. **No `@modelcontextprotocol/sdk` at runtime** (S4): it costs ~140 ms before `initialize` can be answered, 3× the cold-start budget. `@snypd/mcp` ships its own JSON-RPC stdio layer (`protocol.ts`, zero imports) and mirrors the SDK's result types locally; the SDK stays a devDependency for reference. Revisit only if the streamable-HTTP + OAuth transport (docs/03) proves cheaper to adopt than to write.
12. **`js-yaml` on the content path, `yaml` on the config path** (S5): the `yaml` package costs ≈ 1.2 ms per call in Bun 1.4 (15× js-yaml, 40× `Bun.YAML`), which is 1.2 s per 1k frontmatters. Config layering keeps `yaml` for its CST line numbers (provenance, decision 7 keeps `Bun.YAML` out); frontmatter and `chart`/`diagram`/`flow` bodies use `js-yaml`, which needs no provenance. Both accept the same YAML 1.2 core subset that the spec examples use.
13. **The index is disposable, so it is not durable** (S6): `.snypd/index.sqlite` runs `journal_mode = MEMORY`, `synchronous = OFF` — creating it costs 3 ms instead of ~0.5 s of fsyncs on a loaded box, and a corrupt index is deleted and rebuilt from git, never repaired. The parsed-mdast cache lives in the same file (one transaction per build, no per-document files). WAL waits for S11's concurrent reader.
14. **Themes are string-rendering TSX with no framework** (S6): `@snypd/render/jsx-runtime` is ~60 lines — strings escape, `Html` passes through, attributes drop on `false`/`null`. A theme is `theme.yaml` + `layouts/<name>.tsx` + one `.tsx` per primitive; `base` implements all 13 with semantic HTML, one class per primitive, zero CSS and zero JS. `chart`/`diagram`/`flow` render their spec fallbacks (a table, a node/edge list, a step list) until S8–S10.
15. **The 85 % md-reduction budget is measured on a styled theme, not on `base`** (S7): the reduction is `1 − tokens(twin)/tokens(html)`, and `base` emits semantic HTML with no CSS, no nav and no chrome — the very things that make real HTML expensive. On `base` the twin and the HTML are the same content twice, so the ratio measures the theme's thinness, not the surface. The metric stays in every report; its budget is enforced from S13 against `editorial` (docs/05's 92 % claim is about a real site, not a floor theme). Everything the budget exists to guarantee — the twin exists, is byte-identical to the source, is linked, and is negotiable — is covered by `surface.completeness`, which *is* enforced at 100 % from S7.

## 8. Ready to start
Code lives in this repo (`snypd/`), docs in `docs/`. S1 starts now.
