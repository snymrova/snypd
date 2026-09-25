# 38 · Beautiful pieces: what the research says makes them, and how an agent lays them fast

**Asked, 25 Sep 2026:** *"go through docs/37, find more information, find resources to create beautiful pieces or bricks so that agent can build layout fast speed with token efficiency. Beauty is the most important piece of this, the feel is important in design. You can research on prompts, skills, existing resources but dig deeper, this will make or break our app."*

Four research streams, run in parallel on 25 Sep. The full reports, with a URL or arXiv id on every claim, are in `docs/research/beautiful-pieces/`:

| | Stream | File |
|---|---|---|
| A | Prompts, skills and AI builders: what gets beautiful output, and what decays | `A-prompts-and-skills.md` (40 author rules, a 590-token taste brief, a 54-row anti-slop checklist) |
| B | Section libraries, theme systems and kit precedents, mapped onto our slots | `B-libraries-and-kits.md` (archetypes per slot with exemplars, 10 kits, licensing) |
| C | The craft: type, colour, layout, motion and detail, as CSS that reads only our tokens | `C-craft.md` (face shelf, seed formulas, proposed tokens, slot-by-slot bar) |
| D | Judging design automatically, and making the agent's loop cheap | `D-judging-and-cost.md` (gate tiers, image costs, loop budget, tag schema, taste learning) |

This document is the synthesis: what to change, in what order, and what it amends in docs/37. It does not replace docs/37; it sharpens W0–W7 and adds one session in front of them.

---

## 0. The answer on one page

1. **The type under every piece is broken, and the fix is cheap.** No face on the shelf ships an italic. The subset keeps only `kern,liga,clig,calt`, so tabular figures, old-style figures and small caps do nothing. Optical size is pinned (Source Serif 4 at 16, Bricolage at 96), and IBM Plex Serif ships at 400 only. Every `em`, every italic quote in `prose/book`, every dated list and every stat row is quietly worse than the CSS asks for. **This is the single largest lift available, and no piece can supply it** (§1).
2. **B looked flat because nothing asks for expression.** Perceived web aesthetics has two factors: *classical* (clean, ordered) and *expressive* (original, striking) (Lavie & Tractinsky 2004). Contrast, overlap, overflow, axe and CLS all measure classical order. An agent working against those gates converges on correct and flat. Expression has to come from kits that carry it by construction, from one bold move per theme, and from lints that name flatness as a fact (§2).
3. **Beauty comes from specific references, not adjectives.** Every serious source converges on this: *"Adjectives describe a region. A specific reference describes a point"* (Google's design.md). The piece's `line:` and `refs:` are the right lever; make them concrete and make them a gate (§3).
4. **Named "good" choices become the next slop.** Faces Anthropic's 2025 cookbook recommended are on 2026's overused lists. The `notebook` kit as drafted (cream paper, big serif, ruled index) sits inside three of the five clusters Anthropic's own skill now names as AI tells. **Approved pieces and kits age better than word-lists**, but the kit shelf must span visibly different corners (§5).
5. **Taste is personal, so Sunny is the oracle, and that can compound.** Professional designers agree with each other at α = 0.25. Models trained on one person's picks beat majority-vote with about 20× less data (DesignPref, arXiv 2511.20513). Sunny's board sittings should be recorded and fed back as a small ranker that *orders* boards and never approves (§7).
6. **The cost is turns and pictures, and both collapse with boards.** Claude charges images by pixels: one 1568×880 board of four candidates costs ~1,800 tokens, four separate 1280 shots ~5,300. A compose call that renders N candidates on one sheet removes ~20 calls. D's worked loop is **8 calls, 4 sheets plus ≤ 3 crops, final context ~30k**, inside docs/37's 50k gate. It assumes the tool list is deferred; the unmeasured ~67k `tools/list` would break it on its own (§6).
7. **Prompts are guardrails; checks are taste you can run.** The good skills keep a ≤ 600-token core and move everything checkable into tool output. `packages/render/src/taste.ts` already implements ~11 of impeccable's detector rules; A's checklist names the other ~40 with thresholds (§8).
8. **What we have is already the right shape.** Nobody combines "a named kit" with "swap one slot, keep the rest" over fixed markup and token-only CSS. WordPress 2025 comes closest (style variations × patterns) but its patterns carry markup. The commercial builders can only *ask* their models not to type raw colours; our generator refuses them (B §2.7, A §0.10).

---

## 1. The face shelf is the foundation (new session F0)

Read from `packages/shelf/shelf.json` and `scripts/shelf-build.py`:

| Finding | What it breaks | Fix |
|---|---|---|
| All 16 faces `style: normal`, no italic files | Every `em`, `cite`, blockquote and caption gets a synthesised oblique, the most visible "not typeset" sign in long-form prose. Instrument Serif's italic is half of why that face is chosen at all | Ship an italic for every `role: text` face and for Instrument Serif. Second file (~25–30 KB latin), `@font-face` with `font-style: italic`; preload only the roman |
| `features: kern,liga,clig,calt` | `tabular-nums`, `oldstyle-nums`, `small-caps` silently do nothing, or `small-caps` is faked (scaled caps, too light). Dates in lists, version columns, stat rows and tables cannot align | Keep `tnum lnum` on every face (~1–1.5 KB); `onum pnum smcp c2sc` on text serifs; `ss0x` only where a kit names it |
| opsz instanced at one value | A text-pinned serif looks heavy-footed at display size; a display-pinned sans looks spindly in captions | Keep the opsz range (or text + display instances) and let `font-optical-sizing: auto` choose; raise the per-face KB cap for opsz faces |
| IBM Plex Serif 400 only | `prose/book` asks for 600 headings with `font-synthesis-weight: none` and silently gets 400 | Ship 400 + 600; record `weights` per face |
| Nothing records what a face can do | A piece cannot know whether small caps or a 600 exist | `shelf.json` records `weights`, `features`, `axes`, `italic` per face; the generator refuses a piece `needs:` the chosen face cannot honour, and the seed writes `weight.*` tokens clamped to real weights |

**Which faces.** A and C disagree, and the disagreement is the finding. C proposes the best OFL editorial faces of 2025–26: Newsreader, Literata, EB Garamond, Fraunces, Inter (opsz), Geist, Hanken Grotesk, Atkinson Hyperlegible Next, JetBrains/Geist/Commit Mono. A shows that Fraunces, Newsreader, Inter, Geist, Instrument Serif, IBM Plex, Lora and Crimson already read as "an AI picked this" (impeccable, taste-skill, Anthropic's own list). 7 of our 16 are on at least one such list. The resolution:

- **Craft first.** Italics, figures, opsz and weights on the faces we have beat any new face.
- **Add breadth on purpose, not fashion.** Grow toward ~26 faces, and let at least half the additions come from outside the overused lists. Candidates to test on the board (all OFL on Google Fonts; verify axes and features before adding): Spectral, Alegreya, Besley, Petrona, Gelasio, Libre Caslon Text (serif text); Schibsted Grotesk, Familjen Grotesk, Onest, Radio Canada (sans); Martian Mono, Commit Mono (mono). Keep a few of C's picks where the craft is unmatched: EB Garamond for a book kit with real small caps, Atkinson Hyperlegible Next for an accessible kit.
- **Flag, don't ban.** `taste.ts` warns on an overused lead face (it does today for a short list). The overused list lives next to the shelf and follows it. Choosing a flagged face is allowed with a one-line reason in DESIGN.md.

C §1.9 has the full face table and ten text + display + mono pairings, one per kit feel.

**F0 · The face shelf, 1½ days, before W2** (stills rendered on faux italics would have to be re-rendered): shelf-build keeps italics, figure sets, opsz ranges and weights; `shelf.json` records them; generator and seed read them; 6–10 faces added from the list above; board of the shelf at three sizes for Sunny.

---

## 2. Expression: why B was flat, and three things that lift it

Two agents, one brief. A (hand-written CSS) won on sight with a display serif, figures breaking out wide, a centred column and dated rows. B (pieces) was correct and flat. docs/37 §1 blames holes in the shelf, and B §4 fills them. D adds the reason no gate caught it: **every gate we run measures classical order, and none measures expression**. Three levers:

1. **Kits that are expressive by construction.** A kit is a combination somebody looked at whole and approved. Starting from one means the agent inherits a point of view instead of assembling toward the average. Each kit names its **one bold move** in its `line:`: a display face set large, a full-bleed cover, a colour that owns the masthead. Everything else in the kit stays quiet so that move reads (Anthropic: *"spend boldness in one place"*; OpenAI's hero budget; impeccable *bolder*).
2. **Flatness as a fact.** D's T1 lints turn what the trial saw by eye into text the agent reads before any picture (~30 tokens against ~1,300 for an image):
   - **type contrast:** the h1 face differs from the body face, or h1/body ≥ 2.0 and h2/body ≥ 1.4. This catches B's *"headings the body face a size up"*.
   - **fold use at 1280:** the content box covers ≥ 55 % of the viewport width, or is centred within 5 %. This catches *"a third of the screen empty, column set left"*.
   - **width variety:** ≥ 2 block widths in `main` when the page has figures. This catches *"photographs at column width"*.
   - **families** ≤ 3, **weights** ≤ 4, **measure** 45–85 ch, **spacing from the scale** ≥ 90 %, **distinct heading sizes** ≤ 5.
3. **One bold rule set, allowed.** docs/37 §6 already leaves room for one rule set in `theme.css` "if the brief asks for one". Make it the default expectation rather than an exception: the brief almost always implies one ("a serif display face" in the trial brief was that move).

---

## 3. How to draw a beautiful piece: the method

docs/37 §3 sets the bar (one idea, from references, three token sets, 390 and 1280, survives neighbours, passes the eye, tokens only). The research makes each item concrete.

**3.1 References, as points.** Every drawn piece names two or three real pages in `refs:`, each with *the idea taken* (*"date in the margin, tabular"*), never adjectives. B §4 and C §5 give 2–4 exemplars per slot. The strongest, for the pieces docs/37 §7 wants drawn first:

| Piece to draw | Look at | Take |
|---|---|---|
| `home/index` | craigmod.com/essays · danluu.com · overreacted.io | month over title over dek; the archive *is* the front page |
| `home/portfolio` | pentagram.com/work · area17.com/work · koto.studio/work | image cards with title, dek and sector; a filter by discipline |
| `home/lead` *(B's addition)* | stripe.com/blog · vercel.com/blog · anthropic.com/news | one story large, the next few in a column beside it |
| `list/ruled` | pentagram.com/work · github.blog/changelog · smashingmagazine.com/articles | heading, intro, terms as a filter row, a rule |
| `entries/index` | danluu.com · paco.me · manuelmoreale.com | title and date on one line, the date in the margin |
| `feature/facts` | studio.tailwindui.com/work/family-fund · pentagram project pages · wolffolins.com/work | a facts strip (client, year, service) above the fold |
| `feature/log`, `release` | linear.app/changelog · raycast.com/changelog · vercel.com/changelog | the date in the gutter; version as title; grouped Added/Fixed |
| `cover/page` | sive.rs · robinsloan.com | title and a lede, no date, no byline |
| `masthead/centered` | robinsloan.com · kottke.org · worksinprogress.co | name centred over a hairline, menu under |
| `footer/index` | vercel.com · stripe.com · studio.tailwindui.com | sections as columns; done right for a product, wrong for a person |
| `blocks/ink` | gwern.net · edwardtufte.github.io/tufte-css | weight, size and rules carry everything; no tint |
| `prose/book` `display-heads` | practicaltypography.com · craigmod.com · increment.com | true italics, onum, hung punctuation, headings by space |

Galleries for finding more (C §6): Minimal Gallery, Siteinspire, Hoverstat.es, Typewolf, Fonts In Use, Refero (by page type), Personal Sites, and Godly for the loud kits.

**3.2 Licensing (B §3).** Layout ideas are not copyrightable; code, images and exact compositions are.
- Study freely, and adapt code with the notice: Ghost themes, daisyUI, HyperUI, shadcn, Tufte CSS, Hugo and Astro themes (all MIT).
- WordPress core themes are GPL: learn from them, never paste.
- Tailwind Plus explicitly forbids use in themes, UI kits and page builders: look only. The same goes for Relume, Flowbite Pro, Framer, Webflow, Squarespace, Cargo and Once UI's Magic Portfolio (CC BY-NC).
- **Rule:** `refs:` cites any URL and writes the idea taken, and no CSS is pasted from a source that is not MIT or CC0. Our pieces are built from our tokens, so compositions come out different by construction.

**3.3 The author rules.** A §6a has 40 CSS-level rules, grouped into typography, space, colour, shape, chrome, motion and the piece as a whole, and C §4.4 and §8 add the micro-details and robustness rules. They go in `packages/pieces/AUTHORING.md`, not in any agent prompt. The ones that most separate designed from generic:
- adjacent type roles differ by ≥ 1.2× in size, ≥ 200 in weight, or a family change
- tight within a group, generous between groups; space above a heading ≥ 1.5× the space below it
- a list is ruled *or* spaced, never both; never a container inside a container
- the accent has a job list, and a piece declares which of those jobs it uses
- one radius family; nested radii concentric; no hairline border plus a wide soft shadow on one box
- tabular figures for anything that compares; true italics or no italics
- one signature micro-detail per piece, and only one (A rule 40)

**3.4 Robust on any token set.** C §8: never assume polarity (mix toward `--color-bg`, never "lighten"); never assume weights, italics or features (read them from tokens the shelf writes); accent is a budget; text on an image needs a solved scrim or doesn't happen. **Add a fourth board set, the pathological one:** a 400-only display face, a yellow seed at L 0.85, a type ratio of 1.5, and dark. A also asks for an explicit *saturated Committed* set, because most carved pieces only work on paper. The board becomes five sets. Most breakage shows only on the last two.

**3.5 Where the sources contradict, we pick and record.** Eyebrows are template chrome to Anthropic and impeccable, and our covers carry one. Border plus shadow is craft to Vercel and slop to impeccable. Stagger reveals are delight to the 2025 cookbook and generic to the 2026 skill. The pick: **a kit decides.** `notebook` drops the eyebrow; a magazine kit may keep one on the cover only, never on every section. The choice goes in the kit's DESIGN.md, not a global rule.

---

## 4. Tokens the craft needs: a first tranche

C §7 proposes ~25 optional tokens. Adding them all would widen the contract faster than pieces use them. **A first tranche of eight, each needed by a piece docs/37 §7 already plans:**

| Token | Derive | Needed by |
|---|---|---|
| `weight.heading`, `weight.strong` | 600 / 700, clamped by the shelf to real weights | every prose piece (the Plex Serif bug) |
| `figures.data` | `tabular-nums lining-nums` | `entries/index`, `feature/log`, `blocks` stats, `code` tables |
| `tracking.caps` | `0.08em` | any small-caps label that survives §3.5 |
| `leading.display` | `1.05` | `cover/display`, `home/*` heroes |
| `color.tint` | `color-mix(in oklab, accent 10%, bg)`, seed-solved | callouts, selection, a hovered row, code line highlight |
| `color.hairline` | `color-mix(in oklab, border 55%, bg)`, APCA Lc ≥ 15 | every `ruled`/`index` piece |
| `color.focus` | accent, seed-guaranteed 3:1 on bg and surface | every interactive piece |
| `motion.ease` | `cubic-bezier(0.2, 0, 0, 1)` | `motion/*` |

The rest of C §7 waits for a piece that needs it. Unit vocabulary to add: `rlh`, `svh`/`dvh` (the first screen, where `vmax` is wrong on landscape desktops), `ex`/`cap`, and `0s` only as "off". B's `solid` blocks piece (the poster kit) would need shape tokens (border weight, depth) in the daisyUI style. That is deferred with the poster kit.

**The seed** (C §2.2) gains three refinements, all arithmetic and no taste:
- **relative chroma:** every accent step takes `C = k × Cmax(L, H)`, so yellows stay yellow and blues don't clip
- **tinted neutrals on a parabola:** `C(L) = c0 × 4L(1−L)`, clean at the extremes
- **dark mode that isn't inverted:** the accent's L goes up and its C down a little; surfaces lighten as they rise

APCA goes beside WCAG 2 as a *taste* signal: text ≥ Lc 75, muted ≥ 60, hairlines ≥ 15. WCAG stays the gate.

---

## 5. Kits: spread across the corners

B §5 proposes ten kits drawn from the precedents (WordPress 2025's four blog kits, Ghost's option sets, daisyUI's one-line themes). A adds a constraint: the kit shelf must not cluster where AI output already clusters. Together they give **six for v1**, chosen to span strategy, voice and imagery:

| Kit | For | Line (the bold move, stated) | Strategy · voice | Closest AI cluster |
|---|---|---|---|---|
| **notebook** | blog, notebook | A ruled index as the front page; one serif set large; figures out wide | restrained · serif display | 1 + 3 (cream, serif, broadsheet): allowed because the trial brief asked for it; keep it off cream and terracotta |
| **reference** | docs | A manual you trust: sans, the path always visible, tabular everything | balanced · sans | 4 (SaaS kit), avoided by having no cards |
| **gazette** | magazine | A weekly's nameplate, departments, big deks, one red | restrained · serif display, high-contrast | 3 |
| **studio** | portfolio, agency | Big covers, a facts strip, a dark close (exists; re-express) | expressive · sans display | 2 (near-black + one accent) |
| **profile** | personal | The name set large is the only image | balanced · a warm serif | none |
| **ledger** | product, changelog | The gutter is a timeline; versions as titles | **Committed:** one colour owns the masthead and close · sans | none |

Per-slot variants, faces and palettes for all ten are in B §5. The remaining four (essay, gallery, poster and folio re-expressed) follow once `offset`, `tiles`, `bleed`, `solid` and `mark` are drawn. **At least one kit must be Drenched** (the ground is the colour, the poster kit), and at least two must use a sans display, so "the nearest kit" is not always paper and serif. The pieces B adds to docs/37 §7 for these six: `home/lead`, `cover/bleed`, `list/banner`, `wall/grid`, `post-foot/next`.

**Tags** (D §5c) make kits and pieces choosable from text for ~60 tokens a kit. Five ordinal axes, each −2…+2:
- `energy`: calm ↔ loud
- `weight`: light ↔ heavy
- `expressive`: classical ↔ expressive
- `density`: airy ↔ dense
- `imagery`: text-led ↔ image-led

Plus `voice`, `fits`, `words` (4–8 terms for brief matching) and `avoid`. Metrics, approval and taste score are written by CI and the board, never by hand. At 10 kits and ~50 pieces, retrieval is reading a list: BM25 over `words` + `line`, filtered by `avoid`. No embeddings.

---

## 6. The agent's path: cheap because it sees many at once

D §2 measured the costs:
- **Images:** ⌈w/28⌉×⌈h/28⌉ tokens, capped at 4,784, and pixels count, not bytes.
- **Turns:** cost grows with calls × context. B's 38 calls consumed ~2.4M input tokens in total.
- **Cache:** reads cost 0.05×, but any change to the tool definitions invalidates the whole cache.

Anthropic's own guidance on tools and context says the same: fewer, larger tools, facts before pictures, load on demand, loops run on the server.

The loop, amending docs/37 §6:

| # | Call | Returns | Context |
|---|---|---|---|
| 0 | prefix: system + deferred snypd tools (`theme`, `look`, `find_tools`) + build-theme with the **taste brief** (≤ 600) | — | ~8–10k (**measure it**) |
| 1 | read `snypd://theme/kits` (axes as columns, stills as links) | ~700 tokens | ~1.2k |
| 2 | `theme › compose { brief, candidates: 3 }`: server-side match of brief → 3 kits, the **nearest plus one deliberately distant** (A's taste brief §3), rendered on this site's front page, T0–T2 run, ordered by T3 | facts per candidate + **one** 1568×880 sheet | ~2.8k |
| 3 | `compose { kit, change: { home: split }, name, vary?: "home" }` → writes theme.yaml; with `vary` a 3-variant board of one slot | facts + one sheet | ~2.6k |
| 4 | `look { theme, tour: true }` → /, a list, a feature page, at 1280 (½ scale) and 390, one contact sheet | ~250 facts + one sheet | ~3.0k |
| 5–6 | ≤ 2 fixes: `compose { change }` returns **only the changed slot's crop** (~520 tokens), or facts alone when a lint was the issue | | ~3k |
| 7 | optional: one bold rule set, answered with facts + crop | | ~1.2k |
| 8 | `theme › set { check: true }`, refusing on a T0/T1 hard fail | ~150 facts | ~0.5k |
| | **8 calls · 4 sheets + ≤ 3 crops · final context ~30k** | | |

Largest savings, in order: N candidates per call on one board (~20 calls gone); facts-first lints (no "look again to find what's wrong"); `look { theme }` without going live; a deferred, byte-stable tool list; crops on fix rounds.

**The taste brief** (A §6b, ~590 tokens) goes into `build-theme` as-is for W5. It has eight moves:
1. Read the site first and write one line about it into DESIGN.md.
2. Name the five ruts and leave them.
3. Start from the nearest kit and look at a distant one beside it.
4. Choose a strategy before a colour; take the seed from the site's world.
5. Use one family or two clearly different ones.
6. Spend boldness once.
7. Look once and fix once.
8. When unsure, subtract.

No long rulebook goes in the prompt. impeccable (~3.6k core), taste-skill (22k) and gstack's design skills (14–22k each) would each spend half the budget. Their value arrives compiled into pieces and checks.

**Stills stay nearly free:** `still-1280.webp` at 640×400 (~345 tokens) and `still-390.webp` at 195×422 (~112 tokens), always as a `resource_link`.

---

## 7. Capturing Sunny's taste so it compounds

The board sitting (docs/37 W4, decision 278) is the oracle. The research says it can do more than pass or park:

- **Record every sitting.** Store approved and parked pieces, best-of-row picks and a one-word reason for each park in `packages/pieces/taste.yaml` (gstack's taste profile does this with decay; DesignPref shows per-person models win).
- **Park reasons become `avoid:` words** on the piece, so a parked idea stops being offered for that kind of brief.
- **A small Bradley-Terry model** over the five axes plus T2 metrics, trained on the picks, choosing which pairs to show next. Usable after 2–3 sittings (D §4). It **orders** boards and never approves. Its weights read in the axes' own words, so Sunny can see what it learned.
- **The run-off judge stays outside the build.** A pairwise VLM judge, run both orders and counted only when consistent, with an ArtifactsBench-style atomic checklist from the brief, from a different model family than the builder, is a second opinion beside Sunny in W7. It is never the gate: absolute VLM scores diverge from people, preferences flip 13–35 % under distraction, and judges prefer busier pages, so they push against "calm".

---

## 8. The gate stack

D §5a, with A's checklist behind T1:

| Tier | Signal | Kind | Catches |
|---|---|---|---|
| T0 *(have)* | contrast, overlap, overflow, axe, CLS | hard | broken |
| T1 *(new)* | structure lints from DOM + computed style (§2.2), plus A's remaining ~40 anti-slop rows (25 static, 25 rendered, 4 copy; 11 already in `taste.ts`) | hard for measure, families, tap targets; soft otherwise | flat, sloppy, template chrome |
| T2 *(new)* | Hasler–Süsstrunk colourfulness, quadtree complexity, white space, balance, grid quality (Aalto AIM, MIT, Python), checked against the kit's axes | soft | off-mood, cluttered, lopsided |
| T3 *(new)* | UIClip (CPU, ~600 MB, 73.9 % pairwise vs GPT-4V's 51.6 %; sees 224 px), then Sunny's ranker | rank only | worse than before, not Sunny |
| T4 | pairwise checklist judge, offline | report | brief fit |
| T5 | Sunny on the board | the gate | taste |

T1 and T2 run in `look` and come back as text first. T2 and T3 also run in CI on the stills: a piece change that drops the specimen's score is flagged.

---

## 9. What this changes in docs/37

| Session | Change |
|---|---|
| **F0 (new, before W2)** | The face shelf, §1: italics, figure sets, opsz, weights, recorded in `shelf.json`; 6–10 faces added, half from outside the overused lists; seed writes `weight.*` |
| W0 | Add: measure the real prefix (`tools/list` deferred or not), since the 50k gate depends on it |
| W2 | Board sets become five: light serif, dark sans, loud accent, **saturated Committed**, **pathological**. Stills at the sizes in §6 |
| W3 | Unchanged; `feature/facts` gets its refs from §3.1 |
| W4 | Drawing uses §3: refs as points, `AUTHORING.md` rules, one signature detail per piece. Adds `home/lead`, `cover/bleed`, `list/banner`, `wall/grid`, `post-foot/next`. The sitting is recorded (§7) |
| W5 | Six kits (§5) with tags; `compose` renders N candidates on one board and takes `vary`; `build-theme` gets the taste brief; first-tranche tokens (§4) |
| W6 | Pairs, plus T1 lints and T2 metrics in CI; UIClip regression flag |
| W7 | Judged by Sunny, with T4 as a second opinion; the numbers against §6's table |

This adds ~1½ days (F0) and ~1 day across W4–W6, so **about 18 days plus one sitting** in total.

---

## 10. Decisions asked

- **281. The face shelf carries its craft.** Italics for text faces and Instrument Serif; `tnum lnum` everywhere, `onum pnum smcp c2sc` on text serifs; opsz ranges kept; per-face `weights`, `features`, `axes`, `italic` recorded; the per-face KB cap raised where opsz needs it. Recommendation: yes, and first. Nothing else in this plan is worth as much per day.
- **282. The shelf grows on purpose, and overused faces are flagged, not banned.** Half of new faces come from outside the overused lists; the list lives with the shelf; a flagged face needs a one-line reason in DESIGN.md. Recommendation: yes.
- **283. First-tranche tokens:** `weight.heading`, `weight.strong`, `figures.data`, `tracking.caps`, `leading.display`, `color.tint`, `color.hairline`, `color.focus`, `motion.ease`, plus the units `rlh`, `svh`/`dvh`, `ex`/`cap`. The rest of C §7 waits for a piece that needs it. Recommendation: yes.
- **284. Pieces and kits carry tags:** five axes, `voice`, `fits`, `words`, `avoid`; metrics, approval and taste score are written by CI and the board, never by hand. Recommendation: yes.
- **285. The kit shelf spans the corners:** six v1 kits (§5); at least one Drenched, at least two sans-display; each kit states its one bold move in its line. Recommendation: yes.
- **286. `compose` shows many at once:** N candidates or one slot's variants on one sheet per call; fix rounds return crops. Recommendation: yes. This is where most of the token budget is saved.
- **287. Flatness is a lint:** T1 structure lints report in `look` as facts and are hard for measure, families and tap targets. Recommendation: yes.
- **288. Sunny's sittings are recorded and learned from:** `taste.yaml`; park reasons become `avoid:`; a Bradley-Terry ranker orders boards and never approves. Recommendation: yes.
- **289. `refs:` rule:** a URL plus the idea taken; no CSS pasted from anything but MIT or CC0. Recommendation: yes.
- **290. The agent's prompt holds a ≤ 600-token taste brief and nothing longer about taste.** Author rules live in `AUTHORING.md`; checks come back as tool output. Recommendation: yes.

## 11. What would make this wrong

- **If F0 lands and the trial's pieces page still loses on sight,** the type was not the gap: go to the kits.
- **If Sunny approves kits but parks most drawn pieces,** the unit of taste is the kit (docs/37 §10). Spend drawing time on kits' bold moves, not on more variants per slot.
- **If the pathological board set fails most pieces,** the contract is missing a token that pieces are faking (docs/37 §10). Find it rather than drop the set.
- **If the measured prefix is well over 10k,** §6's budget is fiction until the tool list is deferred. W0 finds out.
- **If the ranker's order disagrees with Sunny after three sittings,** the axes are the wrong features. Keep the record and drop the model.

## 12. Calls for Sunny

1. **281–290.**
2. **F0 before W2?** The recommendation is yes: it is cheap, and every still made before it would be made again.
3. **Notebook stays the trial kit?** It sits in two AI clusters by design (the brief asked for it). Keep it as the benchmark, but don't make it the first kit an agent sees for an unrelated brief.
4. **Which exemplars you love or hate** in §3.1. One line from you per slot is worth more than any of the research.
