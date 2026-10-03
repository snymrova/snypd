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

## 13. W1 — folio carved, built 25 Sep 2026

**Folio is pieces.** Its `theme.yaml` names thirteen slots and its `theme.css` is the residue: **4.7 %** of the old sheet's comment-stripped bytes (1,122 of 23,781), against studio's 10.8 %, and all of it is the `log` and `release` layouts' own rules (the facts strip, the neighbours under an entry, the *Breaking* badge, the log archive's line). `parts/` is gone, and `layouts/` holds only `log`, `release` and `log-index`, the three that answer this site's content model (they become `feature` pieces in W3).

```yaml
pieces:
  column:    { use: three-track, data: true, fit: true, pages: true, shrink: true }
  prose: grotesk · code: tint · blocks: rows · cover: plain · masthead: plain · entries: ledger
  post-foot: line · footer: close · home: split
  notes:     { use: cards, on-page: true }
  wall:      { use: row, plain-title: true }
  motion:    { use: still, count: true }
```

**Ten new pieces, 42 on the shelf.** Carved from folio: `prose/grotesk`, `code/tint`, `blocks/rows`, `cover/plain`, `masthead/plain`, `entries/ledger` (ships the ledger as `entries`), `post-foot/line`, `footer/close` (ships the one-line dark footer and the `statusNote` setting), `home/split` (ships the product front page and `heroLabel`/`heroHref`), `motion/still`. Three shared pieces grew switches instead of forking: `column/three-track` gains `pages` (a page's article dissolves into the column as a post's does) and `shrink` (every block may go below its content's width), plus the `space.page-top` token (default `space.5`, folio `space.6`) and `--edge`, the one edge a full-width masthead, band or footer shares (read by `masthead/plain`, `home/split`, `footer/close`, each `pairs: { column: three-track }`); `notes/cards` gains `on-page` (the card on the page's ground); `wall/row` gains `plain-title` (the title as written, in the display face).

**Where it differs from §7's table.** `masthead/plain` ships no part: folio moved onto **base's header** (the contract masthead, decision 273), with `.snypd-brand { display: contents }` so the name stays a flex item of the row. `footer/close` is folio's footer; `.snypd-folio-footer` is `.snypd-footer-close` and `.snypd-status-right` is `.snypd-footer-status`. `post-foot/facts` in §7 is `post-foot/line`: the facts strip is the log layout's, not the post foot's, and stays residue until W3's `feature/log`. `motion/still` + `count` is one piece with a switch, because a slot holds one piece. `motion/still`'s own sheet is empty, since the piece *is* the absence of `@view-transition`, so the manifest test now asks that a piece ship CSS in its sheet *or* its switches. `.snypd-home-list .snypd-ledger-text` became `.snypd-home .snypd-ledger-text` (a contract class), so the ledger hides its descriptions on any front page, not only split's.

**The proof, in two steps**, so the HTML change and the carve are each proved alone:

1. **HTML first.** In the *old* sheet, `body > header` became `.snypd-masthead`, the header part was dropped (base's is used), and the footer classes were renamed. `bench carve` over **every route of snypd.rocks** (39 routes × 390/768/1280/1440, light; folio commits light) against the untouched sheet showed that on all 156 pages the one difference is the brand wrapper: one element more. A path-rewriting compare (`header>div>` → `header>`) finds every other element's style and box identical.
2. **Then the carve**, against that: 156 pages, 25,544 elements. **The HTML is identical on every page**, and the only style change is the term pills' `border-radius: 100px → 100vmax` (44 changes, the §13 destination studio's pills took). A declaration-by-declaration diff of the two built sheets, tokens resolved and layers dropped, finds besides that only the FAQ's `+` turning at `motion.quick` (150 ms, was 200: studio's named difference too), the badge's pill, `main` now a grid everywhere with the front page resetting itself by structure (`main:has(> .snypd-page > .snypd-band)`, as `home/bands` does), the rules two switches override inside their own sublayer, and `masthead/plain`'s `.snypd-tagline` rules (snypd.rocks sets no tagline).

**The shared pieces, re-carved.** `three-track`, `notes/cards` and `wall/row` changed, so editorial (paper, ink, broadsheet), technical (graphite, phosphor) and studio were carved on the specimen against a copy of the tree with those three pieces as they were: 432 pages, 59,824 elements, **every page the same**. That covers HTML, height, and every element's style and box. 677 pass / 0 fail, and the typecheck is clean (the repo, and the site's own layouts).

**Folio's findings, left as rendered.** On a page (`/start/`, `/bench/`), a table breaks out but a code block does not, where on a post both do. `pages` carries exactly that. The sheet asks `strong` for 600 against Inter 500 (`font.craft` warns). The 600 lands on the system sans, so the warning is the lint reading the whole sheet, as its comment says.

**Named numbers.** The built sheet is 28,053 → 30,236 bytes (6,381 → 6,828 gzipped): sublayer wrappers, 25 `needs:` tokens at folio's values (P4 decides which are genes), and three rules a switch now overrides. `check theme folio` passes (`pieces.contract`: 21 sheets, every literal in the vocabulary). **`pieces.residue` now reads only the classes a rule styles.** `main:has(> .snypd-ledger) > .snypd-lede` styles the lede, not the ledger (`styledClasses`: `:has()` and `:not()` arguments are conditions). **The shelf index is folded:** `house` is named in the header, a one-piece slot is one line, and a piece's KB lives in its slot's file. 42 pieces = **1,035 tokens** (1,145 at 32 before), under the 1,200 gate with room for about fifteen more.

**Deploy note.** The site's host build runs `@snypd/*@latest`, and folio now names pieces that no published version has. The site branch goes out with, or after, the release that ships them.

**Not done in W1:** folio as a *kit* (kits are W5); the trial re-run (it now belongs after W2's stills, on the same shelf).

## 14. W2 — stills and the board, built 25 Sep 2026

**A piece can be seen before it is chosen.** Two ways, one machine: `packages/bench/src/board.ts`.

| | What | Where |
|---|---|---|
| **The board** | every variant of one slot, each on this site's own content, side by side in one picture. `theme` › look `{ board: "<slot>" }` (with `name` it swaps into a theme that is not live), `sets: 3 \| 5` draws each on the board's token sets too; `snypd pieces board <slot> [root] [--sets=…] [--variants=a,b] [--out=…]` | `board.ts` `board`, `catalog.ts` `boardAt` |
| **The stills** | every piece on the specimen, on the host theme (editorial, residue 0 %) with only its slot swapped, cropped to the slot: `still-1280.webp` (≤ 640×400) and `still-390.webp` (≤ 195×422) beside each `piece.yaml`; `stills.json` records what each is a picture of. `snypd pieces stills [<id>…] [--stale]` | `board.ts` `stills` |
| **The sets** | `packages/pieces/board.yaml`: five token sets, as docs/38 §9 asked: `light-serif` (Source Serif 4, paper), `dark-sans` (Instrument Sans, near-black), `loud-accent` (Bricolage, one red), `committed` (Young Serif on a saturated cobalt), `pathological` (Barlow Condensed, 1.3rem body, 30rem measure, square corners, 0.95 leading). Contract tokens only; the generator refuses any other | `gen.ts` `readBoard` |

**How a cell is made.** A **child theme** in a scratch directory (`writeChildTheme`): `extends:` the theme being looked at, `pieces: { <slot>: <variant> }`, the set's tokens, the set's face installed from the shelf the way `seed` installs one (a text face takes body and headings; a display face takes headings and display, with the shelf's system pairing for the body). Then it is built out of band through `buildAndServe`'s new `searchPaths`, and cropped by `look` in its new `bare` mode: the clean crop, no boxes, no full page, no before/after record. Nothing in the site is written, and no CSS is composed by hand. A cell is exactly the theme `pieces:` would make, which is what makes the board honest. The variant already in use keeps the theme's own switches. A variation of the parent is folded into the child's tokens, under the set.

**The sheet.** Drawn in the eyes' browser (`composeSheet`), at most 1,568 px on its long side, captions as real text. Two layouts are weighed: the **matrix** (a column per variant, a row per set) and a **flow** (reading order at whatever column count shows the crops biggest, the variant and set in each caption). The flow wins at 1.4× the matrix's scale, so a front page gets the matrix and a 1280×90 masthead flows two-up. Cell height shrinks with the row count so the sheet is never scaled down after the fact. **The route** is this site's page that shows the slot best (`routeFor`): the front page for `home`, `masthead` and `footer`; otherwise the page with most of what the slot styles (`blocks` counts distinct block classes, so every-primitive-once beats fifty callouts), with the variants' own `emits:` counting treble.

**Measured on this box.** A cell is ~1–2.5 s on the specimen or Ferrule (build + crop). `home`, 2 variants: 2.6 s, one 1314×727 sheet (~1,220 image tokens). `masthead`, 4 × 5 sets: 12 s, 1558×1024 (~2,070). `entries` on Ferrule, 4 variants: 5.6 s. All 42 stills: 66 s, 720 KB, **~184 image tokens per 1280 still on average (345 at most), ~59 per 390 still**: a short slot gets a short still, since the frame is a ceiling.

**Found on the way.** `look` tried the classes a piece *emits* before the slot's own container, so `home/bands` was cropped to its first band (`.snypd-band`). Now: the slot's own classed selectors, then the piece's classes, then bare tags (`main`). This also fixes `look { slot: "home" }` on any theme on bands. And the boards already show things for W4's sitting. **`home/split` on editorial** sets its lede off-centre under a centred headline, and **`masthead/plain` on editorial** leaves the right half of the row empty, with the Motion toggle stranded mid-row: both are folio's layout not carrying over. That is exactly what decision 278's board is for, and both are left as rendered.

**The shelf links the pictures.** `snypd://theme/pieces/<slot>` gives each piece a `still:` line (`snypd://theme/pieces/<slot>/<name>/still-1280.webp`, blob resource, template listed) and names `look { board }`; the index says how to see a slot before choosing. Stills are kept out of `files`, out of the bundled barrel (`bundled.gen.ts`) and out of their own input hash.

**CI.** `pieces.test.ts` fails when any piece's stills are missing or older than the piece, its host theme or the stills block of `board.yaml` (the hash in `stills.json`). `snypd pieces stills --stale` reshoots exactly those. It also asserts the five sets, every face on the shelf and a stills route for every slot.

**Tests:** `board.test.ts` (a cell is a child theme: one slot swapped and the rest the parent's switches; a set's tokens over the parent's with its face in the right role; a variation folded under the set; `routeFor` by slot), `pieces.test.ts` (stills fresh and not in `files`; the board sets), `mcp.test.ts` (`look { board }` refuses `sets: 2`; answers without a browser; `home` crops both cells to `main.snypd-home`; the sheet and a still read back as WEBP; `wall` × 3 sets is 6 cells; the site and its dist untouched, the scratch themes gone; the still template is listed).

**Not done in W2:** the stills of the board's other four sets (a still is one set; the board is where sets are compared); a kit's still (kits are W5); `look { board }` at 390 in the same sheet (one width per call, as `look`). The trial re-run waits for W5, as §8 says.

## 15. W3 — the whole-site slots, built 26 Sep 2026

**A type says which of its fields are facts, and one piece draws any type from that.** `FieldSpec` gains `role: fact | kicker | flag` (one or a list), `label` (the word a reader sees; default the name, title-cased, singular when a list fact has one value), `show` (`v{value}`) and `href` (a url with `{value}`, a leading `#` dropped). `TypeSchema` gains `noun` (`case`, `session`) and `description`. **A type with any field that has a role is a feature type**, and `build` renders it through the theme's `feature` layout when the theme has one — unless the theme draws the type by a name of its own (a layout outside the six), which still wins. A theme with no `feature` piece falls back exactly as before (decision 197). The rule is one function, `typeLayout` (render/src/feature.ts), which the build and the coverage read both call; `featureOf(ctx, page)` hands a piece the kicker, the flags and the facts, drawn: a taxonomy ref as term links, a date as `<time>`, a list as items separated by the piece, a value with an `href` as a link.

**Two slots, four pieces, 46 on the shelf over 18 slots.**
- **`list/plain`** (from base, studio's `work-index`, folio's `log-index`): base's archive, and for a feature type one line under the title — how many, by the type's noun, and when (years across years, days within one), then the type's `description`. `/posts/` and `/` are unchanged. The line's size and track are the `entries` piece's (`entries/cards` sets it a step up, `entries/ledger` puts it on the ledger's track), so the list piece's own sheet is one rule. `snypd-lede` joins the contract's classes.
- **`feature/facts`** (studio's `work`): a case as three bands, the facts strip under the cover then the year, the call to action beside the next case. Offers `caseCtaTitle/Href/Label` (studio restates only the label, "Talk to the studio"). Pairs with `home: bands`.
- **`feature/log`** (folio's `log`): a reading page, the kicker above the title, the date and the facts as one ruled strip, the neighbour under the body.
- **`feature/release`** (folio's `release`): the same page with the facts run into the byline, and both neighbours under it. On the shelf, on the board, used by no theme yet.

**The last residue is gone.** Studio has no `theme.css` and no `layouts/`; folio (site branch `s39-folio-scale`) has neither. Ferrule's `work` declares `noun: case` and roles (`client` kicker + fact, `service` fact labelled *Services*, `industry` fact); its unused `year` field is dropped — the strip's year is the date's, as it always was on every case. snypd.rocks's `log` declares `noun: session`, its archive sentence as `description`, and roles with `href`s for the pull request and the decisions. The changelog plugin's `release` declares `version` kicker (`show: "v{value}"`), `breaking` flag and `product` fact — so any site with the plugin gets a designed release page on a theme with a `feature` piece, and the post layout on one without.

**The proof.** `bench carve` before any theme was touched, then after, compared element by element with the renamed classes mapped (`snypd-work*` → `snypd-feature*`, `snypd-log-decisions` → `snypd-fact-items`, the archives' `main` class dropped):
- **Studio on Ferrule**: 32 pages (`/`, `/work/`, the six cases, `/posts/`; 390 and 1280, light and dark), 6,540 elements — **identical**: HTML, box and every computed style.
- **Folio on snypd.rocks**: every log entry, `/log/`, `/posts/`, `/` — 72 pages at four widths — **identical**. The two release pages and `/changelog/` **change, by design**: folio names one feature piece, `feature/log`, so a release is drawn like a session — a facts strip (*Date · Product*) where the byline was, *The release after* where *Other releases* was — and `/changelog/` gains its count line (*2 releases, 6 Sep 2026 to 13 Sep 2026.*). That is §10's test run once: one piece drew both types from roles alone and needed no switch per type. Whether a release *should* look like a session on snypd.rocks is Sunny's call on sight; `feature: release` is the other answer, and it would then draw the log's entries as releases.

**Stills and the board.** The specimen gains the changelog plugin and three releases (one breaking) under a `specimen` product, so `feature` is photographed on `/changelog/1-0-0/` and `list` on `/changelog/`. `look`'s crop learned both slots — `feature` crops to the `main` that holds it, because on `column/three-track` the article has no box of its own. Every still was reshot (the board's stills block changed).

**Coverage names the site's types.** `snypd://theme/coverage` gains `types`: each type with a layout, how many items, the layout it renders through here and the piece that draws it — `{ type: work, items: 6, layout: feature, piece: feature/facts }` — and a note when a type has roles but the theme has no `feature` piece, so a facts strip no longer disappears silently. The shelf index stays under its 1,200 tokens (the two new slots' lines are short).

**Tests:** render (a feature type through `feature/log` — kicker, badge, facts in declared order, a fact's link, a list fact's singular; a type without roles still a post; the archive's line on a feature type and not on `/posts/`; the fallback on a theme without `feature`, and a theme's own `work` still winning), mcp (coverage's `types` on Ferrule), contract (the class list reads the `list` layouts; the house test skips sheets that no longer exist). 688 pass / 0 fail; typecheck clean.

**Not done in W3:** a `feature` still per board set (as W2, one set); `list/ruled` and `list/grid` (W4, drawn); a switch for which fact leads (the date leads on `log`, the year closes on `facts` — each piece's own idea, left so until a board says otherwise). The site's deploy still waits for a release that ships these pieces.

---

## 16. W4 — drawing pieces, begun 27 Sep 2026

**The first drawn piece is `home/index`, and it is a draft.** The front page *is* the ruled index: the page's title at prose size and everything before its first `##` as the line of intro, then every dated type the build hands the page as one list, newest first, in groups by year with the year set in the column's margin — and staying there, sticky, while that year's entries scroll past, which is the piece's one signature detail (docs/38 §3.3). The rows are the `entries` piece's, so a ledger, plain rows or a card grid are all this front page. The way to each archive is one line under the list (*Every post · The whole log*), and the page's own `##` sections come after it, as an afterword. A `::cover` on the page is not drawn: reading first, and the film is `split`'s or `bands`' idea. Drawn from craigmod.com/essays (the archive is the front page; a sentence above it and nothing else), danluu.com (one list, every entry, no hero) and overreacted.io (the year as a running mark over its entries), named under `refs:`.

**What the shelf needed to hold a drawn piece.**
- `piece.yaml` gains `refs:` — a url and *the one idea taken*, never an adjective — and `draft:`. The generator refuses `from: drawn` with fewer than two refs. `snypd://theme/pieces/<slot>` prints both; `snypd://theme/pieces`, the index an agent chooses from, **leaves a draft out** (decision 278); `check theme` gains `pieces.draft`, a fail, so a theme on a draft can be built and looked at but not shipped. Stills and the board treat a draft like any piece — the board is how it gets seen.
- `homeEntries`: the build handed every front page six of each list (S25). A front page that is the list needs more, so the count is now a setting the build reads when a theme declares it — `home/index` declares it, default 24 — and six otherwise, unchanged.
- A layout that wraps its content in `display: contents` loses the column: three-track's `main > *` cannot see the wrapper's children and the grid drops them in the gutter. The intro and the afterword are ordinary items on the text track with the column's own rhythm inside them. A year's group is a subgrid over `wide`, so its mark takes the margin track and its rows the text track; under 52.5rem the mark heads its rows instead.

**Seen.** `snypd pieces board home corpora/specimen --sets=5`: fifteen cells, no findings; on the light serif, the dark sans and the pathological set the index reads as drawn — the intro, one breath, the year beside the first rule, the rows. The specimen holds one year, so the two-year form is proved in the render test and not yet pictured; the sitting should see it on a site with two — snypd.rocks's log has both. Stills reshot.

**Tests:** render (the intro without the cover, ten entries over base's six, two year groups in order, two types merged newest first, the archive line, the afterword after it; `homeEntries: 2` gives two of each list; `pieces.draft` fails on the theme), pieces (every drawn piece has two refs, none an adjective; nothing carved is a draft), mcp (the index omits the draft, the slot file marks it with its refs; the home board is three wide).

**`list/ruled`, the second drawn piece, also a draft.** An archive as a heading, an intro and the terms as a filter row set between two rules — the strip's own rule above it, the first row's rule under it, which is its one signature detail. The intro counts and dates the list for every type (`list/plain` counts only a type with roles), then the type's sentence; the filter row is one line per taxonomy the listed entries carry, in the type's declared order, *All* once with the archive's count, then each term with its count, a link to its page, a bare slug title-cased. A term's page keeps the row: the taxonomy is the heading's kicker, the term's description is the intro, *All* has no count (a term's page does not know the archive's), and the term is marked current — text colour, an accent underline. Ships `index` and `term`; an author page stays base's. Drawn from pentagram.com/work (the disciplines as a filter row, counts beside them), github.blog/changelog (heading, a line of intro, labels as filters, the list) and smashingmagazine.com/articles (the category strip between two rules). *All* goes where the build says the archive is: `LayoutProps.archive` now reaches a term's page too — the one type's archive it filters, when its entries are one type's — so on a site whose only list is `/`, *All* is the page itself on the archive and a term's page offers none, instead of a link to a `/posts/` that does not exist. The contract's classes gain `snypd-list-filter`, as they gained `snypd-lede` in W3, and `entries/ledger` sets it on its track. `look`'s `list` selector learned base's plain archive, which has no lede — every `plain` cell on a posts or term board had been *absent*.

**Seen.** Boards on `/posts/`, `/changelog/` and `/tag/markdown/` at five sets, no findings on the ruled cells; the posts archive on the light serif is the reference: *Posts*, *35 posts, 1 Aug 2026 to 12 Sep 2026.*, the strip — CATEGORIES · All 35 · Engineering 3 / TAGS · Field notes 18 · Markdown 18 · Agents 2 — then the rows.

**`entries/index`, the third drawn piece, also a draft.** A list as an index: each entry one line — the title in the text face at body size, a dotted leader, the date — and nothing under it, no description, no term, no cover. The leader is its one signature detail: it carries the eye from a short title across to a date set at the column's edge, as a book's contents carry it to a page number. Past 60rem the date hangs in the right margin — its box is zero wide and its margins cancel, so the leader runs to the text's edge and the date's text overflows past it, still on the title's baseline and still inside the link — and the text track holds only titles and their leaders. Under 60rem the date ends the line. A title that wraps puts its leader and date on its last line (`align-items: last baseline`), and stops short of the edge by room for a leader. Drawn from sive.rs/blog (every entry is one line, its date and its title), the CSS Generated Content spec's `leader()` (the dot leader from a title to its number) and Tufte CSS (the right margin as the place for the small matter beside the line).

**What pairing it with `home/index` taught.**
- `EntriesProps` gains `year?` — *a heading above the list has already said the year every entry falls in*. `home/index` passes it for each year's group; `entries/index` then drops the year from each date (*09-12*, *12 Sep*), and an archive keeps the whole date. Parts that ignore it are right, so ledger, list, rows and cards are unchanged. The year sits in the left margin and the dates in the right, so the text column is titles only.
- `home/index`'s year mark was pushed down by a padding tuned to the ledger's first row, and with a one-line row it sat a row low. The group now aligns by baseline (`align-items: baseline` on the subgrid, which needs the list to take part as well as the mark), so the year sits on the first row's line whatever the `entries` piece draws.
- `home/index`'s way to each archive said *The whole releases*: `The whole ${title}` only reads for a mass noun. It now says *Every post · Every release* from the type's own `noun:` (`nounOf`). `home/split` keeps the old line, since it was carved from folio and stays zero-diff.

**Seen.** Board `entries` on `/posts/` at five sets at 1280 and three at 390, next to ledger and list: no findings. The board crops to the list's box, so it cannot show the hanging date. That was seen instead on a scratch copy of the specimen, on a child of editorial with `home: index`, `list: ruled`, `entries: index`, and two posts dated 2025: the front page has 2026 and 2025 in the left margin on their first rows' lines, the dates without the year in the right margin, and the archive line reads *Every post · Every release*. On a phone the full ISO date is wide enough to wrap more titles than `short` does. The sitting should judge that. Stills shot for `entries/index` and reshot for `home/index`.

**Tests:** render (an archive row is title, leader, the whole date, and no description, in the build's order; under `home/index` with `dateFormat: short` the dates are *12 Sep* and *3 Nov* while the archive keeps *12 Sep 2026*; `showDates: false` drops the date and the leader; `home/index`'s archive line is *Every note*).

**`home/portfolio`, the fourth drawn piece, also a draft.** The front page is the work: the page's title and everything before its first `##` as a line of intro, then a grid of the type the build hands the front page (decision 195 — the one the header menu names first, *Work* on a studio), newest first, twelve by the piece's `homeEntries` default, then the way to each archive (*Every case · Every post*) and the page's `##` sections as an afterword. The `::cover` is not drawn: the work is the picture. Each work is its cover **whole, never cropped, inside a frame every work shares, standing on the frame's floor** — the one signature detail: a row's pictures stand on one line and its labels start on the next, as works hung to a common sill, and the frame draws nothing, so the pictures are the only shapes. Under each, a wall label: the title, then the year and the first term (a bare slug title-cased, as `list/ruled` sets it). A work with no cover is its name in the frame in the display face, on the one fill the piece allows itself. The intro, the grid and the more line share one left edge on `wide`, with running text held to the measure (decision 188). Drawn from pentagram.com (the work is the front page; the studio's words come after it), are.na (every picture whole inside a cell every work shares, never cropped) and moma.org/collection (the caption as a wall label).

**What the board taught.**
- The first frame was square, from are.na. Ferrule's six covers are all landscape, so every square was two-thirds empty above its picture. The frame now takes **the shape of the grid's typical cover**: the layout takes the median of the covers' proportions from `ctx.media`, holds it between 3:4 and 16:9, and hands it to the stylesheet as `--portfolio-frame` (1 when no cover has a size). A grid of landscape covers fills its frames, and a tall cover among them stands in its frame with room either side. A piece that measures its content beats a token here: no set of token values fits every site's covers.
- **An intro or afterword that is a plain grid breaks any block that names a track.** `blocks/hairline`'s `.snypd-stat-row { grid-column: wide }` had no `wide` line inside it, so it opened an implicit column beside the heading. `home/index` had the same latent bug. Both pieces now make their intro and afterword subgrids over `full`, and their children take the piece's track at zero specificity (`:where(…) > *`), so a block's own `grid-column` wins.
- `measure.tile: 15rem` gives three columns on editorial's and studio's breakouts. At 14rem studio drew four, and six works came out as four plus two.

**Seen.** Board `home` on Ferrule (`examples/studio`) at five sets at 1280 and three at 390, and on the specimen at five: no findings. On Ferrule's light serif the portfolio reads as drawn: the intro, three by two of landscape covers filling their frames, the labels (*Kiln to table*, *2026 · Product*), *Every case · Every post*, and *How we work*'s stat row across the wide track. At 390 the board crops above the grid, so the phone form was seen on a scratch copy of Ferrule with `home: portfolio`: one column, frames holding their shape before their images load (no layout shift). On the specimen, half the posts have no cover, so the grid alternates name tiles and flat covers, and the rhythm holds. Stills shot for `home/portfolio`.

**Tests:** render (the intro without the cover; twelve of fourteen, newest first; frame 1.5 from shapes 1.5, 0.667 and 1.5; the uncovered work's name `aria-hidden` in its frame; *2026 · Product*; the way to the archive; the stat row inside the afterword after the more line; the first row eager; frame 1 with no sized cover). The mcp home board is four wide.

**`list/grid`, the fifth drawn piece, also a draft.** An archive for a type that is its pictures. The head is `list/ruled`'s — the heading, the count and dates, the type's sentence, the terms as a filter row — and under it every entry is a tile: its cover **cropped** to a frame every tile shares, then the title, then the date and the first term. Cropping is what separates it from `home/portfolio`: a front page shows a few works whole, an archive shows many as a wall. The frame is the list's typical cover shape (`coverFrame`, one for the whole list, not one a year), so a list of landscape covers is cropped least. The one signature detail: a list over more than one year **breaks at each year's turn, and a rule across the grid carries the year** — the only line on the page drawn in the text colour — so a wall of pictures stays a timeline, and the tiles under it drop the year from their dates. A list inside one year is one grid with no rule, each date whole. It draws its own tiles; the theme's `entries` piece is not asked. Ships `index` and `term`. Drawn from pentagram.com/work (one crop for every tile; the title and discipline under each), criterion.com/shop/browse (a catalogue of covers at one size, the year under the title) and photos.google.com (the grid broken at each turn of the date by a heading across it).

**What drawing it changed.**
- **The archive's head moved into `@snypd/render`** (`render/src/archive.ts`): `ArchiveHead`, `archiveCount`, `archiveSpan`, `archiveFilters`, `termTitle`, `coverOf`, `coverFrame`, `withoutYear`. `list/plain` and `list/ruled` had each kept their own copy of the span, `home/portfolio` its own frame, and `entries/index` its own `withoutYear`; all four now import them, with the same output. The contract test reads `archive.ts` for the classes it writes, and its scanner learned the `class: "…"` of an `h()` call.
- **The filter row's terms were 18px tap targets on a phone** — `list/ruled` too, since it was drawn; the board at 390 on Ferrule found it (`layout.tap-target`, 13 per cell). Each term now has `padding-block: 0.25em` and the strip's row gap is none, so every term is 24px or more and the lines keep their spacing.
- **In the grid, the filter strip runs the grid's width**, so its rule and every year's rule end on one right edge. Held to the measure as `list/ruled` holds it, it stopped 400px short of the year rules under it.
- **A piece may take its own stills route** (`board.yaml` `stills.routes`, keyed by id: `list/grid: /posts/`), because the list slot's route, the changelog, has no covers and photographed a wall of name tiles. The still's input hash now covers only the host, the specimen and the piece's own route, not the whole `stills:` block, so adding a route stales one still and not fifty-one (the fifty fresh ones were re-stamped, not reshot).

**Seen.** Board `list` on Ferrule's `/work/` at five sets at 1280 and three at 390, on `/service/product/` (a term's page), and on the specimen's `/posts/` at five: no findings once the tap targets were fixed. On Ferrule's light serif: *Work*, *6 cases, 2025–2026.*, the strip (SERVICES · All 6 · Product 3 · Tooling 3 … / INDUSTRIES · Hospitality 2 …), then the 2026 rule over three landscape tiles (*Kiln to table*, *14 May · Product*) and the 2025 rule over three more. At 390, one column under each year's rule. On the term page the kicker is *Service*, *Product 3* is current and *All* goes back to `/work/`. On the specimen, half the posts have no cover, so name tiles alternate with flat covers, as on `home/portfolio`. Phone tiles are one column at `measure.tile: 15rem`; the sitting should judge whether an archive wants two.

**Tests:** render (the head as `list/ruled` draws it, no `snypd-entries`, a section and rule per year newest first, one frame for the list, the wide cover, the uncovered work's name tile, *05-14 · Product* under the 2026 rule, the fifth cover lazy; a one-year term is one grid with whole dates; a term's page with its kicker, *All* back to `/posts/`, the term current), pieces (a stills route per slot, and any piece's own names a piece on the shelf; `stillRoute`).

**`cover/page`, the sixth drawn piece, also a draft.** A top for a site whose pages say something: the title, then a **standfirst**, then the body, and nothing about when or who. The standfirst is its one signature detail: one sentence a size up (`size.h3`, held to `measure.deck`), in the **text colour, not muted**, because it is the page's first sentence and not its meta. A cover's subtitle is one. On a page that opens without a subtitle, the standfirst is **the page's own first paragraph** (`.snypd-page > h1:first-child + p`, or the paragraph after a subtitle-less cover): the author writes no field for it, so the first sentence a reader sees is the author's. A group's space follows it, so the body starts after a pause. A post opens the same way and carries one more line, its byline: small, muted, **with no rule**, tied to the cover by space alone (the cover drops its margin when a byline follows), with a group's space after it. The eyebrow is a line of meta, sentence case, in the UI face. The slot is CSS over markup every layout shares, so the piece cannot take a post's date away; *no date, no byline* is what a page already is, and what the piece makes of it. Drawn from sive.rs/about (a page opens on its title and its first sentence) and theguardian.com (the standfirst: a sentence a size up under the headline, before the body).

**Seen.** The board crops to the cover, and a page with no `::cover` has only its `<h1>` there, so the board showed five identical titles on `/about/` (no findings at three sets). The page tops were seen whole instead, on the specimen on a child of editorial (`look` with `selector: main`), beside `cover/quiet`: on `/about/` the standfirst reads as the page's statement and the callout follows after the pause; on `/posts/every-primitive-once/` the eyebrow is a quiet *Engineering*, the subtitle is in the text colour, and at first the byline floated midway between the cover image and the TL;DR, belonging to neither. The cover now gives up its margin when a byline follows. At 390 both hold; on the about page the standfirst is six lines on a phone, which the sitting should judge. Stills shot on the post.

**Tests:** render (the three shapes the standfirst's selectors read — `h1` then `p`; a subtitle-less cover then `p`; a cover with a subtitle — and the selectors in the built sheet, so a layout change cannot silently lose the standfirst).

**`masthead/centered`, the seventh drawn piece, also a draft.** A nameplate: the name centred and set large (`size.h2`, the display face), **the one big thing in the header**; the tagline muted under it when the site sets one; and the menu centred under them in **a strip between two hairlines that run the page's width**, the piece's one signature detail, so the page starts under a line and not under a name. CSS over base's header and no part, like `masthead/plain`: the header is a three-track grid with **the outer tracks equal**, so the name is centred on the page and not on what sits beside it; the brand in the middle, the menu across all three, the motion control (on a page that has one) in the right-hand corner. The menu is the text colour at the small size, with the current page underlined, so the strip reads as a line of the page and not as chrome. On a phone the list waits behind base's button, and a strip between two rules holding one button is a band for nothing, so the button sits **centred under the name**, the motion control at its left, and one rule closes the header. Drawn from robinsloan.com (the name is the header: centred, large, in the display face), lrb.co.uk (a centred nameplate is the only large thing in the header) and worksinprogress.co (the menu as a strip between two full-width rules). docs/38 §3.1 also named kottke.org; kottke's is now a three-column page with its menu in a sidebar, with nothing centred to take, so it was dropped for the LRB.

**Seen.** The board on Ferrule `/` and the specimen `/` at 1280 (five sets, 25 of 25 cells clean): the name holds centred on the committed blue and the pathological set. Page tops seen whole on Ferrule and on a specimen copy with a long name (*The Quarterly Review of Small Machines and Other Things*) and a tagline: one line at 1280, *Posts* underlined in the strip. At 390 the first draft put the button beside the name, with the outer tracks equal; a name long enough to fill the row took the empty track and left the button's, and was no longer centred. So the button went under the name. `text-wrap: balance` sat on the inline link, where it does nothing, and the long name ended on *Things* alone; it moved to the brand's block. The 390 board then flagged the **motion checkbox at 13×13 px** (WCAG 2.5.8; its label does not count as its target). The piece sizes it from the body size, 1.5em on a phone and 1.2em above (1.5em was 31 px at 1280 and the loudest thing in the corner). After that, all five sets are clean at 390. `masthead/plain` has the same 13 px checkbox, and `title-bar`'s brand link is 21–22 px tall, on every set at 390: both predate this piece and are left for the sitting. Stills shot on `/`.

**Tests:** render (the header's children are the brand, the nav and the motion control, the three the grid places, with the name before the tagline; the grid in the built sheet).

**`footer/index`, the eighth drawn piece, also a draft.** The site as a map. The name, with the site's description beside it; then equal columns across the whole width (as many as `measure.footer-column`, 9rem, fits: five at 1280, two on a phone), each under a heading in the text colour with **a hairline beneath it**, the piece's one signature detail, and the links under it muted until pointed at; then the footer note under a hairline. The columns are **Index** (every archive, headed by the site's own word for it, then the `footer` menu's other items), **one column per taxonomy of at most eight terms** (more than that is a tag cloud, not a section of the site), and **Elsewhere** (the social links). Nothing is written for the footer: a studio that adds a service finds it on every page. Right for a studio or a product with sections, and wrong for a person with one list, as §7 said: on the specimen, a blog, *Categories* and *Products* are one term each. Drawn from stripe.com (headings in the text colour, links muted), linear.app (columns of one width with a small heading over each, and a bottom row on the same left edge) and gov.uk (each section's heading ruled beneath). vercel.com and studio.tailwindui.com, named in docs/38 §3.1, rendered blank in the eyes' browser (their footers fade in by script) and were not taken from.

**The one change outside the piece: `ctx.sections`.** A part had no way to see the site's archives or its terms, and a flat `footer` menu has no sections. `SiteCtx` gains an optional `sections`: every archive (`type`, `route`, `title`) and every taxonomy with its terms in use, sorted by title. There are **no counts and no entries**, so publishing a post under terms the site already uses changes nothing in it. It is in `base`, so it is in every route's key: a new term or a renamed archive re-renders the site, the way a menu edit already does. The key holds it **whether or not the theme draws it**, so a blog that adds a tag now re-renders every page on any theme. That is a cost for the sitting to weigh against a manifest field that says which pieces read it.

**Seen.** Board on Ferrule `/` at 1280, five sets: 20 of 20 cells clean. The first draft put the name in a narrow first track, as linear.app does. On Ferrule that left the map three columns wide: *Industries* and *Elsewhere* fell to a second row under an eight-term *Services*, and the description wrapped in a 9rem column. Now the name and description are a row of their own and the map has the whole width, so all five sections sit on one line. On a phone the rows took a screen and a half, so the gaps are a step smaller there. A term with no page came through as its bare slug (*agents* on the specimen); it is set by `termTitle`, as the list pieces do. A site with nothing to map writes no `<nav>`, not an empty landmark. At 390, `index` and `colophon` are clean on all five sets. `close` and `line` fail `layout.tap-target` on Ferrule's footer menu (17–18 px): both predate this piece and are left for the sitting. Stills shot on `/`.

**Tests:** render (Index is the archive under the menu's word for it, once, then the menu's other items; two categories are a column, nine tags are not; a term with no page is title-cased; Elsewhere is the social links; and by file mtime, a post under a category and a tag the site has leaves the about page and an older post unwritten, while a new category rewrites both).

**`blocks/ink`, the ninth drawn piece, also a draft.** The fourteen primitives in the text colour alone: no tint, no accent, no `viz` colour. It reads `color.text`, `color.bg` and `color.border` and nothing else from the palette. Weight, size and rules carry what colour carries in the other four. Its one signature is **the ladder**: a callout takes more ink the more it matters. A tip is a grey rule down its left side, a note (and any kind the renderer does not know) a 1px rule in the text colour, a warning a 3px one, and a danger is the page reversed, text on a block of the text colour, the only block that is a box. Reversed, its links and code spans take `inherit` and drop their tint, because the prose's link colour and the code's surface were chosen against the page. The summary and a row of figures sit between **a heavy rule and a light one**, 2px over 1px, as a book sets a table. Figures are in the display face at `size.number`, lining and tabular. A pull quote is an epigraph: italic a size up, no quotation marks, the source set right under it after a dash. Steps hang their number in its own column at a heading's size, inline, so number and text share a baseline whatever their sizes. Questions sit between two rules, answers under them by space alone. The call to action opens on the heavy rule, and its button is type reversed out of a square block that turns back to the page on hover. Labels (*TL;DR*, a callout's title) are spaced capitals in the UI face, not small caps, and weights are `strong`'s own `bolder`, never a number. So `font.craft` has nothing to warn about on a face without `smcp` or a heavy cut. The one exception is the epigraph's italic, which `blocks/surface` already sets. Right for a writer, a reference or a notebook, and wrong for a brand that needs its colour on the page. Drawn from gwern.net (admonitions in greyscale, heavier as they grow more serious, the most serious reversed out of black) and Tufte CSS (the epigraph, and the booktabs rules). Both were read from their own stylesheets as well as seen.

**The one change outside the piece: the `blocks` crop.** `look`'s `blocks` selectors were `main .snypd-block`, a class nothing emits, then `main figure`. So **every blocks board and every blocks still since W2 has been the chart**, the one block no blocks piece draws: five identical pictures for an agent to choose between. `locate` learns one form: a selector written with a leading `+` crops to the box around *every* visible match. `blocks` is now `+main :is(.snypd-tldr, .snypd-callout, .snypd-pullquote, .snypd-stat-row, .snypd-steps, .snypd-faq, .snypd-cta)`, cut at 1568 px as any crop is, which on the specimen at 1280 is the summary, the first callout and the pull quote. The outline's slot names strip the `+`. The four existing blocks stills were reshot; their pieces did not change.

**Seen.** Board `blocks` on the specimen at five sets at 1280 (25 of 25 clean) and three at 390 (15 of 15). Ink is its own column on every set: on the committed blue its rules go white with the text, and on the pathological set the ladder still reads. The whole post was seen on a scratch copy of the specimen on a child of editorial with `blocks: ink`, with a tip, an untitled note, a danger holding a link and code, and a three-figure row added, in light and dark at 1280. `look` over `main` at 390 in both schemes found contrast ≥ 5.11:1 over 80 text runs, no overflow and CLS 0. The first draft had two faults. A question was 23 px tall, one under WCAG's 24, so the summary now takes a quarter-em each side, as `list/ruled`'s filter terms do. And house's grey rule under the last question doubled the block's own closing rule, so ink sets it to none (house is the first sublayer, so the slot wins). A step's number, first drawn absolutely at the item's top, sat above the line's baseline, and it is now an inline box hung into the padding. The 390 look still lists the specimen's footer and post-foot links at 19 px, which predate this piece. **For the sitting:** charts, diagrams and flows keep the theme's `viz` palette, so an ink page's one colour is its chart. A greyscale chart would be Tufte's answer, but a chart with three series needs its colours. Stills shot on the post, the five blocks pieces at once.

**Tests:** look (a `blocks` crop spans two blocks and the gap between them). 706 pass / 0 fail.

**`prose/book` `display-heads`, the tenth and last drawn item, a draft switch.** The title and the section heads in the display face. The title, the one large thing on the page, is set at the face's own weight (`normal`): a display face is cut to be seen large and carries itself by its size, not by bolding. The section heads keep book's weight. The heads under them (`h3`, `h4`) stay in the prose face, so the step down from a section head is a change of family, not only a size. Every head is set off by the space above it, `space.6` over a section head and `space.5` over the next, so a head belongs to the text it leads. Right for a writer with a display face to spend, and on editorial's own tokens (`font.display` → `font.heading` → the prose serif) it is the same serif at two weights, a light title over bold heads. Drawn from practicaltypography.com (a heading is emphasised by the space above it; bold, not italic; only a small step up) and craigmod.com (the headline at a display face's regular weight, carried by size alone). increment.com, named in docs/38 §3.1, is offline (its pages return S3's *Access Denied*), so the switch names two.

**The one change outside the piece: a switch can be drawn, and so can be a draft.** `PieceSwitchSchema` gains `refs:` and `draft:`, as a piece has them, and the generator refuses a draft switch with fewer than two refs. `check theme`'s `pieces.draft` fails a theme that turns a draft switch on (`prose/book display-heads is a draft`). The shelf index leaves a draft switch out of its piece's line, and the slot's file marks it `DRAFT` with the pages it was drawn from. The board gains **switch columns**: `--variants=book,book+display-heads` (or `name+switch=value` for a switch with `of:`), and with no `--variants` each variant's draft switches get a column of their own beside it, so the sitting sees them without asking. A switch column on the theme's current variant keeps the theme's other switches.

**Seen.** Board `prose` on the specimen's long read at 1280, five sets, book beside book+display-heads beside display: 15 of 15 clean; at 390, three sets: 6 of 6. The first draft set the section heads at the face's own weight too. On every text-face set a regular `h2` at `size.h2` read as a slightly larger line of text (*The measure* nearly vanished into the paragraph under it), so only the title went light. On the sets that install a display face (committed, pathological) the switch changes little above the fold: the face's heads were already in it, and a 400-only face is 400 whatever the weight asks. The difference there is the space and the `h3`s, which the specimen's long read does not have above its first 1568 px. **For the sitting:** on a text sans (dark-sans) the light title is thin. That is a fair reading of the switch's idea, but a sans site with no display face may want it off. Stills unchanged (the switch is off by default, and the reshoot was byte-identical).

**Tests:** render (off by default: no display-face rule and no `pieces.draft`; on: the heads' rules in the built sheet, `--font-display` emitted because the switch reads it, and `check theme` fails it), mcp (the index's book line has no `display-heads`; the prose file marks it a draft with its sources). 709 pass / 0 fail.

**W4's drawing is done: ten drafts.** Next is **the sitting**: Sunny passes or parks each on its board (`snypd pieces board <slot> <site> --sets=5`), and a passed piece or switch loses `draft:`. The open calls for it are in this section's blocks: the changelog drawn by `feature/log`, `ctx.sections` in every key, an ink page's one colour being its chart, the 390 tap-target failures that predate W4 (`masthead/plain`, `title-bar`, `footer/close`, `line`), the 24-versus-44 px tap target, and studio's case button.
