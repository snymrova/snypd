# 06 — Roadmap, MVP test, open questions

## Locked decisions
1. MCP is the only interface; `snypd` = `serve | build | bench | init`.
2. YAML is the only authoring-facing config; foundation + layered extension.
3. Files in git are truth; SQLite is a disposable index.
4. Closed primitive vocabulary, ~35, versioned; themes implement it.
5. Bun 1.4+ runtime, single-binary distribution, own renderer, TSX themes, zero client JS by default. No framework in core; Astro/Next as adapter plugins.
6. remark + directives for the vocabulary; `Bun.markdown` only where structure doesn't matter.
7. Agents are Contributor by default.
8. `snypd bench` ships in v0.1, before the second theme.
9. MIT. Open-core cloud later, optional.

## Milestones

**v0.1 — "it exists" (2 weeks, dogfood on one real blog)**
- `spec` with 12 primitives: `cover, tldr, callout, pullquote, stat, stat-row, figure, gallery, chart, faq, steps, cta`.
- `core`: YAML layering, `post`/`page`/`author` types, `category`/`tag`, status machine, lint, SQLite index, git ops.
- `render`: static build, `.md` twins, llms.txt, feeds, sitemap, JSON API, Pagefind.
- `mcp` (stdio): resources `config, spec/*, theme, content/*, lint/*`; tools `content.create/update/lint/suggest_blocks/render_preview/query/set_status/publish`, `theme.get_tokens/set_tokens/coverage`, `site.get_config/set_config`, `bench.run`.
- `themes/base` + `themes/editorial`.
- `bench`: tokens-per-page, tokens-to-learn, time-to-first-post, Lighthouse via Unlighthouse, build timer.
- `bun build --compile` producing `snypd` for Linux/macOS.

**The v0.1 test.** Take three existing plain-markdown posts. From a fresh harness with only the MCP: `suggest_blocks`, accept, swap between the two themes, change tokens, publish — never opening an editor. Then write a *new* post the same way. If that is not obviously faster and better than a markdown folder + Claude Code (which is already excellent), the primitives are wrong — fix them or stop. The bar is not "better than WordPress."

**v0.2 — the model**: remaining primitives; `series`, `cluster`; `review` + `/_snypd/review`; history tools; media manifest + `Bun.Image`; `render_preview` screenshots via `Bun.WebView`; visual-regression bench; plugin manifest with `tools`; `seo` + `newsletter` plugins; `themes/technical`; `build-theme` and `migrate-from-wordpress` prompts.

**v0.3 — beyond one machine**: Streamable HTTP + OAuth; workspaces; i18n; `Bun.cron()` jobs; `astro-adapter` / `next-adapter`; public read-only MCP per site; agent-analytics plugin; published benchmark page.

**v1.0**: spec freeze at ~35 primitives; RFC process; Node-compatible build verified; hosted cloud optional.

## Naming
**Snypd** — decided 27 Aug 2026. Domain `snypd.rocks` (owned; also the dogfood site and public benchmark page). npm scope `@snypd/*`, binary `snypd`, config `snypd.yaml`, URI scheme `snypd://`. Earlier working name "Press" retired; parked alternatives dropped.

## Open questions
- Fenced-code alias (```` ```callout ````) for the top five primitives, for renderers that don't know directives (GitHub preview)?
- Pages vocabulary (`hero`, `pricing`, `logo-wall`) as a separate `spec-pages` so the post vocabulary stays small?
- Chart renderer: spec reference SVG only, or theme-overridable?
- Preview images for `describe_primitive`: pre-rendered per theme (fast, stale) vs live (slow, true) — ship both, live on demand?
- When the 2026-07-28 MCP spec goes stable: adopt MRTR for approval flows.
- `Bun.WebView` needs Chrome on Linux — acceptable for local; CI is Playwright anyway.

## Launch post
"We turned the CMS into an MCP server and the theme into a spec." Traces to a shipped system only if v0.1 passes its test.
