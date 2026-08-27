# Snypd

An open-source CMS whose **only interface is MCP**. Write, edit, theme and publish a site from the harness you already live in. Markdown + YAML in a git repo you own; one Bun binary; static HTML with zero JS by default; charts, diagrams and flows rendered to SVG at build time.

**Status:** v0.1 in progress — see [`docs/07-delivery-plan.md`](docs/07-delivery-plan.md). Every speed claim links to [`bench/latest.md`](bench/latest.md).

```
bun install
bun run snypd bench      # speed suite → bench/latest.md
bun run snypd build corpora/100
bun test
```

Design set: [`docs/`](docs/) · Site & public benchmarks: https://snypd.rocks
