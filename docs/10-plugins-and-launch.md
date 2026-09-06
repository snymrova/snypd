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

S19b's two log rows (docs/07 §5) record eleven findings from writing four posts through the MCP. Three were content fixes; the product fixes still open are: the dead byline on a default site (1), YAML flow-map labels with commas accepted by lint (3, 7), `lr` diagrams that scroll rather than scale (4), flow labels clipping at three lines (5, 8), the 160-character `description` refusal with no hint (9), and `suggest_blocks` missing a branching list as a `flow` (10). A launch visitor writing their first post will hit (1) and (9) inside ten minutes. §7 gives them a session (H1) rather than leaving them in a log row.

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
      provider: { type: string, enum: [plausible, fathom, umami, cloudflare] }
      domain:   { type: string }
  capabilities:
    network: [plausible.io]     # hosts the plugin's own fetch may reach (§4.7)
    client: 1kb                 # client JS it asks to add; the site's jsKb budget must cover it (§4.6)
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
| 4 | **Speak** | `tools` `prompts` | in the MCP, via `find_tools` | `indexnow › ping` |

A plugin that does something its manifest did not declare fails a **gate**, not a review: a `<script>` from a plugin with no `client:` fails `page.js.kb`; a file emitted outside a declared prefix is refused at write; a fetch to a host outside `network:` is refused by the fetch the plugin was handed. What cannot be enforced is named honestly in §4.7.

### 4.3 Slots and filters — docs/09 §4.4, adopted and moved

Everything docs/09 §4.4 decided stands: named, declared, resolved at load, ordered by the `plugins:` array, no priorities, inspectable by doctor, free when unused. Two amendments:

- The slot set is **six**: `head`, `body-start`, `before-content`, `after-content`, `footer-end`, and **`body-end`** — because a beacon goes before `</body>` and not inside the footer element, and an analytics plugin is the first thing anyone will write.
- `filters` stay the closed six — `title`, `description`, `excerpt`, `entries`, `jsonLd`, `route` — and each one is typed `(value, ctx) => value` with a plugin that throws becoming a diagnostic naming it.

The theme decides *where* a slot is (its parts render them); the plugin decides *what* goes in it. This session was U5 in docs/09 §7; it is **P2** here, because it needs the manifest (P1) to have anything to declare in.

### 4.4 Stages — the pipeline gets a way in

docs/02 §9 lists six stages as pure functions nothing can register into. Two of them open to plugins, both declared:

- **`transform(tree, ctx) → tree`** — the typed block tree after spec coercion, before render. The `autolink` proof links the first mention of a term to its archive, which docs/02 §9 already names as a transform. **The route key gains the plugin graph hash** — the same `themeHash` treatment, over every plugin's files — because a transform that changes output must invalidate the incremental cache, and today the key is content + theme + config subset.
- **`emit(site, ctx) → { path, bytes }[]`** — extra artefacts into `dist/`. **The plugin returns files; core writes them.** A path that collides with a route, another plugin's file, or anything outside the plugin's declared prefix is a diagnostic and the file is not written. Nothing a plugin can do overwrites a page.

`parse`, `validate`, `render` and `publish` stay closed. A plugin cannot change how markdown parses (one markdown engine is the point), cannot add lint rules in 0.x (the twelve are the spec's; an RFC opens that), and does not render (the theme does).

### 4.5 Events — fire and report

Two events, `publish` and `push`, matching the two acts a static site actually has. `publish(item, ctx)` fires after `Repo.land` succeeds; `push(commits, ctx)` fires after `site › push` returns success. A handler returns `{ ok, message }`. **A handler that fails produces a line in the tool result and a row in `.snypd/activity.json`, never a failed publish** — the words are on `main` regardless of whether IndexNow answered. No retries in 0.x; a plugin that needs one exposes a tool to run again (which is exactly what `indexnow › ping` is, and why it is the Tier 4 proof).

`onCreate`, `onUpdate`, `onStatusChange`, `onDelete` (docs/02 §9) are **not** opened. Nothing at launch needs them, and each is a place a plugin could react to an agent's keystroke — the surface stays as small as the launch set needs.

### 4.6 Client JavaScript is a budget line — amending decision 78

Decision 78: "A slot may not add JavaScript in v0.1.5." Kept as the **default**, changed as a **rule**:

- `bench.budgets.jsKb` is per site and defaults to `0`, as it does today.
- A plugin (later, a theme — docs/04's unbuilt `client:`) declares `capabilities.client: <n>kb`.
- At load, the declared client bytes are **summed against the site's budget**. Over budget is a diagnostic at load, with the remedy in it: `analytics asks for 1 KB of client JS; this site's jsKb budget is 0. Set bench.budgets.jsKb: 2 to afford it, or remove the plugin.` The plugin is not loaded.
- `page.js.kb` measures the output, as it does today, and the gate is the budget. A plugin whose script is bigger than it declared fails the gate — measured, not trusted.

What this buys is the sentence for the maker comment: **"Zero JS by default. Every byte is declared by the plugin that spends it and afforded by the site that allows it."** That is a stronger claim than "no JS", because it survives the first plugin.

### 4.7 Trust — what is enforced, what is declared, said plainly

A plugin is TypeScript running in the snypd process. Bun does not sandbox an import, and this document does not pretend otherwise. What snypd does:

- **Enforced:** the manifest and options schema; `api:` compatibility; emit paths; the client byte budget on output; `ctx.fetch` — the plugin is handed a fetch whose hosts are its declared `network:` list and refuses others.
- **Declared and visible:** `capabilities` in the manifest, printed by `site › doctor` and `snypd://plugins` beside the plugin's version and where it was found.
- **Not enforced, and said so:** a plugin can `import "node:fs"` and a plugin can call the global `fetch`. **A plugin is a dependency you install, and you vet it the way you vet any dependency.** snypd's contribution is that what it declared and what it did are both inspectable — `content.explain(slug)` prints what ran over a post and `page.js.kb` prints what reached the page.

The launch copy says exactly this. Overclaiming a sandbox is the one thing that would cost more on launch day than having none.

### 4.8 First-party plugins ship in the binary

`plugins/` joins `themes/` as a workspace and as a barrel in `bundled.gen.ts` (decision 46). `plugins: [analytics]` on a fresh `bunx @snypd/cli init` site works with **no install step**, exactly as `theme.use: editorial` does — and a plugin on disk in `plugins/` or `node_modules/` is found first, so a third-party plugin is not second-class.

**The launch set is four, one per tier, and each is the conformance test of that tier:**

| Plugin | Tier | What it does | Why this one |
|---|---|---|---|
| `changelog` | 0 | A `release` type (`version`, `date`, `breaking: bool`), a `product` taxonomy, `/changelog/{version}` — **zero code**, one `snypd.yaml` | Proves the YAML-only plugin is real; and a changelog page is what a Product Hunt visitor wants for *their* product |
| `analytics` | 1 (+ §4.6) | `head` preconnect + `body-end` beacon for Plausible / Fathom / Umami / Cloudflare; `client: 1kb` | The first plugin anyone asks for; the one that forces the JS-budget decision |
| `autolink` | 2 | `transform`: first mention of a taxonomy term in a post links to the term's archive | Exercises the stage and the route-key invalidation; visible on snypd.rocks the day it lands |
| `indexnow` | 3 + 4 | `push` event pings IndexNow with the URLs that went; `indexnow › ping` tool re-pings; `snypd://indexnow/last` resource | Network with an allowlist, an event, a catalogue tool and a resource in one small package |

**Not in the launch set, with reasons.** `seo` (docs/09 U5's proof): OG and Twitter tags belong in **core** — the `shell` part emits them from frontmatter and site config, the way canonical and JSON-LD already are. WordPress's worst onboarding lesson is that basics need a plugin. `newsletter`: wants a provider account on the visitor's side before it does anything on launch day; v0.2 after launch. `og-image`: the most demo-able idea on the list and the riskiest — rasterising text to PNG at build needs either `Bun.Image` compositing text (unverified) or the bench's headless Chrome, which a host's build box does not have. Spike it in P3 if there is time; ship it only if it renders without Chrome. `comments`: Giscus is JS the budget can now afford, but it is a `body-end` slot anyone can write in an afternoon once P2 lands — a fine *first community plugin* and a poor first-party one.

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
| D9 | Four first-party plugins, one per tier, bundled; `plugins: [analytics]` works on a fresh `init` with no install; removing a plugin from the list removes every byte it added | P1–P4 exits; a test that diffs `dist/` with and without each plugin |
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
| 3 | **H1** | The S19b product findings (§2.3): dead byline on a default site, comma labels caught by lint, `lr` diagrams scaled not scrolled, flow label clipping, `description` hint, the branching-list `flow` detector | each finding has a test; `suggest.precision` unmoved |
| 4 | **P1** | **The contract.** `plugin:` block, Zod, `api:` check, options schema, resolution incl. `plugins/` workspace and the bundled barrel, plugin graph hash in the route key, `snypd://plugins`, doctor rows, `changelog` as the Tier 0 proof | D10's fixture loads; a bad option is attributed; `build.cold.100` unmoved with no plugins |
| 5 | **P2** | **Slots and filters** (docs/09 U5) + **the client budget (§4.6)** + `analytics` | the seo-tag test docs/09 wrote, now against `analytics`; `page.js.kb` 0 without it, 1 with it and a budget of 2; over budget refuses at load |
| 6 | **P3** | **Stages and events.** `transform`, `emit`, `publish`, `push`, `ctx.fetch` allowlist; `autolink` + `indexnow`; spike `og-image` and ship only if it needs no Chrome | a term autolinks on snypd.rocks; a push pings; a failed ping is a line, not a failure |
| 7 | **P4** | **Plugin tools and prompts** in the catalogue; `indexnow › ping`; `content.explain(slug)` prints what ran | `tokens.tools` byte-identical with all four plugins on; `find_tools("ping search engines")` finds it |
| 8 | **U3** | Settings schema (docs/09) | docs/09 U3 exit |
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

---

## 11. Open questions — the calls that are Sunny's

Answered 6 Sep 2026, in the order they were asked; the one still open is marked.

1. ~~**Launch date and time zone.**~~ **29 September 2026**, 00:01 Pacific, 6 October fallback — recorded in §7.2's calendar. Sunny's answer to "say the word" was "start", so H1 stays third as scheduled.
2. ~~**H1 before P1?**~~ Stays third, as scheduled (no objection raised; the schedule stands).
3. **`og-image` — spike or skip?** *Still open.* P3 spends its first hour on the spike unless told otherwise before then; the stop rule in §4.8 holds.
4. ~~**Windows in D13?**~~ **"All Bun provides":** the copy names all five targets, Windows included, and L2's clean-machine runs include it — D13 and the risk table say so.
5. ~~**A post per session?**~~ **"Three good ones":** one per gate — decision 97, D12 amended.

---

## 12. Ready to start

Code in `packages/`, `themes/` and — new — `plugins/`; docs in `docs/`. **U1 starts on a branch off `main`** once `s19b-launch-posts` lands, and the two rules docs/07 §4 sets for every session hold: one row in a session log, one PR, one `bench.compare` from CI. This document's session log lives in §7.2's table; a row gets a date, a PR and a bench diff as it lands, and a session with no bench diff is a session that did not measure.
