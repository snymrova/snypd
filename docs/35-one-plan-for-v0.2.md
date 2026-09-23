# 35 — One plan for v0.2: three documents, one order, the things they each meant to build once

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 23 Sep 2026 · **Launch:** Tue 6 Oct 2026 — unchanged by this document
**Asked for:** *"please go through the 33 32 and 34 docs and create a combined implementation plan."*
**Combines:** docs/32 (the way forward — Z1–Z3, T1–T3, V1–V3; decisions 240–248), docs/33 (the backdrop — G1–G3; 249–253), docs/34 (themes by combination — K1–K5; 254–259).
**Scope:** one dated order for the nineteen sessions the three documents propose; the places where they contradict each other and how each is resolved; the pieces two or three of them each planned to build, named once with one owner; the checkpoints where a number decides what comes next; the two release cuts. No new capability is proposed here. Decisions numbered from **260** (docs/34 claims 254–259).
**Status:** proposed. Nothing before 6 Oct: L7, the 0.1.7 publish, the factory sitting and the film keep docs/31's days.

---

## 1. The plan, in one paragraph

Two weeks of honest numbers first — aliases, hygiene, the per-turn tax, the prerender row, the learn floor, and a baseline of what a theme costs to write. Then the genome search on the genes that already exist, because the baseline will say the factory's cost is CSS and the search is the cheapest cut. Then the pages vocabulary and the image pipeline, and **0.2.0 on ~4 Nov** — the date docs/32 gave, kept. Then the look: the chrome shelf, the backdrop, both folded into the genome, the factory rewritten to run on it, and the theme-cost row re-measured — **0.2.1 on ~20 Nov**. Thirty-one and a half working days from 7 Oct, one engineer, in order.

## 2. Where the three documents disagree, and the resolution

| # | The conflict | Where | Resolution |
|---|---|---|---|
| C1 | docs/34 §1 *assumes T3 runs before anything in it is built*; decision 259(a) puts K1–K3 on ~20 Oct; docs/32 dates T3 on 3 Nov, after V3. All three cannot hold. | 34 §1, 34 §7·259, 32 §7 | **T3 splits** (decision 260). **T3a** — the `theme.authoring.tokens` row and one baseline run of today's factory — lands 12 Oct, before K1. **T3b** — the re-measure — lands last, after K5, and is the proof for V3 *and* K. |
| C2 | docs/33 §5 puts G after V3 and *beside* Z1, with G3 writing Z1's encoder "first"; docs/32 dates Z1 (23–28 Oct) before V3 (29–31 Oct). G3 cannot be after V3 and before Z1. | 33 §3.4, §5, 252; 32 §7 | **Z1 owns the encoder** (decision 261). `Bun.Image` resize + AVIF/WebP is written once, for every picture, in Z1; G3 is its second caller. G keeps docs/33's place after V3. Decision 252's substance — *Chrome draws, Bun encodes* — is unchanged; only "first used here" moves. |
| C3 | A clip with no poster: docs/32 Z1 *derives one from the clip*; docs/33 G3 *draws one from the backdrop and the title*. Both claim the same empty slot. | 32 §3.2, 33 §3.4·2 | **The clip's own frame first; the backdrop card is a theme setting** (decision 265). A poster that shows the clip is the truthful preview; `poster: backdrop` in `theme.yaml` opts in. Frame extraction goes through Chrome (`Bun.Image` does not decode video), on the `cards.ts` path — so Z1 needs Chrome for this one derivative and ships without a derived poster on a machine that lacks it. |
| C4 | Two menu resources for one tool: `snypd://theme/backdrops` (253) and `snypd://theme/genes` (256). By G2's date the genes resource already exists. | 33 §3.5, 34 §3.5 | **One resource** (decision 262). G2 adds the six types as the `backdrop` section of `snypd://theme/genes`; `theme/backdrops` is never created. One read, one gated row. |
| C5 | Three contact-sheet modes: `shoot --chrome` (V3), `shoot --backdrop` (G2), `explore { shoot: true }` with one composite (K3). | 32 §6.1, 33 §3.5, 34 §3.1 | **One composite mode, three axes** (decision 263). K3 builds `shoot --sheet <axis>`: N candidates × one route × 390/1280 × light/dark → one PNG in context, `contact.html` to the person. V3 adds `chrome`, G2 adds `backdrop`, K3 itself uses `genome`. |
| C6 | A content-hash cache is planned three times: Z1's `.snypd/media.json` manifest + new cache key, G3's `bun:sqlite` cache of backdrop bytes, K3's genome-hash cache. | 32 §3.2, 33 §3.4, 34 §6 | **One artefact cache** over the build's existing `bun:sqlite` index, `Bun.hash` keyed, built in K3 (first to need it). Z1 stores derivative bytes in it and keeps `media.json` as the human-readable manifest; G3 stores the SVG and rasters in it. |
| C7 | docs/32 ships V3 in 0.2.0 on ~4 Nov. Inserting K1–K3 (5 days, decision 259a) before V2 moves V3 to ~9 Nov. | 32 §7, 34 §6 | **0.2.0 keeps its date and loses the chrome** (decision 264). 0.2.0 = speed, tokens, vocabulary, pictures, genome search. 0.2.1 = the look: V3, G1–G3, K4–K5, T3b. |
| C8 | `snypd seed` is extended three ways: V3 (*the seed emits the chrome rules*), G2 (`--backdrop=silk`), K1 (the genome expresses over `expandSeed`). | 32 §6.2, 33 §3.5, 34 §2 | **Seed becomes compose-without-search.** K1's `express(genome)` is the one code path; `snypd seed` parses its flags into a genome and calls it. V3 and G2 add genes, not seed flags. No flag is removed — `seed` keeps its CLI shape. |

Two smaller notes. docs/32 dated Z3 and T2 on Saturdays (10 and 17 Oct); the dates below are working days. And docs/32 §7 says Vercel parity and Desk deploys (docs/31 §7 · 2–3) *follow* V2 without giving them days; they are not in this plan's count — each one inserted after V2 moves everything after it by its length, and 0.2.0 with it.

## 3. Built once, owned once

What more than one session needs, the session that builds it, and who else calls it:

| Piece | Built in | Used by |
|---|---|---|
| `theme` tool action dispatch, under `find_tools` (none in `tools/list`) | K1 (`compose`) | K2 `explore`, K3 `vary`/`cross`, G2 `backdrop` |
| `snypd://theme/genes`, generated from the registries | K2 | G2 (backdrop section), K4 (chrome section) |
| `shoot --sheet <axis>` composite | K3 | V3 `chrome`, G2 `backdrop`, K5 the factory |
| Artefact cache (`bun:sqlite`, `Bun.hash`) | K3 | Z1 derivatives, G3 backdrop bytes |
| `Bun.Image` encoder + resizer | Z1 | G3 card + poster, V2's `gallery` and `before-after` |
| `express(genome)` over `expandSeed` + shelf | K1 | `snypd seed`, V3 chrome genes, G2 backdrop gene, K4 |
| `page.lcp` reported on the *site* | Z3 | Z1 (poster win), G3 (grain on/off) |
| Token rows: `tokens.turn`, `tokens.session.30` (T1); `tokens.learn.floor` (T2); `theme.authoring.tokens` (T3a) | T1–T3a | every later session asserts it added nothing to `tokens.learn.floor` |

## 4. The order

Working days from Wed 7 Oct. ½ = half a day. *Doc* is where the session is specified — this plan does not re-specify it.

### Phase 0 — launch (to Tue 6 Oct)
Untouched: L7 rampscan, 0.1.7 on npm, the factory proof sitting, the film's last beat (docs/31 §5).

### Phase A — honest numbers (7–19 Oct)

| When | # | Session | Doc | Lands |
|---|---|---|---|---|
| 7 Oct – 9 Oct am | — | `site › domain` | 31 §7·1 | as recorded; first thing a paying stranger asks for |
| 9 Oct pm | **V1** | Aliases, and fourteen | 32 §5.1 | `cover (hero)` + five; `primitives.ts:18` reads the spec; README/docs/05/docs/15 say fourteen. **0.1.8** with S39 |
| 12 Oct am | **Z3** | Hygiene on the real site | 32 §3.2 | rule 20's 10 MB gone; posters re-encoded; `fetchpriority`; `Link:` preload; `page.lcp` on the site |
| 12 Oct pm | **T3a** | What a theme costs — the baseline | 32 §4.3, this §2 C1 | `theme.authoring.tokens` written by `shoot`; one run of today's `build-theme`, split into *CSS written* vs *pictures read* |
| 13–14 Oct | **T1** | The per-turn tax | 32 §4.1 | `tokens.turn`, `tokens.session.30` gated; core tools ≤ ~180; `resources/list` thinned. Rides with docs/13 §5.1 |
| 15–16 Oct | **Z2** | The number that proves it | 32 §3.1 | `navSuite()`; `page.prerender.hit` gated at 1; `nav.ms`, `prefetch.kb`, `fcp`; README headline (240) |
| 19 Oct am | **T2** | Learning, re-scoped | 32 §4.2 | `tokens.learn.floor` gated at 2,500; `.full` reported |

**Checkpoint A (19 Oct pm).** Read T3a. If the factory's tokens are mostly *pictures read*, not *CSS written*, docs/34 §8's first clause fires: K3's composite sheet moves to the front of Phase B and K1–K2 follow it. Otherwise Phase B runs as written. Also read Z2's first `Preload.prerenderStatusUpdated`: if speculation never ran, Z2 reopens before anything else (docs/32 §9).

### Phase B — the genome, on the genes that exist (19 Oct pm – 26 Oct am)

| When | # | Session | Doc | Lands |
|---|---|---|---|---|
| 19 pm – 20 Oct | **K1** | The genome | 34 §2, §3.4 | `core/src/genome.ts` parse/format/hash/express; `compose`; `## Genome` in DESIGN.md; property test; `seed` routed through `express` (C8) |
| 21–22 Oct | **K2** | The search | 34 §3.1, §3.5 | `core/src/explore.ts`; `explore`; `snypd://theme/genes`; `tokens.theme.explore` ≤ 600, `tokens.theme.genes` ≤ 1,200 gated |
| 23 Oct – 26 Oct am | **K3** | Vary, cross, one picture | 34 §3.2–3.3 | `vary`, `cross`; `shoot --sheet genome` (C5); the artefact cache (C6) |

**Checkpoint B (after K2).** First `explore` sheet, judged by Sunny on sight. If the six look like one theme six times, the spread vector is missing a gene the eye cares about — find it before `vary` ships (docs/34 §8).

### Phase C — what a page says, and what it weighs (26 Oct pm – 4 Nov am)

| When | # | Session | Doc | Lands |
|---|---|---|---|---|
| 26 Oct pm – 29 Oct am | **V2** | The pages vocabulary | 32 §5.2 | six blocks (`features pricing testimonial team comparison banner`); `snypd://spec/pages`; detectors; stills; `spec/home` recomposed; snypd.rocks' front page rewritten through the MCP |
| 29 Oct pm – 4 Nov am | **Z1** | The image pipeline | 32 §3.2 | `Bun.Image` encoder (C2); manifest + artefact cache; `srcset`/AVIF from `figure`, `cover`, posters; clip-frame posters (C3); `page.media.kb` budgeted; then `gallery`, `before-after` → vocabulary at 22 |

**Checkpoint C (inside V2).** The write lane with a "landing page" topic, before V2 is called done. If a live model misses steps the way `registry` does (10/12), `spec/home` carries the eight inline for a `home: true` page (docs/32 §9).

**0.2.0 — Wed 4 Nov.** Zero-loading proved, per-turn tokens gated, 22 blocks, pictures that are the size they are shown, and the theme search on colour, scale, face and chain.

### Phase D — the look (4 Nov pm – 19 Nov)

| When | # | Session | Doc | Lands |
|---|---|---|---|---|
| 4 Nov pm – 9 Nov am | **V3** | The chrome shelf | 32 §6.1–6.2 | `chrome:` in the schema; 4 mastheads / 3 footers / 3 entry lists in `base`; four themes moved on; `shoot --sheet chrome`; chrome rules from `express` |
| 9 Nov pm – 11 Nov am | **G1** | The drawing | 33 §3.2–3.3 | `svg.ts` gains `defs/gradient/filter/turbulence`; `viz/src/backdrop.ts`, six types, mulberry32; `backdrop` budget line; same-record-same-bytes test |
| 11 Nov pm – 13 Nov am | **G2** | The declaration | 33 §3.1, §3.5 | `backdrop:` in `theme.yaml`; artefact + `--backdrop*` tokens; two contrast pairs; `theme › backdrop`; backdrop section of `theme/genes` (C4); `shoot --sheet backdrop`; studio's scrim moved on |
| 13 Nov pm – 16 Nov | **G3** | The raster | 33 §3.4 | OG card over the backdrop; `poster: backdrop` setting (C3); Z1's encoder; artefact cache; `page.lcp` before/after grain |
| 17 Nov | **K4** | Chrome and backdrop join | 34 §6 | masthead/sticky/footer/entries/backdrop are genes; spread vector gains them |
| 18 Nov | **K5** | The factory runs on it | 34 §3, §6 | `build-theme`: brief → `explore` → one picture → `vary`/`cross` → `compose` → `check` → contact sheet |
| 19 Nov am | **T3b** | What a theme costs — after | 32 §4.3 | one factory run through K5, against T3a's baseline; target ≤ 20 % of it (docs/34 §5); then gated |

**Checkpoint D1 (after G2).** Sunny looks at the six-type sheet. Same look six times → four types. `air` reads as the rut → `air` goes, with a line in `## Taste` (docs/33 §7).
**Checkpoint D2 (G3).** Grain moves site `page.lcp` by more than Z1's poster saved → grain ships at 0 and the row says why.
**Checkpoint D3 (T3b).** No fall against T3a → the seed is not writing enough of the sheet (docs/32 §9); `bold` over 100 lines in the first three composed themes → the shelves are thin and the next work is parts, not tools (docs/34 §8).

**0.2.1 — Fri 20 Nov.** Chrome by name, a backdrop from the palette, and a factory that picks from a table.

### The count

| Phase | Sessions | Days |
|---|---|---|
| A | domain, V1, Z3, T3a, T1, Z2, T2 | 8½ |
| B | K1, K2, K3 | 5 |
| C | V2, Z1 | 7 |
| D | V3, G1, G2, G3, K4, K5, T3b | 11 |
| | | **31½** |

## 5. What each release proves, as rows

| Row | Gate | Lands | Release |
|---|---|---|---|
| `page.prerender.hit` | 1 | Z2 | 0.2.0 |
| `tokens.session.30` | set at T1 from the measured value | T1 | 0.2.0 |
| `tokens.learn.floor` | 2,500 | T2 | 0.2.0 — every later session holds it flat |
| `tokens.theme.explore` / `.genes` | 600 / 1,200 | K2 | 0.2.0 |
| `page.media.kb` | set at Z1 | Z1 | 0.2.0 |
| `backdrop.renderMs` / `.svgKb` | 3 / 8 | G1 | 0.2.1 |
| `theme.authoring.tokens` | report at T3a; ≤ 20 % of it gated at T3b | T3a, T3b | 0.2.1 |

## 6. Decisions asked

The twenty from the three documents, unchanged, answered together — the recommendation in each is its own document's:

| Range | Document | Recommendation |
|---|---|---|
| 240–248 | docs/32 | yes to all nine |
| 249–253 | docs/33 | yes to all five, with 252 and 253 as amended by 261 and 262 |
| 254–258 | docs/34 | yes to all five |
| 259 | docs/34 | **(a)** — K1–K3 before V2, in 0.2.0; this plan is written on it |

And six that only exist because the three were read together:

- **260. T3 splits into a baseline and a proof.** T3a (12 Oct) writes the row and measures today's factory; T3b (19 Nov) measures the factory on K5. Resolves C1. Recommendation: yes — without T3a, docs/34 has no "before" and Checkpoint A has nothing to read.
- **261. Z1 writes the encoder; G3 is its second caller.** Amends 252's "first used here, then by Z1." Resolves C2. Recommendation: yes.
- **262. One menu: `snypd://theme/genes`, with backdrops as a section.** Amends 253: no `snypd://theme/backdrops`. Resolves C4. Recommendation: yes — one read, one row.
- **263. One composite sheet: `shoot --sheet <axis>`.** Built in K3; `chrome` and `backdrop` are axes, not modes. Resolves C5. Recommendation: yes.
- **264. 0.2.0 on 4 Nov without chrome; 0.2.1 on 20 Nov with the look.** Resolves C7. The alternative is V3 in 0.2.0 and the release on ~10 Nov. Recommendation: the split — the speed and token rows are what the launch post will be asked about, and they should not wait on the shelf.
- **265. A clip's poster is its own frame; the backdrop card is a setting.** Resolves C3. Recommendation: yes.

## 7. What this document does not do

It adds no session, no block, no gene and no row that one of docs/32–34 did not already propose. It does not touch the launch or reorder docs/31 §7, docs/13 §5 or docs/30 §6 — Vercel parity, Desk deploys, catbook and knots slot in where those documents put them, and each one moves the dates after it. It keeps docs/11 §6's trigger on parallel parse. Measurements are read from CI, not this box (the fsync and load-average note in the record); every "set at" gate above takes its number from CI's first run of the row.
