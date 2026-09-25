# 37 · A whole site from pieces — beautiful bricks, and an agent that knows how to lay them

**Asked, 25 Sep 2026:** *"completely focus on creating a whole website using pieces, and focus just on building beautiful pieces and giving access to agents with proper context. create a way ahead plan."*

This replaces the order of docs/36 §7 from P3's end onward. docs/36's machinery stands — the contract (P1), the shelf and `pieces:` (P2), the eyes (E1), the carve and its proof (P3). What changes is what comes next: **the shelf grows until a whole site can be dressed from it and look good, and the agent's path to it is rebuilt around that**, before the genome, `explore`, `vary` and `cross` (docs/36 P4–P6), which are search over a shelf and are worth only as much as the shelf.

---

## 1. Where it stands — measured on 25 Sep

**The trial.** Two agents, one brief (*"Ferrule, re-dressed as an architect's studio notebook: calm, paper-toned, a serif display face, reading first"*), two copies of Ferrule (`examples/studio`), each driving `snypd serve` over stdio.

| | A — the `build-theme` prompt, CSS by hand | B — pieces |
|---|---|---|
| Tokens | 172k | 127k |
| Tool calls · time | 48 · 16.8 min | 38 · 5.7 min |
| `theme.css` | 12.3 KB | 1.9 KB |
| Images looked at · fix rounds | 9 · 5 | 5 · 2 |
| On sight | **the better page** — a display serif for titles, figures and numerals; photographs breaking out wider than the text; a centred column; dated rows | correct and calm, and flat: one narrow column set left on the front page with a third of a 1280 screen empty; headings the body face a size up; photographs at column width; a plain list |

B is a quarter cheaper and three times faster and loses on sight, and every reason it loses is **a hole in the shelf, not a flaw in assembling**:

1. **One front page.** `home` has one piece, `bands` — the loud agency look the brief was running from. B fell back to `base`'s stream, a single column.
2. **No page for a site's own type.** Ferrule's case studies (`work`, 6 of them) render through `post` on any theme but studio. The facts strip (client, year, service) is gone in both A and B. docs/36 §2 ruled these out of the shelf ("they answer a content model, not a look"); the trial says a whole site cannot be dressed without them.
3. **No display voice outside studio.** `prose/display` is studio's; `prose/book` sets headings in the body face. A reached for a second face and that is most of why it looks designed.
4. **Carved pieces carry their theme's bugs and clashes.** `cover/quiet` still shows the reel's still under the clip; `blocks/hairline`'s button meets `prose/book`'s link colour as accent-on-black. `check` flagged neither.

**The agent's path does not lead to the shelf.** `build-theme` (`packages/mcp/src/prompts.ts`) never mentions pieces; step 5 is *"one stylesheet per candidate"*. B got there because this trial told it to.

**Where the tokens go.** Resources are small: the shelf index 1.2k, all fifteen slot files 4.4k, `theme/tokens` 2.8k, `config` 2.1k, the prompt 3.9k, unlocking `theme` 2.9k. A `look` is ~200 tokens of text and one WebP. **The cost is turns** — each of ~40 calls re-reads a growing conversation — **and pictures**. So the lever is fewer calls that each do more, not shorter lines.

**Friction the agents hit** (their reports, 25 Sep): `look` shows only the live theme, so a candidate must be set live to be seen; the prompt's blocking `bench page` gate measures the product's fixture, not the new theme; `seed`'s argument names were found by trial; nothing says `base`'s behaviour rules sit in a lower layer, so an author's `display:` silently overrides them (three of A's fix rounds); `look` raised two false alarms on studio's front page (fixed in `0ac6ad3`).

**The shelf today:** 15 slots, 32 pieces, all carved from editorial, technical and studio; `backdrop` empty; **no piece has a still** (docs/36 §2 planned `still.png`; none was made), so the only way to see a piece is to build a theme on it.

---

## 2. What "a whole site" means

A site is its routes, and every route is drawn by a handful of slots. Dressing a whole site from pieces means every row of this table has at least three good answers.

| Route | Drawn by | Answers on the shelf | Gap |
|---|---|---|---|
| Front page `/` | masthead · **home** · wall · footer | home: 1 (`bands`) | a quiet front page; a front page that is an index; a portfolio front page |
| A list — `/posts/`, a term, an author | masthead · **list** · entries · footer | entries: 3; the list page itself: none (base's) | **a `list` slot**: the page around the entries — its heading, its intro, its filter by term |
| A post | cover · column · prose · code · blocks · notes · toc · post-foot | 2–3 each | prose with a display voice that is not studio's |
| A page — about, contact | cover · column · prose · blocks | shares post's | a page cover that is not a post's (no date, no byline) |
| **A site's own type** — a case study, a log entry, a release | none | none | **a `feature` slot** (below) |
| 404 | page | base's | fine |
| Everywhere | masthead · footer · motion · backdrop · **palette + face** | 3 · 2 · 1 · 0 · seed + 16 faces | footer and motion thin; backdrop empty |

**`feature` — a piece for a type a site declares.** The content model already says what a case study's facts are: `work` declares `client`, `year`, `service`, `industry`, each described *"Shown in the facts strip."* So a piece can draw a facts strip for *any* type from the type's own declaration, if the type says which fields are facts. One field flag — `role: fact` in `types.yaml` (and `role: kicker` for the one that goes above the title) — and a `feature` layout renders a long page with a cover, a facts strip, the body and a close. studio's `work`, folio's `log` and `release` become `feature` pieces with switches; a new type gets a designed page on day one instead of `post`'s. This reverses docs/36 §2's "not pieces" line (decision 275) and keeps its reason: the *model* stays the site's, only its *drawing* moves to the shelf.

---

## 3. What makes a piece beautiful — the bar

A carved piece was beautiful once, on the theme it came from. The shelf has to be beautiful on **any** theme that picks it, next to **any** other slot's piece. So the bar is higher than "carved without a diff":

1. **One idea, stated.** Its `line:` names the idea (*"a ruled index, the date in the margin"*) and the piece does that and nothing else. Two ideas are two pieces or one piece with a switch.
2. **Designed from references, not only carved.** Every new piece starts from two or three real pages named in `piece.yaml` under `refs:` (a URL and what was taken from it). Carving gave us the first 32; the next ones are drawn.
3. **It holds on three token sets.** Seen on a light serif set, a dark sans set and one loud accent — the three `board` sets (§5). A piece that only works on its origin's palette is a theme fragment, not a piece.
4. **It holds at 390 and 1280**, at rest and in its states (hover, focus, menu open, details open) — `look` already forces them.
5. **It survives its neighbours.** Every pair of pieces across slots renders without a clash the gates can see (contrast, overlap, overflow) — the pairwise suite (docs/36 decision 271) runs in CI, and a failing pair is either fixed or written as `pairs:`.
6. **It passes the eye.** Sunny approves a piece on its board, on sight (decisions 209, 221). A piece nobody has looked at is not on the shelf; it is in `packages/pieces/_drafts/`, which `resolvePieces` does not read.
7. **Its tokens are the contract's.** A piece may add `needs:` tokens with derived defaults (docs/36 §3); it may not type a colour, a size or a face. Unchanged, enforced by the generator.

**Beauty is also the parts no single piece owns** — a palette and a face that suit each other, and a type scale. Those are the seed and the face shelf. The shelf's unit of taste above the piece is the **kit** (§4).

---

## 4. Kits — a whole site in one line

A **kit** is a named, proven set: one piece per slot, a seed, a face, and the switches — the combination somebody looked at and approved as a whole site. `notebook`, `reference`, `magazine`, `studio`, `ledger`… The four themes we have are the first kits once they are re-expressed on pieces (editorial, technical and studio already are; folio after its carve).

```yaml
# packages/pieces/kits/notebook.yaml
kit: notebook
line: An architect's notebook — paper, one serif set large, figures out wide, a ruled index.
seed: { accent: "oklch(0.42 0.06 250)", strategy: restrained, scheme: light }
face: instrument-serif
pieces: { column: { use: three-track, fit: true }, prose: book, cover: quiet, masthead: nameplate,
          home: index, list: ruled, entries: ledger, feature: facts, post-foot: ruled, footer: line,
          notes: sidenotes, wall: row, motion: glide }
still: still-1280.webp        # the front page, a list and a feature page, one image
```

**Why kits are the efficient path.** An agent that starts from the nearest kit and changes one to three slots makes **one** decision per slot it touches, not fifteen; it reads the kits (one short resource with pictures), not every slot; and what it starts from has already been seen whole. The genome and `explore` (docs/36 P4–P6) later sample *between* kits; kits are the points somebody has already vouched for.

---

## 5. Seeing pieces before choosing them — the board

Today the only way to see a piece is to build a theme on it. Two things change that:

- **Stills, generated.** `snypd pieces stills` builds the specimen once per piece on the default kit with only that slot swapped, and crops the slot — `still-1280.webp` and `still-390.webp` beside each `piece.yaml`, committed, regenerated in CI when a piece changes. The shelf index links them; an MCP client reads one as a `resource_link`, so a still costs nothing until it is opened.
- **The board.** `snypd pieces board <slot>` (and `theme › look { board: "<slot>" }`) — every variant of one slot, on **the site's own content**, side by side in one image: the agent chooses a `home` by looking at the four front pages *its* site would have, in one picture (~1,500 tokens), instead of building four themes. With `sets: 3` it renders each variant on the three token sets — this is the sheet Sunny approves pieces on (§3·6).

---

## 6. The agent's path, rebuilt

**Target:** the trial's brief, pieces path, **≤ 50k tokens, ≤ 15 calls, ≤ 5 images, `theme.css` ≤ 2 KB**, and on sight at least as good as A.

```
1. read  snypd://theme/kits                 ≤ 700 tokens: each kit's line, its still as a link
2. look  { board: "kits" }                  one image: the kits on this site's front page (optional)
3. theme › compose { kit: "notebook", name, change: { home: "split" }, seed?, face? }
                                           writes theme.yaml (pieces + seed + face) and DESIGN.md's genome;
                                           previews without going live
4. look  { theme: "<name>", tour: true }    one image: /, a list, a feature page, at 1280 + 390;
                                           facts first — gates, pairs, taste — as text
5. at most two rounds of: change a slot (compose again) or read snypd://theme/pieces/<slot> +
   look { board: "<slot>", theme } — then one bold rule set in theme.css, if the brief asks for one
6. check theme <name>; theme › set
```

What that needs, in the tree:

- **`snypd://theme/kits`** — the kits, a line each, still links. Gated at 700 tokens.
- **`theme › compose`** — docs/36 §5's action, built now over kits rather than after the genome: kit + changes + seed + face → `theme.yaml`, `DESIGN.md` `## Kit`. Scaffold + seed + edits + set become one call.
- **`look` takes `theme`** — renders a theme that is not live, so candidates are seen without switching the site.
- **`look { tour: true }`** — the three route kinds a site has (front page, a list, the longest page of its richest type) at two widths as one contact image, facts first.
- **`look { board }`** — §5.
- **Route-aware coverage.** `snypd://theme/coverage` names the site's own types and what draws each: *"work × 6 — `feature: facts` in this kit; `post` without it."* The facts strip no longer disappears silently.
- **`build-theme` rewritten pieces-first.** Its three candidates become three kits or three variants of one (decision 221 stands: Sunny picks on a picture). The long CSS section shrinks to the one bold move, and the prompt gains a ~600-token *how pieces combine* note: the layer order, residue beats pieces, a piece's `needs:`, and why an author's `display:` overrides `base`.
- **The friction list closed:** `bench page` measures the site's theme; `seed`'s arguments in its schema; `cover/quiet`'s reel still; `blocks/hairline` × `prose/book`.

---

## 7. The shelf to build — v1 of a whole site

Minimum three good answers where a slot decides the look; the rest as needed. **Carve** = from a sheet already judged; **draw** = new, from references, approved on the board.

| Slot | Have | Add | How |
|---|---|---|---|
| `home` | bands | **split** (heading beside content, folio) · **stream** (base, finished) · **index** (the front page *is* the ruled list, a line of intro above — the notebook) · **portfolio** (a grid of a type's covers) | carve · carve · draw · draw |
| `list` *(new slot)* | — | **plain** (base's) · **ruled** (a heading, an intro, the entries, terms as a filter row) · **grid** (for image-led types) | carve · draw · draw |
| `feature` *(new slot)* | — | **facts** (cover, a facts strip from `role: fact`, body, close — from studio's `work`) · **log** (dated, compact — from folio's `log`) · **release** (from folio) | carve ×3 |
| `entries` | list · rows · cards | **ledger** (folio) · **index** (title and date on one line, the date set in the margin) | carve · draw |
| `prose` | book · docs · display | **book** gains `display-heads` (headings in the display face) | switch |
| `cover` | quiet · path · display | fix `quiet`; **page** (no date, no byline — an about page's top) | fix · draw |
| `masthead` | nameplate · title-bar · bar | **plain** (base/folio) · **centered** (name over a rule, menu under) | carve · draw |
| `post-foot` | band · pills · ruled | **facts** (folio) | carve |
| `footer` | line · colophon | **close** (folio's dark close + footer) · **index** (the site's sections as columns) | carve · draw |
| `motion` | glide | **still** · **count** (folio) | carve |
| `blocks` | hairline · ruled · surface | fix the hairline button × book link; **ink** (blocks drawn in the text colour only) | fix · draw |
| `backdrop` | — | stays docs/33 G1–G3 (P7), after this plan | later |

Roughly **20 new pieces** — about half carved (folio and the three type layouts), half drawn — and **two new slots**. Plus five kits: `editorial`, `technical`, `studio`, `folio` re-expressed, and `notebook`, the trial's brief, built from the new pieces as the proof that a new kit needs no hand-written sheet.

---

## 8. Sessions

| # | Session | Lands | Days |
|---|---|---|---|
| W0 | **Unblock the agent** | `build-theme` pieces-first (interim, before kits); `look` takes `theme`; `bench page` on the site's theme; `seed` schema; the layer note; `cover/quiet` fix; hairline × book fix | 1 |
| W1 | **Folio carved** | on a site branch from `29897b5`: `home/split`, `entries/ledger`, `post-foot/facts`, `footer/close`, `masthead/plain`, `motion/still` + `count`; residue measured; carve zero-diff; folio is a kit | 2 |
| W2 | **Stills and the board** | `snypd pieces stills` (every piece, 1280 + 390, CI-regenerated); `pieces board <slot>` + `look { board }` on the site's content, `sets: 3`; the shelf index links stills | 1½ |
| W3 | **The whole-site slots** | `role: fact` / `role: kicker` in the type schema; `feature` slot with `facts`, `log`, `release` carved from studio and folio (their theme layouts deleted); `list` slot with `plain`; coverage names a site's own types | 3 |
| W4 | **Drawing pieces** | `home/index`, `home/portfolio`, `list/ruled`, `list/grid`, `entries/index`, `cover/page`, `masthead/centered`, `footer/index`, `blocks/ink`, `prose/book display-heads` — each from named `refs:`, each on the board at three token sets; **Sunny's sitting on the boards** decides what ships and what stays in `_drafts/` | 3 + sitting |
| W5 | **Kits and compose** | `packages/pieces/kits/`, five kits with stills; `snypd://theme/kits`; `theme › compose`; `look { tour }`; `build-theme` rewritten around kits; the *how pieces combine* note | 2½ |
| W6 | **Pairs, proven** | docs/36 P5's pairwise covering array over the shelf in CI — contrast, overlap, overflow, axe, CLS; failing pairs fixed or written as `pairs:` | 1½ |
| W7 | **The trial, again** | the same brief plus two new ones (a reference manual; a small magazine) on fresh subagents; tokens, calls, images, minutes; the pictures to Sunny beside A's | 1 |
| | **Total** | | **15½ days + one sitting** |

**Then**, over a shelf that can dress a whole site: docs/36 P4 (the genome, now over slots *and* kits), P5's `explore`, P6's `vary`/`cross`, P8 the factory on pieces, P7 the backdrop.

**The trial is the benchmark.** After W0, W5 and W7 the same brief runs on a fresh agent and the numbers go in this document. §6's target is the gate for calling W5 done.

---

## 9. Decisions asked

- **275. A site's own types are drawn by pieces.** A `feature` slot renders a long page for any type; the type's own fields say what is a fact. Reverses docs/36 §2's "not pieces" for layouts; studio's and folio's type layouts become `feature` pieces. Recommendation: yes — without it a whole site cannot be dressed from the shelf.
- **276. `role: fact` and `role: kicker` on type fields.** Two roles, declared in `types.yaml` (the core schema and a site's `snypd.yaml`), read by `feature` pieces. Recommendation: yes.
- **277. Kits are the agent's starting point.** A kit is a named, approved set of pieces + seed + face; the agent starts from the nearest and changes a few slots. Kits live in `packages/pieces/kits/`, versioned with pieces. Recommendation: yes.
- **278. A piece ships only after it is seen on its board at three token sets and approved on sight.** Unseen pieces live in `_drafts/`. Amends docs/36 decision 267 ("carved, not invented") for the next shelf: drawn pieces are allowed, gated by the board. Recommendation: yes.
- **279. `compose` comes before the genome.** docs/36 §5's action is built over kits in W5; the genome later extends it. Recommendation: yes.
- **280. The agent's budget for a theme is a gate.** ≤ 50k tokens, ≤ 15 calls, ≤ 5 images on the trial brief, measured in W7 and re-measured when the path changes. Recommendation: yes, as a target this plan must hit, not a CI gate (an agent run is not deterministic).

## 10. What would make this wrong

If W7's pieces path is cheap and still loses to A on sight, the shelf is too carved and too little drawn — W4 again with more references, not a return to hand-written sheets. If a piece looks right on one token set and wrong on the other two, the contract is missing a token the piece is faking — find it and add it, don't narrow the board. If `feature` needs a switch per type, `role:` is too coarse and the model needs one more role, not a layout per type. And if Sunny approves kits but not pieces on their own, the unit of taste is the kit — spend W4 on kits.

## 11. Calls for Sunny

1. **Launch chores stay parked?** Decision 272 put themes first and alone; L7 and the TF proof sitting are still waiting behind this plan.
2. **The board sitting in W4** — about an hour, on the boards, to pass or park each drawn piece.
3. **275–280.**

---

## 12. W0 — built 25 Sep 2026

**The agent's path now leads to the shelf.** Seven of W0's items, plus docs/38's prefix measurement, in one session. 

| Item | What changed | Where |
|---|---|---|
| `build-theme` pieces-first | Nine steps instead of ten. Step 1 reads `snypd://theme/pieces` first. A card is a parent, the slots it changes, a seed, a face and one bold move. Each candidate extends the nearest shipped theme on pieces (`editorial` · `technical` · `studio`) unless `extends` is given. Step 5 looks before any CSS, and the first fix is another piece. The picture and the pick stay the owner's. 3,851 → **3,233 tokens** (the rubric is 1,002 of them) | `packages/mcp/src/prompts.ts` |
| `look` takes a theme | `name` (and `variation`) render a theme that is not live, built out of band with drafts through `buildAndServe`, the switch `shoot` and `check theme` already make. The site is not switched, the scratch build is removed, and the label and `since` key carry the theme, so a candidate is compared with itself. A wrong name or variation is refused with the list. ~3.3 s on Ferrule, build included | `packages/mcp/src/catalog.ts` `lookAt`, `bench/src/look.ts`, `gallery.ts` |
| `bench page` on the site's theme | `bench` › run `suite: "page"` from a session is now `sitePage`: one theme (`themes: ["x"]`, or the live one) on this site's own routes (`pickRoutes`, up to 8) at 1280 + 390, against this site's budgets and the theme's own font budget. It writes nothing but a scratch build. `snypd bench page` in the repo is still the product harness. ~42 s on Ferrule | `bench/src/index.ts` `sitePage` |
| `seed` arguments | `name`'s description now says `seed` fills the scaffolded theme it names (and `look` sees it). The prompt's step 4 spells out every argument | catalog schema |
| The layer note | Step 6 of the prompt, 324 tokens: the five layers in order; a later layer wins whatever the specificity; a bare `a {}` or `main {}` in `theme.css` beats every piece; base's behaviour rules sit in `snypd.base`; `needs:`; `pieces.residue` | prompt §6 |
| `cover/quiet` | The still no longer shows under the reel: the `display: block` on `.snypd-cover-media` is gone (the fix cover/display got in docs/18). The plain cover image keeps it | `pieces/cover/quiet/piece.css` |
| hairline × book | **Not a shelf bug.** The pair renders correctly at rest and on hover, light and dark (carve + look on Ferrule, 2 schemes: pill = `color.text`, label = `color.bg`). The trial's accent-on-black pill came from **the scaffold**. `starterCss` writes `a { color: var(--color-accent) }` and `main { width; margin-inline }`, both in `snypd.theme`, above every piece. Fixed in two places: (1) a scaffold over a parent on pieces now gets a `theme.css` with **no rules**, only what the sheet is for, and the result names the pieces it inherits; (2) `pieces.residue` now also names a **bare element** rule that paints or lays out (`color`, `background`, `display`, `border`, `font`, `padding`, `margin`, `text-decoration`) where the selector names no class, or only classes a piece styles. `.snypd-facts dd a` (studio's own layout) passes; studio's count is unchanged at 4 | `core/src/scaffold.ts`, `render/src/check.ts`, `contract.ts` `bareElements` |
| The prefix (docs/38 §9) | snypd's own: `initialize` 162 tokens; `tools/list` before `find_tools` **2,237** (11 tools); the whole catalogue 3,224 (`theme` 1,433). docs/32's "~67k per session" is the **harness's** whole tool list, not snypd's. So §6's 50k gate depends on the harness deferring its own tools, and W7 has to run on one that does | measured o200k, Ferrule |

**Tests:** `contract.test.ts` (bare elements), `render.test.ts` (scaffold over pieces has no rules and checks clean; bare residue caught, scoped residue not), `mcp.test.ts` (`look { name }` refuses a wrong name or look, renders `technical` without touching `snypd.yaml`, leaves no `dist-look-*`; the prompt names the shelf, `look { name }`, the site page gate and the layer note, and no longer names `snypd bench page`).

**Not done in W0:** re-running the trial (§8 says after W0; it needs a fresh subagent run, ~130k tokens, and belongs in the session that starts W1 so the number is on the same shelf). The `look` reporting findings outside `slot` and the `contrast.rendered` 1.07:1 flag on Ferrule's brand (25 Sep) are still open. `scaffold` still writes no `pieces:` block of its own; a candidate names the slots it changes by hand until `compose` (W5).
