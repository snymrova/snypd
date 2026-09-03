# 06 — Roadmap, MVP test, open questions

## Locked decisions
1. MCP is the only interface; `snypd` = `init | dev | serve | build | bench` (`dev` added in S18e, `07` decision 51 — it serves, it does not write). None of the verbs touch content.
2. YAML is the only authoring-facing config; foundation + layered extension.
3. Files in git are truth; SQLite is a disposable index.
4. Closed primitive vocabulary, ~35, versioned; themes implement it.
5. Bun 1.4+ runtime, single-binary distribution, own renderer, TSX themes, zero client JS by default. No framework in core; Astro/Next as adapter plugins.
6. remark + directives for the vocabulary; `Bun.markdown` only where structure doesn't matter.
7. Agents are Contributor by default — **amended S19c (`07` decision 80): the *write policy* is `publish` by default and `deploy.push` is `agent`, so an agent drafts, publishes and deploys. The role vocabulary is still unbuilt; the gates that exist are per-type config, not roles.**
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
**Snypd** — decided 27 Aug 2026. Domain `snypd.rocks` (owned; also the dogfood site and public benchmark page). npm scope `@snypd/*`, launcher package `@snypd/cli`, binary `snypd`, config `snypd.yaml`, URI scheme `snypd://`. Earlier working name "Press" retired; parked alternatives dropped.

**The bare name `snypd` is not ours and is not going to be.** Two different refusals, settled in S18h. The first was a permission — a granular token can write inside a scope it names and cannot *create* a new top-level package, which is why the same run published all five `@snypd/*` and 403'd on the sixth. The second survived fixing that, and is a registry rule rather than a credential:

> `E403 … Package name too similar to existing package snyk; try renaming your package to '@snymrova/snypd'`

No token and no retry gets past it, and npm's own suggested remedy is a scope. **So the launcher is `@snypd/cli`, and the binary it installs is still `snypd`** — a two-line `bin` map is the whole of the difference, and nothing but an install command changes: the domain, the config file, the URI scheme and the command you type are untouched. What you paste is `bunx @snypd/cli init`; what lands on `PATH` is `snypd`.

An appeal to npm support for the bare name costs one email and is worth sending; it is not worth blocking a release on, and if it is ever granted, `snypd` becomes a second name pointing at the same artefact rather than a rename. `packaging/README.md` §2 carries both refusals with the evidence for each.

## Open questions
- Fenced-code alias (```` ```callout ````) for the top five primitives, for renderers that don't know directives (GitHub preview)?
- Pages vocabulary (`hero`, `pricing`, `logo-wall`) as a separate `spec-pages` so the post vocabulary stays small?
- Chart renderer: spec reference SVG only, or theme-overridable?
- Preview images for `describe_primitive`: pre-rendered per theme (fast, stale) vs live (slow, true) — ship both, live on demand?
- When the 2026-07-28 MCP spec goes stable: adopt MRTR for approval flows.
- `Bun.WebView` needs Chrome on Linux — acceptable for local; CI is Playwright anyway.

## Launch post
"We turned the CMS into an MCP server and the theme into a spec." Traces to a shipped system only if v0.1 passes its test.
