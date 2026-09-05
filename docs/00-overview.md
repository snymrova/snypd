# Snypd — an MCP-native CMS on Bun

> Code lives in this repo (`snypd/`); this design set lives in `docs/`.

**Status:** design set v0.3, 27 Aug 2026. Supersedes the five `harness-native-cms*.md` brainstorms (deleted). Name **Snypd**, domain snypd.rocks; see 06-roadmap §naming.
**Docs in this set:** 00 overview · 01 content & primitives · 02 architecture (YAML, types, taxonomies, plugins, roles) · 03 MCP surface · 04 runtime & renderer (Bun) · 05 benchmarks · 06 roadmap.

---

## One paragraph

Snypd is an open-source CMS whose **only interface is MCP**. You write, edit, theme, and publish a website from whatever harness you already live in — Claude Code, Cursor, Codex, a Slack agent. Content is markdown + YAML in a git repo you own. Every configurable thing is YAML with a small built-in foundation that extends by layering. It ships as **one Bun binary** (`snypd`) containing the MCP server, the renderer, the spec, the bundled themes, SQLite, an image pipeline, a screenshotter and a scheduler. Output is static HTML with zero JavaScript by default, plus the full agent-read surface (`.md` twins, `llms.txt`, feeds, JSON API, a public read-only MCP) generated on every build. Speed, beauty and agent-friendliness each have a benchmark that runs in CI and fails the build.

"Your CMS is wherever your agent is."

## Why now

- The interface shift already happened for code; content (draft → review → publish) has the same shape and hasn't moved.
- Incumbents (Sanity, Contentful, Payload, WordPress, Ghost) are bolting MCP onto dashboard-first products. Git-based CMSs (Keystatic, Decap, Tina) are UI-first with no MCP. Nobody has built the composition: **git-owned markdown + MCP as the only interface + a closed, themeable primitive vocabulary + a hosted agent-read surface + editorial lint.**
- Bun 1.4 (Aug 2026) makes the one-binary distribution real in TypeScript: native image processing, headless screenshots, cron, SQLite, `--compile --asset`.
- We have a measured number to sell: a `.md` twin cuts what an agent parses by ~92% versus HTML.

## Who it's for

- **Primary:** solo founders and small technical teams who already write in a harness and resent the CMS tab.
- **Secondary:** agencies running 5–20 client sites from one workspace.
- **Not v1:** marketing teams who live in Notion/Webflow. No dashboard, on purpose.

## Principles (every later decision traces to one of these)

1. **MCP is the only interface.** If it isn't a resource, tool or prompt, it doesn't exist. The `snypd` binary has five verbs — `init`, `dev`, `serve`, `build`, `bench` (amended by `07` decision 51, S18e; three at first writing, four after `init`) — and **none of them touch content**, which is the load-bearing half. `dev` is the one a person types to *look*: it serves what a build already produced and writes nothing.
2. **YAML is the only authoring-facing configuration.** An agent reading `snypd.yaml` + `theme.yaml` + the spec knows the whole site without opening a `.ts` file.
3. **Files are truth.** Markdown + YAML in git. SQLite is a disposable index. No content in a database, ever.
4. **Closed vocabulary.** ~35 typed content primitives, versioned. Themes implement the vocabulary; content never references a theme.
5. **Zero JS by default.** Client JavaScript is an opt-in per primitive, per theme, and is budgeted.
6. **Evidence-grade by default.** `stat`, `chart`, `citation` require sources; `faq`/`steps` emit schema; the editorial rules are lint.
7. **Own the renderer.** No framework in core. A few hundred lines of Bun + TSX we can benchmark and reason about beats a framework's roadmap. Frameworks are plugins ("bring your Astro/Next site").
8. **Agents are principals with roles.** ~~Default Contributor: draft, never publish.~~ **S19c (`07` decision 80): an agent drafts, publishes and pushes by default.** A site puts a person back in the loop per type (`mcp.write: draft`) or per deploy (`deploy.push: human`); the role vocabulary itself is still unbuilt, and these two keys are what actually decides.
9. **Measure or don't claim.** Every performance/agent-friendliness claim in the README links to `snypd bench` output.
10. **Small, boring spec.** Additions by RFC, bias to no. Removals only across majors, with fallbacks.

## What you get out of the box

- `snypd serve` → stdio MCP server in the current repo. Zero accounts.
- Built-in types `post, page, author, nav, redirect, media`; taxonomies `category, tag, series, cluster`; statuses `draft → review → scheduled → published → trashed`.
- Three themes: `base` (unstyled, 100 % coverage), `editorial`, `technical`.
- Build → `dist/` static site + agent-read surface + Pagefind search + JSON API.
- `snypd bench` → the three suites, with budgets in `snypd.yaml`.
- Prompts: `get-started`, `write-post`, `refresh-stale`, `build-theme`, `migrate-from-wordpress`.

## Business shape (kept deliberately thin)

MIT everything in this repo. Optional paid cloud later: hosted builds, remote MCP with OAuth for team/hosted harnesses, review queue notifications, agent-traffic analytics. Free tier is the funnel and must be complete on its own.
