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
              ──emit──▶ dist/ + .md twins + llms.txt + feeds + JSON API + sitemap + schema
              ──post──▶ Pagefind index, image derivatives (Bun.Image), CSS from tokens
```

- **Static by default.** `snypd build` writes `dist/`. Deploy anywhere.
- **Incremental.** Each route's cache key = hash(content) + hash(theme module graph) + hash(config subset). Stored in the SQLite index; unchanged routes are copied, not re-rendered.
- **Zero client JS.** Themes may declare `client:` scripts per primitive (e.g. `tabs`, `before-after`) as small vanilla modules; each is counted against `bench.budgets.js`. No hydration framework.
- **CSS.** `theme.yaml` tokens → CSS custom properties; theme styles are plain CSS (or a build-time Tailwind pass inside the theme package — the renderer doesn't care). One stylesheet per theme, critical CSS inlined per layout.
- **SSR / preview.** `snypd serve --preview` runs the same render function behind `Bun.serve` with hot reload from the SQLite watcher. Hosted SSR (scheduled posts, per-request `/ask`) uses the same fetch handler; a Workers adapter is a plugin.
- **Themes are TSX.** `theme.yaml` maps each primitive to a `.tsx` file exporting `(props, ctx) => JSX`. Rendered to strings. Theme authors (mostly agents) get a strict, tiny contract: props from the spec, `ctx.tokens`, `ctx.slots`, nothing else. `theme.check` type-checks the theme against the spec.

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
