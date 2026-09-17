# 20 — The registry, shown: a full demo of custom types, taxonomies and the rest of what snypd kept from WordPress

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 17 Sep 2026
**Asked for:** *"create the plan to create a full fledged demo showing the full capabilities of custom post types and other such things that we added from wordpress world … we can different template for different post type and so on."*
**Scope:** a plan, not a build. What docs/02 kept from WordPress, where each idea stands in the code today (built, config-only, or not yet), the demo site that shows all of it on one screen, the renderer gaps the demo needs closed first, the sessions, and the calls.
**The finding that starts it:** the type system is the oldest promise in this repo and the least shown. docs/02 §1 sketches a `caseStudy` type that extends `post`, core resolves it, the tests cover the inheritance and the provenance, `snypd://spec/types/<name>` explains it — and **no site in the tree has ever declared one.** Every corpus and the Ferrule specimen use `post`, `page` and `author` and nothing else. The Ferrule case studies are posts wearing a studio sheet (docs/19), which is why they read like a blog.
**What this is not:** a new content model. Nothing here adds a field type, a primitive, a hook kind or a status. The demo declares things the spec already allows and closes the four places where the build does not yet follow a declaration through.

---

## 1. What was kept from WordPress, and where each idea stands

The list from docs/02 §1 (*registered content types, reusable taxonomies, a status machine, roles, hooks, a theme that renders a contract*), with the mechanisms docs/02 §14 refused left out. *Stands* is what the code does on 17 Sep 2026, checked in the tree, not what the docs say.

| WordPress idea | snypd's form | Stands | The demo shows |
|---|---|---|---|
| `register_post_type` | `types.<name>` in `snypd.yaml`: `dir`, `urlPattern`, `layout`, `taxonomies`, `vocabulary`, `fields`, `mcp.write`; `extends:` inherits a base and overrides, arrays replace | **Built**, config-tested, never declared by a site | a `work` type beside `post`, ten lines of YAML |
| `register_taxonomy` | `taxonomies.<name>`: `hierarchical`, `attaches`, `urlPattern`, `fields`; terms are files with a title, a description and a body | **Built**; term pages, the term layout, rule 19, the API surface walk whatever is declared | `service` (hierarchical) and `industry` (flat) on `work`; `tag` stays on `post` |
| Custom fields / post meta | typed `fields` on the type, validated by lint rule 0 (required, unknown, type), read by layouts from `frontmatter` | **Built** | `client` required on `work`; the sentence rule 0 says when it is missing |
| Template hierarchy (`single-work.php`) | `types.<t>.layout` names a layout; a theme declares any layout name; the build loads it by name | **Built for the item; no fallback.** A theme without the named layout fails the build | `layouts/work.tsx` in studio; editorial and technical fall back to `post` (§3 · 4) |
| Archives (`archive-work.php`, `/work/`) | — | **Not built.** One list page exists, at `/` or `/posts`, and it mixes every dated type | `/work/` and `/posts/` as two lists (§3 · 1) |
| Post status | `statuses`: `draft → published → trashed`, transitions enforced by lint and by `content.set_status`; trash is `content/.trash/`, `content.restore` brings it back | **Built.** `review` and `scheduled` are v0.2 (docs/07 §2) | one case in draft, visible in preview only; one trashed and restored in the script |
| Revisions | git: agent writes land on `snypd/drafts`, publish lands the item's paths on `main` with the base as parent; `snypd://history/{type}/{slug}` | **Built** (S17b) | the history resource for a case after three edits |
| Roles and capabilities | `roles.agents` (default `contributor`), the type's `mcp.write` policy (`false | draft | publish`), every commit carries `Snypd-Principal:` | **Built** at the MCP boundary; the five human roles of docs/02 §11 are not | `work` at `mcp.write: draft`: an agent drafts a case and cannot publish it; the refusal names the policy |
| Hooks and filters | plugins in five tiers (declares, decorates, transforms, reacts, speaks): slots, filters, two stages, two events, in `plugins:` order, no priorities | **Built** (P2–P4); four first-party plugins | `autolink` linking the first mention of a service term; `content.explain` printing the pipeline a case ran |
| Menus | `content/nav/<location>.yaml` per theme-declared location; `ref` follows an item when it moves | **Built** (U2) | the masthead reads *Work · Notes · Studio*, resolved to `/work/`, `/posts/`, `/studio/` |
| Redirects | `content/redirects.yaml`; a slug change on a published item appends one; rule 10 blocks a publish that would 404 a known URL | **Built** | six cases move from `/posts/…` to `/work/…` and every old URL still lands |
| Hierarchical pages | `page.parent`, `urlPattern: /{path}` | **Built** | `/studio/` with `/studio/credits/` under it |
| `WP_Query` | `content.query`: type, status, taxonomy, term, sort | **Built** | *every published `work` in `service/product`* |
| `wp-json` | `api/<type>/<slug>.json`, plus the `.md` twins, `llms.txt`, the feed, the sitemap | **Built**; JSON-LD is `BlogPosting` for `post` only | `api/work/kiln-to-table.json`; a case's schema (§3 · 3) |
| Child themes, the customizer | `extends:` between themes; `tokens` and `settings` | **Built** (U1, U3) | already shown by the studio theme; unchanged |
| WP-CLI | `snypd init · new · check · lint · build · dev · bench` | **Built** | `snypd lint` on the registry; `snypd check theme studio` |
| `series`, `cluster`, `review`, `scheduled`, human roles, i18n, workspaces | docs/02 §4, §5, §11–§13 | **Not built** (v0.2) | not claimed. The demo shows what is built and says so |

The shape of the table is the finding: fourteen rows built, one half-built, one missing. The demo costs one site and four renderer changes, and it is the part of the launch story that no theme can tell.

---

## 2. The demo: Ferrule grows a registry

Ferrule stays the specimen (`examples/studio`). It is a product studio with cases, notes, people and a couple of pages, which is exactly the content model a custom type is for. Today it has six cases as posts, three people, three pages, a category taxonomy of three terms and a tag taxonomy of six.

### 2.1 The declaration

```yaml
types:
  work:
    extends: post
    dir: content/work
    urlPattern: /work/{slug}
    layout: work
    taxonomies: [service, industry]
    mcp: { read: true, write: draft }     # an agent drafts a case; a person publishes it
    fields:
      client: { type: string, required: true, description: Who it was for. Shown in the facts strip. }
      year:   { type: string, description: The year on the facts strip, when the date is not the story. }
  author:
    layout: author

taxonomies:
  service:
    hierarchical: true
    attaches: [work]
    urlPattern: /service/{term}
  industry:
    hierarchical: false
    attaches: [work]
    urlPattern: /industry/{term}
```

Fifteen lines. `post` keeps its defaults and becomes the journal (*Notes*): three short posts written for the demo, with tags. `page` keeps `about` as `/studio/` with `credits` as its child. `author` keeps its layout. Nothing in the spec changes.

### 2.2 The content

- `content/work/` — the six cases, moved from `content/posts/`, each gaining `client:` (Bitácora, Lumo, Bloco, Marés, Sela's maker, Tarn & Vale) and losing `category:`/`tags:` for `service:` and `industry:`. One of the six goes back to `draft` so the status machine has something to show; one is trashed and restored in the script.
- `content/taxonomies/service/` — `product`, `space`, `identity` as parents; `tooling`, `furniture`, `lighting`, `wayfinding`, `type` as children with `parent:`. Today's category and tag files, re-homed, with their descriptions (quoted).
- `content/taxonomies/industry/` — `hospitality`, `manufacturing`, `property`, `publishing`, or whatever the six clients are. Flat.
- `content/posts/` — three notes: *What we learned running a dishwasher for eleven weeks*, *Why our schedules are bolted to the kiln*, *A note on grog*. Short, tagged, dated; they exist so the front page and `/posts/` show a second type with a second template.
- `content/nav/header.yaml` — *Work → /work*, *Notes → /posts*, *Studio → page/about*.
- `content/redirects.yaml` — the six `/posts/<slug>/ → /work/<slug>/` lines, written by `site › set_redirect` so the demo shows the tool, and checked by rule 10 and the build.

### 2.3 The templates

- **`themes/studio/layouts/work.tsx`** — the studio theme's second owned layout, the case page the studio look was missing (docs/19 said a post layout was not needed for its nine findings; this is a different page). Hero band on the opposite scheme: eyebrow, display-size title, subtitle, the cover full width with a height cap. A facts strip on the wide track: *Client · Services · Industry · Year*, every cell a real field or a term link. The body in the reading column, one scheme. A close band: the author's `cta`, then the next case as a card. The Markdown twin stays.
- **`layouts/post.tsx`** stays `base`'s reading page: the notes are a blog and should read like one. That contrast on one site is the point of "a different template for a different type".
- **The archive** at `/work/` and `/posts/` renders through the theme's `index` layout with the type's label as its title and the type's entries — the studio entries part already draws cards from any `Entry`. A theme that wants a different archive per type declares `work-index` and the build prefers it (§3 · 1).
- **Editorial and technical** get no `work` layout. On them the type renders through `post` by the fallback in §3 · 4, and the demo shows that switch: `theme › set editorial` and the site still builds.

### 2.4 The script — twelve steps an agent runs from the MCP, each with the sentence it should see

This is the demo. Every step is a tool call a fresh agent can make; the *sees* column is what the tool answers, so the demo is checkable without a screenshot, the same standard docs/18 §3 set. The same twelve steps become the `README` section and the film's second clip.

| # | The agent | Sees |
|---|---|---|
| 1 | reads `snypd://types` | `work` beside `post`, `page`, `author`, with *inherited from types.post* on every key it did not write |
| 2 | `site › explain_config types.work.layout` | `"work" ← snypd.yaml:NN, overrides inherited "post"` |
| 3 | `content.create` type `work`, no `client` | rule 0: *Frontmatter is missing required field `client` — Who it was for. Shown in the facts strip.* |
| 4 | adds `client`, `service: [product, tooling]`, `industry: hospitality` | created on `snypd/drafts`, status `draft`, route `/work/<slug>/` |
| 5 | `content.suggest_blocks` | the same upgrades a post gets; the vocabulary is the type's |
| 6 | `content.publish` | refused: *publishing work/<slug> needs a human* — with the hint to call `content.render_preview`, which returns the review page a person approves |
| 7 | Sunny approves the review page; the agent publishes again | lands on `main`; `snypd://history/work/<slug>` shows the approval and the publish with their principals. The same call on a note (`mcp.write: publish`) lands at once |
| 8 | `content.query type=work taxonomy=service term=product` | the product cases, newest first, the draft absent |
| 9 | `content.explain work <slug>` | the pipeline it ran: parse, lint 0 errors, `autolink` linked *tooling* once, render `work` layout, emit twin + JSON |
| 10 | `site › set_redirect /posts/<slug> /work/<slug>` | appended; rule 10 stops firing on the move |
| 11 | `site › build` | `/work/`, `/posts/`, `/service/product/`, `/industry/hospitality/`, `/studio/credits/` in the route list; the feed carries both types |
| 12 | `theme › set editorial`, `site › build` | builds: *`work` renders through `post` — editorial declares no `work` layout* |

### 2.5 What the reader sees

The studio site at five widths, held to docs/18 §1's standard as docs/18 and docs/19 were: `/work/` as a card grid headed *Work*, a case page on the work layout with its facts strip, `/posts/` as a plainer list headed *Notes*, a note on the reading page, `/service/product/` listing the three product cases with the term's description as its lede, the front page's entries band showing work and not notes. axe 0 at the top and one viewport down on each; one edge inside every block; the numbers in docs/21 when it is built.

---

## 3. The renderer gaps, in order

Found in `packages/render/src/build.ts` and `emit.ts` on 17 Sep 2026. All four are small; all four are needed before Ferrule can move, because a `work` type today has no list page and no route for its menu item.

1. **An archive per type** (`build.ts` §list, the one `index` plan entry at `/` or `/posts`). Every type with a layout and a `date` field gets a list at the directory of its `urlPattern` — `/work/` from `/work/{slug}` — unless a page holds that route. The list renders through `<type>-index` when the theme declares it, else `index`, with the type's label (`titleCase(plural(t))`, which the API surface already computes) as its title and a `CollectionPage` schema. `/posts/` becomes the `post` archive by this rule instead of the special case it is now, and the `/` list stays what it is when no page holds `/`. `nav.ts` learns the archive routes so a `ref: /work` resolves. Key: the type's entries, so a change in one type does not rebuild another's list.
2. **The front page lists one type.** `HOME_ENTRIES` today is the newest six of every dated type. The studio home already picks the band's label from the menu item that points at `/posts`; the same lookup picks the type: the entries band lists the type whose archive the header menu links to first, and every dated type when the menu names none. Same rule, one place, and `base`'s home keeps its behaviour on a site with one type.
3. **Schema follows `extends`.** `emit.ts` `pageSchema` emits `BlogPosting` for `e.type === "post"` and `WebPage` for everything else. A type that extends `post` inherits the schema of its base; `client` becomes `sourceOrganization`, the terms stay `keywords`. `caseStudy` in docs/02 was always meant to be an article about work.
4. **Template fallback.** `build.ts:284` throws when the theme lacks the type's layout. The build falls from `types.<t>.layout` to the layout of the type it extends, then to `post`, and says which one it used in the build line — WordPress's `single-work → single → singular`, as a decision. `check theme` gains one row: the layouts a theme declares beyond the six, so a theme can be asked *what does this theme do with a `work`?*

Not a gap, checked: `content.create`, `content.update`, `content.query`, `content.explain`, rule 0, rule 19, the `.md` twin, `api/<type>/`, the sitemap, `snypd://content/{type}/{slug}` and the entries part all take the type as given. The MCP `write-post` prompt takes a `type` argument already (`prompts.ts:99`).

---

## 4. The work — four sessions, in order of dependence

| Unit | What | Where | Exit |
|---|---|---|---|
| **R1 · the renderer** | §3 · 1–4 with tests: the archive on a two-type fixture (`corpora/_test/registry`), the home rule, the schema, the fallback, `check theme`'s row; docs/11 decisions 194–197 | `packages/render`, `packages/core/src/nav.ts` | `bun test` green; the two-type fixture builds `/work/` and `/posts/` and every route the table in §2.4 · 11 names; editorial builds it through the fallback |
| **R2 · the registry** | §2.1–2.2: `snypd.yaml`, the six moves with `client`, the two taxonomies with their files, three notes, the nav, the six redirects, one draft, the hierarchy under `/studio/` | `examples/studio` | `snypd lint` 0 errors over the registry; `snypd build` lists the routes; the six old URLs redirect; the studio site still passes docs/18's page suite |
| **R3 · the work page** | §2.3: `layouts/work.tsx`, the sheet rules for the hero band, facts strip and close band, the archive heading; audited at five widths, light and dark, as docs/18 and docs/19 were; docs/21 with the numbers | `themes/studio` | axe 0 × captures; one edge; `check theme studio` passes; `bundled.ts` regenerated |
| **R4 · the demo** | §2.4 as a runnable script over the MCP (`packages/bench` `agent` suite already drives a fresh agent through tasks, with a scripted driver and a `claude:<model>` driver); the README section *Custom types*, with stills; the film's second clip | `packages/bench`, `README.md`, `docs/launch/` | the twelve steps pass under the scripted driver in CI; a `claude:` run's transcript in the doc |

R1 before R2 (Ferrule cannot move until `/work/` lists). R3 after R2 (the page needs the fields). R4 last. R1 and R3 can start on the same day if two sessions run; R2 is content and is the shortest.

**Where it sits against Gate D** (launch Tue 6 Oct 2026, docs/launch, memory). S28 (the site on studio) and the film re-render are queued. R1 + R2 are the launch story — *a fifteen-line type, every tool knows it* — and belong before it. R3 is the case page the studio look was missing anyway and folds the post layout of docs/19's follow-up into one file. R4's README section is launch copy. Recommendation: R1–R3 before S28, R4 with the launch docs.

---

## 5. Calls

1. **The type's name.** `work` (URL `/work/`, menu *Work*, the studio's own word, and what phenomenonstudio.com calls it) · `case` · `project`. **Recommend `work`.**
2. **`mcp.write: draft` on `work`.** An agent drafts a case and a person publishes it; the notes stay `publish`. It is the one row in §1 that shows policy doing something. **Recommend yes.**
3. **`service` hierarchical.** Parents *product / space / identity* with today's tags as children, so the demo shows `parent:` on a term and the archive lists the children's cases under the parent. The alternative keeps two flat taxonomies. **Recommend hierarchical.**
4. **The archive layout.** Reuse `index` with the type's title, plus an optional `<type>-index` a theme may declare (§3 · 1) · a required `archive` layout in the contract. **Recommend the optional one**: the six-layout contract stays, and studio gets to draw `/work/` as cards and `/posts/` as a list without a seventh required file.
5. **Three notes for the journal.** Without them `post` is an empty type and the second template is unseen. **Recommend three, short, written in R2.**
6. **Sequence against Gate D** (§4). **Recommend R1–R3 before S28**, R4 with the launch docs.

---

## 6. What this plan does not do

It does not add `review` or `scheduled` (docs/07 §2 keeps them v0.2), human roles, `series`, `cluster`, i18n or workspaces; §1 says so in its last row and the demo does not claim them. It does not add a field type: `client` and `year` are strings. It does not add a primitive, a hook kind or an agent-facing attribute. It does not touch the spec's default types: a blog on `base` after this plan is byte-for-byte the blog before it, and the two-type fixture is what proves that.

---

## 7. R1 outcome (18 Sep 2026)

Built as planned, with two departures, on `s29-studio-specimen`; decisions 194–197 in docs/11 §8.

- §3 · 1 **as written**, plus the rule that keeps a blog byte for byte: one dated type with `/` free lists at `/` and gets no `/posts/`. The archive's title is the menu's word for it, else the plural — so `/work/` reads *Work*, not *Works*, the moment the masthead says so, and §2.5's *headed Work* and §3 · 1's *`titleCase(plural(t))`* stop disagreeing.
- §3 · 2 **narrowed**: the front page lists one type — the menu's first, else the first dated type — never *every dated type* (decision 195 says why).
- §3 · 3 **without `sourceOrganization`**: the schema follows `extends`; a field named `client` is Ferrule's, not the renderer's. R3's work layout can emit it from the declaration.
- §3 · 4 **as written**, and `check theme` has the row.

Exit: 477 tests, the two-type fixture (`corpora/_test/registry`, written by the test) builds every route §2.4 · 11 names except the term pages R2 declares; editorial builds it through the fallback. Ferrule is unchanged on disk and builds as before — R2 moves it.
