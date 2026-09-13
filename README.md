# Snypd

An open-source CMS whose **only interface is MCP**. Write, edit, theme and publish a site from the harness you already live in. Markdown + YAML in a git repo you own; one Bun binary; static HTML with zero JS by default; charts, diagrams and flows rendered to SVG at build time.

**Status:** v0.1 in progress — see [`docs/07-delivery-plan.md`](docs/07-delivery-plan.md) for delivery and [`docs/11-hardening-and-themes.md`](docs/11-hardening-and-themes.md) for what is being hardened before launch. Every speed claim links to [`bench/latest.md`](bench/latest.md).

MIT ([LICENSE](LICENSE)). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md) — the design set in [`docs/`](docs/) is the answer to "why is it like this". Vulnerabilities: [SECURITY.md](SECURITY.md), which says plainly what is enforced and what is not.

**Start here — paste this into the harness you already have open:**

> Set up snypd here and write me a first post. Ask me what the site is called, then run `bun run snypd init`.

That is the whole front door. The agent asks what the site is called, runs `init`, and relays the one
thing it cannot do — restart the harness, so the tools load. On the far side it picks up from
`initialize` and writes the post. Five human actions, one of them friction ([docs/08](docs/08-first-run.md)).

**The sentence reads `bunx @snypd/cli init` from the first published release.** The package is built —
a launcher whose binary arrives as one platform-gated optional dependency, published from CI with
provenance ([`packaging/`](packaging/)) — and until that first publish the line above is a checkout.
The package is scoped and the command is not: npm declined the bare `snypd` as too close to `snyk`
(S18h), and `npm i -g @snypd/cli` still puts **`snypd`** on your `PATH`.

```
bun install
bun run snypd init my-site         # no flags: named after the directory, on a placeholder origin
bun run snypd init my-site --deploy=cloudflare   # …and the host's half: build command + dist/
bun run snypd dev my-site          # the Desk + the site with drafts in it, for a person to look at
bun run snypd serve my-site        # the MCP server on stdio — the only interface that writes
bun run snypd bench                # speed suite → bench/latest.md
bun run snypd bench agent          # the kill test → bench/agent.md + a transcript
bun run snypd bench onboard        # first run, walked end to end → bench/onboard.md
bun run snypd build corpora/100
bun test
bun run release                    # five platform packages + tarballs → dist/release
bun run scratch                    # a real site in sites/, wired to this tree, with dev running
```

`dev` is the one verb aimed at a person, and it writes nothing — it serves what a build already
produced, opens the Desk, and records itself in `.snypd/dev.json` so the agent hands you *that* URL
instead of starting a second server beside it. Everything that writes still goes through the MCP.

From a harness, everything else is the MCP: run the `get-started` prompt — it reads what the site already is and takes it from there — or read `snypd://config`, `snypd://spec/primitives` and `snypd://theme` yourself and write. `tools/list` stays small on purpose — `content.*` plus `find_tools`, which hands over theming, config and benchmarks when you ask for them ([docs/03](docs/03-mcp.md)).

**Plugins** are a directory with a `snypd.yaml` — `plugins: [changelog]` in the site's config enables one that ships in the binary, with no install; `plugins/<name>/` in the site or `snypd-plugin-<name>` on npm goes through the same loader. The root of that file merges into the site's config (types, taxonomies, budgets); the `plugin:` block is the manifest — name, version, `api: 1`, an options schema the site's entry is validated against, and the capabilities it declares. `snypd://plugins` and `site` › doctor print all of it. The contract is **experimental through 0.x** ([docs/10 §4](docs/10-plugins-and-launch.md)): a plugin declares (types, taxonomies), decorates (six slots, six filters), transforms (a `transform` stage over each document's tree, an `emit` stage whose files core writes under the plugin's own prefix) and reacts (`publish` and `push` events, fire-and-report, through a fetch that reaches only the hosts the manifest names); plugin tools land next, and a manifest that names them parses now and says so. Four ship in the binary — `changelog`, `analytics`, `autolink`, `indexnow` — one per tier. A plugin is code you install and vet like any dependency — what it declared and what it did are both inspectable, and nothing here is a sandbox.

Design set: [`docs/`](docs/) · Site & public benchmarks: https://snypd.rocks
