# The launch page's words

**Written:** 16 Sep 2026 (S27) · **Plan:** [docs/16 §4](../16-launch-campaign.md) · **Source of every claim:** the README and [bench/latest.md](../../bench/latest.md) — CI's record, 4 vCPUs. A number in this file that is not in that file is wrong.

Everything Product Hunt asks for in words, in the order its form asks. The maker post (docs/16 §3) and the first comment below are one text in two lengths: write the post from the comment, not the other way round.

---

## Tagline

*≤ 60 characters. Docs/10 §8 chose it; decision 146 chose the order of the three sentences below it.*

> **The CMS whose only interface is your AI agent.** — 46

Weaker, kept for the record: *Your CMS is wherever your agent is.* (35 — names a location, needs the second sentence); *Publish a website from the harness you already have open.* (57 — the README's H3, better above a wordmark than beside one); *WordPress for the agent era* (the comparison every commenter will make; the first comment makes it first, precisely, so the tagline does not have to).

## Description

*≤ 260 characters. Decision 146's three sentences, joined.*

> Publish a website from the harness you already have open. Your CMS is wherever your agent is: markdown in a git repo you own, one Bun binary, static HTML out with zero JavaScript — and the only interface is MCP. — 211

## Topics

Developer Tools · Open Source · Artificial Intelligence. A fourth if the form allows one: Content Management.

## Links

- Website: `https://snypd.rocks` (the front page is `pages/home.md` — S26)
- Repository: `https://github.com/snymrova/snypd`
- Install: `npm i -g @snypd/cli` — or the front door, four lines, below

## Video — the first gallery slot

V1, 50.7 s (docs/15 §9 R4): `mkdir · bunx @snypd/cli init · claude`, "Write me a first post.", a post with a chart and a flow, the built page. PH takes a YouTube URL for the top slot; the upload is Sunny's (unlisted is enough). The same file goes into the site's `content/media/` for the front page (S26).

## Gallery

`docs/launch/gallery/`, five at 1270×760 and `thumbnail.png` at 240×240, from `python3 packages/bench/readme/gallery.py` — nothing photographed for the launch, everything cut from the README's own frames. In the order they should sit, after the video:

| # | File | What it shows | Where it came from |
|---|---|---|---|
| 1 | `01-editorial-paper.png` | The page itself: a post in `editorial › paper`, cut at the fold | `.github/readme/looks/editorial-paper-light.png` |
| 2 | `02-six-looks.png` | The phone strip on a plate — three themes, six looks, one post | `phones/strip.png` |
| 3 | `03-primitives.png` | Five of the thirteen as `editorial` renders them: chart, flow, diagram, steps, callout | `primitives/*.png` |
| 4 | `04-check-theme.png` | The terminal: `snypd check theme editorial`, 17 rules, passes | `terminal/check-theme.png` |
| 5 | `05-desk.png` | The Desk at `/_snypd`, cut at the fold: what to say to your agent, a draft in flight, the push | `desk/desk-light.png` |

The thumbnail is the wordmark's full stop — Source Serif 4's own glyph — on the accent. No mark, no mascot (docs/15 §4 A).

---

## The maker's first comment

*Posted within the minute of the launch going live, by Sunny, from his account. The shape is docs/10 §8's; every number links its row.*

Hi — Sunny here, I made this.

Snypd is a CMS with no dashboard. Its only interface is MCP: you open Claude Code, Cursor or Codex on a directory, say "write me a first post", and the agent writes, lints, previews and publishes it — markdown and YAML in a git repo you own, rendered by one Bun binary to static HTML with no JavaScript on the page. Every chart, diagram and flow is SVG the build drew. The whole front door is four lines:

```
mkdir field-notes && cd field-notes
bunx @snypd/cli init
claude
"Write me a first post."
```

**WordPress for the agent era**, precisely. I kept the ideas WordPress got right and refused the mechanisms that made it heavy:

| WordPress | Kept | Refused |
|---|---|---|
| Custom post types, taxonomies | Content has a registered shape | `register_post_type()` at runtime, from anywhere — here it is YAML in the repo |
| Hooks (`add_action` / `add_filter`) | An extension point at a named place | The global registry and priority folklore — slots and filters are declared in YAML, ordered by the `plugins:` list |
| Themes, child themes, style variations | One theme, several complete looks; extend without forking | The registry — a theme is an npm package, `snypd check theme` judges it before the shelf lists it |
| The plugin directory | One place to find things | Hosting it — npm is the registry, snypd.rocks lists and never hosts |
| The dashboard and the Customizer | — | All of it. The agent is the interface; a person keeps a review page and one Push button |

Three numbers, from the benchmark suite that fails CI when one moves ([snypd.rocks/bench](https://snypd.rocks/bench/) is generated from the same file):

- **23 ms** from spawn to `initialize` on the release binary — the agent's first turn does not wait ([`mcp.coldStart.binary`](https://snypd.rocks/bench/))
- **510 tokens** to read a page as its markdown twin; a whole site costs an agent under 6 000 tokens to learn ([`tokens.page.md`, `tokens.learn`](https://snypd.rocks/bench/))
- **0 KB** of JavaScript on every route of every shipped theme, and the build refuses a page that breaks it ([`page.js.kb`](https://snypd.rocks/bench/))

What it is not, on purpose:

- **No dashboard**, and there will never be a visual designer. If your team lives in Notion this is not for you.
- **No marketplace.** Themes and plugins are npm packages with a keyword. The site lists them; it does not host or review them.
- **No sandbox.** A plugin is code you install and vet like any dependency; I would rather say that plainly than imply a boundary that is not there. The contract is experimental through 0.x.
- **No telemetry** in the binary. Nothing leaves your machine that you did not push. I will not know you installed it unless you tell me.

What is next: a `migrate-from-wordpress` prompt (WXR in, a repo out), and an HTTP transport so a hosted harness can reach a site that is not on its disk.

It is MIT. The design set — the answer to "why is it like this" — is in `docs/`; the benchmarks are in `bench/`; the README's pictures were all made by the tree. I will be here all day.

---

## Ask the makers — the FAQ

*Ten answers, ready to paste. The README's `<details>` and the bench are the source; nothing here is new.*

**Is this a static site generator?**
It builds one — static HTML, a `.md` twin beside every page, `feed.xml`, `sitemap.xml`, `llms.txt`, a JSON API. But you never run it the way you run a generator. There is no `new post` command and no template you edit; the agent writes through MCP, and a person keeps a review page. The generator is the part you do not see.

**Why is there no dashboard?**
Because the harness is already open. A dashboard is a second interface that drifts from the first; WordPress spent a decade on that drift. Here the CMS's whole surface is what the agent reads (`snypd://config`, the primitives' spec, the theme) and the `content.*` tools — 2 230 tokens a turn. A person gets `/_snypd` — the Desk — which shows what to say to the agent, a draft in flight, and one Push button. That is the entire UI, and it is for reading.

**What about WordPress?**
Kept: post types, taxonomies, hooks, themes, child themes, a plugin directory. Refused: the database, the dashboard, the registry, the priorities, and every byte of default JavaScript. `migrate-from-wordpress` — WXR in, a repo out — is the first thing after launch.

**What does it cost?**
Nothing. MIT, one binary, your git repo, your host. A custom domain is never behind a paywall because there is no paywall in the binary. Cloudflare Pages or Vercel build it on push from a workflow `init --deploy` writes.

**What data leaves my machine?**
Nothing you did not push. There is no telemetry, no account, no update check. The MCP server speaks over stdio to the harness on the same machine. The one plugin that reaches the network, `indexnow`, reaches only the hosts it names, and only when you enable it.

**Windows?**
Yes — `npm i -g @snypd/cli` puts `snypd` on your `PATH` on Windows x64, macOS (Apple silicon and Intel) and Linux (x64, arm64): one ~85 MB binary per platform, published from CI with provenance.

**Can I write my own theme?**
`snypd new theme slate` writes a `theme.yaml` and one stylesheet; `base` brings every layout and all thirteen primitives, so a theme is CSS and tokens until it wants to be more. It may ship one webfont — self-hosted, subsetted, ≤ 40 KB, with a metric-matched fallback. `snypd check theme` judges it by seventeen rules, including the WCAG ratio of every colour pair on every look. Or ask your agent: the `build-theme` prompt walks it through the same steps.

**Plugins — is there a marketplace?**
npm is the registry: `snypd-plugin-*` and `snypd-theme-*` with a keyword. snypd.rocks lists what it finds and hosts none of it. Four plugins ship in the binary, one per tier: `changelog` (a type and a taxonomy, no code), `analytics` (a slot and a 3 KB client budget), `autolink` (a transform over the document tree), `indexnow` (reacts to publish and push).

**Is there a sandbox?**
No. A plugin is code you install and vet like any dependency, and I would rather say so than imply a boundary that is not there. The contract is experimental through 0.x; what a plugin *can* declare — types, slots, transforms, events, one tool — is closed and documented, but nothing stops the code inside from doing what code does.

**What is next?**
`migrate-from-wordpress`, an HTTP transport for hosted harnesses, and whatever the first sites that are not mine ask for. What I measure is `@snypd/cli` downloads, issues from people who are not me, and `snypd-theme-*` packages on npm — there is no telemetry, so those are the only signals there are.
