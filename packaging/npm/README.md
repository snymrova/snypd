# @snypd/cli

An open-source CMS whose **only interface is MCP**. Write, edit, theme and publish a site from the harness
you already live in. Markdown + YAML in a git repo you own; one binary; static HTML with zero JS by
default; charts, diagrams and flows rendered to SVG at build time.

**Start here** — one command, then the harness:

```sh
mkdir my-site && cd my-site
bunx @snypd/cli init
claude          # or Cursor, or Codex
```

Then say **“Write me a first post.”**

That is the whole front door. `init` scaffolds the site, git-inits it, commits, and writes `.mcp.json`;
the harness reads that file as it opens, and the agent picks up from the `get-started` prompt and
writes the post. Already inside a harness? Ask it to run `bunx @snypd/cli init`, then restart it.

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

`bunx @snypd/cli init` needs no install. Otherwise:

```
npm install -g @snypd/cli       # or: bun add -g @snypd/cli
brew install snymrova/tap/snypd
```

Either of those puts **`snypd`** on your `PATH` — the package is scoped, the command is not. npm declined
the bare `snypd` as too close to `snyk`, which is a rule about registry names and not about this program;
the `bin` map is what keeps every command below unchanged.

The package carries no code — the binary arrives as one platform-gated optional dependency
(`@snypd/darwin-arm64`, `@snypd/linux-x64`, …), which is why the install downloads one binary and not
five. Published from CI with npm provenance; every release is attested to the workflow that built it.

Built for macOS (arm64, x64), Linux (arm64, x64) and Windows (x64). Alpine/musl and pre-AVX2 x64 are not
built yet — a checkout runs on anything Bun supports.

MIT · https://snypd.rocks · https://github.com/snymrova/snypd
