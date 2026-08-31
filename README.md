# Snypd

An open-source CMS whose **only interface is MCP**. Write, edit, theme and publish a site from the harness you already live in. Markdown + YAML in a git repo you own; one Bun binary; static HTML with zero JS by default; charts, diagrams and flows rendered to SVG at build time.

**Status:** v0.1 in progress — see [`docs/07-delivery-plan.md`](docs/07-delivery-plan.md). Every speed claim links to [`bench/latest.md`](bench/latest.md).

**Start here — paste this into the harness you already have open:**

> Set up snypd here and write me a first post. Ask me what the site is called, then run `bun run snypd init`.

That is the whole front door. The agent asks what the site is called, runs `init`, and relays the one
thing it cannot do — restart the harness, so the tools load. On the far side it picks up from
`initialize` and writes the post. Five human actions, one of them friction ([docs/08](docs/08-first-run.md)).
The sentence will read `bunx snypd init` once the package is published; until then it is a checkout.

```
bun install
bun run snypd init my-site         # no flags: named after the directory, on a placeholder origin
bun run snypd serve my-site        # the MCP server on stdio — the only interface
bun run snypd bench                # speed suite → bench/latest.md
bun run snypd bench agent          # the kill test → bench/agent.md + a transcript
bun run snypd build corpora/100
bun test
```

From a harness, everything else is the MCP: run the `get-started` prompt — it reads what the site already is and takes it from there — or read `snypd://config`, `snypd://spec/primitives` and `snypd://theme` yourself and write. `tools/list` stays small on purpose — `content.*` plus `find_tools`, which hands over theming, config and benchmarks when you ask for them ([docs/03](docs/03-mcp.md)).

Design set: [`docs/`](docs/) · Site & public benchmarks: https://snypd.rocks
