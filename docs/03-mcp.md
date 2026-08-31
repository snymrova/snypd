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
| `snypd://theme` · `snypd://theme/tokens` · `snypd://theme/coverage` | the active theme, its palette, and which primitives it implements itself (S16). `theme` is part of what docs/05 counts as learning the site; the other two are read by an agent that is restyling, and are not in that budget. `theme/patterns` — the class contract a stylesheet targets — is not built yet; `base`'s `snypd-<name>` classes are the contract in the meantime |
| `snypd://content/{type}/{slug}` · `snypd://content/{type}/{slug}.md` | frontmatter+body as YAML/markdown |
| `snypd://media/{id}` | manifest entry |
| `snypd://history/{type}/{slug}` | commits touching it |
| `snypd://bench/latest` | the last full report as Markdown (S16). `snypd://bench/profile/{id}` follows when profiles do |
| `snypd://lint/{type}/{slug}` | diagnostics: rules 0–9 (docs/01) as `{rule, n, severity, line, message, hint}` — every entry carries a fix hint the agent can act on; served from S5, rules 10–11 need the S6 index |

Resources carry `ttlMs`; content resources subscribe so the harness is told when a post changes under it. Session start = read three resources (`config`, `spec/primitives`, `theme`) — budgeted at ≤ 6,000 tokens total (05); measured 4,571 (base) / 4,775 (editorial) at S16, with `tools/list` a further 2,208 on top.

### Tools — a small list, and a catalogue behind it (S16, docs/07 decision 38)

`tools/list` is paid on **every turn**, whether or not the agent themes anything. Measured in S15: 203 tokens per tool. The full v0.1 surface written flat — one tool per verb, as this document first specified it — is ≈ 8,600 tokens before the agent writes a word, on top of the ≈ 4,600 it pays to learn the vocabulary. So the surface is split, and the split is budgeted (`tokens.tools` ≤ 3,000, gated in `snypd bench`; measured **2,208**).

**Always listed.** The hot path, plus the way to reach everything else.

**content.** *(S11 ships `create` `update` `query` `lint` `set_status` `publish` `trash` `restore`; S15 adds `suggest_blocks` and `render_preview`.)* `create(type, slug?, frontmatter, body)` · `update(type, slug, patch|body)` · `lint` · `suggest_blocks({type, slug} | {markdown}, apply?, fill?)` · `render_preview` · `query` · `set_status` · `publish` · `trash` · `restore`
**find_tools.** `find_tools(query?)` — say what you are trying to do; the matching tools come back with their full JSON Schema and join `tools/list` (`notifications/tools/list_changed`). A catalogue tool is callable whether or not it was ever listed, so a client that ignores the notification loses nothing.

**In the catalogue.** One tool per namespace with an `action`, not one per verb: nine `theme.*` tools is nine descriptions and eight of them re-explain what a theme is. Reads are not tools at all — they are resources, which cost nothing until something reads them.

**theme.** `set(name)` · `set_tokens(patch)` (declared `customisable` keys only) · `scaffold(name, extends)` → `theme.yaml` + one stylesheet + `package.json`
**site.** `init(name?, url?, description?, theme?, deploy?)` — every argument optional (S18d: a name falls back to the directory, a URL to a placeholder that comes due at publish); `deploy: cloudflare|vercel` also writes the host's half, a build command and `dist/` (S18d′) · `set_config(path, value)` (validated, and rolled back on disk if it does not load) · `explain_config(path)` · `set_redirect(from, to)` · `doctor` · `build`
**bench.** `run(suite?)` · `compare(a, b)`

*Not yet in v0.1:* `taxonomy.*`, `media.*`, `history.*`, `jobs.*`, `theme.preview`, `site.set_nav`, `site.use` (workspaces). They join the catalogue on the same terms — one tool, an `action`, reads as resources — which is what keeps the budget intact as they land. `theme.preview` is deliberately absent: `theme` › set followed by `content.render_preview` is the same thing in two calls the agent already knows.

### Prompts (versioned editorial workflows)

S16 ships two: **`get-started`** (look before writing → ask the human only for the name and URL → `site` › init → read the vocabulary → one real post → preview → hand back the review link) and **`write-post`** (read the primitives and the type first → choose the shape before the prose → create → act on the lint's own fix hints → preview). Both are written as instructions naming the exact resources and calls in order — a prompt that does not name its calls is a paragraph, not a workflow.

Planned: `refresh-stale` · `build-theme` (scaffold → implement primitive → preview → repeat) · `migrate-from-wordpress` (WXR → types/terms/posts, shortcodes → primitives).

## Discoverability is the documentation

Descriptions are written for agents: purpose, intent, anti-intent, example. `tools/list` + `resources/list` are the docs. A generated `SKILL.md` / `AGENTS.md` / `.cursor/rules` pack (from the spec) is published for harnesses that want a file, but it contains nothing the MCP doesn't already say.

## The "no UI" consequences, made explicit

- **Approval:** `/_snypd/review/<id>` is a theme-rendered page in the site (diff + preview + approve), served by `snypd serve --preview`. No admin app.
- **Onboarding:** the `get-started` prompt, which calls `site` › init itself — nothing has to be run in a terminal first. `snypd init --name=… --url=…` is the same call for someone who reached for a shell anyway (S16); `--deploy` joins it in S18.
- **Media:** the harness already has file tools; `media.upload` takes a path.
- **Public read-only MCP** for every built site (`/.well-known/mcp.json`: `search`, `get_page`, `ask`) — the site itself is queryable by other agents.

## Safety defaults

Agents draft; humans publish (02 §11). `destructiveHint` on `trash`, `restore`, `theme.set`, `set_config`. Every write is a git commit with a principal trailer. Prompt-injection posture: a page an agent *reads* can never cause a *publish* without a human or an explicitly elevated token.

**How S11 enforces that, as S17b rewrote it.** A write goes to **`snypd/drafts`** — one branch for the whole site, cut from `main` on the first write and checked out from then on — and only the paths that write touched are staged, so `main` never carries a half-written post and an unrelated edit in the tree stops the one branch switch rather than riding along. Every draft in flight is therefore a file the agent can read, and writing a second post does not make the first one disappear. `content.publish` on a `draft`-policy type is refused until a human approves on `/_snypd/review/{type}/{slug}`, and the approval names the content hash it covers: edit after approving and the publish is refused again, with the reason. Approvals live in `.snypd/approvals.json` — the preview server writes it, the MCP server spends it, and losing the file can only ever *refuse* a publish. **Publishing lands one item's paths on `main` with git plumbing** — the base's tree with those paths replaced, committed with the base as its only parent — so no other draft reaches `main`, nothing unapproved enters its history, and the working tree does not move. Configuration writes (`theme`, `set_config`) are not content and land as they are made; content waits for its human. A site that is not its own git top level (a corpus inside another repo, say) gets the file writes and no commits at all: a benchmark must never be able to commit.
