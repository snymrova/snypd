# 34 — Themes by combination: a genome, a search, and an agent that reads numbers instead of stylesheets

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 23 Sep 2026
**Asked for:** *"so can we have such nav primitives in the themefactory so that it can produce themes"* — then *"snypd theme can be an mcp or a different flow to create themes by combining existing components like lego"* — then *"we have to have a deep tool to generate themes using different permutation and combination by agent with token efficiency perspective."*
**Reads with:** docs/29 (the factory, as built), docs/32 §6 (the chrome shelf, V3; T3 `theme.authoring.tokens`), docs/33 (the backdrop, G1–G2), docs/28 (why a factory at all).
**Scope:** what a theme is once the parts are on shelves; one tool that searches the space of those parts on the server and hands the agent a short table instead of a stylesheet; what it costs in tokens and how that is gated; the sessions, and which of them need nothing that is not already built. Decisions numbered from **254** (docs/33 claims 249–253).
**Status:** proposed. Nothing before 6 Oct.

---

## 1. Where a factory run's tokens go today

docs/29's factory is a good process spent on the wrong work. Of its nine steps, the one that costs is step 5 — *"the agent writes each theme.css"* — three times, then again in each fix round.

| Theme | `theme.css` | At ~4 bytes a token (unmeasured) |
|---|---|---|
| base | 8.2 KB | ~2,000 |
| technical | 22.1 KB | ~5,500 |
| editorial | 26.3 KB | ~6,600 |
| folio (snypd.rocks) | 33.3 KB | ~8,300 |
| studio | 42.3 KB | ~10,600 |

Three candidates, one fix round: somewhere between **15k and 60k output tokens** of CSS a run, most of it restating a masthead, a footer and an entry list that four themes have already written (docs/32 §6.1). Output tokens are the expensive ones, and they are the slow ones. The contact sheet's pictures are the other half: docs/29 §3 already cut 216 shots to a handful of composite images for exactly this reason.

The rows that would prove this do not exist yet — T3's `theme.authoring.tokens` (decision 248) is the first. This document assumes T3 runs *before* anything here is built, so the "before" is a number and not this table.

## 2. The genome — a theme is one record

Once chrome and backdrop are on shelves, every choice a theme makes that is not its one bold move is a pick from a finite list or a number in a range. Write them down together and a theme is a record of about a dozen genes:

| Gene | Values | Source | Status |
|---|---|---|---|
| `hue`, `chroma` | 0–360, 0–0.2 (the seed colour) | `core/src/seed.ts` › `expandSeed` | built |
| `strategy` | restrained · balanced · expressive | seed | built |
| `scheme` | both · light · dark | seed | built |
| `ratio` | phone:desktop, e.g. 1.2:1.25 | seed | built |
| `base` | phone:desktop px, e.g. 17:19 | seed | built |
| `face` | 16 on the shelf — 10 text, 6 display — each with its `pairsWith` stack | `@snypd/shelf` | built |
| `extends` | base · editorial · technical · studio | theme chain | built |
| `masthead` | brand-left · centred · split · stacked | V3 | docs/32, proposed |
| `sticky` | yes · no | V3 | proposed |
| `footer` | one-line · columns · colophon | V3 | proposed |
| `entries` | rows · grid · ledger | V3 | proposed |
| `backdrop` | none · wash · paper · air · silk · bars · mist (+ grain 0–20) | G1–G2 | docs/33, proposed |

It has a canonical one-line form — the thing an agent reads and writes — and a hash, which is its id:

```
g1 h250 c.12 restrained both 1.2:1.25 17:19 ibm-plex-serif ^editorial | split sticky colophon ledger | paper/6
→ id 7f3a2c
```

About **35 tokens**. The same line always expands to the same bytes (property-tested, as the seed already is), so a genome is also a cache key and a reproducible theme: re-running it next month with the same shelf gives the same theme.

**The size of the space.** With hue binned to twelve and the scale to a handful of steps, the axes that are built today give roughly 12 × 3 × 3 × 4 × 3 × 16 ≈ **20,000** themes. With V3's chrome (72 combinations) and docs/33's backdrops (7), about **10 million**. No agent should be picking from that by reading. That is the point of §3.

## 3. The tool — `theme › explore`, and three verbs around it

Not a new MCP server: docs/32 §4 found the tool list is the largest per-turn cost in the system, and a second server pays it again every turn. These are actions on the `theme` tool that exists (`packages/mcp/src/catalog.ts:45`), found through `find_tools` like the rest of it, and one resource read on demand. Zero tokens at session start (the same principle as decision 253).

### 3.1 `explore` — the search runs on the server

```jsonc
theme { action: "explore", n: 6,
  lock:   { scheme: "both", extends: "editorial" },
  prefer: { face: "serif", strategy: ["restrained", "balanced"], hue: "200-280" },
  avoid:  { masthead: "centred" } }
```

What happens, all server-side, none of it in the agent's context:

1. **Sample** a few hundred genomes inside `lock`, weighted by `prefer`, excluding `avoid`.
2. **Express** each: `expandSeed` is pure and fast (the solver already runs thousands of contrast checks per call); chrome and backdrop are token-painted parts, so a candidate's CSS is generated, never written.
3. **Gate** each on what can be known without a browser: the contrast pairs (passed by construction), `font.*`, and `staticTaste` (`packages/render/src/taste.ts:98`) — flat hierarchy, measure, tiny text, overused font, untinted neutral. A candidate that fails is dropped, not reported.
4. **Spread**: pick `n` by farthest-point sampling over a feature vector — hue, background lightness, chroma strategy, face category, scale ratio, masthead, entries, backdrop. This is docs/29's anti-sibling check made arithmetic: two candidates that differ only in hue by 10° are never both returned.
5. **Answer** with a table:

```
id      genome                                                        spread  body/h2  measure
7f3a2c  h250 c.12 restrained · ibm-plex-serif · 1.2:1.25 · split/ledger   .81   19/35    64ch
b91e04  h145 c.16 expressive · young-serif · 1.25:1.33 · stacked/rows     .77   20/42    61ch
…
```

Target: **≤ 80 tokens a row, ≤ 600 for six.** Against §1's 15k–60k, the agent now spends its tokens on choosing, not on typing.

With `shoot: true`, the survivors are rendered once through the existing `shoot` (`packages/bench/src/shoot.ts`) and the answer carries **one** composite image — every candidate, one route, 390 and 1280, light and dark — while the full `contact.html` goes to the person as today. One picture in context, not a sheet per candidate.

### 3.2 `vary` — neighbours of a pick

```jsonc
theme { action: "vary", id: "7f3a2c", genes: ["face", "masthead"], n: 4 }
```

Candidates that differ from the pick in only the named genes. This is the fix round of docs/29 step 7 without a stylesheet in it: "the heading feels light" is `vary face`, not a CSS diff.

### 3.3 `cross` — two picks, one child

```jsonc
theme { action: "cross", ids: ["7f3a2c", "b91e04"], take: { palette: "b91e04" } }
```

The owner's most common note on a contact sheet is *"A's type with B's colour."* Today that is a rewrite. Here it is a line.

### 3.4 `compose` — adopt one

```jsonc
theme { action: "compose", id: "7f3a2c", name: "marginalia", bold: "…" }
```

Writes `themes/marginalia/` from the genome: `theme.yaml` with the tokens and the chrome picks, the generated stylesheet, the font with its licence (the shelf's `installFace`, as `seed` does now), and the genome under `## Genome` in `DESIGN.md` — the pattern `## Seed` already follows, because `theme.yaml` is `.strict()`. `bold` is optional: the one move a theme makes that no other does (docs/29's "boldness" row), and the only CSS the agent ever writes — tens of lines, not thousands. `compose` also accepts a genome line directly, so a person can paste one.

### 3.5 `snypd://theme/genes` — the menu, read when needed

Every gene, its values, its default and one line of what it does to a page, generated from the same registries the tool reads (seed, shelf, the chrome parts, the backdrop types), so it cannot drift. Roughly **1,000 tokens**, read once by a session that is making a theme and never by one that is writing a post. `snypd://theme` gains one line pointing at it.

## 4. The rut, and why a search does not make it worse

The risk of any combination tool is ten million themes that are the same theme. Four things hold against it:

- **Spread is a number, reported.** Every `explore` row carries its distance from the others; a table whose spread is low says so.
- **`DESIGN.md ## Taste` becomes `avoid`.** The owner's log of what the site refuses on sight (the gradient blob, all-caps chrome, Inter) is read as default exclusions, so the search never returns what the owner has already said no to.
- **The bold move stays a hand.** `compose`'s `bold` is where a theme gets the one thing no genome has. The tool makes the other 95 % cheap so that the 5 % can have the attention.
- **The shelf grows, the tool does not.** If the contact sheets start to look alike, the answer is a fifth masthead or a seventeenth face — a part added to a shelf, which `explore` picks up with no change.

## 5. What it costs, gated

| Row | Budget | Gate or report |
|---|---|---|
| `tokens.theme.explore` — one call, n = 6, no image | ≤ 600 | gated |
| `tokens.theme.genes` — the resource | ≤ 1,200 | gated |
| `theme.authoring.tokens` — a whole `build-theme` run through the tool | T3's number before, measured after; target ≤ 20 % of it | reported, then gated at T3's second run |
| `theme.explore.ms` — n = 6, no shoot | ≤ 2 s on CI | reported |
| `tokens.learn.floor` (decision 244) | unchanged | gated — the tool must add nothing to session start |

## 6. Sessions — and half of it needs nothing new

The genes that are built today (colour, strategy, scheme, scale, face, extends) are already enough for a useful search. So the work splits: K1–K3 can land before V3; K4 folds chrome and backdrop in when they exist.

| # | Session | Lands | Days | Needs |
|---|---|---|---|---|
| K1 | **The genome** | `core/src/genome.ts`: parse, format, hash, express (over `expandSeed` + shelf); `compose` action; `## Genome` in DESIGN.md; property test that one line draws one set of bytes | 1½ | nothing new |
| K2 | **The search** | `core/src/explore.ts`: sampler, static gate, farthest-point spread; `explore` action; `snypd://theme/genes`; `tokens.theme.explore` gated | 2 | K1 |
| K3 | **Vary, cross, one picture** | `vary`, `cross`; `explore { shoot }` through `shoot.ts` with one composite; genome-hash cache in `bun:sqlite` | 1½ | K2 |
| K4 | **Chrome and backdrop join** | masthead/sticky/footer/entries and backdrop become genes; the spread vector gains them | 1 | V3, G2 |
| K5 | **The factory runs on it** | `build-theme` prompt rewritten: brief → `explore` → one picture → `vary`/`cross` → `compose` → `check` → contact sheet; T3 re-measured | 1 | K3 (K4 for the full space) |

Against docs/32 §7: K1–K3 fit after T2 (17 Oct) and before V2, or after T3 (3 Nov) if the pages vocabulary should not move. The first keeps the factory cheap while V3 is being built; the second keeps 0.2.0 at ~4 Nov and puts this in 0.2.1. That is Sunny's call (decision 259).

## 7. Decisions asked

- **254. A theme is a genome plus one bold move.** Every choice that is a pick from a shelf or a number in a range is a gene; the genome has a canonical line and a hash; the only hand-written CSS is `bold`. Recommendation: yes.
- **255. The search runs on the server; the agent reads a table.** `explore` samples, expresses, gates and spreads without putting a stylesheet in context; ≤ 600 tokens for six. Recommendation: yes — it is the whole point.
- **256. Actions on `theme`, not a new server.** `explore`, `vary`, `cross`, `compose`, found through `find_tools`; `snypd://theme/genes` read on demand. Recommendation: yes.
- **257. Spread is measured, not hoped for.** Farthest-point over a stated feature vector, reported on every row; `DESIGN.md ## Taste` read as default `avoid`. Recommendation: yes.
- **258. A genome is reproducible.** Same line, same shelf → same bytes, property-tested; written under `## Genome` so a theme can be re-derived or crossed later. Recommendation: yes.
- **259. When.** (a) K1–K3 between T2 and V2, in 0.2.0; or (b) after T3, in 0.2.1. Recommendation: (a) — the factory proof sitting will have shown what a run costs, and the cheapest fix for that number is this.

## 8. What would make this wrong

If T3 shows a factory run's tokens are mostly reading pictures and not writing CSS, §1's premise is wrong and the win is K3's one-picture shoot, not the genome. If `explore`'s six look like one theme six times on the first contact sheet, the spread vector is missing a gene that matters to the eye, and the fix is to find it before shipping `vary`. If `bold` grows past a hundred lines in the first three themes made this way, the shelves are too thin and V3 comes first. And if Sunny looks at a composed theme and sees a template, the genome is right and the shelf is not — the answer is better parts, not a return to hand-written sheets.
