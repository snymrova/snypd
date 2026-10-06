# 32 — The way forward: the page just opens, the agent picks by name, and the number nobody was counting

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 23 Sep 2026 · **Launch:** Tue 6 Oct 2026 — unchanged by this document
**Asked for:** *"I am not sure about zero js, as js is integral part of the web.. also how about creating primitives like these [prebuiltui.com/components] so that agent can use them instead of wasting tokens"* — then *"some of the features that we need in all sites are zero loading, not zero js.. it should just open the page. and second thing we want is ability for the agent to select intuitive primitives … so that agent can build amazing ui using these primitives in fastest way possible"* — then *"please audit our conversation, please do a research and figure out the best plan for the wayforward for our cms.. our focus is speed, beauty, ease, and save tokens."*
**Builds on:** docs/01 (the ~35 vocabulary), docs/06 (v0.2 rows and the open `spec-pages` question), docs/09 §4.5 (why `patterns:` was deferred), docs/13 §5 (the post-launch list), docs/14 (CSS as the runtime), docs/23 §6 (media, what is not built), docs/29 (the factory), docs/31 §7 (after launch, in order).
**Scope:** an audit of the 23 Sep conversation; the four words measured against the tree as it is today, with the current numbers and which of them are gated; one plan, sessioned and dated, that starts on 7 Oct and states how it interleaves with the two post-launch lists that already exist. Decisions are numbered from **240** (239 is S39's last, docs/11 §8). Nothing here moves before 6 Oct: L7, the 0.1.7 publish and the factory sitting keep their days.
**Status:** proposed. Every number in §2–§6 was re-measured on 23 Sep against 0.1.7; the committed `bench/latest.md` is 0.1.4 and eight days behind on the token rows, which are the ones that moved.

---

## 1. The audit — what the conversation argued, and what held

Three things were argued on 23 Sep. Two of them were argued wrong on the first pass, and the record should say so.

**"Zero JS" was defended as a goal. It is a mechanism.** The first answer defended `page.js.kb = 0` on its own terms. Sunny's correction — *the feature we need in all sites is zero loading, not zero JS; it should just open the page* — is the correct statement of the goal, and the tree already agrees with it: `themes/base/parts/shell.tsx:24-25` emits speculation rules with `prefetch` at `eagerness: "immediate"` and `prerender` at `"moderate"` over every internal page, and `@view-transition` is in every bundled theme. A click on an internal link opens a document that was rendered in another process before the click. **That only works because there is no script to boot** — a prerendered React page is prerendered-then-hydrating, which is not "just opens." So zero JS is how zero loading is bought, and the badge, the CI gate and the README's first capability line all name the purchase instead of the thing purchased. §3 fixes the measurement; decision 240 fixes the words.

**"Navbar as a primitive" was refused as a category error, and the refusal stopped one question short.** It *is* a category error — `docs/01:62` says so in the original vocabulary: *"deliberately absent: `grid`, `columns`, `hero-with-three-cards`. Layout is the theme's job; the author never says 'grid.'"* Content never references a theme, and that rule is what makes theme switching and the `.md` twin safe. But the useful question was *what is the agent actually short of when it wants a site to look like the ones on that page*, and the answer is two different things on two different layers: **a catalogue of chrome it can choose by name** (the theme layer), and **the marketing half of the vocabulary that docs/01 planned and docs/13 locked out** (the content layer). Both are real gaps. The proof that a by-name catalogue is the right shape is already in the tree: `@snypd/shelf` is sixteen typefaces chosen by name with measured metrics and `pairsWith` prose, and it works. There is no equivalent for chrome, and four themes have each rewritten the same ~35-line `parts/header.tsx` by hand because of it.

**"Closed vocabulary" was quoted as if fourteen were the design.** docs/00 principle 4 says *~35*. docs/01 lists them by category. It was locked at thirteen (docs/13 §5.4) for one reason with a number on it — decision 41: *"one more primitive in the spec breaches `tokens.learn`"* — and that reason has since been superseded by decision 182 (exact counts, budget 6,000) and never re-argued. docs/06 has held an open question since v0.1 that is exactly this document's: *"pages vocabulary (`hero`, `pricing`, `logo-wall`) as a separate `spec-pages` so the post vocabulary stays small?"* §5 answers it.

**What held.** The content ↔ theme boundary. The theme layer, not the content layer, as the token sink (§4 puts a number on it: ~40,000 output tokens per `build-theme` run, unmeasured). And the timing: none of this is 6 Oct work.

---

## 2. The four words, measured

Every row is from a 23 Sep run on 0.1.7 unless marked. *Gated* means CI fails on it; *report* means it is printed and nothing holds it.

### Speed

| What | Now | Gate | Verdict |
|---|---|---|---|
| `mcp.coldStart.binary` | 23 ms | 50 | won |
| `build.cold.100` / `.1000` / `.10000` | 292 ms / 2.7 s / 27.7 s (CI, 0.1.4) | 2 s / 20 s / 200 s | won; **parse is 76–79 % of every build, single-threaded on purpose** — the one lever with 4× in it, deferred by docs/11 §6 until `build.cold.1000` passes half its budget (it is at 14 %) |
| `page.lcp` (editorial corpus, localhost) | 208 ms | **report-only** | "the shape of the page, not a field number" — `page.ts:246` |
| `page.cls` | 0 | 0.05 | won |
| `page.js.kb` | 0 | 0 | gated — **the mechanism, not the outcome** |
| second navigation (prerender hit, click → paint) | **not measured** | — | the outcome Sunny named; §3 |
| `onboard.ttfv` on a clean machine | **13.93 s ❌** (`bench/clean-machine.md`) | 5 s | the only red row in the committed records; belongs to L7's day, noted here so it is not lost |

On the real front page (`sites/snypd.rocks/dist/index.html`, measured on the wire): HTML 6.2 KB gzip, CSS 6.3 KB gzip, font 17.7 KB, **images 147 KB of a 177 KB eager load — 83 %**. The single largest object is `front-door-done.webp`, a 112 KB `<video poster>` that `loading="lazy"` cannot touch and that is almost certainly the LCP element. There is no image pipeline: `packages/render/src/build.ts:153-177` copies `content/media/**` byte for byte, `media.ts` reads intrinsic size from the header and nothing else, and a grep of `packages/`, `themes/`, `sites/*/themes/` for `srcset|<picture|avif|Bun.Image` returns nothing. docs/23 §6 recorded it: *"derivatives: resize, webp, posters — not built; v0.2, behind the manifest."* Rule 20's first run found **5.6 MB of stills no page fetches and a 4.4 MB clip nothing names** (docs/11:309); they are still in `dist/` today.

So: the thing the CMS optimises hardest — script, stylesheet, font — is 17 % of what a page loads, and the thing it does not touch is the rest.

### Tokens

| What | Now | Gate | Verdict |
|---|---|---|---|
| `tokens.page.md` | 510 | 2,500 | won; 20 % used |
| `tokens.learn` / `.editorial` | **5,295 / 5,469** | 6,000 | gated; **88 % / 91 %, +15 % in one release**; 72 % of it (3,788) is the fourteen primitive sheets, read eagerly because the metric's definition says so (`bench/src/index.ts:740-746`) |
| `tokens.tools` | 2,239 | 3,000 | gated — **and paid on every turn**, which no row multiplies |
| `tools/list` × 30 turns | **≈ 67,000** | — | **not measured**; 4× the whole surface return of a kill-test run and 13× `tokens.learn` |
| handshake beyond `tools/list` (`resources/list` 38 entries, templates, prompts) | 2,313 | — | not measured |
| `snypd://spec.json` | 5,809 in one read | — | not measured; described as *"Everything as JSON Schema"*, an inviting name on the most expensive read in the system |
| one `build-theme` run (three candidates, CSS + YAML + brief) | **≈ 40,000 output tokens** | — | **not measured**; `bench/gallery.md` measures the result, never the cost |
| model context per kill-test run vs what the surface returned | 521k–601k vs 13k–17k, **32–39×** | — | `agent.model.tokens`, report |

The lane that is won (reading a page) is the one with a gate at 20 % used. The two largest sinks — the per-turn tool list and theme authoring — have no row at all.

### Ease

`onboard.handoff` 3 actions of 5, walked and not claimed. `agent.goal` 15/15 on haiku, sonnet and opus (0.1.4). `suggest.precision` 1.0. The `.md` twin, `llms.txt`, feed, sitemap, JSON API: 8/8. `registry.claude-sonnet` **10/12** — a live model missed two of docs/20's twelve steps. `bench/writes.md`: haiku's first-attempt lint pass is 0.70, and eight of its failures are one rule, `unsourced-evidence`.

And the vocabulary: fourteen blocks — `cover, tldr, callout, pullquote, stat, stat-row, faq, steps, figure, chart, diagram, flow, cta, logo-wall`. Eleven are an essay or a technical doc; two are a landing page. A site that is not a blog — Ferrule, snypd.rocks itself — has no `hero` by that name, no `pricing`, no `testimonial`, no `features`, no `gallery`, no `team`, and both of those sites grew a site-local theme (`folio`, `public`) to get one. That is where the agent stops picking a block and starts writing markup, and the site-local themes are the smell.

### Beauty

What exists is stronger than the conversation gave it credit for: `DESIGN.md` with a dated `## Taste` log that a factory run must read first; eleven `taste.*` rules (six on the stylesheet, five measured in the page — eyebrow, tiny text, measure, flat hierarchy, monotonous spacing); a contrast solver that makes every seeded palette pass by construction; decision 209, *a look is picked from a picture, before it is a theme*; and S39's five type decisions (235–239) landed this morning. The machine has eyes.

What it does not have: **any way for a theme to choose its chrome by name.** `theme.yaml`'s schema (`packages/core/src/schema.ts:227-258`) has tokens, variations, settings, parts by file, layouts by file, locations, one font, one stylesheet. There is no `header: { pattern: split, sticky: true }`. `snypd seed` writes ~35 tokens and stops at `:root`; every pixel of look and every line of chrome structure is a hand-written `theme.css` of 22–42 KB and a hand-written `parts/*.tsx`. `patterns:` and `variants:` are reserved keys, parsed only so the diagnostic can say *not built* (docs/09 §4.5).

---

## 3. Speed — zero loading, and the number that proves it

**The goal, in one sentence:** a click on an internal link paints the next page before the finger lifts, and the first page paints before the reader notices it loading.

Three moves, in the order of bytes saved per unit of work.

### 3.1 Measure the outcome (Z2)

`packages/bench/src/page.ts` drives Chrome over CDP and already keeps one browser alive across routes (`page.ts:181`, `:195`). Three things in-file stop it measuring a second navigation: it disables the cache on purpose (`page.ts:123`, so a warm cache cannot hide a beacon), it opens a fresh target per route (`page.ts:191`, and prerender is scoped to the initiating document), and `cdp.ts:71` launches with `--disable-background-networking`, which plausibly suppresses speculation. None of these is a harness change; a `navSuite()` sibling that reuses the browser, keeps the cache on, and walks route → hover → click on one target is the shape. `Preload.prerenderStatusUpdated` says whether the speculation ran, and why not if not.

Two new rows, and a third that makes the trade visible:

- **`page.prerender.hit`** — did the click activate a prerendered document. Boolean, gated at 1. **This is the row that proves "the page just opens."** A millisecond count on unthrottled localhost proves nothing; a prerender hit proves the mechanism works end to end and that no page broke it.
- **`page.nav.ms`** — click → first paint of the activated document. Report, then a budget once two releases of numbers exist.
- **`page.prefetch.kb`** — what `eagerness: "immediate"` fetched in the background. The front page carries 29 internal links at ~3 KB gzip each: **85–120 KB per visit**, more than the critical path, and today it is a choice nobody made. It stays — it is what makes the click instant — but it becomes a number.

`page.fcp` is already collected (`page.ts:84`) and never emitted. Free row.

### 3.2 Land the bytes (Z3, half a session, and Z1, two sessions)

**Z3 — hygiene, on the real site, no new code.** Delete what rule 20 already found (5.6 MB stills, 4.4 MB clip). Re-encode the two front-page posters (112 KB → ~25 KB AVIF, the largest single LCP win available). `fetchpriority="high"` on the first eager image or poster on the page, not only on `::cover` (`cover.tsx:30` is the only site of it today). Four lines in `emit.ts:117-123` to carry `Link: </assets/theme.css?v=…>; rel=preload; as=style` and the font in `_headers`, which Cloudflare turns into a 103 Early Hint. Report `page.lcp` on the *site*, not only the corpus — the corpus has almost no images, which is why the corpus numbers look font-dominated and the real site is image-dominated.

**Z1 — the pipeline docs/23 named.** `Bun.Image` resizes and encodes (decision 105). A media manifest (`.snypd/media.json`, content-hashed) records the derivatives written; `figure`, `cover` and the poster emit `<img srcset sizes>` (AVIF with the original as fallback) sized to the theme's `measure`; a poster is derived from the clip when none is named; **the source file is never touched** (docs/01 §2 — the `.md` twin names the original, and the build names the derivatives). Cache key moves from `sha1(size + mtime)` to the content hash the manifest already needs. `page.media.kb` gets a budget. Rule 20 stops warning about size and starts warning about *a picture wider than any column that will show it*. This is the v0.2 row from docs/06 with its reasons re-stated: it is 83 % of what a page loads, and it is the one speed item that is also a beauty item — a picture served at the size it is shown is a picture that is sharp.

### 3.3 Parse (not in this plan)

Parallel parse is the 4× lever on build speed and docs/11 §6 deferred it until `build.cold.1000` passes half its budget; it is at 14 %. The rule stands. Recorded so that the next person asking "why not build speed" finds the answer.

### 3.4 The words

The README badge reads `JavaScript on the page — 0 KB`. To the reader who thinks JavaScript is integral to the web — which is most of them — that is a vow of poverty, and it invites the argument this document opens with. Decision 240 replaces it with the outcome and keeps the mechanism as the second clause: **"the next page is already there — prerender hit 100 %, 0 KB JS by default"**, each half a bench row. `page.js.kb` keeps its gate; it leaves the headline.

---

## 4. Tokens — the number nobody was counting

### 4.1 The per-turn tax (T1)

`tokens.tools` is 2,239 and it is sent on every turn. A 30-turn session — the kill test's own length on every model — pays **≈ 67,000 tokens for the tool list alone**, which is four times what the whole surface returned across those 30 turns and thirteen times `tokens.learn`. Decision 38's deferral of the catalogue already saves 2,642 a turn (≈ 79,000 over 30 turns) and is, by that measure, worth more than every other token decision in the record combined — and there is no row that says so.

Two rows: **`tokens.turn`** = `tokens.tools` + the per-turn share of the handshake, and **`tokens.session.30`** = `tokens.turn × 30 + tokens.learn.floor`, the cost of a reference session, gated. With the row in place, the trims are ordinary work: `content.suggest_blocks` is 348 tokens of schema (the largest core tool; its `because[]`/`needs[]` shape can be a resource the description points at), `content.query` 235, `content.create` 246. A per-tool ceiling of ~180 brings the eleven under 2,000, or ≈ 7,000 a session back. The handshake's other 2,313 — `resources/list` at 38 entries — gets the same look: plugin `{p}/last` rows and `bench/latest` can be templates, not entries.

### 4.2 Learning the site, re-scoped (T2)

`tokens.learn` counts every primitive sheet because `bench/src/index.ts:740-741` calls that *"the conservative upper bound."* It is now 88 % of its gate and grew 15 % in one release; at that rate it has two releases left, and the next primitive breaches it — the exact argument that locked the vocabulary at thirteen (decision 41). But the metric penalises the disclosure the tree already does: decision 171 made the index name a primitive and the sheet its contract, read *before using a block*. A session that writes a post with a chart and a flow reads `spec/primitives` (588) + `chart` (439) + `flow` (475) = **1,502**, not 5,295.

So the gate splits, the way `tokens.tools` and `tokens.tools.full` already do: **`tokens.learn.floor`** = config + `spec` + the primitives index + `theme` (today 1,507; gate 2,500) is what every session pays; **`tokens.learn.full`** stays as the report row for the upper bound. `snypd://spec.json` gets a description that says what it costs. **This is the row that makes §5 affordable**: a new primitive costs the index one line (≈ 42 tokens; 588 ÷ 14) and the floor nothing else.

### 4.3 What a theme costs to write (T3)

One `build-theme` run is a 3,682-token prompt and three candidates of ≈ 7,600 tokens of CSS + ≈ 4,000 of YAML + a brief, then a shoot loop that reads PNGs, two fix rounds, a critique and a polish: **≈ 40,000 output tokens** before a person picks. No lane measures it. The factory's own `snypd shoot` knows every run; it can write `theme.authoring.tokens` beside the contact sheet. Not a gate — a theme is written rarely — but the number that says whether §6 worked: if chrome comes off a shelf and the seed writes more of the sheet, this row falls, and if it does not, §6 is decoration.

---

## 5. Ease — the agent picks by name

### 5.1 Aliases (V1, half a session, ships in 0.1.8)

An agent that has read the open web types `hero`. snypd's word is `cover`. The word is good — it is an editorial word, chosen — but it costs a resource read before the agent can use it, and "fastest way possible" is measured in reads. So the index says both: `cover (hero)`, `pullquote (quote)`, `tldr (summary)`, `callout (note)`, `logo-wall (logos)`, `stat-row (numbers)`. The parser accepts either; the `.md` twin is the source and keeps whatever the author wrote; lint says nothing, because an alias is not a mistake. The kill prompt already avoids naming tools so that the route is discovered; the write lane can carry a variant where the topic says "hero" and the check is whether a `cover` landed on the first attempt.

Same session: **the README says thirteen; the spec has fourteen.** `packages/bench/readme/primitives.ts:18` is a hard-coded list of thirteen names with `logo-wall` left out, under a header that says the spec is the source. One line, three copy edits (README:40, :50, :139; docs/05's Beauty table; docs/15 block 5). docs/25 found it and left it; it goes now.

### 5.2 The pages vocabulary (V2, two sessions)

docs/01's ~35 fell into five categories; the interaction-and-conversion category was cut nearly whole and nothing has been added for a page that persuades. Against the component list Sunny pointed at (26 names): five are already here (`callout`, `cta`, `faq`, `cover`, `entries`), six are chrome (§6), six need a server or storage (login, newsletter, cookie policy, e-commerce, checkbox, toggle) and are out for a static site by definition, not by taste. The rest, plus the three every marketing page wants that the list does not name, are content — a person reading the `.md` twin would recognise every one as a thing being said, not a place it is said — and they are the vocabulary a front page is short of:

| Block | What it is | Zero-JS form | Was in docs/01 |
|---|---|---|---|
| `features` | three to six things the product does, each a line and a sentence | a list with a role | no (nearest: the refused `hero-with-three-cards` — but this is the *content* of that, without the layout) |
| `pricing` | one to four tiers, each a name, a price, a list, a link | `<table>` semantics or a definition list | no |
| `testimonial` | a quotation, who said it, where they are from | `<figure><blockquote><figcaption>` | no (`pullquote` cites a *text*; this cites a *person*) |
| `team` | people, a name, a role, a picture | a list | as `author-card` |
| `gallery` | pictures, more than one, seen together | `scroll-snap` + `::scroll-marker` — docs/14 §5 wrote the answer down for the day it was asked | yes, cut to v0.2 |
| `comparison` | two or more things against the same rows | `<table>` with row and column headers | yes |
| `before-after` | two pictures of one thing | two figures and a `<details>` | yes |
| `banner` | one line the page wants read first, with an optional link | a `<p role="note">` | no |

Eight, and the vocabulary is **22**. Two are pure media (`gallery`, `before-after`) and want Z1's derivatives under them, so they land after Z1. Each ships as the spec requires — a sheet with schema, intent, anti-intent and fallback; a `detect/*.yaml` so `suggest_blocks` can propose it from prose (a table with a price column is a `pricing`; a blockquote with a name after it is a `testimonial`); a renderer in `base`; CSS in the three bundled themes; a still in each, judged on sight (decision 209 applied to a block, not a theme); and the `taste.*` probes run on the result.

**Where it lives, and what it costs at session start.** docs/06's open question was whether a pages vocabulary should be its own `spec-pages` so the post vocabulary stays small. Yes, as an index: `snypd://spec/pages` lists the eight and `snypd://spec/primitives` carries one line pointing at it. Cost to `tokens.learn.floor`: **one line**. `get-started` names it when the site has a `home: true` page; `snypd://spec/home` (the front-page recipe, decision 191) is rewritten to compose from it. A type may declare which vocabulary it draws on, so a `post` never sees `pricing` in a suggestion and a `page` does.

**The lock, and the rule that opens it.** docs/13 §5.4 locked the vocabulary; decision 185 added `logo-wall` as *"the spec minor that rule allows."* This is not a minor. It is the re-opening docs/13 §5.4 itself scheduled — *"one pass of Super Builder's 60-component list against docs/01's ~35 primitives: does anything we declined deserve revisiting?"* — done against a shorter list, with the answer written as a spec change rather than a note, because the reason for the lock (decision 41's budget) is answered by T2, and because two sites in this repository already had to route around it.

### 5.3 What ease does not get from this

`onboard.ttfv` at 13.93 s on a clean machine is not a vocabulary problem; it is L7's. `registry.claude-sonnet` at 10/12 is a prompt problem in docs/20's own twelve steps. Haiku's `unsourced-evidence` failures are the `stat` sheet not saying loudly enough that a number needs a source. Each is noted; none is this document's.

---

## 6. Beauty — chrome by name, and the sheet that stops being plumbing

### 6.1 The chrome shelf (V3, two sessions)

Four themes have rewritten the same masthead — brand link, nav, popover menu, motion control — in four `parts/header.tsx` files of 31–41 lines each, and studio's *sticky, blurred* is thirty lines of its own CSS. The shape a theme wants for its chrome is one of a handful, and a theme should say which:

```yaml
chrome:
  masthead: split          # brand-left | centred | split | stacked
  sticky: true
  footer: colophon         # one-line | columns | colophon
  entries: rows            # rows | grid | ledger
```

`base` ships every pattern as a part; the theme picks by name and paints it with tokens; a theme that wants something the shelf does not have overrides the part by file, exactly as today. The phone menu is already the platform's (`<ul popover>`, docs/14 §4.6), so every pattern is zero-JS by inheritance. The patterns are chosen the way a theme is — from a contact sheet, on sight (decision 209) — and `snypd shoot` gets a `--chrome` mode that shoots one page under each masthead so the pick is a picture.

This is not `patterns:`. docs/09 §4.5 deferred `patterns:` as *content compositions* — `launch-post: [cover, tldr, …]` — and called them "a `suggest_blocks` feature wearing theme clothing," which they were. Chrome is not a composition of blocks; it is the part of the page the author never writes. New key, so the deferred one keeps its reason.

`docs/01:62` said the author never says "grid." The *theme* may — `entries: grid` is a theme's word about its own list, and the content that lands in it is still `entries`.

### 6.2 The seed writes more of the sheet (rides with V3)

`snypd seed` stops at `:root` because everything below it was bespoke. Once the chrome is a shelf part, the masthead, footer and entry list are token-driven by construction, and the seed can emit the rules that read those tokens — the theme's own CSS shrinks to its *argument*: the type scale it chose, the one thing it does that no other theme does. T3's row says whether it worked. The factory prompt's steps 4–5 ("hand-write `theme.css` for each candidate") become "pick chrome; write what the shelf does not."

### 6.3 What beauty keeps

Everything in §2's Beauty row stays as it is. The eleven `taste.*` rules run on the eight new blocks and the four chrome patterns before either is on a shelf. The `## Taste` log in `DESIGN.md` stays the first thing a factory run reads. `taste.overused-font` keeps Inter off a stranger's theme. Nothing here adds a rule; it adds things for the rules to look at.

---

## 7. The plan — nine sessions from 7 Oct, and how they sit against the lists that exist

Two post-launch lists already exist and are ordered: docs/31 §7 (domain → Vercel parity → Desk deploys → GitHub Pages → the cloud) and docs/13 §5.1–5.5 (`publish.toLive` lane → three `check theme` rules → `migrate-from-notion` → the vocabulary pass → the shelf as a marketplace). docs/30 §6 adds catbook → knots → cloud, and §4 · 1–3 as one session (undated types, a facts strip, media credits). This plan does not reorder any of them; it names where each of its sessions goes between them.

| # | Session | Lands | Days | Sits against |
|---|---|---|---|---|
| — | **L7, the 0.1.7 publish, the factory sitting, the film's last beat** | as dated in docs/31 §5 | to 6 Oct | untouched |
| — | **docs/31 §7 · 1 — `site › domain`** | first, as recorded: the first thing a paying stranger asks for | 7–9 Oct | untouched |
| V1 | **Aliases, and fourteen** | `cover (hero)` and five more in the index and the parser; `primitives.ts:18` reads the spec; README, docs/05, docs/15 say fourteen | 9 Oct, ½ | ships in **0.1.8** with S39 |
| Z3 | **Hygiene on the real site** | rule 20's 10 MB gone; posters re-encoded; `fetchpriority` on the first eager image; `Link:` preload in `_headers`; `page.lcp` reported on the site | 10 Oct, ½ | pairs with docs/30 §4 · 3 media credits if that session is the same week |
| T1 | **The per-turn tax** | `tokens.turn`, `tokens.session.30` gated; core tools trimmed under ~180 each; `resources/list` thinned; `spec.json` described by its cost | 13–14 Oct | rides with docs/13 §5.1 (`publish.toLive`) — same bench session, same harness |
| Z2 | **The number that proves it** | `navSuite()`; `page.prerender.hit` gated at 1, `page.nav.ms`, `page.prefetch.kb`, `page.fcp`; the README badge and the first capability line say the outcome (decision 240) | 15–16 Oct | before Vercel parity, so the second host is measured by the same rows |
| T2 | **Learning, re-scoped** | `tokens.learn.floor` gated at 2,500, `.full` reported; the argument that locked the vocabulary is answered in a row | 17 Oct, ½ | must precede V2 |
| V2 | **The pages vocabulary** | six of the eight (`features`, `pricing`, `testimonial`, `team`, `comparison`, `banner`); `snypd://spec/pages`; detectors; stills; `spec/home` recomposed; snypd.rocks' front page rewritten from it through the MCP | 20–22 Oct | **is** docs/13 §5.4, done as a spec change; docs/31 §7 · 2 (Vercel) and · 3 (Desk deploys) follow it |
| Z1 | **The image pipeline** | `Bun.Image` derivatives, the manifest, `srcset`, AVIF, derived posters, content-hash cache key, `page.media.kb` budgeted; then `gallery` and `before-after` on top of it | 23–28 Oct | the docs/06 v0.2 row; the media-credits half of docs/30 §4 lands here if not at Z3 |
| V3 | **The chrome shelf** | `chrome:` in the schema, four mastheads / three footers / three entry lists in `base`, the four themes moved onto them, `shoot --chrome`; the seed emits the chrome rules; `build-theme` steps 4–5 rewritten | 29–31 Oct | before docs/13 §5.5 (the marketplace), so a stranger's theme picks chrome rather than writing it |
| T3 | **What a theme costs** | `theme.authoring.tokens` written by `shoot`; one factory run measured before and after V3 | 3 Nov, ½ | the proof of §6 |
| | **0.2.0** | | **~4 Nov** | |

**Where the value is.** Z2 + Z3 are the headline made honest in two days. T1 is the largest token number in the system, found and gated. V1 is a morning. V2 is what "build amazing UI in the fastest way possible" actually needs. Z1 is 83 % of the bytes. V3 is where beauty and tokens meet. T2 and T3 are the rows that make the others assertable.

**What this displaces.** Nothing dated. GitHub Pages and the cloud keep their places at the end of docs/31 §7. `migrate-from-notion` keeps Sunny's deferred call. Catbook and knots keep docs/30's order. The parallel-parse spike keeps docs/11 §6's trigger.

---

## 8. Decisions asked

- **240. The headline is the outcome, and the mechanism is its second clause.** The README badge, the first line of *What you get*, and snypd.rocks' capability band say *the next page is already there* — `page.prerender.hit` — with *0 KB JS by default* after it. `page.js.kb` keeps its gate at 0 and `bench.budgets.jsKb` stays the site's number to raise (decision 84). What changes is the sentence a stranger reads first. Recommendation: yes.
- **241. Speed is measured where the reader is: a second navigation, gated.** `page.prerender.hit` at 1 and `page.prefetch.kb` reported, in a lane that keeps the cache and reuses the target, beside the first-load lane that does neither. Recommendation: yes.
- **242. Pictures get a pipeline, and the source is never touched.** `Bun.Image` derivatives behind a content-hashed manifest, `srcset` and AVIF from `figure`, `cover` and posters, `page.media.kb` budgeted. The `.md` twin names the original; the build names the rest. Recommendation: yes — the docs/06 row, with 83 % as its reason.
- **243. A session's token cost is a per-turn number times a reference length.** `tokens.turn` and `tokens.session.30`, gated; every core tool under a ceiling; the largest single number in the system gets a row before anything else is trimmed. Recommendation: yes.
- **244. `tokens.learn` splits into a floor and a full.** The floor (index + config + `spec` + `theme`) is what a session pays and is gated at 2,500; the full is the upper bound and is reported. A new primitive costs the floor one line. Amends decision 41's reasoning without touching its numbers. Recommendation: yes.
- **245. The vocabulary re-opens at 22, in two indexes.** Eight page blocks in `snypd://spec/pages`, pointed at by one line in `snypd://spec/primitives`; a type declares which index it draws from. docs/13 §5.4's pass, done as a spec change. Recommendation: yes; the alternative is a third site-local theme by December.
- **246. Aliases are read, never written.** `cover (hero)` and five more; the parser accepts both, the twin keeps the author's word, lint is silent. Ships in 0.1.8. Recommendation: yes.
- **247. Chrome is chosen by name, under its own key.** `chrome:` in `theme.yaml`, patterns shipped by `base` as parts, picked from a contact sheet; `patterns:` keeps docs/09 §4.5's deferral and its reason. Recommendation: yes.
- **248. Writing a theme is a measured lane.** `theme.authoring.tokens`, reported, written by `shoot`. Recommendation: yes — it is the only way §6 can be shown to have worked.

---

## 9. What would make this wrong, and what this document does not do

- **If `--disable-background-networking` cannot be dropped without breaking the first-load lane's isolation**, Z2 measures prerender in a second browser launch, which costs a second and changes nothing else. `Preload.prerenderStatusUpdated` will say, on the first run, whether the speculation ran at all.
- **If eight blocks in a second index cost a live model a step** — if `registry`'s 10/12 becomes the pages recipe's 6/8 — then the index is not enough and `spec/home` must carry the eight inline for a `home: true` page. The write lane with a "landing page" topic is the test, and it runs before V2 is called done.
- **If the seed cannot emit the chrome rules without the sheets growing back**, T3's row will say so, and V3 is still worth it for the four headers alone.
- **This document does not touch the launch.** L7, the publish, the sitting and the film are docs/31's and keep their days. It does not reorder docs/31 §7 or docs/13 §5. It does not propose search, a reader theme toggle, or any block that needs a server; those are out by definition, and docs/11 §10 question 7 (the toggle, as a decision) is still Sunny's. It does not compare snypd to v0, Lovable or Bolt — no document in the record does, and that gap is named here for the launch post rather than closed.
