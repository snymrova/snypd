# Snypd

An open-source CMS whose **only interface is MCP**. Write, edit, theme and publish a site from the harness you already live in. Markdown + YAML in a git repo you own; one Bun binary; static HTML with zero JS by default; charts, diagrams and flows rendered to SVG at build time.

**Status:** v0.1 in progress — see [`docs/07-delivery-plan.md`](docs/07-delivery-plan.md). Every speed claim links to [`bench/latest.md`](bench/latest.md).

```
bun install
bun run snypd init my-site --name="My Site" --url=https://example.com
bun run snypd serve my-site        # the MCP server on stdio — the only interface
bun run snypd bench                # speed suite → bench/latest.md
bun run snypd bench agent          # the kill test → bench/agent.md + a transcript
bun run snypd build corpora/100
bun test
```

From a harness, everything else is the MCP: read `snypd://config`, `snypd://spec/primitives` and `snypd://theme`, run the `get-started` prompt, and write. `tools/list` stays small on purpose — `content.*` plus `find_tools`, which hands over theming, config and benchmarks when you ask for them ([docs/03](docs/03-mcp.md)).

Design set: [`docs/`](docs/) · Site & public benchmarks: https://snypd.rocks
