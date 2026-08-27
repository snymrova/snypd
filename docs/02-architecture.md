# 02 — Architecture: YAML foundation, types, taxonomies, plugins, roles, pipeline

WordPress's durable ideas — registered content types, reusable taxonomies, a status machine, roles, hooks, a theme that renders a contract — are all kept. Its mechanisms (global mutable PHP state, HTML-in-MySQL, untyped meta, do-anything plugins) are not.

## 1. YAML layering

Resolution order, later wins, deep-merged; arrays append unless tagged `!replace`:

```
1. @snypd/spec defaults       built-in types, taxonomies, statuses, roles, jobs, primitives, budgets
2. theme.yaml                 tokens, layouts, variants, patterns, primitive map
3. plugins' snypd.yaml        in declared order
4. snypd.yaml                 the site
5. snypd.<env>.yaml           dev / preview / prod
```

`snypd://config` returns the merged result; `site.explain_config(path)` returns provenance ("`types.post.urlPattern` ← snypd.yaml:14, overrides spec default").

## 2. `snypd.yaml`

```yaml
snypd: 1
site:
  name: Example
  url: https://example.com
  locales: [en, fr]
  defaultLocale: en
theme:
  use: snypd-theme-editorial
  tokens: { color.accent: "#0FF0FC", font.heading: "Space Grotesk", content.width: 68ch }
types:
  post: { extends: post }
  caseStudy:
    extends: post
    dir: content/work
    urlPattern: /work/{slug}
    taxonomies: [industry, service]
    fields:
      client:  { type: string, required: true }
      outcome: { type: text }
      metrics: { type: list, of: { value: string, label: string, source: url } }
    mcp: { read: true, write: draft }
taxonomies:
  industry: { hierarchical: false, attaches: [caseStudy] }
  service:  { hierarchical: true,  attaches: [caseStudy, post] }
roles:
  agents: contributor
plugins:
  - snypd-plugin-seo
  - snypd-plugin-newsletter: { provider: buttondown }
jobs:
  refreshStaleReport: { every: 7d }
bench:
  budgets: { lcp: 1200, cls: 0.05, js: 0kb, tokensPerPage: 2500, buildPer100: 2s }
```

## 3. Content types

Built-ins are just pre-registered entries in the spec: `post`, `page` (hierarchical), `author` (data-only, `layout: null`), `nav`, `redirect`, `media`. A type = directory + frontmatter schema + allowed vocabulary + layout + taxonomies + URL pattern + MCP write policy (`false | draft | publish`). `hierarchical: true` gives `parent` and nested URLs. `snypd://types` and `snypd://types/{name}` expose the merged schema including plugin-added fields.

## 4. Taxonomies

Declared, typed, shared across types. Terms are files (`content/taxonomies/category/engineering.md`) with their own description, cover and SEO — an archive page an agent can write. Built-ins: `category` (hierarchical), `tag`, `series` (ordered; prev/next, part numbers, landing page), `cluster` (one hub, N spokes, internal links generated). Tools: `taxonomy.suggest(slug)` classifies against existing terms so agents don't invent a 900th tag; `taxonomy.merge`.

## 5. Status machine

`draft → review → scheduled → published → trashed`, in frontmatter, enforced by lint and write policy. `review` carries reviewer + note; transitions append to `history:` in frontmatter so the audit trail is in git. Scheduled posts are invisible until `publishAt`; the build filters, the scheduler rebuilds. Trash = `content/.trash/` with a 30-day sweep.

## 6. Revisions

git. Surfaced as `history.list/diff/restore`. Agent edits autosave to a branch `snypd/draft-<slug>`; publish = merge. An agent mid-edit never dirties `main`.

## 7. Media

`content/media/` + generated `media.yaml` manifest (dimensions, blurhash, alt, credit, licence, source, where-used). Lint: no alt, no licence, oversized. Optional object-storage plugin keeps the manifest in git.

## 8. Nav, globals, redirects

Nav: `content/nav/<location>.yaml` per theme-declared location. Globals: `snypd.yaml › site`. Redirects: `content/redirects.yaml`; a slug change on a published item auto-appends one and lint blocks publishes that would 404 a known URL.

## 9. Pipeline (typed hooks, fixed order)

```
parse      md → AST                        remark + remark-directive
validate   AST + frontmatter → diagnostics  lint rules
transform  AST → AST                        term autolinks, oEmbed, related, schema
render     AST + theme → HTML               own renderer (04)
emit       site → artefacts                 .md twins, llms.txt, feeds, JSON API, sitemap, Pagefind
publish    event                            webhooks, IndexNow, cross-post
```

Lifecycle events: `onCreate, onUpdate, onStatusChange, onPublish, onDelete`. Stages are pure `(input, ctx) → output`; plugins register in declared order; `content.explain(slug)` prints the pipeline a post went through.

## 10. Plugins

An npm package containing a `snypd.yaml` fragment (types, taxonomies, field types, primitives with schema + fallback, jobs, budgets) and optionally a `plugin.ts` exporting pure hook functions and **MCP tools/prompts**. A YAML-only plugin is first-class. Every plugin declares capabilities up front (`writes: [content]`, `network: [api.buttondown.com]`); `site.doctor` lists health and last release. Launch set: `seo, newsletter, comments (Giscus/Webmention), i18n, agent-analytics, social-crosspost, astro-adapter, next-adapter, pocketbase-state`.

## 11. Roles and principals

Roles `subscriber, contributor, author, editor, admin` with capability bags. A principal is a human, an **agent token**, or a plugin. Agent tokens default to `contributor` (draft, never publish); owners opt them up per site. Capabilities are checked at the MCP boundary; every write commit carries `Snypd-Principal: agent:claude-code/<user>` in the trailer.

## 12. i18n

Core, not a plugin war: `<slug>.fr.md` beside `<slug>.md`, `hreflang` emitted, translation staleness is a lint (`3 posts changed since their French twin`). `content.translate(slug, locale)` delegates to an engine plugin.

## 13. Workspaces

`workspace.yaml` lists sites, shared plugins/themes, per-site roles. `site.use(name)` switches. Each site is still its own repo.

## 14. What is explicitly not imported from WordPress

Global mutable state · HTML as storage · untyped meta · unrestricted plugins · comments in core · i18n as plugins · in-place prod updates · widgets · shortcodes as theme-owned syntax.
