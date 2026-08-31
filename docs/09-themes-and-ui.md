# 09 — Themes, parts, hooks and the settings surface

**Owner:** PM · **Engineer:** Claude Code · **Reviewer / decider:** Sunny · **Written:** 31 Aug 2026 · **Inputs:** docs 02 §§3, 8–10, docs 04 §§`theme.yaml`, 07 (decisions 26, 29, 32, 44–45, 51), the code as it stands at `v0.1.2`.
**Scope:** the presentation layer — themes, layouts, template parts, header and footer, navigation, the extension points that replace WordPress's actions and filters, and a settings surface a person *and* an agent can both drive.
**Not in scope:** the primitive vocabulary (locked at 13, docs/06), content authoring (MCP only, decision 44), and hosting (docs/07 §3b).

---

## 1. The stake

Snypd's theme layer is the part of the product a reader actually sees and the part an operator most wants
to change, and it is the layer with the largest gap between what `docs/04` describes and what `loadTheme`
implements. The gap is not cosmetic. **A site built with snypd today cannot have a navigation menu**, and
the only way to add one is to fork a theme and ship five `.tsx` files — which is precisely the outcome the
`extends:` chain exists to prevent. `editorial` proves the chain works for *colour and type*; it also
proves the chain stops at the document, because `editorial` cannot change one character of the header even
though it declares a whole visual language.

The second stake is the settings surface. Every knob in the product is reachable by exactly one road — an
MCP tool call — and that is correct for content and wrong for configuration. A person who wants a different
accent colour is not authoring; they are turning a dial, and asking them to describe the dial to an agent so
the agent can call `theme › set_tokens` is the same ceremony as asking them to describe a colour over the
phone. Decision 44 refused an admin app for content and was right to. It never ruled on configuration, and
this document is where that gets decided rather than assumed.

---

## 2. Audit — what is built, what is documented, what is neither

### 2.1 Built and working

| Surface | Where | State |
|---|---|---|
| Theme chain (`extends:`), per-slot resolution | `render/src/theme.ts:240–275` | ✅ Nearest declarer wins per layout and per primitive; `{ fallback: x }` followed within a theme's map then up the chain |
| Coverage reporting | `theme.ts:76`, `snypd://theme/coverage` | ✅ `own \| inherited \| fallback \| missing` with `via` |
| Layouts | `themes/base/layouts/` — `post page index term author` | ✅ 5, declared in `theme.yaml › layouts` |
| Primitives | `themes/base/primitives/` — 13 | ✅ One `snypd-<name>` class each; `editorial` restyles all 13 with **zero** `.tsx` |
| Design tokens | `theme.yaml › tokens`, `render/src/tokens.ts` | ✅ `{ default, customisable, kind, description }` → merged config → `:root { --color-accent: … }` |
| Stylesheet chain | `theme.ts:278–286` | ✅ Ancestors first, minified (`minifyCss`, S14), one `assets/theme.css` |
| Theme hash in the route key | `themeHash()` | ✅ Every byte of every dir in the chain |
| Hot reload of the theme graph | `bundleTheme()` (S13, decision 29) | ✅ `snypd dev` only; `build` pays nothing |
| MCP write surface | `mcp/src/catalog.ts:42` — `theme` › `set \| set_tokens \| scaffold` | ✅ One tool, three actions |
| MCP read surface | `snypd://theme`, `/tokens`, `/coverage` | ✅ Resources, so free until read |
| Desk (read-only) | `render/src/desk.ts` | ✅ 0 KB JS, gated |
| One `<form method="post">`, already shipped | `render/src/preview.ts:200` — the approve button | ✅ **The precedent §5 rests on** |

### 2.2 Documented in 02/04, never built

Each of these appears in a design doc as though it exists. None of them is read by any code.

| Promised | Where | Reality |
|---|---|---|
| `locations: [header, footer]` | docs/04 `theme.yaml` example | `ThemeYaml` (`theme.ts:73`) has no `locations`; the key is silently discarded |
| `variants: { callout: [soft, loud] }` | docs/04 | Not read anywhere |
| `patterns: { launch-post: [...] }` | docs/04 | Not read anywhere |
| `client: { tabs: ./client/tabs.js }` + a JS budget | docs/04 | Not read; the JS budget is enforced by *emitting nothing*, which is a different guarantee |
| `content/nav/<location>.yaml` | docs/02 §8 | No `nav` type, no loader, no lint |
| Pipeline hooks `parse → validate → transform → render → emit → publish` | docs/02 §9 | The stages exist as functions; **nothing can register into them** |
| Plugins with `plugin.ts` exporting hook functions | docs/02 §10 | `config.plugins` is an array Zod accepts and nothing reads |

### 2.3 Found by this audit — defects and holes, with their addresses

1. **The shell is not overridable, so no child theme can change the header or footer.**
   `themes/base/layouts/shell.tsx:27` is `<header><a href="/" rel="home">{site.name}</a></header>` and
   `:29` is `<footer><p>{site.name}</p></footer>`. Every layout reaches it by a *static relative import*
   (`import Shell from "./shell"`, five files), which resolves against **base's directory** — not the
   chain. `shell` is not in `layouts:`, so `loadTheme` never sees it and per-slot resolution never applies.
   A child theme can only replace the shell by declaring and shipping all five layouts, at which point it
   has forked the theme it claimed to extend. **This is the single biggest gap in the presentation layer**,
   and it is why a snypd site cannot have a nav menu without a fork.

2. **`theme.yaml` is not validated.** It is parsed by `js-yaml` into a TypeScript *interface* (`theme.ts:73,216`)
   and `Object.assign`-merged. There is no Zod schema, so `layout:` for `layouts:`, or any of §2.2's four
   documented-but-unread keys, is accepted in silence. The one failure that *is* loud — a declared layout
   whose file is missing (`theme.ts:249`) — is loud because the loader needs the file, not because anything
   checked the document. Contrast `snypd.yaml`, which is strict-mode Zod with provenance.

3. **There is no extension point in `<head>`.** `shell.tsx` hard-codes canonical, RSS, stylesheet, icon,
   generator and JSON-LD. The `seo` plugin (docs/02 §10, launch set) has nowhere to write an OG tag, and
   neither does a site that wants an analytics `<link rel=preconnect>` or a verification meta.

4. **Configuration below `site` and `theme` is unvalidated passthrough.** `schema.ts:57` declares
   `theme: z.object({ use, tokens }).passthrough()` and `site` likewise. So `site.tagline` or
   `theme.showDates` can be *written* by `site › set_config` and read by a theme — with no declaration, no
   type, no description, no default, and no way for an agent or a form to know either exists. The
   passthrough is the right call for plugin extension; it is the wrong mechanism for a theme's own options,
   because a knob nobody declares is a knob nobody can find.

5. **Tokens are the only declared settings, and they are all design tokens.** `themeTokens()`
   (`core/src/site.ts:100`) returns exactly what a settings UI needs — name, value, default, `customisable`,
   `kind`, `description`, `overridden` — for the one category of setting that compiles to a CSS variable. A
   logo, a footer line, a nav location, a "show reading time" boolean and a social URL have no home at all.

6. **`entries.tsx` is a shared part in practice and not in the contract.** Three layouts import it
   (`index`, `term`, `author`). It has the same problem as `shell`, one level down: a theme that wants a
   different entry list must re-declare three layouts.

7. **The `.md` twin has no theme story, and that is correct — but nothing says so.** Worth recording before
   somebody "fixes" it: parts, nav and slots must never reach the twin, because the twin is the source plus
   resolved frontmatter (docs/07 §3.4) and a header in it would cost every agent tokens on every read.

---

## 3. What WordPress got right, and what it cost

docs/02 opens by keeping WordPress's durable ideas and refusing its mechanisms. This section makes that
concrete for the four mechanisms this document touches, because "keep hooks, refuse `global $wp_filter`"
is a slogan until somebody writes down what replaces it.

| WP idea | What it got right | What it cost | What snypd does |
|---|---|---|---|
| `do_action('wp_head')` | An extension point *at a named place in the output* is the most reusable idea in the CMS. Twenty years of plugins work because of it | A global mutable registry: any code can add anything at any time from anywhere, and nothing can tell you what will run | **Slots** — named, declared in YAML, resolved at load, listed by doctor (§4.4) |
| `apply_filters('the_title', …)` | Transforming a value on its way past is composable in a way that inheritance is not | Untyped, unordered without magic numbers, and invisible: `remove_filter` needs the exact callable | **Filters** — a closed set of named values, typed `(v, ctx) => v`, ordered by the plugin list a human can read (§4.4) |
| `$priority = 10` | Ordering is real and must be expressible | 10 became folklore; ordering became a negotiation between plugins that cannot see each other | **Refused.** Order is the declared `plugins:` array. To reorder, edit one list |
| `header.php` / `footer.php`, then template parts | The document is not one file; the reusable pieces are named and overridable per child theme | Classic themes made them files-by-convention with no manifest; block themes fixed that with `theme.json` and `parts/`, a decade later | **Parts** — declared in `theme.yaml`, resolved per slot exactly like primitives (§4.1) |
| `register_nav_menus()` + the menu editor | A menu is *content*, not markup, and belongs to the site rather than the theme | Menus lived in the database, so they were invisible to git and unportable between themes | **`content/nav/<location>.yaml`** — files in git are truth (docs/06 locked decision 3) (§4.3) |
| The Customizer | Live preview beside the control is still the best pattern any CMS has shipped for design settings | jQuery, a bespoke JS framework, and a settings API most themes used wrong; superseded by the Site Editor for block themes, which is a full React app | **A zero-JS settings page** — form on one side, iframe on the other, POST-back (§5) |

**Shopify's `settings_schema.json` is the better model for the schema itself**, and worth borrowing from
directly: a flat, declarative list of `{ type, id, label, default, info }` with a *closed* set of input
types (`text textarea number checkbox radio range select color font_picker image_picker url link_list
richtext html …`), grouped into named panels. It is declarative enough that Shopify renders the entire
theme editor from it and a theme author writes no UI code. That is exactly the property we need, because
here the same declaration has to render a form *and* answer an agent, and any schema rich enough for only
one of those readers will drift.

**What we take:** the closed type list, the four required attributes, the grouping, and the rule that the
theme declares and the platform renders.
**What we leave:** Shopify's `sections`/`blocks` page-composition model. That is a page builder, it competes
directly with the primitive vocabulary, and docs/06 locked the vocabulary at 13.

---

## 4. The design

Five pieces, in dependency order. Each is a session in §7.

### 4.1 Parts — the shell becomes a declared, overridable slot

`theme.yaml` gains `parts:`, resolved by the **same code path** as `primitives:` — nearest declarer in the
chain wins, `{ fallback: x }` is followed, and `coverage` reports `own | inherited | fallback | missing`.

```yaml
parts:
  shell:   ./parts/shell.tsx        # <html>, <head>, <body>, header, footer
  header:  ./parts/header.tsx
  footer:  ./parts/footer.tsx
  entries: ./parts/entries.tsx
```

Layouts stop importing parts relatively and receive them resolved. Two candidate shapes:

- **(a) `ctx.parts.Header`** — a record of components on the ctx every layout already takes.
- **(b) `<Part name="header" />`** — one component from `@snypd/render` that looks the name up on ctx.

**Recommendation: (a), with (b) as a thin wrapper over it.** (a) is what the type system can check — a
layout that names a part which does not exist fails at typecheck rather than at render — and (b) exists so
a *part* can nest another part without threading ctx through its own props.

`shell`, `header`, `footer` and `entries` are the v0.1.5 set. The four are chosen because each is
independently overridable by a real theme and none of them is content.

**Migration:** `base` moves its four files from `layouts/` to `parts/` and declares them; the five layouts
take `ctx.parts.Shell` instead of `import Shell`. This is a breaking change to the theme contract and it
costs two themes, both ours. It becomes expensive the day a third-party theme exists, which is the whole
argument for doing it now rather than in v1.0.

### 4.2 Settings — one schema, three readers

`theme.yaml` gains `settings:`, declared beside `tokens:` rather than replacing it.

```yaml
settings:
  - { id: logo,        type: image,     label: Logo,          group: Identity, info: "Falls back to the site name as text." }
  - { id: tagline,     type: text,      label: Tagline,       group: Identity, default: "" }
  - { id: showDates,   type: boolean,   label: "Show dates",  group: Posts,    default: true }
  - { id: dateFormat,  type: select,    label: "Date format", group: Posts,    default: iso, options: [iso, long, relative] }
  - { id: footerNote,  type: richtext,  label: "Footer note", group: Footer }
  - { id: social,      type: link_list, label: "Social links",group: Footer }
```

**Why two declarations and not one.** Tokens compile to CSS custom properties and settings do not; that is
a real difference in what the value *is for*, not a naming accident. Folding tokens into `settings:` would
also churn `tokens.learn` (gated at 6,000, currently 4,494/4,620) and a shipped MCP surface — `theme ›
set_tokens`, `snypd://theme/tokens` — for no gain a user can see. **One form renderer and one write path
over two declarations** is the trade. `07` decision 48's rule about not redefining a measured number
applies directly.

Closed type list for v0.1.5: `text · textarea · richtext · url · number · boolean · select · color ·
size · font · image · link_list`. Everything else is refused until something needs it, per docs/06's rule
for the vocabulary.

Three readers, one declaration:

1. **The renderer** — `ctx.settings.showDates`, resolved and typed, defaults applied.
2. **The agent** — `snypd://theme/settings` (a resource, so free until read) and `theme › set_settings`,
   which validates against the declaration exactly as `set_tokens` does against `customisable`.
3. **The settings page** — renders one form control per declaration (§5). No UI code in the theme.

Values live in `snypd.yaml › theme.settings`, written by `setConfig`, which already rolls back on disk when
the result does not validate (decision 40).

### 4.3 Nav — menus are files

`content/nav/<location>.yaml`, exactly as docs/02 §8 says, one file per location the theme declares.

```yaml
# content/nav/header.yaml
- { label: Posts,  ref: /posts }
- { label: About,  ref: page/about }
- { label: GitHub, url: https://github.com/… , rel: external }
```

- `ref` resolves through the index to a route, so a slug change moves the menu with it; `url` is verbatim.
- A `ref` that resolves to nothing is **lint rule 7's** existing "dead internal link" with a new source, not
  a new rule — the vocabulary of failures stays small.
- `theme.yaml › locations: [header, footer]` (the key docs/04 already documents) declares which files mean
  anything; a nav file for an undeclared location is a diagnostic, not a silent no-op.
- The `nav` content type stays deferred: a YAML list needs no frontmatter, no status machine and no route.
  Reading it is `loadNav(root, location)`, not a content type. If v0.2 needs per-item metadata this
  decision gets revisited with a reason.

### 4.4 Slots and filters — the hook model

**Slots** are the action analogue: a named place in the output where declared contributors render.

```yaml
# a plugin's snypd.yaml
slots:
  head:        ./slots/og-tags.tsx
  footer-end:  ./slots/webmention.tsx
```

v0.1.5 slot set, deliberately five: `head`, `body-start`, `before-content`, `after-content`, `footer-end`.
Each is rendered by the `shell` part (`head`, `body-start`, `footer-end`) or by the content layouts
(`before-content`, `after-content`), which means **the theme decides where a slot is** and the plugin
decides what goes in it — the same division of labour as tokens.

**Filters** are the value analogue: `(value, ctx) => value`, pure, over a closed set of named values —
`title`, `description`, `excerpt`, `entries`, `jsonLd`, `route`. A filter that throws is a diagnostic
naming the plugin, never a crash.

Four rules, which are the whole of the difference from WordPress:

1. **Declared, not registered.** A hook exists because a YAML file names a file. There is no
   `addFilter()`, no global registry, and nothing can be added at runtime by anything.
2. **Ordered by the `plugins:` array.** No priority numbers. To reorder, edit one list in `snypd.yaml`.
3. **Inspectable.** `site › doctor` lists every slot and filter with the plugin that fills it;
   `content.explain(slug)` prints what ran over that item (docs/02 §9 already promises this).
4. **Free when unused.** A site with no plugins resolves nothing and pays nothing — the same property
   `loadTheme` already has for a theme with no `css:`. This is a `mcp.coldStart` and `build.cold.100`
   requirement, not an aspiration, and §6 gates it.

**Explicitly refused:** shortcodes (docs/02 §12 already refuses them), widgets (ditto), filters that can
edit the primitive tree (that is what the vocabulary is for), and any slot inside a primitive (a theme
styles primitives; a plugin does not rewrite them).

### 4.5 Variants and patterns — deferred, and why

`variants:` and `patterns:` (docs/04) stay unbuilt through v0.1.5, and the doc line stops claiming
otherwise. Variants are a per-primitive prop the spec would have to own — that is a vocabulary change and
docs/06 locks the vocabulary. Patterns are a `suggest_blocks` feature wearing theme clothing: the detectors
(S15, `spec/detect/`) already propose block sequences from a post's shape, and a theme-declared list of
blocks would be a second, dumber path to the same output. Both are v0.2 with the reasons written down.

---

## 5. The settings page — a customizer that does not become an admin app

> **Declined on 1 Sep 2026, and kept.** U4 is dropped and decision 77 withdrawn (§9): configuration stays
> agent-and-file only. This section stays in the document as the design that was *declined* rather than
> deleted — the next person who wants a settings page has to read it and say what changed, and the rules
> below are what any future version has to beat. Everything downstream of it — §4.2's schema with its two
> readers, U1–U3 and U5 — is unaffected.

### The collision, stated honestly

Decision 44 refused an admin app: *"no authoring here, no theme switcher, no config editor… a second way to
write means every feature is built twice, and the MCP surface stops being the product the moment there is a
better way to use it."* A settings page is, on its face, exactly the config editor that sentence names.

**The resolution is a line between configuration and content, and the line is defensible:**

> **Content is words a reader will read. Configuration is everything else.** Publishing words a human has
> not read is the risk the MCP-only rule exists to prevent, and D6's *"edited only via MCP"* is a claim
> about the site's **content**. A colour, a font, a menu order and a footer note are not authored — they
> are chosen, and choosing them through a chat interface is ceremony, not safety.

Note also that "no forms" was never the rule. `preview.ts:200` has shipped a `<form method="post">` with an
approve button since S11, on the review page, and the Desk's own constraint is *no authoring*, not *no
HTML controls*. What decision 44 actually protects is that there is **one** way to write content.

### The rules — each one testable

1. **Dev server only.** `/_snypd/settings`, served by `snypd dev`. Never emitted to `dist/`, never reachable
   on a deployed host. Asserted the same way decision 52's empty index is: a test that `build()` never
   writes it.
2. **Configuration only.** The page can write `snypd.yaml › theme.tokens`, `theme.settings`, `site.*` and
   `content/nav/*.yaml`. It cannot write `content/**/*.md`. Asserted by the write path itself — the handler
   calls `setConfig` and `setNav` and has no other write available to it.
3. **Zero JS.** No `<script>`, as everywhere else. Live preview is an `<iframe>` of `/`; a POST returns 303
   and both panes reload. That is the Customizer's actual value — control and result side by side —
   without its framework.
4. **One write path, shared with the agent.** Every field POSTs through the same `setConfig` /
   `themeTokens` validation the MCP tool calls, produces the same git commit, and carries
   `Snypd-Principal: human:<reviewer>` (the trailer machinery exists; `reviewerOf`, `preview.ts:110`, is how
   the review page already names one). An agent reading `snypd://config` after a person moves a slider sees
   the change and its provenance. **Neither surface is a second source of truth, because there is one file.**
5. **The page reports what it cannot do.** Every group carries the MCP call that does the same thing, the
   way the Desk's theme card already names `theme › set`. The page is a faster road to the same place, and
   says so.
6. **No content, no theme *code*, no deploy.** Switching the active theme is allowed (it is one config
   value and it is reversible); scaffolding one is not (it writes files). `site.push` stays the Desk's one
   button (decision 44), not a settings field.

### The layout

```
┌─────────────────────────── /_snypd/settings ───────────────────────────┐
│ Snypd Desk › Settings          theme: editorial      [Desk] [Preview]  │
├───────────────────────────────┬────────────────────────────────────────┤
│ Identity                      │                                        │
│   Site name   [____________]  │        <iframe src="/">                │
│   Tagline     [____________]  │        the live site, this theme,      │
│   Logo        [ media pick ]  │        these values                    │
│                               │                                        │
│ Design            38 tokens   │                                        │
│   Accent      [#8a3324] ███   │                                        │
│   Measure     [34rem      ]   │                                        │
│   …grouped by kind            │                                        │
│                               │                                        │
│ Navigation                    │                                        │
│   header.yaml   3 items  →    │                                        │
│                               │                                        │
│ [ Save ]   agent: theme › set_tokens                                   │
└───────────────────────────────┴────────────────────────────────────────┘
```

Groups come from `settings[].group` and from token `kind`. `Save` is one POST of the whole form; the
handler diffs against current values and writes only what moved, so the commit message names three tokens
rather than thirty-eight.

**Open, and §10 carries it:** whether nav editing is a form on this page or stays a file an agent writes.
A reorderable list without JS is doable (up/down buttons that POST) and it is the first place this design
starts to feel like an admin app. My recommendation is to ship nav as **read-only on the page with a link
to the file** in the first session, and let the second session decide with something to look at.

---

## 6. Budgets and gates

Nothing here may move a shipped number. New lanes extend `desk.*` and `page.*` rather than being invented.

| # | Gate | Budget | Evidence |
|---|---|---|---|
| T1 | Parts cost nothing at build | `build.cold.100` within 10 % of `main`; `mcp.coldStart.binary` unmoved | `bench.compare` in CI |
| T2 | The settings surface is free until read | `tokens.learn` ≤ 6,000 unchanged — `snypd://theme/settings` is a resource, and resources cost nothing until read (S11 precedent). `tokens.tools` ≤ 3,000 with `set_settings` added | `snypd bench agent` |
| ~~T3~~ | ~~The settings page is a page, not an app~~ — **void: U4 dropped, 1 Sep 2026.** The `settings.*` lane is not built, and the JS budget it would have spent is already spent nowhere: `desk.js.kb` gates the Desk's whole document at 0, push button included | — | — |
| T4 | A site with no plugins pays nothing for hooks | slot/filter resolution absent from a no-plugin build's profile; `build.cold.100` unmoved | `bench.compare` |
| T5 | The wall holds | **Narrowed with U4's drop:** there is no settings handler to constrain, so what remains is the rule that outlived it — `build()` emits no `/_snypd/*` route at all, and the one handler on that namespace that writes anything (`07` decision 79's push) touches git and never `content/**/*.md` | assertion tests, the shape decision 52 uses |
| T6 | Nav is real | header and footer menus render on `base` and `editorial`, from files, with a dead `ref` caught by lint rule 7 | `render.test.ts` + a corpus fixture |
| T7 | Themes are validated | a `theme.yaml` with an unknown key or a mistyped `layout:` produces a diagnostic naming file and line | Zod over `ThemeYaml`, `theme.test.ts` |

---

## 7. Sessions

Six sessions, in dependency order — **five since U4 was dropped on 1 Sep 2026.** **U1 and U2 are the two that belong before S19b** (docs/07 Phase 4):
the three launch posts will be read on a public site, and a public site whose header is a bare site-name
link is the first thing a visitor sees. U3–U6 can land after Gate C without blocking it.

| S | Deliverable | Exit |
|---|---|---|
| **U1** | **Parts.** `parts:` in `theme.yaml`, resolved by the primitive code path; `shell`, `header`, `footer`, `entries` moved to `themes/base/parts/` and declared; layouts take `ctx.parts`; `coverage` extended to parts; Zod over `ThemeYaml` (T7), which also makes §2.2's four dead keys say so out loud | `editorial` overrides the header with one file and no layouts · coverage reports it · T1 green |
| **U2** | **Nav.** `locations:` honoured; `content/nav/<location>.yaml` loaded and resolved; `ref` → route through the index; dead `ref` on lint rule 7; `header`/`footer` parts render a real menu on both themes; `snypd://nav` resource; `site › set_nav` | T6 green · a menu survives a slug change · `base` and `editorial` both ship a header a real blog can use |
| **U3** | **Settings schema.** `settings:` in `theme.yaml`, closed type list, defaults, groups; `ctx.settings`; `snypd://theme/settings`; `theme › set_settings` with the same validation `set_tokens` has; `editorial` declares its first six (logo, tagline, showDates, dateFormat, footerNote, social) | T2 green · an agent can set a setting it discovered from a resource · a theme with no `settings:` is unaffected |
| ~~**U4**~~ | **dropped, 1 Sep 2026** — the sequencing call §12 left to Sunny, answered *no*. The settings page is not built: configuration stays agent-and-file only, and decision 44 stands unamended (see decision 77 below). U1–U3 and U5 are unchanged, because the settings *schema* always had two readers — the agent and the renderer — and the page was only ever the third | — |
| **U5** | **Slots and filters.** The five slots and six filters; declared in a plugin's `snypd.yaml`, resolved at load, ordered by the `plugins:` array; `site › doctor` lists them; `content.explain` prints what ran; one real plugin in-tree (`snypd-plugin-seo`, OG + Twitter tags in `head`) as the proof | T4 green · the seo plugin adds OG tags with no theme change · removing it from `plugins:` removes them |
| **U6** | **The design pass**, the way S14 was one: `base` and `editorial` headers, footers and menus reviewed at 390 px and 1280; the settings page given the same treatment; a third theme (`technical`, docs/06 v0.2) scaffolded as the real test of whether parts + settings + nav are enough to build a theme *without* touching `base` | a theme built from `scaffold` + settings + parts, no forked layouts · `page.*` and `settings.*` green at both viewports |

---

## 7b. Session log

Filled as each lands, the shape `07` §5 uses: one row, one PR, a bench diff, and what it found. A session
with no bench diff is a session that did not measure, which `07` §3.1 calls a failed session rather than a
warning.

| S | Date | PR | Bench diff | Notes |
|---|---|---|---|---|
| U1 | — | — | — | not started |

---

## 8. Risks

| Risk | L | Mitigation |
|---|---|---|
| ~~**The settings page becomes the admin app.**~~ **Retired with U4 (1 Sep 2026)** — the risk is closed by not building the page. The live version of it is now `07` decision 79's push button: one control on the Desk, and every future one has to argue with decision 77 above | — |
| Two writers on one `snypd.yaml` — an agent mid-session and a person mid-form | Medium | The form carries the values it rendered; the handler diffs and writes only what moved, and reports any field that changed underneath rather than clobbering it. Config writes already roll back when the result does not validate (decision 40) |
| Moving `shell` out of `layouts/` breaks any theme that exists | Low **now**, High later | Two themes exist and both are ours. This is the cheapest it will ever be, and it is the reason U1 is first rather than fourth |
| `tokens.learn` regresses because the settings surface is bigger | Medium | Settings are a *resource*, not a tool, so they cost nothing until read — the same property that let S11 add `content`/`history` for free. Gated by T2, and if it breaches, the fix is to trim the declaration rather than to redefine the metric |
| Hooks reintroduce WordPress's real cost — unknowable ordering | Medium | Declared-only, no priorities, one readable order, and doctor prints it. If a second ordering mechanism is ever proposed, it is a decision in this document and not a patch |
| A slot lets a plugin inject `<script>` and the 0 KB JS guarantee dies quietly | **High** | The JS budget is measured on the output (`page.js.kb`, `desk.js.kb`, gated at 0), so a slot that emits a script **fails a gate** rather than shipping. Extend the same assertion to slot output in U5 (T3's `settings.js.kb` is void with U4). docs/04's unbuilt `client:` key stays unbuilt until there is a budget to spend |
| The iframe preview is stale after a save | Low | The dev server already rebuilds on change and the POST returns 303; both panes reload on the same response |

---

## 9. Decisions

Continuing `07` §7. These override `04` and `02` where they conflict.

72. **The shell is a part, and parts resolve like primitives.** `theme.yaml › parts:` with nearest-declarer
    resolution, `{ fallback }`, and coverage reporting. Layouts receive parts on ctx rather than importing
    them relatively, because a relative import resolves against the theme that *wrote* the line and that is
    exactly what makes a child theme unable to override the document.
73. **`theme.yaml` is validated.** Zod, strict, with file:line diagnostics, the same treatment `snypd.yaml`
    gets. A theme's typo is an error a theme author can act on; four documented keys have been silently
    discarded since S6 because nothing checked.
74. **Settings are declared beside tokens, not merged into them.** A token becomes a CSS variable and a
    setting does not; that is a real difference. One form renderer and one write path over two declarations,
    rather than one declaration and a churned metric.
75. **A menu is a file.** `content/nav/<location>.yaml`, resolved by `ref` through the index, linted by rule
    7\. No `nav` content type in v0.1.5 — a list needs no status machine.
76. **Hooks are declared, never registered.** Slots and filters exist because YAML names a file. No global
    registry, no runtime registration, no priority numbers; order is the `plugins:` array. Doctor lists
    them, `content.explain` prints what ran.
77. ~~**The settings page edits configuration and never content, and lives only on the dev server.**~~
    **Withdrawn, 1 Sep 2026, before anything was built.** The argument stands as written — a colour is not
    a word, so decision 44's wall was in the wrong place — and it was still declined, because "the wall is
    in the wrong place" is a reason to *move* it and not yet a reason to spend a session and a permanent
    surface on the move. What the settings schema needed was two readers, the agent and the renderer (U3),
    and it has them. The page was the third, and a third reader that is also the product's first
    human-writable form is a precedent worth more than the convenience it buys.

    **Decision 44 therefore stands, with exactly one control on the Desk** — `07` decision 79's push
    button, which writes nothing and is the act of making a site public rather than of editing it. If the
    settings page is ever reopened, this is the paragraph to argue with, and `07` §5's S19a row is the
    evidence about what one control costs to add.

78. **A slot may not add JavaScript in v0.1.5.** The 0 KB budget is measured on output and gated at zero,
    so this is enforced rather than promised. `client:` (docs/04) stays unbuilt until there is a budget for
    it to spend.

---

## 10. Open questions

- ~~**Nav editing on the settings page**~~ — moot with U4 dropped: there is no settings page, so a menu is
  edited the way every other file is, through `site` › set_nav (U2) or by hand.
- **Does `site.*` get a declared schema too**, or do site-level settings stay Zod-strict in `schema.ts` and
  theme-level ones declared in `theme.yaml`? Two mechanisms for one form is a smell; one mechanism means a
  theme could redeclare `site.name`, which is worse.
- **`image` settings need a media picker**, and the media manifest is v0.2 (docs/07 §2). Until then the
  field is a path with a `content/media/` prefix and a validation that the file exists.
- **Should `header`/`footer` parts be *primitives*** — i.e. renderable inside a page body — so a landing
  page can place its own? That is the pages vocabulary question docs/06 already parks. Kept parked.
- **Style variations** (WordPress's best `theme.json` idea: one theme, several complete token sets shipped
  as named alternatives) would be ~40 lines on top of §4.2 and would make `theme › set` far more useful
  than switching between two themes. Not scheduled; recorded because it is cheap and good.

---

## 11. What this unblocks

- **docs/07 S19b** — three launch posts on a site that has a navigation menu and a footer, rather than a
  bare `<a rel=home>`.
- **docs/02 §10's launch plugin set** — `seo` and `newsletter` both need a `head` slot and a filter over
  `jsonLd`; neither has anywhere to write today.
- **docs/06 v0.2's `themes/technical`** — U6 is the test of whether a theme can be *built* from the contract
  instead of forked from `base`, which is the only honest measure of whether any of this worked.

---

## 12. Ready to start

Docs in `docs/`, code in `packages/` and `themes/`. **U1 starts on a branch off `main` at `v0.1.2`**, and
the two rules `07` §4 sets for every session hold here unchanged: one row above per session, one PR, and a
`bench.compare` against `main` attached to it — from CI, not from this box (`07` §3.3).

Two sequencing calls are Sunny's rather than a session's:

1. **Whether U1–U2 land before `07` S19b.** This document argues they should: the three launch posts are
   read on a public site, and today that site's header is one link. The counter-argument is that S19a/S19b
   are the last of Gate C and this is new scope. Either order works; doing U1 *after* a third-party theme
   exists does not, which is decision 72's whole argument.
2. ~~**Whether §5's settings page is built at all**~~ — **answered on 1 Sep 2026: no.** U4 is dropped and
   decision 77 is withdrawn above. U1–U3 and U5 stand unchanged, and §5 is kept in this document as the
   design that was declined rather than deleted: the next person to want a settings page should have to
   read it and say what changed, and the reasoning in it — one form renderer, one write path, `setConfig`
   and `setNav` and nothing else — is what any future version has to beat.
