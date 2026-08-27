# 03 — The MCP surface

MCP spec target: **2025-11-25** (stable) with the **2026-07-28** RC tracked (cache `ttlMs` on list responses, MRTR replacing server-initiated elicitation; roots/sampling/logging deprecated — we use none of the three). SDK: **none at runtime** — the official `@modelcontextprotocol/sdk` costs ~140 ms to import, 3× the cold-start budget (measured S4); `@snypd/mcp` speaks JSON-RPC 2.0 over stdio itself (`protocol.ts`, zero imports, result shapes mirrored from the SDK's `types.js`; docs/07 decision 11).

## Transports

- **stdio** — `snypd serve` in the repo. Default, free, zero accounts.
- **Streamable HTTP + OAuth 2.1** — `snypd serve --http` for hosted harnesses and teams. `/.well-known/oauth-protected-resource`, bearer tokens, scopes = role capabilities (02 §11). Rate-limit and route on `Mcp-Method`/`Mcp-Name` headers per the RC.

## Mapping the CMS onto MCP's three primitives

### Resources (read, cacheable, subscribable)
| URI | Content |
|---|---|
| `snypd://config` | merged YAML with provenance: `# ← file:line, overrides …` on every non-default line; untouched spec subtrees collapse to their `snypd://spec/*` pointer (S4) |
| `snypd://spec` · `snypd://spec/primitives` · `snypd://spec/primitives/{name}` | the vocabulary, one line each / full schema + intent + example + preview image |
| `snypd://types` · `snypd://types/{name}` | merged type schemas |
| `snypd://taxonomies/{name}` · `…/{name}/{term}` | terms and term files |
| `snypd://theme` · `snypd://theme/tokens` · `snypd://theme/coverage` · `snypd://theme/patterns` | active theme |
| `snypd://content/{type}/{slug}` · `snypd://content/{type}/{slug}.md` | frontmatter+body as YAML/markdown |
| `snypd://media/{id}` | manifest entry |
| `snypd://history/{type}/{slug}` | commits touching it |
| `snypd://bench/latest` · `snypd://bench/profile/{id}` | benchmark reports as Markdown |
| `snypd://lint/{type}/{slug}` | diagnostics: rules 0–9 (docs/01) as `{rule, n, severity, line, message, hint}` — every entry carries a fix hint the agent can act on; served from S5, rules 10–11 need the S6 index |

Resources carry `ttlMs`; content resources subscribe so the harness is told when a post changes under it. Session start = read three resources (`config`, `spec/primitives`, `theme`) — budgeted at ≤ 6,000 tokens total (05).

### Tools (side effects; all carry `readOnlyHint / destructiveHint / idempotentHint`)
**content.** `create(type, slug?, frontmatter, body)` · `update(type, slug, patch|body)` · `lint` · `suggest_blocks(markdown)` — upgrades plain prose into primitives · `render_preview(type, slug|markdown, theme?, viewport?)` → screenshot + URL · `query({type, taxonomy, fields, status, sort, limit})` · `set_status` · `publish` (elicits approval when policy is `draft`) · `schedule(publishAt)` · `trash` · `restore` · `translate(slug, locale)` · `explain(slug)`
**taxonomy.** `create_term` · `update_term` · `suggest(slug)` · `merge(from, to)` · `lint`
**media.** `upload(path|base64, alt, credit?, licence?)` · `set_alt` · `find_unused` · `transform(id, ops)`
**theme.** `list` · `set(name)` (runs coverage lint over all content) · `get_tokens` · `set_tokens(patch)` (declared keys only) · `preview(theme, slug)` · `coverage(theme)` · `scaffold(extends)` · `which_layout(slug)` · `check`
**site.** `get_config` · `set_config(path, value)` (schema-validated) · `explain_config(path)` · `set_nav(location, items)` · `set_redirect(from, to)` · `doctor` · `use(site)` (workspaces) · `build(target?)`
**history.** `list` · `diff(slug, from, to)` · `restore(slug, sha)`
**jobs.** `list` · `run(name)`
**bench.** `run(suite?)` · `compare(a, b)`

### Prompts (versioned editorial workflows)
`get-started` (creates `snypd.yaml` interactively) · `write-post` (system → draft → lint → preview → review) · `refresh-stale` · `build-theme` (scaffold → implement primitive → preview → repeat) · `migrate-from-wordpress` (WXR → types/terms/posts, shortcodes → primitives) · `weekly-content-review`.

## Discoverability is the documentation

Descriptions are written for agents: purpose, intent, anti-intent, example. `tools/list` + `resources/list` are the docs. A generated `SKILL.md` / `AGENTS.md` / `.cursor/rules` pack (from the spec) is published for harnesses that want a file, but it contains nothing the MCP doesn't already say.

## The "no UI" consequences, made explicit

- **Approval:** `/_snypd/review/<id>` is a theme-rendered page in the site (diff + preview + approve), served by `snypd serve --preview`. No admin app.
- **Onboarding:** `snypd init` = `snypd serve` + the `get-started` prompt.
- **Media:** the harness already has file tools; `media.upload` takes a path.
- **Public read-only MCP** for every built site (`/.well-known/mcp.json`: `search`, `get_page`, `ask`) — the site itself is queryable by other agents.

## Safety defaults

Agents draft; humans publish (02 §11). `destructiveHint` on `trash`, `restore`, `theme.set`, `set_config`. Every write is a git commit with a principal trailer. Prompt-injection posture: a page an agent *reads* can never cause a *publish* without a human or an explicitly elevated token.
