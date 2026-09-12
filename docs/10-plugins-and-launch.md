# 10 — Plugins, the theme ecosystem, and the Product Hunt launch

**Owner:** PM · **Engineer:** Claude Code · **Reviewer / decider:** Sunny · **Written:** 6 Sep 2026 · **Inputs:** docs 02 §§9–10, 06 (v0.2 milestone), 07 (Phase 4 as it stands after S19b, decisions 38, 46, 80), 09 (U1–U6, T1–T7, decisions 72–78), `packages/core/src/config.ts:147–175`, `packages/mcp/src/catalog.ts`, `bench/latest.md` at `0.1.2`, and the live header on snypd.rocks this morning.
**Scope:** the plugin contract; what "themes" has to mean for a public launch; the directory; the launch itself as a gate with a definition of done. Written with a free hand, as asked, and written down so it can be argued with.
**Not in scope:** the primitive vocabulary (locked, docs/06), content authoring (MCP only, decision 44), hosting (docs/07 §3b), anything in docs/06 v0.3.

---

## 1. The stake, and the opinion in one paragraph

Product Hunt is a Tuesday. A few thousand people will read a tagline, watch sixty seconds of video, click through to snypd.rocks, and a few hundred of them will paste one sentence into Claude Code. **Nothing in that funnel is a plugin system.** What the funnel needs is: a site that looks like a product when they land on it, a paste that works on a clean machine, and one sentence they can repeat to a friend. What themes and plugins buy is the *answer to the second question* — "is this a toy with two themes, or is this WordPress for the agent era?" — and that answer has to be true on launch day, not promised. So the opinion is: build the theme layer docs/09 already designed, build a plugin contract small enough to be finished and honest enough to be public, prove both with things a launch visitor can see, and **treat the launch as a gate with its own definition of done** rather than a date somebody picks. The rest of this document is that plan, and the places where I think the current design should move.

**Three things I would change from the standing plan, stated up front:**

1. **Client JavaScript becomes a budget line, not a prohibition** (§4.6). Decision 78 says a slot may not add JS. The first plugin anyone will ask for is analytics, and every privacy-respecting analytics provider is a one-kilobyte script. A rule the first real plugin has to break is not a rule. The budget already exists — `bench.budgets.jsKb`, default 0, measured on output — so the fix is to let a plugin *declare* what it spends and let the site *choose* to afford it.
2. **Plugins do not add primitives, and they do not write content** (§4.9). docs/02 §10 lets a plugin ship "primitives with schema + fallback". That is a shortcode with a manifest: a post that only renders with plugin X installed is the lock-in WordPress is famous for, and the closed vocabulary is this product's thesis. Refused at the contract, not at review.
3. **Style variations before a third theme** (§5.2). WordPress's best `theme.json` idea, forty lines on top of docs/09 §4.2, and it turns "two themes" into six looks on the gallery page. `technical` still gets built (U6), because it is the only honest test of the contract — but the variations are what a visitor sees first.

---

## 2. Where we stand

### 2.1 Plugins — what exists today

| Surface | Where | State |
|---|---|---|
| `plugins:` in `snypd.yaml` | `schema.ts:67` | ✅ Zod accepts `string \| { name: options }` |
| A plugin's `snypd.yaml` merged as a config layer, in declared order | `config.ts:168–175` | ✅ Found in `node_modules/<name>`, `plugins/<name>`, `node_modules/snypd-plugin-<name>`; missing → warning, not error |
| Provenance for plugin-contributed keys | `snypd://config` | ✅ `# ← plugin:<name>` |
| Anything a plugin can *do* | — | ❌ No hooks, no stages, no events, no tools, no options schema, no capability declaration, no doctor row, no resource listing them |

So a **YAML-only plugin already works** — a package whose `snypd.yaml` declares a type, a taxonomy, a field type or a budget is merged and attributed today. That is the floor this document builds on, and it is why Tier 0 in §4.2 costs one session's proof rather than a session's code. What does not exist is any way for a plugin to run.

### 2.2 Themes — what docs/09 established

docs/09 §2 is the audit and it stands. The short form: the `extends:` chain, coverage, tokens, the stylesheet chain and hot reload all work; **the shell is not overridable**, so no child theme can change the header or footer; `theme.yaml` is unvalidated; four documented keys (`locations`, `variants`, `patterns`, `client`) are read by nothing. U1–U6 are the plan. **None has started.** This morning `curl https://snypd.rocks` returns `<header><a href="/" rel="home">snypd.rocks</a></header>` — four launch posts behind a header that is one link. That is the first thing to fix, and §7 puts it first.

### 2.3 The dogfood findings still open

S19b's two log rows (docs/07 §5) record eleven findings from writing four posts through the MCP. Three were content fixes; the product fixes still open are: the dead byline on a default site (1), YAML flow-map labels with commas accepted by lint (3, 7), `lr` diagrams that scroll rather than scale (4), flow labels clipping at three lines (5, 8), the 160-character `description` refusal with no hint (9), and `suggest_blocks` missing a branching list as a `flow` (10). A launch visitor writing their first post will hit (1) and (9) inside ten minutes. §7 gives them a session (H1) rather than leaving them in a log row. **All six closed in H1, 6 Sep 2026 (PR #12; docs/07 §5).** Findings 6 (`<ol start>`) and 11 (the 3 + 1 stat row) were never in H1's list and stay open.

---

## 3. What WordPress built, and what each piece becomes here

docs/02 opens by keeping WordPress's durable ideas and refusing its mechanisms; docs/09 §3 did this for four presentation mechanisms. This table finishes the job for the ecosystem, because "inspired by WordPress" is only useful if every piece has a named counterpart or a named refusal.

| WordPress | What it got right | What it cost | Snypd |
|---|---|---|---|
| Custom post types, taxonomies | Content has shape; shape is registered, not implied | `register_post_type()` at runtime, from anywhere | `types:` / `taxonomies:` in YAML, merged with provenance — **built** |
| `add_action` / `add_filter` | An extension point at a named place | Global mutable registry, priority folklore | Slots and filters, **declared in YAML, ordered by the `plugins:` list** — docs/09 §4.4, moved here as P2 |
| `the_content` filter | Transform on the way past | Untyped, on HTML strings | `transform` stage over the typed tree; a closed set of named value filters — §4.4 |
| `publish_post`, `save_post` | Side effects at lifecycle moments | Synchronous, can fail the save | `publish` and `push` events, fire-and-report — §4.5 |
| `wp_head` / `wp_footer` | The head is a place plugins need | Anyone can inject anything, including scripts | `head`, `body-end` slots; scripts only inside a declared, budgeted `client:` — §4.6 |
| Plugin directory | One place to find things; install from the dashboard | A hosted registry with reviews, accounts, and a decade of security work | **npm is the registry.** `snypd-plugin-*` / `snypd-theme-*` with a keyword; snypd.rocks lists, never hosts — §6 |
| Must-use plugins | Some plugins are part of the product | A directory convention nobody documents | First-party plugins **ship in the binary** like `base` and `editorial` (decision 46 extended) — §4.8 |
| Plugin header comment | A manifest | Parsed out of a PHP comment | `plugin:` block in the plugin's `snypd.yaml`, Zod-validated — §4.1 |
| Theme directory, child themes | Distribution; extend without forking | Same registry cost | npm again; `extends:` — **built** |
| `theme.json` style variations | One theme, several complete looks, named | Arrived a decade late | `variations:` in `theme.yaml`, one config value to switch — §5.2 |
| Template hierarchy, parts | The document is not one file | Files-by-convention, no manifest | `layouts:` + `parts:` declared — docs/09 U1 |
| Customizer / Site Editor | Live preview beside the control | A framework, then a bigger framework | **Declined** (decision 77 stands). Configuration is agent-and-file |
| WP-CLI | Everything from a shell | A second surface that drifted from the first | The MCP *is* the CLI; five verbs touch nothing — **built** |
| REST API | The site is readable by machines | Bolted on, per-endpoint auth | `.md` twins, `llms.txt`, JSON API, public read-only MCP — **built / S19** |
| wp-cron | Scheduled work | Runs on page views | `jobs:` on `Bun.cron` — docs/06 v0.3, untouched here |
| Shortcodes, widgets | — | Content that depends on a plugin to render | **Refused** (docs/02 §14), and §4.9 refuses the manifest version too |
| WXR import | Leaving is possible, so arriving is too | — | `migrate-from-wordpress` prompt — **does not block launch**, §7 |

---

## 4. The plugin contract

### 4.1 A plugin is an npm package with a validated manifest

A plugin is a directory with a `snypd.yaml`. Everything at the **root** of that file merges into the site's config exactly as it does today (types, taxonomies, field types, jobs, budgets, tokens). Everything the plugin says **about itself** lives under one key, `plugin:`, which is read by the loader and **never merged**:

```yaml
# node_modules/snypd-plugin-analytics/snypd.yaml
plugin:
  name: analytics
  version: 0.1.0
  api: 1                        # the contract version this file speaks; a binary that does not → refused with a diagnostic
  description: Adds a privacy-respecting analytics beacon. One line; doctor and the directory print it.
  options:                      # JSON Schema for what the site passes in `plugins: [{ analytics: {…} }]`
    type: object
    required: [provider]
    properties:
      provider: { type: string, enum: [plausible, fathom, umami] }   # cloudflare dropped in P2: its beacon is 9.9 KB (§4.8)
      domain:   { type: string }
  capabilities:
    network: [plausible.io]     # hosts the plugin's own fetch may reach (§4.7)
    client: 3kb                 # client JS it asks to add; the site's jsKb budget must cover it (§4.6). P2 measured it: 1kb was a guess
  slots:
    head:      ./slots/head.tsx
    body-end:  ./slots/beacon.tsx
  filters: {}
  stages: {}
  events: {}
  tools: null
```

Rules, each one a test:

- **Validated, strict, with file:line diagnostics** — the treatment `snypd.yaml` has and docs/09 decision 73 gives `theme.yaml`. An unknown key under `plugin:` is an error naming the plugin.
- **Options are validated against the plugin's own schema** at load, and the failure is attributed: `plugins[analytics].provider: expected one of plausible|fathom|umami|cloudflare`. A plugin with bad options is **not loaded** and the rest of the site is; the diagnostic is in `snypd://config` and in doctor.
- **Resolution mirrors themes** (`themefs.ts`, decision 46): `plugins/<name>` in the site first — the unpublished, local plugin, WordPress's `mu-plugins` without the folklore — then `node_modules/snypd-plugin-<name>`, then `node_modules/<name>`, then the **bundled** set inside the binary. A third-party plugin and a first-party one go through one loader.
- **`api: 1` is checked before anything else is read.** The contract will change in 0.x; a plugin written for a contract this binary does not speak is refused with the version it wanted, not loaded and broken.
- **Every path is relative to the plugin's own directory**, the rule `theme.yaml` already follows, so a bundled plugin with no directory resolves through the same barrel themes do.

This amends docs/09 §4.4's example, which put `slots:` at the root of a plugin's `snypd.yaml`. Root keys merge; `plugin:` does not. One rule, no exceptions, and a plugin author can tell at a glance which half of their file changes the site's config and which half is about them.

### 4.2 Five tiers, declared

A plugin does one or more of five things, and the manifest says which. The tiers are not a hierarchy of trust — they are the five *kinds of thing* a plugin can be, so that doctor can print "analytics: decorates" and an operator knows what to expect before reading a line of code.

| Tier | Verb | Manifest keys | Runs | Launch proof |
|---|---|---|---|---|
| 0 | **Declare** | root keys: `types` `taxonomies` `fieldTypes` `jobs` `bench` | at config load — **exists today** | `changelog` |
| 1 | **Decorate** | `slots` `filters` | at render, per route | `analytics` |
| 2 | **Transform** | `stages: { transform, emit }` | at build, per route / per site | `autolink` |
| 3 | **React** | `events: { publish, push }` + `capabilities.network` | after a publish or a push | `indexnow` |
| 4 | **Speak** | `tools` `prompts` | in the MCP, via `find_tools` — **runs since P4** | `indexnow › ping`, `indexnow.get-indexed` |

A plugin that does something its manifest did not declare fails a **gate**, not a review: a `<script>` from a plugin with no `client:` fails `page.js.kb`; a file emitted outside a declared prefix is refused at write; a fetch to a host outside `network:` is refused by the fetch the plugin was handed. What cannot be enforced is named honestly in §4.7.

### 4.3 Slots and filters — docs/09 §4.4, adopted and moved

Everything docs/09 §4.4 decided stands: named, declared, resolved at load, ordered by the `plugins:` array, no priorities, inspectable by doctor, free when unused. Two amendments:

- The slot set is **six**: `head`, `body-start`, `before-content`, `after-content`, `footer-end`, and **`body-end`** — because a beacon goes before `</body>` and not inside the footer element, and an analytics plugin is the first thing anyone will write.
- `filters` stay the closed six — `title`, `description`, `excerpt`, `entries`, `jsonLd`, `route` — and each one is typed `(value, ctx) => value` with a plugin that throws becoming a diagnostic naming it.

The theme decides *where* a slot is (its parts render them); the plugin decides *what* goes in it. This session was U5 in docs/09 §7; it is **P2** here, because it needs the manifest (P1) to have anything to declare in.

**As built (P2, 6 Sep 2026 — `@snypd/render` hooks.ts):**

- A slot module's default export is `(props: SlotProps) => Html | string | null`, where `SlotProps` is `{ ctx, route, title, page?, options, plugin }`. **A string is markup** — a slot is a place in the document, so it is not escaped and the author owns it. That is deliberate: a site-local plugin can fill a slot with one `.ts` file and no JSX, no `@snypd/render` import, which is what keeps `plugins/<name>/` the WordPress `mu-plugins` of this system. A filter module's default export is `(value, ctx) => value` with `ctx = { name, route, entry?, options, plugin, site, config }`.
- **Where the base theme puts the six** — and `editorial` inherits every one, with no file of its own: `head` last in `<head>` after the JSON-LD; `body-start` first in `<body>`; `before-content` / `after-content` around the item's body in `post`, `page` and `author`, and around the entry list in `index` and `term`; `footer-end` last inside the `footer` part; `body-end` last before `</body>`. A theme that wants a slot elsewhere moves the `<Slot>` line; a theme that omits one has no such slot, and doctor's table says which plugins were expecting it.
- **Where the six filters run**: `title` and `description` on the entry, once, so the page, every list, the feed, `llms.txt` and the JSON agree; `excerpt` on the excerpt the build derives when frontmatter has no description; `entries` on the list an `index`, `term` or `author` layout receives; `jsonLd` on the schema array before it is serialised; `route` on the content item's route, first, so its output directory, the lists that link it, the surface and the menus all follow. The index keeps the unfiltered route — a filter is a view, and removing the plugin puts the route back.
- **A hook that fails is a diagnostic, not a crash and not a missing page.** A slot that throws contributes nothing and the others render; a filter that throws, or returns the wrong kind (a `title` that is not a string, `entries` that is not an array), leaves the value as it was. Each is `{ plugin, hook, route, message }` on `BuildResult.hooks.diagnostics`, one line per distinct failure however many times the value was read; `snypd build` prints them as `⚠ plugin analytics slots.head on /posts/a: …` and `site › build` carries them in its result. Filters run at plan time, so a build that renders nothing still reports a plugin that is still broken.
- **Free when unused** is a property, not a promise: a site whose plugins declare no slot or filter gets a frozen `EMPTY_HOOKS`, imports nothing, bundles nothing, and every `slot()` / `applyFilter()` is one length check. `tokens.learn` and `tokens.tools` did not move (§7.2 row 5).
- **Every hook module must exist at load.** A `slots.head: ./slots/head.tsx` that is not there refuses the plugin with the file and the line, the way a missing part file fails a theme — found before the first render, not at it.

### 4.4 Stages — the pipeline gets a way in

docs/02 §9 lists six stages as pure functions nothing can register into. Two of them open to plugins, both declared:

- **`transform(root, ctx) → root`** — the parsed document tree after the cache and before render, with the typed blocks beside it for reading (`ctx.blocks`); the blocks are **rebuilt from what comes back**, so a directive a transform touched is coerced again. The tree it is handed is a **copy** — the mdast cache is shared across routes and builds, and a transform that mutated it would run twice on the next build (P3 found this the day it wrote the stage). The `autolink` proof links the first mention of a term to its archive, which docs/02 §9 already names as a transform. **The route key gains the plugin graph hash** — the same `themeHash` treatment, over every plugin's files — because a transform that changes output must invalidate the incremental cache; and while a transform is on, the key also carries **the site's term list** (`ctx.terms`), because that is an input too: add a term in one post and every other post re-renders, which is the cache being right rather than fast. Returning nothing means "changed in place"; returning anything that is not a root is a diagnostic and the tree stands. As built: `hooks.ts` `applyTransforms`, `build.ts` `renderDoc`.
- **`emit(ctx) → { path, bytes }[]`** — extra artefacts into `dist/`, once per build, after every route, artefact and media file is planned. **The plugin returns files; core writes them.** The prefixes a plugin may write under are declared — `capabilities.emit: [og/]` — and default to **its own name** (`<name>/`); `/` and `../` are refused at load as prefixes, because "anywhere" is the one thing a prefix exists to refuse. A path outside them, one a route or site artefact already produces, one an earlier plugin already emitted, or one that is not a file path inside `dist/` is a diagnostic naming the plugin, the path and the rule, and the file is not written. Nothing a plugin can do overwrites a page. Each accepted file is a plan item keyed on its bytes, so unchanged bytes rewrite nothing and a removed plugin's files are pruned with it. As built: `hooks.ts` `runEmits`; `indexnow` is the proof (its key file).

`parse`, `validate`, `render` and `publish` stay closed. A plugin cannot change how markdown parses (one markdown engine is the point), cannot add lint rules in 0.x (the twelve are the spec's; an RFC opens that), and does not render (the theme does).

### 4.5 Events — fire and report

Two events, `publish` and `push`, matching the two acts a static site actually has. `publish(item, ctx)` fires after `Repo.land` succeeds — after `content.publish` has the item on the base branch — with the item, its URL, its path and the landed commit; `push(payload, ctx)` fires after `pushSite` returns success, from both places a push happens (`site › push` and the Desk's button), with the branch, the commits, and **the pages the sent commits changed** (`payload.changed`, mapped from git's paths by each type's `dir` and `urlPattern`, deletions included, and `payload.urls` ready to send). A handler returns `{ ok, message }` (a bare string is `ok`). **A handler that fails — throws, returns nonsense, or runs past a 10-second clock — produces a line in the tool result and a row in `.snypd/events.json`, never a failed publish** — the words are on `main` regardless of whether IndexNow answered. Handlers run one at a time in `plugins:` order. No retries in 0.x; a plugin that needs one exposes a tool to run again (which is exactly what `indexnow › ping` is, and why it is the Tier 4 proof). As built: `@snypd/core` `events.ts` (`fireEvent`, `eventLines`, `changedContent`, `readEvents`).

The rows live in **`.snypd/events.json`**, not `activity.json` as first written here (decision 101): `activity.json` is one process's liveness record, rewritten wholesale by a throttled writer inside the MCP server, and a push fires from two processes. An append-only ring of the last hundred rows, written by whichever process fired, is the shape a history has.

`onCreate`, `onUpdate`, `onStatusChange`, `onDelete` (docs/02 §9) are **not** opened. Nothing at launch needs them, and each is a place a plugin could react to an agent's keystroke — the surface stays as small as the launch set needs.

### 4.5b Tools and prompts — the plugin joins the conversation

The first three tiers put a plugin inside a build. Tier 4 puts it inside the only interface this CMS has. A plugin that declares `tools:` or `prompts:` names **one module each**, plugin-relative, checked at load like every other hook module.

**One tool per plugin, named after the plugin, with its verbs as the `action` enum.** Not one tool per verb — the same call the static catalogue makes for `theme`, `site` and `bench` (docs/07 decision 38): five `indexnow.*` tools would be five descriptions, four of them repeating what IndexNow is. So `indexnow › ping` is the tool `indexnow` with `action: ping`, which is the form that sentence was always written in. The module's default export is `{ description?, keywords?, actions }`; each action is `{ name, description, input?, required?, run }`, and the actions' `input` properties merge into one flat property bag the way `site`'s do.

**A plugin tool is never in the always-listed set.** `tools/list` returns the eleven `content.*` + `find_tools` tools until `find_tools` hands something over, and a plugin's tool can arrive only that way. That is what makes D11's "`tokens.tools` unchanged with every plugin on" a property of the design and not a thing to remember: the bench counts the static arrays, and the session's own `tools/list` is asserted byte-identical to `CORE_TOOLS` on a site with four plugins enabled (`mcp.test.ts`). The ranking is the catalogue's own, over the union — a plugin's tool competes with `site` and `theme` on the same scoring rather than being appended behind them, which is why `find_tools("ping search engines")` returns `indexnow` and nothing else.

**What an action is handed** is the event handler's set (§4.7) plus two reads a tool needs and a commit does not: `ctx.pages()`, every page the site publishes with its absolute URL, and `ctx.events()`, this plugin's own rows from the ring. Both are functions, because most actions want neither. There is no write: plugins do not write content (§4.9), and a plugin that wants words written exposes a tool the agent calls.

**Prompts are namespaced `<plugin>.<name>`**, so nothing a plugin declares can shadow `get-started`. A prompt returns the opening turn of a conversation, as markdown, from `{ name, description, arguments?, render }`.

**A module of the wrong shape is a diagnostic, not a crash.** The plugin loads, its other tiers run, and `site` › doctor prints ❌ with the reason — which is the only surface such a refusal has, so doctor resolves the modules and prints the verbs (`✅ \`indexnow\` speaks: \`indexnow\` › ping · prompt indexnow.get-indexed`). The one thing checked at config load instead is that the file exists at all, because a module missing from the plugin's own directory is a mistake worth finding before an agent asks for it.

**What it costs.** Resolving a site's plugin tools reads the config and imports a module per speaking plugin, so it happens on the first `find_tools` of a session and is cached for the rest of it — never on the `initialize` path `mcp.coldStart` measures. Measured on this box: **7 ms** on a site with no plugins (the config read that finds that out) and **55 ms** on a site with four, once per session. `prompts/list` pays the same way and nothing at all when no plugin declares one.

### 4.6 Client JavaScript is a budget line — amending decision 78

Decision 78: "A slot may not add JavaScript in v0.1.5." Kept as the **default**, changed as a **rule**:

- `bench.budgets.jsKb` is per site and defaults to `0`, as it does today.
- A plugin (later, a theme — docs/04's unbuilt `client:`) declares `capabilities.client: <n>kb`.
- At load, the declared client bytes are **summed against the site's budget**, in `plugins:` order. Over budget is a diagnostic at load, with the remedy in it — as built: `plugins[analytics].plugin.capabilities.client: asks for 3 KB of client JS; this site's jsKb budget is 0 KB. Set bench.budgets.jsKb: 3 to afford it, or remove the plugin (snypd.yaml:4)`, and when earlier plugins already took some: `…budget is 3 KB and 2.5 KB of it is already declared by the plugins before it. Set bench.budgets.jsKb: 5…`. The plugin is not loaded, its root keys do not merge, and the line named is the site's `bench.budgets.jsKb` when it has one. The budget is the **site's** number — env over site over the spec default — and a plugin's own root `bench:` keys cannot raise it for itself.
- `page.js.kb` measures the output, as it does today, and the gate is the budget: `bench.budgets.jsKb` is what the page suite compares against, not a hardcoded 0. A plugin whose script is bigger than it declared fails the gate — measured, not trusted. P2 found the measurement had a hole: the suite's warm-up navigation primed Chrome's disk cache and a cached third-party script reported zero bytes, so a page with a beacon measured as 0 KB. The cache is disabled for measurement now, as Lighthouse does.

What this buys is the sentence for the maker comment: **"Zero JS by default. Every byte is declared by the plugin that spends it and afforded by the site that allows it."** That is a stronger claim than "no JS", because it survives the first plugin.

### 4.7 Trust — what is enforced, what is declared, said plainly

A plugin is TypeScript running in the snypd process. Bun does not sandbox an import, and this document does not pretend otherwise. What snypd does:

- **Enforced:** the manifest and options schema; `api:` compatibility; emit paths (§4.4); the client byte budget on output; `ctx.fetch` — the plugin is handed a fetch whose hosts are its declared `network:` list (exact host, or `*.example.com`) and refuses every other one **before a connection is made**, with the remedy in the error: the plugin's own `snypd.yaml`, because the site cannot widen a plugin's allowlist and the plugin cannot widen it at runtime. A plugin with no `network:` gets a fetch that refuses everything. Under a wall clock, so a host that never answers is the fetch's error and not a hung publish.
- **Declared and visible:** `capabilities` in the manifest, printed by `site › doctor` and `snypd://plugins` beside the plugin's version and where it was found.
- **Not enforced, and said so:** a plugin can `import "node:fs"` and a plugin can call the global `fetch`. **A plugin is a dependency you install, and you vet it the way you vet any dependency.** snypd's contribution is that what it declared and what it did are both inspectable — `content.explain(slug)` prints what ran over a post (**built in P4**, and it builds the site into a scratch directory to answer, so it reports what ran rather than what was declared) and `page.js.kb` prints what reached the page.

The launch copy says exactly this. Overclaiming a sandbox is the one thing that would cost more on launch day than having none.

### 4.8 First-party plugins ship in the binary

`plugins/` joins `themes/` as a workspace and as a barrel in `bundled.gen.ts` (decision 46). `plugins: [analytics]` on a fresh `bunx @snypd/cli init` site works with **no install step**, exactly as `theme.use: editorial` does — and a plugin on disk in `plugins/` or `node_modules/` is found first, so a third-party plugin is not second-class.

**The launch set is four, one per tier, and each is the conformance test of that tier:**

| Plugin | Tier | What it does | Why this one |
|---|---|---|---|
| `changelog` | 0 | A `release` type (`version`, `date`, `breaking: bool`), a `product` taxonomy, `/changelog/{version}` — **zero code**, one `snypd.yaml` | Proves the YAML-only plugin is real; and a changelog page is what a Product Hunt visitor wants for *their* product |
| `analytics` | 1 (+ §4.6) | `head` preconnect + `body-end` beacon for Plausible / Fathom / Umami; `client: 3kb` — **measured** in the page suite on 6 Sep 2026: 1.87 / 2.69 / 2.63 KB on the wire, headers included. Cloudflare Web Analytics dropped: 9.9 KB, and one declaration covers every provider | The first plugin anyone asks for; the one that forces the JS-budget decision — and the one that showed "one-kilobyte script" was a guess |
| `autolink` | 2 | `transform`: the first prose mention of a taxonomy term in a post links to the term's archive — the term's title, or its slug with dashes as spaces; whole words, case-insensitive; headings, links, code, images and directive attributes left alone; once per document; never to the page itself. **Shipped P3** (`plugins/autolink`) | Exercises the stage and the route-key invalidation (the term list is in the key); on snypd.rocks the day it lands — enabled 10 Sep 2026, visible when the host builds with a release that has it |
| `indexnow` | 2 + 3 (+ 4 in P4) | `emit`: `dist/indexnow/<key>.txt`, the key file the protocol verifies, under its own prefix; `push` event POSTs the URLs the push changed (deletions included) to `api.indexnow.org` with `keyLocation`; `network:` is exactly the protocol's five endpoints; nothing changed → nothing sent, and it says which reason. **Shipped P3** (`plugins/indexnow`). **P4 added** `indexnow › ping` (re-send on demand — the whole site by default, `urls` to narrow it; a placeholder `site.url` is refused with the remedy, because no engine can fetch a key file from localhost), the `indexnow.get-indexed` prompt (the five-step order of operations, whose one failure mode is pinging before the key file is live), and `snypd://indexnow/last` | Network with an allowlist, an event, an emit that makes the event honest, and in P4 a catalogue tool, a prompt and a resource, in one small package |

**Not in the launch set, with reasons.** `seo` (docs/09 U5's proof): OG and Twitter tags belong in **core** — the `shell` part emits them from frontmatter and site config, the way canonical and JSON-LD already are. WordPress's worst onboarding lesson is that basics need a plugin. `newsletter`: wants a provider account on the visitor's side before it does anything on launch day; v0.2 after launch. `og-image`: the most demo-able idea on the list and the riskiest — rasterising text to PNG at build needs either `Bun.Image` compositing text or the bench's headless Chrome, which a host's build box does not have. **Spiked P3, 10 Sep 2026, and the stop rule fired:** Bun 1.4.0's `Bun.Image` decodes, resizes, rotates, flips and encodes (`png`/`webp`/`avif`/`jpeg`), and draws nothing — no text, no compositing, no canvas. Text to PNG without Chrome means a font rasteriser of our own, which is not an hour and not a plugin. It waits, as a community plugin over the `emit` stage once someone brings a renderer; social platforms do not render SVG cards, so an SVG `og:image` is not the shortcut it looks like. `comments`: Giscus is JS the budget can now afford, but it is a `body-end` slot anyone can write in an afternoon once P2 lands — a fine *first community plugin* and a poor first-party one.

### 4.9 Explicitly refused

- **Plugins do not write content.** No `writes: [content]`. The MCP is the one door for words (decision 44), and a plugin that writes a post is a second door with no principal trailer. A `translate` plugin exposes a *tool* the agent calls; the agent writes.
- **Plugins do not add primitives.** docs/02 §10's "primitives with schema + fallback" is withdrawn. A block that renders only when a package is installed is a shortcode with a manifest. New primitives go through the spec's RFC path (docs/06 #10) and arrive in every theme's coverage report or not at all.
- **No runtime registration, no priorities, no global registry** (decision 76, restated).
- **No plugin-added lint rules, no plugin-added parse.** One engine, twelve rules, until an RFC.
- **No marketplace, no accounts, no reviews, no "install from the dashboard."** There is no dashboard. §6.

---

## 5. Themes — what launch needs beyond docs/09

docs/09 U1–U3 and U6 stand unchanged. U5 moves to §4.3 as P2. Three additions:

### 5.1 Core owns social metadata

The `shell` part (U1) emits `og:title`, `og:description`, `og:type`, `og:url`, `og:image` (from `cover.image` or a site default), `twitter:card`, and `article:published_time` — from frontmatter and `site.*`, no plugin. `head` stays a slot for what varies by site; what every site needs is not a plugin.

### 5.2 Style variations

`theme.yaml` gains `variations:` — named, complete token sets shipped by the theme:

```yaml
variations:
  paper:      { description: "Warm cream, oxblood accent. The default." }             # the theme's own tokens
  ink:        { description: "Dark-first, cool grey, one cyan.", tokens: { color.bg: "…", color.accent: "…", … } }
  broadsheet: { description: "Tighter measure, sans headings.", tokens: { measure: "38rem", font.heading: "…" } }
```

`theme.variation: ink` in `snypd.yaml` is one config value; `theme › set` takes `variation` beside `name`; `snypd://theme` lists them. Precedence: theme defaults ← variation ← site `theme.tokens`, so a site's own overrides still win. `editorial` ships three; `technical` (U6) ships two. **Six looks from two themes**, and each is a screenshot on the gallery page. About forty lines on top of `tokens.ts`; the cost is a bench row (`tokens.learn` grows by the variation list, gated at 6,000, currently 4,620) and a test that switching a variation changes exactly the tokens it names.

### 5.3 The `build-theme` prompt

docs/03 planned it. It is the sentence that replaces the theme directory: *"ask your agent for a theme."* Scaffold (exists) → set tokens (exists) → override one part (U1) → declare a setting (U3) → preview → repeat. The prompt names its calls in order, as `get-started` and `write-post` do. It lands with U6, because U6 is the session that finds out whether the contract is enough to build a theme from — and the prompt is that finding, written for an agent.

### 5.4 Distribution is npm

`snypd-theme-<name>` with keyword `snypd-theme`; `theme.use` already resolves `node_modules/snypd-theme-<name>` (docs/04). Nothing to build except `snypd://themes` — installed and bundled themes with their variations — which is one resource and free until read. There is **no `theme › install`**: snypd does not run package managers, the agent's shell does, and doctor says `bun add snypd-theme-<name>` when `theme.use` names something not found.

---

## 6. The directory — npm is the registry, snypd.rocks is the shelf

WordPress.org's directory is the thing every "WordPress for X" wants and cannot afford. The honest version for launch:

- **Registry:** npm. Keywords `snypd-theme` and `snypd-plugin`; a `snypd` field in `package.json` is not needed because the manifest is `snypd.yaml`.
- **Shelf:** `snypd.rocks/themes` and `snypd.rocks/plugins` — two pages, written through the MCP like every other page on the site, one `figure` per theme variation (screenshots rendered by a script in this repo, the bench's CDP screenshotter over the `corpora/theme` fixture at 1280 and 390) and one `steps` block per plugin showing the two lines of YAML that enable it. Hand-maintained at launch. Generated from an npm keyword search when `jobs:` lands (v0.3), by a job on the site's own repo — which is a nice dogfood of both features and not a launch dependency.
- **Refused:** hosting packages, accounts, ratings, an install button, a review queue. Every one is a second product.

---

## 7. Gates and sessions

### 7.1 Gate D — the launch gate

Gate C (docs/07: D1–D6) is the release. **Gate D is the launch, and it is a different gate.** Launch day is chosen *after* D7–D13 are green, never before.

| # | Gate | Evidence |
|---|---|---|
| D7 | A site has a header, footer and menu from files, on both themes, and snypd.rocks shows them | docs/09 T6 green; `curl snypd.rocks` returns a `<nav>` |
| D8 | `technical` is built from the contract — parts + settings + variations — with no forked layout from `base` | docs/09 U6 exit; coverage shows `inherited` for every layout |
| D9 | Four first-party plugins, one per tier, bundled; `plugins: [analytics]` works on a fresh `init` with no install; removing a plugin from the list removes every byte it added | **green, 12 Sep 2026** — P1–P4 exits are all in §7.2, and the byte diff is `render.test.ts` "D9 (P4)": a baseline `dist/` hashed file by file, each of the four plugins on then off, and the tree asserted byte-identical to the baseline each time, plus all four at once (P4 wrote it because it is the last P session and no later one claimed it) |
| D10 | A plugin in a site's own `plugins/` dir — not bundled, not on npm — loads by the same path and passes the same gates | a corpus fixture with a local plugin; `snypd://plugins` names its source as `plugins/` |
| D11 | The budgets hold with every plugin on: `tokens.tools` unchanged (plugin tools are catalogue-only); `tokens.learn` ≤ 6,000; `build.cold.100` within 10 % of `main` with no plugins; `page.js.kb` equals the declared client bytes exactly (0 without `analytics`) | `bench.compare` in CI; new lanes `plugins.*` extend rather than invent |
| D12 | snypd.rocks has `/themes`, `/plugins`, `/bench` (S22), a nav, and **one post per gate** — the U-series (after U6b), the P-series (after P4), and the launch itself (L2) — build-in-public is the launch content (amended 6 Sep 2026, decision 97: three good posts over fourteen thin ones) | the pages answer 200; the three posts are in the feed |
| D13 | Launch assets exist and the paste works: a 60-second recording of an agent writing a post, switching a variation, and enabling a plugin; five gallery images; tagline, first comment, and an FAQ; `bunx @snypd/cli init` run on a clean machine on at least three of the five platforms — and the copy names **every platform Bun compiles to**, Windows included (Sunny, 6 Sep 2026: "all bun provides"), so `@snypd/windows-x64` gets its clean-machine run in L2 and is fixed rather than dropped from the sentence | a `docs/launch/` folder with the assets and the three clean-machine transcripts |

### 7.2 Sessions, in order

Fourteen sessions. Public embarrassment first, then the contract in dependency order, then the proofs, then the shelf. Phase 4's remaining four (S19d, S20, S21, S22) are unchanged and interleave where noted. Each session keeps docs/07 §4's two rules: one PR, one `bench.compare` from CI.

| # | Session | Deliverable | Exit |
|---|---|---|---|
| 1 | ~~**U1**~~ | **done 6 Sep 2026, PR #10** — parts, Zod over `theme.yaml`, social metadata in the shell; the log row is docs/09 §7b | docs/09 U1 exit ✅ · OG tags on every route ✅ |
| 2 | ~~**U2**~~ | **done 6 Sep 2026, PR #11** — nav (docs/09 §4.3); snypd.rocks got a header and footer menu the same day, through `site` › set_nav, and was pushed; the log row is docs/09 §7b. No post: decision 97 | T6 green ✅; `curl snypd.rocks` has a `<nav>` **⏳ — blocked on a release**: Cloudflare builds the site with `npx -y @snypd/cli@0.1.2`, the published binary, which predates U1 and U2. The menus are in the site's repo and render on `snypd dev`; they reach the public page when 0.1.3 ships (Sunny's call, 6 Sep: release now — `v0.1.3` is the ten version fields in lockstep on top of #11, and the site's build pin moves to it once npm has it) |
| 3 | ~~**H1**~~ | **done 6 Sep 2026, PR #12** — the six S19b product findings (§2.3), each with a test; the log row is docs/07 §5. No post: decision 97 | each finding has a test ✅ · `suggest.precision` 1.000 (17/17), unmoved ✅ |
| 4 | ~~**P1**~~ | **done 6 Sep 2026, PR #13** — the contract, as §4.1 wrote it, each rule a test (`core.test.ts` "plugins (P1)"). `plugin:` is strict Zod with file:line and is never merged; `api:` is checked before anything else and a mismatch refuses the manifest *and* its root keys; `options` is JSON Schema (`z.fromJSONSchema`, zod 4) and a failure reads `plugins[analytics].provider: … (snypd.yaml:4)` — the site's line, where the fix is; resolution is `plugins/<name>` → `node_modules/snypd-plugin-<name>` → `node_modules/<name>` → the barrel, through the themefs seam (`snypd:plugin/<name>`, one loader). **One call §4.1 did not make:** a refused plugin does not fail the config — `ok` stays true, the build goes on without it, doctor prints ❌ with the diagnostic, `snypd://config` and `snypd://plugins` carry it (`Diagnostic.plugin`). Tier 1–4 keys parse today and warn *not built yet, lands in P2/P3/P4* — the `THEME_UNBUILT_KEYS` treatment. `changelog` ships in the barrel (`plugins/` is a workspace; `bundled.gen.ts` packs both): a `release` type (`extends: post`, `version`, `breaking`, `product` ref) and a `product` taxonomy, zero code; `/changelog/{slug}` not `{version}` — url patterns expand `{slug}` and `{path}` only, and the slug is the filename. Route key: `themeHash` over the loaded plugins' dirs, plus the site's options in the config hash, both absent when no plugin is on. No post: decision 97 | D10's fixture loads ✅ (`mcp.test.ts`: a `plugins/local` plugin, `from: plugins/local`, refused then fixed); a bad option is attributed ✅; `build.cold.100` — no clocks from this box (memory: not comparable), CI's `bench.compare` on the PR; the loader runs only over declared plugins, so a site with none pays no read. Tokens via `bench --quick` here: `tokens.tools` 2230 → **2230** byte-identical; `tokens.learn` 4564 → 4564 (`snypd://plugins` is a resource, read when asked, not at session start); JS 0 KB. tests 336 → 346 (345 pass, 1 todo), 0 fail; typecheck clean |
| 5 | ~~**P2**~~ | **done 6 Sep 2026, PR #14** — slots and filters as §4.3 now records them (`hooks.ts`; `loadHooks` / `slot` / `applyFilter`; `SiteCtx.hooks`), the client budget as §4.6 records it (summed in order at load in `plugins.ts`, `bench.budgets.jsKb` read by the page suite), and `analytics` (§4.8) with `client: 3kb`, three providers, and the id-less provider a slot-time diagnostic that names the fix. Doctor prints per plugin `— slots head, body-end · client 3 KB` and one `client JS: 3 KB declared by plugins, 3 KB afforded` row; `snypd://plugins` prints the hook table (`hooks: { slots: { head: [analytics], … }, filters: {…} }`) and `client: { declared, budget }`. **Three things P2 found:** (1) "one-kilobyte script" was a guess — measured on the wire the three providers are 1.9–2.7 KB, so the declaration is 3 KB and Cloudflare (9.9 KB) is out; (2) `page.js.kb` could not see a third-party script at all, because the warm-up navigation cached it and a cached response weighs 0 — `Network.setCacheDisabled` fixes the suite, and the numbers above are the first honest ones; (3) a `route` filter that moves an item shares an output (`api/post/a.json`) between the vanished row and the new plan item, and the prune deleted it — the prune now skips outputs a planned route claims, a latent bug for any route move. The base shell's `<title>` and `og:title` at `/` read `title` rather than `ctx.site.name`, so a `title` filter reaches the front page. Tokens via `bench --quick` here: `tokens.tools` 2230 → **2230**, `tokens.learn` 4564 → **4564**, `tokens.page.md` 510 / `.html` 1510 unchanged (no slot on the corpus site; a slot costs what it emits). `page.js.kb` measured in the page suite: **0** without analytics, **1.87** Plausible / **2.69** Fathom / **2.63** Umami against a budget of 3. tests 346 → 349 (348 pass, 1 todo), 0 fail; typecheck clean. No post: decision 97 | the seo-tag test docs/09 wrote, now against `analytics` ✅ (`render.test.ts` "P2 slots and filters": the beacon with no theme change, gone when the plugin is) · `page.js.kb` 0 without it ✅, 1.87–2.69 with it under a budget of 3 ✅ (the "1 with it" was the same guess as the declaration) · over budget refuses at load ✅ (`core.test.ts` "P2: client JS is a budget line") |
| 6 | ~~**P3**~~ | **done 10 Sep 2026, PR #15** — the two stages as §4.4 now records them (`hooks.ts` `applyTransforms` / `runEmits`, `build.ts` `renderDoc`), the two events as §4.5 does (`@snypd/core` `events.ts`: `fireEvent`, `eventLines`, `changedContent`, `.snypd/events.json`), the allowlisted `ctx.fetch` (§4.7, `pluginFetch`), and two plugins: `autolink` (transform) and `indexnow` (emit + push, `network:` = the protocol's five endpoints). `content.publish` fires `publish` after the land; `site › push` and the Desk's button both fire `push` with the pages the sent commits changed; every handler's answer is a line in the result and a row in the ring. Doctor prints per plugin `— stages transform, emit; events publish · writes hello/ · fetches example.com`; `snypd://plugins` prints `stages:` / `events:` per plugin and the `stages` / `events` rows of the hook table. **Four things P3 found:** (1) a transform must get a *copy* — the mdast cache is shared, and the first draft ran the transform twice on the second build (decision 102); (2) a transform's inputs include the site's term list, so the list is in the key while a transform is on — a term added in post C re-renders post A (tested); (3) `activity.json` is the wrong file for event rows: a heartbeat rewritten wholesale by one process cannot be a log two processes append to (decision 101); (4) `Bun.Image` 1.4.0 draws nothing — `og-image` waits (decision 105, §11 q.3 closed). Emit prefixes default to the plugin's name and `/` is refused at load (decision 103); the `push` payload carries pages, not paths (decision 104). snypd.rocks: `autolink` + `indexnow` enabled, a `Building in public` category title and an `MCP` tag title added, the three MCP posts tagged and republished, pushed — the first ping went out and came back as a line (the key file is not live until the host builds with a release that has the plugin). Tokens via `bench --quick` here: `tokens.tools` 2230 → **2230** byte-identical; `tokens.learn` 4564 → **4564**; `tokens.page.md` 510 unchanged. `build.cold.100` — no clocks from this box; CI's `bench.compare` on the PR. tests 349 → 356 (355 pass, 1 todo), 0 fail; typecheck clean. No post: decision 97 | a term autolinks ✅ locally on the snypd.rocks tree (`MCP` → `/tag/mcp/`, `building in public` → its category) — **⏳ live when the host's pin moves to a release ≥ 0.1.4**, the same wait U2's menus had · a push pings ✅ (`events.test.ts`: a local endpoint through `ctx.fetch`; `indexnow`'s request checked byte for byte) · a failed ping is a line, not a failure ✅ (six handler behaviours, six rows, one push) · a host outside `network:` is refused before a connection ✅ · emit cannot overwrite a page ✅ (`render.test.ts` "stages (P3)") |
| 7 | ~~**P4**~~ | **done 12 Sep 2026** — tier 4 as §4.5b now records it. `PLUGIN_UNBUILT_KEYS` is **empty for the first time since P1 wrote it**: every key the manifest accepts is a key this binary runs. `@snypd/core` `speak.ts` is the contract (`PluginToolsModule`, `PluginPromptsModule`, `loadPluginTools`, `loadPluginPrompts`, `callPluginTool`) and `@snypd/mcp` `plugintools.ts` is the bridge; the module loader P3 wrote inside `events.ts` moved to `plugins.ts` as `pluginModule`, so one seam now serves every tier that runs plugin code. `indexnow` gained both halves — `› ping` and the `get-indexed` prompt — and `content.explain(type, slug)` landed **in the catalogue, not the always-listed set**, which is the one call §4.5b did not have to make: explain is read once when something is surprising, and putting it beside `content.create` would have moved the number every turn pays for. **Four things P4 found:** (1) a one-action namespace looks odd until the second verb arrives, and `indexnow` only has `ping` — kept, because the shape is the catalogue's and scaling it later must not rename the tool; (2) `find_tools` could not stay free — its comment said it "needs nothing but the catalogue", and searching a site's plugin tools means reading the site's config, so it now pays 7 ms on a plugin-free site and 55 ms on this four-plugin one, once per session, and the comment says why; (3) a plugin whose name collides with a built-in must lose the *name* and keep every other tier, or a plugin could shadow `site`; (4) `content.explain` cannot build with the site's own index — a scratch `out` with the real index would leave the incremental state believing files exist that do not, so explaining a post would break the next build; it gets its own index in a temp dir and the whole thing is removed after (asserted: 15 cached before and after). Doctor resolves the modules and prints the verbs, because a refused tools module has no other surface. **D9's byte diff was written here too** (`render.test.ts` "D9 (P4)"), because P4 is the last P session and the gate's other half had no owner — and it found the fifth thing: a transform changes the page and **not** the `.md` twin, which is correct and was worth asserting rather than assuming. The twin is the source file byte for byte (docs/01 §2: "the source file *is* the agent `.md` twin"), so with `autolink` on, the HTML and the twin deliberately disagree. A twin that carried the transform's output would let an agent read it, write it back, and bake the transform into the source — where the next build would transform it again. That is decision 102's failure arriving by another door, and the source staying the source is what keeps a transform a view rather than an edit. Tokens via `bench --quick` here: `tokens.tools` 2230 → **2230** byte-identical; `tokens.learn` 4564 → **4564**; `tokens.tools.full` 3649 → 3890 (`content.explain`, +241, report-only). `build.cold.100` from CI, both lanes, against P3's run of the same job: **330.2 → 224.9 ms** on Bun 1.4.0 and **284 → 346.9 ms** on 1.3.14, both far under the 2,000 ms budget and both inside the noise a shared runner produces — nothing here is on the build path, which is the reading those two opposite signs support. `build.cold.10000` 21.7 s / 32.3 s, budget 200 s. tests 356 → 359 (358 pass, 1 todo), 0 fail; typecheck clean. **Checked through the compiled artefact and not only the source lane** (the S18a rule): `bun build --compile --splitting`, then `serve` over stdio on the four-plugin site — `tools/list` 11, `find_tools` returns `indexnow`, `› ping` runs, `prompts/list` carries `indexnow.get-indexed`, `snypd://indexnow/last` reads. The barrel is how the binary sees a plugin's modules, so a new file in one is exactly the change that passes on disk and fails in the artefact | `tokens.tools` byte-identical with all four plugins on ✅ — and stronger than the row asked: the session's own `tools/list` is asserted `toEqual(CORE_TOOLS)` with three plugins on, one of which speaks (`mcp.test.ts` "P4"), so the claim is the object and not the count · `find_tools("ping search engines")` finds it ✅ — returns exactly `[indexnow]`, and finding it does not drag the plugin beside it into the list · a plugin's tool is callable before it was ever listed ✅ · a wrong verb is snypd refusing, a failed handler is the plugin answering ✅ · prompts are namespaced and cannot shadow `get-started` ✅ · `content.explain` names what ran, not what was declared ✅ (autolink changed the tree, analytics filled two slots, indexnow emitted its key file) · a broken tools module costs one tier and doctor says which ✅ |
| 8 | ~~**U3**~~ | **done 12 Sep 2026** — the settings schema (docs/09 §4.2, §7b): `settings:` in `theme.yaml`, twelve types, strict and appended up the chain; `ctx.settings` with `settingText`/`settingFlag`/`settingLinks`; `snypd://theme/settings`, listed only by a theme that has some; `theme` › set_settings; `editorial`'s six, four of them read by parts `base` owns. Decisions 113–116 | docs/09 U3 exit ✅ |
| 9 | **U6a** | **Style variations (§5.2)**: `variations:`, `theme.variation`, `theme › set variation`, `editorial` × 3 | switching changes exactly the named tokens; `tokens.learn` ≤ 6,000 |
| 10 | **U6b** | **`technical`** from the contract + the **`build-theme` prompt (§5.3)** + the design pass at 390 and 1280 | D8 |
| 11 | **S19d · S20** | Phase 4 as scheduled — branch previews; the markdown-engine report and speed pass | docs/07 exits |
| 12 | **S21** | Kill test × 3 models, **with all four plugins enabled** — the plugin contract is inside the kill test or it is not tested | D1, D4 |
| 13 | **S22 · L1** | The bench page (S22) + `/themes` and `/plugins` (§6) + the gallery screenshots script | D12 |
| 14 | **L2** | Launch assets (D13); clean-machine runs on three platforms; the maker post drafted on snypd.rocks as an unpublished draft — S19d's branch preview is how Sunny reads it | D13; **Gate D** |

**Calendar.** Fourteen sessions at the two-a-day pace docs/07 assumes is seven working days; at one a day it is three weeks. From 7 Sep that puts Gate D between **18 and 25 Sep**, plus a week of slack for CI, screenshots and the recording. **Launch date: Tuesday 29 September 2026, 00:01 Pacific (12:31 IST) — chosen by Sunny on 6 Sep 2026; Tuesday 6 October is the fallback.** Not announced anywhere until D7–D13 are green (decision 93 still holds: the date is a target, the gate is the gate). Product Hunt launches land Tuesday to Thursday, 00:01 Pacific; the maker should be awake for the first twelve hours, which is evening in India — that is Sunny's constraint to weigh, not this document's.

**What does not block launch:** `migrate-from-wordpress` (a week of WXR edge cases nobody runs on launch day; it is the first post-launch session because it will be the first comment), `newsletter`, `og-image` unless the spike is clean, i18n, HTTP transport, workspaces, adapters.

---

## 8. The launch itself

**Tagline** (≤ 60 characters): *"The CMS whose only interface is your AI agent."* Alternatives, weaker: "Your CMS is wherever your agent is" (the README's line; better as the first sentence of the description than as the tagline, because it needs the second sentence). "WordPress for the agent era" is the comparison every commenter will make, and the maker comment should make it first and precisely: *kept post types, taxonomies, hooks, themes, child themes, a plugin directory; refused the database, the dashboard, the registry, the priorities, and every byte of default JavaScript.*

**The sixty seconds:** a Claude Code window. Paste the sentence. The agent asks the site's name, runs `init`, restarts. The agent writes a post with a chart and a flow — the primitives are the visual. `theme › set variation: ink` — the page changes. `plugins: [analytics]` — doctor says one kilobyte, afforded. `site › push` — the site is live. No cuts between the paste and the URL, because the whole claim is that there is nothing in between.

**First comment, the shape:** what it is (one paragraph); the WordPress table (§3, five rows); the three numbers with links to `/bench` — cold start, tokens per page, 0 KB JS; what it is not (no dashboard, on purpose; no marketplace, npm; no sandbox, said plainly); what is next (`migrate-from-wordpress`, HTTP transport). Every number links to the bench page. Every "we don't" has a reason beside it.

**What to measure, since upvotes are not it:** `@snypd/cli` weekly downloads before and after; GitHub stars; issues opened by people who are not us; and the one that matters — **posts on snypd.rocks written by someone else's agent** is not measurable, so the proxy is `init` sites that show up as `snypd-theme-*` or `snypd-plugin-*` packages on npm, and sites that link back. No telemetry in the binary; that is a decision, not an omission, and the maker comment says so.

---

## 9. Risks

| Risk | L | Mitigation |
|---|---|---|
| **Scope grows to the date.** Fourteen sessions is the longest plan this project has written | High | Gate D is the gate, not the date. If 25 Sep passes with D9 red, the fallback is 6 Oct, not a smaller D9. Anything not in §7.2 is post-launch by default |
| **The plugin contract ships too early and becomes a compatibility debt** | Medium | `api: 1` in every manifest and the check before anything is read; the README calls the contract *experimental* through 0.x; four first-party plugins are the only consumers we owe anything to |
| **The JS budget becomes the hole the 0 KB claim leaks through** | Medium | Default 0; declared and summed at load; measured on output; the launch copy says *declared and afforded*, never *none*. A plugin over its declaration fails a gate |
| **A plugin does something its manifest did not say, and a visitor finds out** | Medium | §4.7 says what is and is not enforced, in the docs and in the maker comment. Overclaiming is the failure mode; the mitigation is not to |
| **Six looks from two themes reads as padding** | Low | Each variation is a real, complete token set with a name and a description, and the gallery labels them as variations of a theme. `technical` is a genuinely different theme |
| **`og-image` eats P3** | Medium | It is a spike with a stop rule: renders without Chrome or it waits |
| **The clean-machine paste fails on a platform on launch day** | High impact | D13 requires three platforms *before* the date is chosen; the copy names all five Bun targets (Sunny's call), so Windows is one of the three runs, and a Windows failure in L2 is a fix, not a sentence |
| **CI bench noise blocks a merge** (docs/07 §3.3, memory: this box's numbers are not comparable) | Low | Every `bench.compare` comes from CI; the 10 % tolerances in D11 are against `main`'s CI run |

---

## 10. Decisions

Continuing docs/07 §7 and docs/09 §9. These override 02, 04 and 09 where they conflict.

81. **A plugin's manifest is a `plugin:` block in its `snypd.yaml`; root keys merge into the site's config and `plugin:` never does.** One rule a plugin author can see at a glance. Amends docs/09 §4.4's example, which put `slots:` at the root.
82. **Five tiers — declare, decorate, transform, react, speak — and a plugin declares which it does.** What it did not declare and does anyway fails a gate: client bytes on output, emit paths at write, fetch hosts at call.
83. **First-party plugins ship in the binary** the way first-party themes do (decision 46 extended), found *after* the site's own `plugins/` and `node_modules/`, so a third-party plugin goes through the same loader and is never second-class.
84. **Client JavaScript is a budget line, not a prohibition** (amends 78). `bench.budgets.jsKb` defaults to 0; a plugin declares `capabilities.client`; the sum is checked against the budget at load with the remedy in the diagnostic; the output is measured at the gate. The claim becomes *declared and afforded*.
85. **Plugin tools join the catalogue and never `tools/list`.** A plugin cannot make every turn more expensive; `tokens.tools` is byte-identical with every plugin on, and D11 asserts it.
86. **Emit returns files; core writes them.** No plugin may overwrite a route, another plugin's file, or anything outside its declared prefix. A collision is a diagnostic.
87. **Events are fire-and-report.** `publish` and `push` are the two; a handler's failure is a line in the result and a row in the activity log, never a failed publish. No retries in 0.x — a plugin that needs one ships a tool.
88. **Plugins do not write content.** The MCP is the one door for words, and a plugin is not a principal. A plugin that has something to say to a post exposes a tool; the agent writes.
89. **Plugins do not add primitives.** docs/02 §10's "primitives with schema + fallback" is withdrawn; content that renders only with a package installed is a shortcode with a manifest. New primitives are RFCs into the spec.
90. **Social metadata is core, not a plugin.** The `shell` part emits OG and Twitter tags from frontmatter and site config. The `seo` plugin docs/09 U5 named as its proof is not built; `analytics` is the proof instead.
91. **Style variations: a theme ships named, complete token sets, and `theme.variation` is one config value.** Precedence: theme ← variation ← site tokens.
92. **npm is the registry; snypd.rocks is the shelf.** Keywords `snypd-theme` and `snypd-plugin`; two hand-written pages at launch, generated by a job later. No hosting, accounts, ratings or install button, ever.
93. **Gate D is the launch gate, distinct from Gate C, and the date is chosen after it is green.** D7–D13 above.
94. **`migrate-from-wordpress` does not block launch** and is the first session after it, because it will be the first comment.
95. **The route key includes the plugin graph hash.** A transform that changes output must invalidate the cache; the key is content + theme + plugins + config subset.
96. **No telemetry in the binary.** Adoption is read from npm, GitHub and the web, and the maker comment says so.
97. **One build-in-public post per gate, not per session** (Sunny, 6 Sep 2026: "three good ones"). The U-series post lands after U6b, the P-series post after P4, the maker post at L2. A session still ships its change to snypd.rocks the day it lands — U2's menus did — it just does not write about it. Amends D12.
98. **A slot module may return a string, and the string is markup** (P2). Not escaped, because a slot is a place in the document and escaping would make it useless; the author owns it. This is what lets a site-local plugin be one `.ts` file with no JSX and no `@snypd/render` import. A filter that throws or returns the wrong kind leaves the value unchanged and is a diagnostic naming the plugin, the hook and the route — never a failed build, never a missing page.
99. **The client budget is the site's number, and the declaration is one number per plugin** (P2, refines 84). Env over site over the spec default; a plugin's own root `bench:` keys merge like any root key and cannot raise the budget its script is measured against. A plugin whose cost varies by option declares the largest — `analytics` declares 3 KB for providers that weigh 1.9–2.7 KB — and drops an option that would make the one number a lie for the rest (Cloudflare, 9.9 KB). Per-option declarations are not built; the day a plugin needs them is the day to add them.
100. **`page.js.kb` is measured with the browser cache off** (P2). The warm-up navigation the suite has run since S13 cached the first route's scripts, and a cached response reports zero bytes — so the gate that was supposed to catch an undeclared script could not see a declared one. Every gated page number from P2 on is a cold fetch, as Lighthouse measures.
101. **Event rows live in `.snypd/events.json`, a ring of the last hundred; `activity.json` stays a heartbeat** (P3, amends the file named in 87). A heartbeat is one process's liveness, rewritten wholesale by a throttled writer; a push fires from two processes (the server's `site › push`, the Desk's button). A history is append-only and written by whoever fired — a different file, on purpose.
102. **A transform gets a copy of the tree and the typed blocks are rebuilt from what it returns** (P3). The mdast cache is shared across routes and builds; a transform that mutated it would run twice on the next build and poison every later reader. The copy costs `structuredClone` per document *only while a transform is on*; a site with none pays nothing. And while one is on, the site's term list is in every route key — a transform's inputs are the tree and its context, and everything in the context is in the key.
103. **Emit prefixes default to the plugin's own name, and `/` is not a prefix** (P3, refines 86). `capabilities.emit: [og/]` declares; nothing declared means `<name>/`; `/` and `../` are refused at load with the remedy. The check at write is one `startsWith` over normalised paths, and the site's own outputs are claimed first, so a collision loses to the page every time.
104. **The `push` event carries pages, not paths** (P3). `pushSite` reads the files between what the remote has and what it is getting — the whole branch on a first push — and core maps them to routes and URLs by each type's `dir` and `urlPattern`, deletions included. A handler that wants to name what changed gets a list it can send; one that wanted git's view still has `commits`.
105. **`og-image` waits** (P3 spike, answers §11 q.3). `Bun.Image` does not draw text; a font rasteriser is not a plugin; Chrome is not on a build box. The `emit` stage is where it lands when a renderer exists, and it lands as a community plugin.
106. **One tool per plugin, named after the plugin, with its verbs as the `action` enum** (P4, refines 85). The catalogue's own shape (docs/07 decision 38) rather than one tool per verb, so an agent that has learned `site` has learned `indexnow`. `indexnow › ping` is that tool and that action, which is the form this document had already been writing. A one-verb namespace is accepted: the shape must not have to be renamed when the second verb arrives.
107. **A plugin whose tool name collides with a built-in loses the name and keeps every other tier** (P4). `site`, `theme` and `bench` are what an agent's muscle memory reaches for, and a plugin that could take one of those names could take the call. Checked after the built-ins in both the search and the dispatch.
108. **A plugin's prompts are namespaced `<plugin>.<name>`** (P4). `get-started` is the first thing an agent runs on an unfamiliar site; nothing installed may shadow it.
109. **A broken `tools` or `prompts` module is a diagnostic, and the plugin keeps its other tiers** (P4, consistent with 98). The existence of the file is checked at config load, because a module missing from the plugin's own directory is a mistake worth finding before an agent asks for it; the *shape* of it is checked when the tool is resolved, which is the first `find_tools` of a session. `site` › doctor resolves the modules and prints the verbs, because a refusal nobody prints is a plugin that quietly does four of its five tiers.
110. **`find_tools` reads the site's config, and that is the price of plugin tools being findable** (P4, amends its own comment). It said it needed nothing but the catalogue; a plugin's tool cannot be searched without knowing which plugins the site has. Measured here: 7 ms on a site with no plugins, 55 ms on one with four, once per session and never on the `initialize` path. The alternative — reading `snypd.yaml` for a `plugins:` key to decide whether to read the config properly — is a second source of truth about which plugins a site has, and it would be wrong the first time one arrives from an env layer.
111. **`content.explain` is a catalogue tool, not an always-listed one** (P4). Every other `content.*` tool is listed on every turn because writing is the hot path; explain is read once, when something is surprising. Listing it would have moved `tokens.tools` for a call most sessions never make.
112. **`content.explain` builds, and it builds with its own index into a scratch directory** (P4). It builds because a declaration table cannot distinguish a hook that never ran from one that ran and changed nothing, and §4.7's honesty claim rests on that distinction. It gets its own index because a build to a scratch `out` with the site's real index would record route keys for files that are not in `dist/`, and the next real build would skip writing them — explaining a post must not be a way to break a site.
113. **`settings:` is the one `theme.yaml` key that does not merge into the config** (U3, docs/09 §4.2). Every other root key of a theme's file becomes `theme.*`; a declaration *list* merged onto `theme.settings` would land where the *value map* has to be. The loader reads it and drops it, which is the plugin manifest's rule one file over (§4.1: root keys merge, the block about itself does not). The payoff is a `theme.settings` whose every line came from `snypd.yaml`, so its provenance says something.
114. **A setting's value is checked at config load: wrong shape is an error, unknown id is a warning** (U3). A token has no declared type and a setting does, so this is the check `set_tokens` could never make. An error means `setConfig` rolls back, which is what makes a hand-edited `showDates: "yes"` a refusal rather than a truthy string discovered at render. An unknown id stays a warning because a theme switch strands values exactly as it strands token overrides, and neither is a reason a site stops building.
115. **There is no `relative` date format** (U3, amends docs/09 §4.2's example). A static page cannot carry one honestly — "2 days ago" is baked in, wrong on day three, and kept true only by client JS (none shipped) or a daily rebuild (which an incremental build correctly skips). `short` takes its place, and `formatDate` writes English month names from the date string's own digits rather than through `toLocaleDateString`, whose answer depends on the ICU data of the build machine. Same rule as S18d′'s absolute paths: what the build emits may not depend on where the build ran.
116. **`base`'s parts read settings `base` does not declare** (U3). `showDates`, `dateFormat`, `footerNote` and `social` are read by the footer, the entry list and the post byline — all `base`'s — while `base` declares none of them, so every reading falls back to what that part did before U3 and a theme with no `settings:` is byte-identical. A child that declares one gets it honoured without forking a part, which is the same argument D8 makes about layouts: the ids are the parent's half of the contract, and declaring them is the child's.

---

## 11. Open questions — the calls that are Sunny's

Answered 6 Sep 2026 (1, 2, 4, 5) and 10 Sep 2026 (3), in the order they were asked; nothing is open.

1. ~~**Launch date and time zone.**~~ **29 September 2026**, 00:01 Pacific, 6 October fallback — recorded in §7.2's calendar. Sunny's answer to "say the word" was "start", so H1 stays third as scheduled.
2. ~~**H1 before P1?**~~ Stays third, as scheduled (no objection raised; the schedule stands).
3. ~~**`og-image` — spike or skip?**~~ **Spiked 10 Sep 2026; it waits** (decision 105). `Bun.Image` has no text; the stop rule in §4.8 fired inside the hour.
4. ~~**Windows in D13?**~~ **"All Bun provides":** the copy names all five targets, Windows included, and L2's clean-machine runs include it — D13 and the risk table say so.
5. ~~**A post per session?**~~ **"Three good ones":** one per gate — decision 97, D12 amended.

---

## 12. Ready to start

Code in `packages/`, `themes/` and — new — `plugins/`; docs in `docs/`. **U1 starts on a branch off `main`** once `s19b-launch-posts` lands, and the two rules docs/07 §4 sets for every session hold: one row in a session log, one PR, one `bench.compare` from CI. This document's session log lives in §7.2's table; a row gets a date, a PR and a bench diff as it lands, and a session with no bench diff is a session that did not measure.
