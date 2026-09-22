# 30 — The first client: many sites, one binary, and what each one teaches

**Owner:** PM · **Decider:** Sunny · **Written:** 22 Sep 2026
**Asked for:** *"so i am the first client, and i work on many projects, for example i want snypd to create site for rampscan, then i want to create a site which explains different kind of knots with images … openrouter keys added then snypd will have capabilities to generate images and videos and other ai usage"* — then *"write the first client doc … for example a client has to publish a site about breeds of cats and their details, he can easily do that using snypd."*
**Scope:** a test plan and a position, not a build. It names the sites the first client wants, what shape each one is, what it proves or breaks, and in which order. §3 walks one stranger's site — a field guide to cat breeds — through the binary as it stands today, call by call, so the walk is checkable the way docs/20 §2.4 was. §5 takes a position on AI generation inside snypd. Nothing here adds a primitive, a field type or a status.
**Builds on:** docs/20 (the registry), docs/27 (site basics), docs/28–29 (the theme factory), the five go-live docs of 22 Sep (the funnel, the two hosts, the cloud cost, the cloud architecture).

---

## 1. The opinion in one paragraph

Until today snypd has had one site on it, and that site is its own. A CMS with one site is a CMS that has never met a shape it did not expect. The first client works on many projects, and that is worth more than any audit: a product site, a reference site with hundreds of images, a field guide with a custom type and three taxonomies, each on a different theme, each with a different publish policy, all driven from the same MCP by the same agent. Every one of them is a run through the go-live funnel with a real destination at the end. The doc's rule for choosing them is simple: **no two sites of the same shape.** snypd.rocks is a product blog; the next site should not be. And the first client's wish to give the binary API keys so it can make pictures is the one place this doc pushes back (§5): snypd should own what happens to media — provenance, alt text, derivatives, credits, orphans — and leave making it to the agent that already can.

## 2. The sites, and what each one is for

| Site | Shape | Theme | Types and taxonomies | Publish policy | What it proves | When |
|---|---|---|---|---|---|---|
| **snypd.rocks** | product blog + docs | `folio` (site-local) | `post`, `page`, `release`, `log` | agent publishes | the funnel end to end; already live | live |
| **rampscan** | product site: a front page that sells one thing, a few pages, a changelog | a seeded theme from a brief (`snypd seed`, docs/29 §4) | `page` with `home: true`, `release` | agent publishes | the theme factory on a second brief; a site with almost no posts; a second live host build on the pinned CLI | **before 6 Oct** |
| **cat breeds** (§3) | field guide: forty undated reference entries, three ways to browse them | seeded, photographic, big type | `breed` extends `post`; `origin`, `coat`, `group` | agent drafts, a person publishes | the registry on a stranger's content; undated types; facts from fields; photo credits at scale | launch demo, then a corpus |
| **knots** | instructional reference: one entry per knot, each a sequence of pictures | seeded, diagrammatic | `knot` extends `post`; `use`, `family`; `steps` on every entry | agent publishes | `steps` → HowTo at scale; media as the content, not the decoration; a site that must not use generated pictures (§5) | after launch |

Two of the four are not the client's: the cat guide and the knots site are the shapes a *stranger* brings. That is the point. The first client stands in for the tenth.

## 3. The worked example: a person with cats

A person has a folder of breed notes and a hundred photographs and wants a site that lists every breed with its details. They have an agent with the snypd MCP and nothing else. This is the walk, in the order the binary already suggests, with the sentence the agent should see at each step. Every step is a call that exists on `main` today unless marked *TF* (the theme factory branch, docs/29, built and unpushed).

### 3.1 The declaration — fifteen lines, like Ferrule's

```yaml
snypd: 1

site:
  name: The Cat Book
  description: Every recognised breed, its history, its temperament and what it needs from you.
  icon: /media/icon.svg

types:
  breed:
    extends: post
    dir: content/breeds
    urlPattern: /breeds/{slug}
    layout: breed
    taxonomies: [origin, coat, group]
    mcp: { read: true, write: draft }          # the agent drafts a breed; the owner publishes it
    fields:
      origin:        { type: ref, to: origin, required: true, description: "Where the breed was first recognised." }
      coat:          { type: ref, to: coat, required: true, description: "Short, long, hairless or rex." }
      group:         { type: ref, to: group, description: "Natural, hybrid or mutation — and its parent." }
      weight:        { type: string, description: "Adult range, e.g. 4–7 kg. Shown on the facts strip." }
      lifespan:      { type: string, description: "Typical, e.g. 12–15 years." }
      temperament:   { type: list, of: { type: string }, description: "Three to five words a breeder would use." }
      hypoallergenic:{ type: boolean, default: false }
      recognised:    { type: list, of: { type: enum, values: [CFA, TICA, FIFe, GCCF] } }

taxonomies:
  origin: { hierarchical: false, attaches: [breed], urlPattern: /origin/{term} }
  coat:   { hierarchical: false, attaches: [breed], urlPattern: /coat/{term} }
  group:  { hierarchical: true,  attaches: [breed], urlPattern: /group/{term} }
```

Nothing in the spec changes. `post` stays for the owner's occasional notes; `page` carries *About* and *Sources*; `author` is the owner.

### 3.2 One breed, as the agent writes it

```markdown
---
title: Maine Coon
status: draft
description: The largest domestic breed, a gentle working cat from the north-eastern United States.
origin: united-states
coat: long
group: natural
weight: 5–8 kg
lifespan: 12–15 years
temperament: [gentle, sociable, playful, vocal]
recognised: [CFA, TICA, FIFe]
cover:
  image: /media/breeds/maine-coon/portrait.jpg
  alt: A brown tabby Maine Coon sitting on a fence post, ears tufted, looking left.
---

:::tldr
A big, easy-going cat that likes company and water. Needs a weekly comb and room to climb.
:::

:::stat-row
::stat{value="5–8 kg" label="adult weight" source="https://cfa.org/maine-coon/"}
::stat{value="12–15 yrs" label="lifespan" source="https://cfa.org/maine-coon/"}
::stat{value="1895" label="first shown" source="https://cfa.org/maine-coon/"}
:::

## History
…

## Temperament
…

:::figure{src="/media/breeds/maine-coon/kitten.jpg" alt="A Maine Coon kitten, eight weeks old, on a wool blanket." width="wide"}
:::

## Care

:::callout{kind="warning" title="Health"}
Screen for hypertrophic cardiomyopathy; the breed carries a known MYBPC3 variant.
:::

## Similar breeds

| | Maine Coon | Norwegian Forest Cat | Siberian |
|---|---|---|---|
| Weight | 5–8 kg | 4–7 kg | 4–8 kg |
| Coat | long, shaggy | long, double | long, triple |
| Origin | United States | Norway | Russia |

:::faq
### Are Maine Coons hypoallergenic?
No. No breed is; some people react less to some cats.

### How big do they get?
Males commonly reach 8 kg; some exceed 10 kg. Length, not weight, is the record.
:::
```

The shipped vocabulary was enough: `tldr`, `stat-row` with sources, `figure` with alt, `callout`, `faq` (→ FAQPage), and a plain table. A breed page is a post with a facts strip, which is exactly what the `work` layout on Ferrule already is (docs/20 §2.3). Two things the page *wanted* are on docs/01's list and not in `packages/spec/primitives/` (thirteen files today): `comparison` and `related`. The table stands in for the first; the theme's *next entry* card stands in for the second. §4 · 5 says what to do about it.

### 3.3 The script — the calls, and what the agent sees

| # | The agent | Sees |
|---|---|---|
| 1 | `snypd init cats --name="The Cat Book" --deploy=cloudflare` | a scaffold, the harness registered, a `wrangler.toml` and a workflow on the pinned CLI (README §deploy) |
| 2 | prompt `get-started` | branch A (empty site): read `snypd://config`, then `snypd://spec/primitives`, then declare types before writing |
| 3 | writes the fifteen lines of §3.1; reads `snypd://types` | `breed` beside `post`, `page`, `author`, each inherited key marked *inherited from types.post* |
| 4 | `content_create` type `breed`, no `origin` | rule 0: *Frontmatter is missing required field `origin` — Where the breed was first recognised.* |
| 5 | creates the three taxonomies' terms under `content/taxonomies/…` (forty origins is too many by hand: the agent writes them from the breed list) | terms resolve; `ref` fields lint clean |
| 6 | the forty breeds, one `content_create` each, from the owner's notes | forty drafts on `snypd/drafts`, routes `/breeds/<slug>/` |
| 7 | `content_suggest_blocks` on a plain one | *this section reads like a comparison; two facts here have no source; the second image has no alt* |
| 8 | the photographs: the owner's own, or CC0/CC BY from Commons through the Ferrule pipeline (`scripts/media.py`, `credits.json`) — never generated (§5) | lint: every `figure` and `cover` has an alt; rule 20 names the two photographs no entry uses |
| 9 | prompt `site-basics` | an SVG icon under 1 KB, a `/404` page, descriptions on the pages that lack one, `snypd cards` for the forty share cards in the theme's style |
| 10 | *TF* — prompt `build-theme` with a brief: *"a field guide: warm paper, one serif for display, photographs edge to edge, a facts strip on every breed"*; `snypd seed` | a theme with a `breed` layout (facts strip: *Origin · Coat · Weight · Lifespan · Recognised*), `DESIGN.md`, the taste lint's report, the contact sheet Sunny's process puts in front of a person first (docs/28 §8) |
| 11 | `content_publish` on *Maine Coon* | refused: *publishing breed/maine-coon needs a human* — with the hint to `content_render_preview` |
| 12 | the owner approves that exact version on `/_snypd`; the agent publishes again | lands on `main`; `snypd://history/breed/maine-coon` shows the approval and the publish with their principals |
| 13 | `content_query type=breed taxonomy=coat term=long` | the long-haired breeds, the drafts absent |
| 14 | `site › build` | `/breeds/`, `/origin/united-states/`, `/coat/long/`, `/group/natural/`, `/sources/`, `/404` in the route list; feed, sitemap, `llms.txt`, a `.md` twin per breed, FAQPage JSON-LD on every entry with a `faq` |
| 15 | `git push` | the host builds `dist/` with the pinned CLI; the site is at `<project>.pages.dev`; a custom domain is one record at the host |

Fifteen steps, one afternoon, no dashboard. The person did two things: looked at a contact sheet and pressed *approve* forty times — or once, if they set `mcp.write: publish` because they are alone.

### 3.4 What the reader sees

`/breeds/` as a photographic grid, alphabetical; a breed page with its portrait full width, the facts strip, the reading column, the comparison, the questions; `/coat/long/` with the term's description as its lede and the long-haired breeds under it; `/group/natural/` listing its children (*landrace*, *foundation*) and their breeds. Five widths, axe 0, one edge inside every block — docs/18 §1's standard.

## 4. What the walk finds — the gaps, in order of how much they hurt

The walk in §3 is honest about what exists. These are the places it would stumble today, each a one-line finding for a session, none a new content model.

1. **Undated types sort by date.** A `breed` has no meaningful date, but `extends: post` gives it one, the archive sorts newest first, and the feed carries it. `content_query` already takes `sort: title`; the archive and the feed do not read anything from the type. A type needs to say *sort: title* and *feed: false* — two keys, read by the archive and the feed emitters.
2. **The facts strip is theme-owned.** Ferrule's `work` layout draws *Client · Services · Industry · Year* because the studio theme wrote that TSX. A stranger's seeded theme has to write a `breed` layout to get *Origin · Coat · Weight*. The fields already carry `description`; a base `facts` part that draws any type's declared fields in declaration order — a theme restyles it, a theme's owned layout replaces it — would let every custom type have a facts strip on every theme, including the bundled three.
3. **Credits are Ferrule-local.** `credits.json` and `scripts/media.py` live in `examples/studio`. A hundred photographs on a stranger's site need the same thing: a `credit` (and `license`, `source`) on media, read by lint and drawn by a `/sources/` page or the figure's caption. This is the provenance layer §5 argues snypd should own.
4. **A taxonomy of forty terms is forty files.** `content/taxonomies/origin/` with a file per country (`title`, `description`, `parent`) is the correct model and a tedious one; the term files are content, so the agent writes them, but nothing offers to. A `terms:` list on a taxonomy for the flat case, or a `site › ensure_terms` that writes the missing files from the entries that reference them, closes it.
5. **`comparison` and `related` are on the list and not on the shelf.** docs/01 names ~35 primitives; thirteen are built. The breed page reached for two of the missing ones and a table stood in. `comparison` is the one a field guide needs most, and the interesting version reads the registry (`entries: [maine-coon, norwegian-forest-cat, siberian]`, `fields: [weight, coat, origin]`) so it stays true when an entry changes. It is the only item here that adds a primitive, and it can wait for the corpus to prove the need.
6. **Knots need `steps` with a picture per step.** `steps` emits HowTo from an ordered list and its slot already allows nested content inside an item, so a `figure` per step parses today. What is unproven is whether a theme draws it as a strip of pictures rather than a list with images in it, and whether the HowTo emit carries each step's `image`. A slot-and-emit question, not a new primitive, and it decides whether the knots site is possible on the vocabulary.

Items 1–3 are what the cat guide teaches. Item 6 is what the knots site teaches. Rampscan is expected to teach nothing new in the content model and everything about the theme factory on a second brief, which is why it goes first.

## 5. Media and AI: what snypd should own, and what it should not

The first client asked for OpenRouter keys in snypd so the binary could generate images and video. The recommendation is **no key in the binary**, for two reasons and with one compromise.

- **The agent already can.** The hero film (docs/26) was made by the agent with HyperFrames and OpenRouter; the share cards are photographed by the bench; Nano Banana sits on the agent side. Every agent host ships generation. A key inside snypd duplicates that and ties the CMS's release cycle to model churn. The binary's promise is *complete without a server*; it should also be *complete without a model*.
- **The durable part is after generation.** What no agent host does is remember where a picture came from. snypd is the place that can: `credit`, `license`, `source`, `model` and `prompt` on a media file, alt text as a hard rule, orphans by rule 20, derivatives (sizes, formats, poster frames) by the build. That is the layer to build (§4 · 3), and it makes generated media *safer* on snypd than anywhere else, because a generated picture without a `model` field will not lint.
- **The compromise.** `content_suggest_blocks` already says *this section wants a figure*. It can say what the figure should show and hand the agent a prompt. The agent makes the picture with whatever it has and drops it into `content/media/`; the provenance fields say what made it. A key in `snypd.yaml` becomes optional sugar for an agent host with no skills, not the feature.

**The knots site is the case that settles it.** Image models are bad at rope topology: they draw knots that look right and cannot be tied, because crossings are hallucinated. A knots reference with generated diagrams is worse than none. The site needs photographs of real knots or procedural SVG drawn from a crossing sequence — which fits CSS-as-the-runtime (docs/14) far better than a raster ever would, and would seed the `steps`-with-a-picture work in §4 · 6. A site that needs generation to exist is the wrong first site for generation.

## 6. Order

1. **Rampscan, before 6 Oct.** A second brief through the theme factory, a second live host build on the pinned CLI, a front page that sells one thing. The launch evidence that "we use it for our own sites" means *sites*.
2. **The cat guide as the launch demo.** Not the client's, deliberately: it is the stranger's site, and the fifteen steps in §3.3 are the README's next section and the film's next clip, on the pattern docs/20 §2.4 set. Built as `corpora/catbook` so the bench walks it; forty entries are enough to find §4 · 1–3.
3. **Knots, after launch**, once §4 · 6 is answered. Procedural SVG or photographs; no generated pictures.
4. **The cloud (the 22 Sep docs), when the first ten people ask.** Nothing in §3 needs it: the guide lands on a host from `snypd init --deploy`. The approval from a phone (cloud §7) is the first cloud feature the cat guide would use, and only if two people run it.

## 7. Calls

1. **Rampscan before launch — yes or no.** Recommendation: yes; it is a week of the theme factory on a real brief, which the proof sitting needs anyway.
2. **The cat guide as a bundled corpus and the README's second story.** Recommendation: yes, as `corpora/catbook`, forty entries, photographs from Commons through the Ferrule pipeline, credits on `/sources/`.
3. **No model keys in the binary; provenance fields on media instead (§5).** Recommendation: as written. If the first client wants the sugar, it is a plugin (docs/01 says plugins may register field types; one that registers a `generate` tool is the same shape).
4. **§4 · 1–3 as one session after launch**, before the cloud: undated types, a base facts strip, media credits. They are what every stranger's site will hit first.
