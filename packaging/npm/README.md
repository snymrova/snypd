# snypd

An open-source CMS whose **only interface is MCP**. Write, edit, theme and publish a site from the harness
you already live in. Markdown + YAML in a git repo you own; one binary; static HTML with zero JS by
default; charts, diagrams and flows rendered to SVG at build time.

**Start here — paste this into the harness you already have open** (Claude Code, Cursor, Codex):

> Set up snypd here and write me a first post. Ask me what the site is called, then run `bunx snypd init`.

That is the whole front door. The agent asks what the site is called, runs `init`, and relays the one
thing it cannot do — restart the harness, so the tools load. On the far side it picks up from the
`get-started` prompt and writes the post.

## What `init` does

Writes `snypd.yaml`, a scaffold and `.mcp.json` — the registration your harness reads at startup, which is
the one step between an installed binary and a usable product. It creates the git repo if the directory is
empty, commits the scaffold, and asks for nothing: the site is named after the directory and the origin
stays a placeholder until something is about to publish.

## The verbs

```
snypd init [dir]                # scaffold + register; no flags required
snypd serve [dir]               # the MCP server on stdio — the only interface
snypd serve [dir] --preview     # drafts rendered locally, with the Desk at /_snypd
snypd build [dir]               # static site → dist/
snypd bench                     # the speed suite
```

Everything else is the MCP surface: `content.*` plus `find_tools`, which hands over theming, config and
benchmarks when you ask for them.

## Install

`bunx snypd init` needs no install. Otherwise:

```
npm install -g snypd            # or: bun add -g snypd
brew install snymrova/tap/snypd
```

The package carries no code — the binary arrives as one platform-gated optional dependency
(`@snypd/darwin-arm64`, `@snypd/linux-x64`, …), which is why the install downloads one binary and not
five. Published from CI with npm provenance; every release is attested to the workflow that built it.

Built for macOS (arm64, x64), Linux (arm64, x64) and Windows (x64). Alpine/musl and pre-AVX2 x64 are not
built yet — a checkout runs on anything Bun supports.

MIT · https://snypd.rocks · https://github.com/snymrova/snypd
