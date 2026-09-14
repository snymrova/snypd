# 11 — Hardening, speed, and the theme ecosystem (Gate E)

**Written 13 September 2026, after the fast-forward.** docs/10 planned the launch; this plans what the
software has to be when strangers arrive at it. It is a shorter document than docs/10 on purpose: the
mechanism is built, and what follows is an audit with addresses, a quality gate, and the order the
remaining work goes in.

Sunny's calls on 13 Sep, all three recorded in §8: **the launch moves to 6 October** (the fallback, taken
deliberately rather than discovered), **a theme may ship a webfont** with a declared budget, and Block 0 —
this session — runs first.

---

## 1. The stake

Every number in docs/05 and every claim in the README is true of a tree that one person has run on one
machine. The launch changes the population: strangers, their content, their agents, their plugins, and
their Bun. The audit in §3 is what changes when *correct for me* has to become *stays correct for them*.

The other half is the shelf. docs/10 §6 says npm is the registry and snypd.rocks lists — but a list of
one theme and a null theme is not an ecosystem, and nothing in the tree can yet tell a stranger whether
the theme they wrote is any good. Ghost's marketplace works because GScan runs before a human looks.
That validator, here, is one command built out of checks that already exist somewhere in the bench.

---

## 2. Where we stand, 13 September 2026

Three things happened this morning, in this order, and they were all housekeeping that had been owed for
a week:

**`main` is the branch a stranger clones again.** It sat at S18k while nine PRs stacked linearly on top
of it — 25 commits, #8 through #17, each green on both Bun lanes. `git merge --ff-only` was the whole
operation; there was never a conflict to resolve, only a merge nobody had run. Anyone who had cloned the
repository in the last week got a tree with no parts, no nav, no plugins and no settings.

**v0.1.4 is cut.** 0.1.3 predates P1–P4 and U3, so a host building with it knows nothing about
`plugins:`, `transform`, `emit`, plugin tools or `theme.settings`. The bump is the ten version fields in
lockstep, as in 0.1.2 and 0.1.3; `deploy.VERSION` reads its own `package.json`, so a fresh
`init --deploy=cloudflare` pins 0.1.4 with no second edit.

**The publish failed on the credential, not the code.** Every step before it passed — typecheck, the full
suite, `tag matches package version`, all five platform binaries cross-compiled — and then:

> `npm error code E404` · `404 Not Found - PUT https://registry.npmjs.org/@snypd%2fdarwin-arm64`

A 404 on a `PUT` to a package that demonstrably exists is npm declining to admit the package exists to a
caller that cannot write it — the shape an **expired or revoked token** makes, not a scope problem
(`packaging/README.md` §2 records the 403 that a scope problem makes, and this is not that). Nothing was
published: the loop skips what is already on the registry and stops on the first real failure, so the
registry is untouched at 0.1.3 and the run is re-runnable once the secret is good.

`packaging/README.md` §2 already anticipated the fix: *"Once the packages exist, npm's trusted publishing
can replace the token entirely and the secret can be deleted."* All six packages now exist. The token is
the unblock; trusted publishing is the repair, and it cannot expire again.

**Still owed, and it is Sunny's hand:** the npm credential, and the Cloudflare pin — which lives in the
dashboard and moves to `@snypd/cli@0.1.4` once npm has it. D7 goes green on that one edit, and U2's menus
and P3's `autolink` reach the public page the same minute.

---

## 3. The audit — eleven findings, with their addresses

Read against `u3-settings` on 12 Sep, in docs/09 §2.3's convention: a defect names its file and its line.
Severity is what it costs when it happens, not how likely it is today.

| # | Severity | Address | Finding |
|---|---|---|---|
| 1 | **high** | `render/src/html.ts:59` · `core/src/content/lint.ts:137` | Raw HTML renders verbatim and lint skips `html` nodes. Correct CommonMark; it also means anything that can write a content file can put a `<script>` on the live site — and since decision 80 that is an agent reading the open web |
| 2 | medium | `core/src/schema.ts:152,259` · `render/src/tokens.ts:19` | Token values are unvalidated strings interpolated into `:root { … }`. `theme › set_tokens` is agent-callable. Settings of kind `color`, `size`, `font` are `str("a string")` at `schema.ts:94`, while `url` and `image` are pattern-checked two lines below |
| 3 | medium | `core/src/store.ts` (the `sync` contract) | Change detection is mtime + size; a same-second same-length edit is invisible to the index and therefore to the route cache |
| 4 | medium | the whole test tree | 6,712 lines of tests, all example-based. No property-based testing, no fuzz corpus, for a system whose three inputs are a directives parser, four YAML documents and a JSON-RPC surface |
| 5 | medium | `render/src/theme.ts:405` | The cascade is `sheets.join("\n")`. A child theme beats a parent only on specificity or source order — the ecosystem inherits WordPress's `!important` culture on day one |
| 6 | low | `render/src/build.ts:130,266` | `assets/theme.css` has a stable URL and changing content. The build already holds `sha1(css)` |
| 7 | low | `core/src/store.ts:93` | `dev`, `serve` and `build` can hold one index at once; no WAL, no busy timeout. The failure is a `SQLITE_BUSY` in the middle of an agent's turn |
| 8 | low | `render/src/build.ts:310–330` | A build interrupted mid-plan leaves a `dist/` the route cache believes. Recoverable by deleting `.snypd/`, which nothing tells you |
| 9 | low | `.github/workflows/` | Supply chain is half-hardened: provenance yes; pinned action SHAs, a Scorecard run and an SBOM, no |
| 10 | low | `core/src/schema.ts:116` · mdast `link`/`image` | Scheme checking happens for `url` and `image` settings and nowhere else. `javascript:` survives in a `link_list` item and in a markdown link |
| 11 | low | contract-level | `api: 1` is a version check without a deprecation policy. "Experimental through 0.x" is honest and is not a policy |

**The three that decide the order.** Finding 5 is a no-op today and a breaking change to everyone's CSS
the day a stranger ships a theme — its cost only rises. Finding 1 is the product's central claim, and the
answer is not to sanitize (that breaks real embeds and contradicts docs/01 §2, where the source *is* the
twin) but to make the claim self-enforcing on the user's own build. Finding 4 is the only one that would
have found the other ten.

**Closed since.** Findings 5, 2 and 10 in H0 (§7b, decisions 119, 120, 126); finding 1 in H2 (decisions 147–149). The other seven stand as
written, and keep the sessions §7 gives them.

**What the audit did not find** is worth recording so nobody re-audits it: escaping in the renderer is
careful, every config surface is strict Zod with file:line provenance, `page.a11y.violations` is a gate at
0 across 12 route/viewport pairs, `page.cls` is gated at 0, CI runs two Bun lanes, and a grep for
TODO/FIXME/HACK across `packages/`, `plugins/` and `themes/` returns nothing but a test asserting the word
never reaches a written post.

---

## 4. Speed — profile first, and say which number you are buying

The honest position: **speed is not a user problem.** 100 pages cold is 728 ms here and 224.9 ms in CI
against a 2,000 ms budget; incremental is 17.5 ms; the binary answers `initialize` in 33.7 ms against 50.

What is structurally true is that `build.ts` assembles a `plan[]` of pure, content-keyed items and then
walks it with a `for`, synchronously. The only `Promise.all` in `@snypd/render` is theme module loading.
A sixteen-core machine renders 10,000 pages on one of them, in 21.7 s.

Parallelism is the right *shape* — the items are already pure and keyed, which is the hard part, and
D9's byte-identical assertion is exactly the test that would prove order does not matter. It is not the
right *next thing*, for three reasons: `phases: { config, theme, sync, plan, render }` is already
instrumented and nobody has published the split; `lint.100.cold` at 425 ms against `lint.100` at 18.9 ms
says the cold cost is parsing, which a worker pool re-pays per worker; and workers cost process startup,
which is the one budget an agent actually feels.

**So F1 publishes the profile for 100, 1,000 and 10,000 pages, adds the missing `build.cold.1000` lane —
where most real sites live and no lane covers — and the decision is recorded either way.** "Single-threaded
on purpose, here is the profile" is a perfectly good answer to write down; "we never measured" is not.

---

## 5. Beautiful — what it costs, in order of effect

Two themes, one of them deliberately unstyled. `editorial` is genuinely well made — fluid `clamp()`
scales, a 34 rem measure, `light-dark()` on every colour token, six spacing steps — and it is one look,
tuned for a serif most visitors do not have.

**1 · Type.** `editorial`'s body stack is `'Iowan Old Style', 'Palatino Linotype', Palatino, Charter,
Georgia, ui-serif, serif` with the comment *"a webfont is a network round trip this theme will not
spend."* That refusal was aimed at a 300 KB family and a third-party origin, and neither is the 2026
proposition: one subsetted variable WOFF2 is ~30 KB for a Latin subset, self-hosted (cross-origin font
caching died in 2021, so the shared-cache argument is gone), `font-display: swap`, preloaded, with a
fallback face carrying `size-adjust`, `ascent-override` and `descent-override` matched to it — so the
swap shifts nothing and `page.cls` stays 0 rather than being traded away. **Decision 118 permits it with
a budget lane**, and the claim becomes *zero JS, one font, both declared*, which is stronger than *zero JS
and whatever your OS has*. **Done in B1** (§7b): Source Serif 4, 30.33 KB against a 40 KB lane, `page.cls`
still 0 — and the estimate above was right about the size and wrong about what fits in it, because a
roman, its bold and its italic do not (`editorial`'s `font:` block carries the three measurements).

**2 · Variations** (U6a, already scheduled) are the cheapest breadth available: three complete token sets
per theme, each named and described. Worth pairing with OKLCH and relative colour syntax —
`oklch(from var(--color-accent) calc(l - .08) c h)` derives hover, border and surface from one accent
instead of declaring twelve, so a variation is a few lines and stays perceptually even.

**3 · The Baseline CSS that is free.** `@layer` (finding 5, and an extensibility fix before it is an
aesthetic one); container queries, so an entry card adapts to *its* column rather than the viewport;
`text-wrap: balance` on headings and `pretty` on prose; and `@view-transition`, which gives a static
multi-page site cross-document transitions with **zero JavaScript** and is silently ignored where
unsupported. None of these move `page.js.kb`, which is the point of choosing these five. **Four of the
five are done** — `@layer` in H0, `text-wrap` in `editorial` since S14 and in `technical` from its first
line, `@view-transition` in both in U6b (decision 138: it survives the cascade layer, which `@import`
does not, and that was checked in a browser). Container queries are unclaimed: nothing in either theme
has yet wanted a component that adapts to its column rather than the page, and adding one to say the
word would be the kind of feature docs/07 principle 9 exists to refuse.

**4 · A contrast gate.** With finding 2's validation in place, WCAG ratios can be computed from the token
set at `theme check` time: a theme whose muted-on-background is below 4.5:1 fails before a human looks.
**Done in X1** (§7b), and it is seven pairs rather than one — text, muted and accent against both the page
and a raised block, plus text on an accent fill — measured on every look a theme ships and on every side
of `light-dark()` that look actually renders. The paragraph above was right that the values were enough
and wrong that they were *readable*: `oklch(from var(--color-bg) calc(l + 0.045) c h)` is what a well-made
2026 theme writes, and nothing in this repository could turn it into a number. About a hundred lines of
arithmetic now can (decision 141). The tightest ratio on the shelf today is `technical` › `phosphor`,
muted on a raised block, at **4.97:1** — which is the number the gate exists to have.

`technical` (U6b) should be a different argument rather than a recolour: a denser measure, mono for
headings, tables and code as first-class citizens, a table of contents from the heading tree. Three
themes × three variations is nine looks from one contract, and the gallery is what makes the shelf worth
visiting. **Done in U6b** (§7b), and the paragraph above was right about what to build and wrong about
what it would cost: the contents list was one part and one field short of being buildable from the
contract at all (decisions 135, 136), which is the finding the session existed to produce. Two themes ×
five variations is **five looks**, not nine — `editorial` ships three and `technical` two, which is what
docs/10 §5.2 said and what the gallery will show.

---

## 6. What is *not* in this plan

Deferred with a reason, so nobody re-proposes them every quarter:

- **Sections and blocks / page building.** Shopify's schema model and WordPress's block themes both solve
  "let a non-technical person compose a page". Composition here is the primitive vocabulary and the
  composer is the agent; adopting either puts a dashboard back in the middle of the product. docs/09 §4.5
  deferred variants and patterns and they stay deferred.
- **Sanitizing content.** See finding 1.
- **Parallel rendering**, until F1 says so.
- **DTCG import/export and `@snypd/plugin-test`** — both are real ecosystem reach (the W3C Design Tokens
  format reached its first stable version, 2025.10, with Adobe, Figma, Google, Microsoft, Shopify and
  Salesforce behind it, and `theme.yaml › tokens` is already the same idea). Post-launch: X2.
- **Everything in docs/10 §7's "does not block launch" list**, unchanged.

---

## 7. Gate E, and the sessions

Gate C is the release, Gate D is the launch. **Gate E is the quality bar the launch is allowed to stand
on**, and its rows interleave with docs/10 §7.2 rather than replacing them.

| # | Gate | Evidence |
|---|---|---|
| E1 | `main` is the branch a stranger clones | **green, 13 Sep 2026** — #8 → #17 fast-forwarded, CI green on both lanes |
| E2 | The repository is legible as open source | **this session** — LICENSE, description, topics, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, four issue templates and a PR template |
| E3 | The published binary knows what the tree knows | npm `latest` ≥ the tree's version and snypd.rocks built with it — **blocked on the npm credential** (§2); carries D7 and half of D12 with it |
| E4 | The cascade is a contract | **green, 13 Sep 2026 (H0)** — `@layer snypd.tokens, snypd.base, snypd.theme, snypd.site;` emitted; a three-deep chain asserted, child's plain selector over parent's compound one; the `dist/` byte-diff on snypd.rocks moved one file, `assets/theme.css`, by 105 bytes |
| E5 | A value cannot change the meaning of the sheet | **green, 13 Sep 2026 (H0)** — `cssValue` refuses at `loadConfig`, naming the token and `snypd.yaml:6, overrides themes/t/theme.yaml:3`; `set_tokens` refuses the whole patch before writing any of it |
| E6 | The 0 KB claim enforces itself | **green, 14 Sep 2026 (H2)** — `build()` weighs every page it writes against `bench.budgets.jsKb` and refuses the build naming page, line and bytes, on whatever site it is run on; five tests on a scratch site with no corpus in it: a content `<script>` at the default 0, a handler, a `javascript:` url, a remote script under a 50 KB budget, a media script that grew past 1 KB, and a plugin that rendered script it never declared. Lint rule 13 names the same thing in the source file first |
| E7 | An incremental build equals a cold build | a property, under interruption and under concurrency — not an example |
| E8 | A stranger's theme can be judged by a machine | **green, 13 Sep 2026 (X1)** — `snypd check theme` passes `base`, `editorial` and `technical` on 14–16 named rules, out of a `--compile` binary in a directory with no `themes/`; seven fixtures each break one rule and the test asserts the rule's *name*. `check plugin` the same, on the four first-party plugins |
| E9 | The gallery is worth visiting | three themes × three variations; `page.font.kb` declared and met (**the lane exists and `editorial` meets it since B1**); `page.a11y.violations` 0 on every one |

### Sessions, in order

Thirteen, from 13 Sep. docs/10 §7.2's remaining six are unchanged and keep their names; everything new is
interleaved where its cost is lowest.

| # | Session | Deliverable | Exit |
|---|---|---|---|
| 0 | **L0** | **this session** — the fast-forward, v0.1.4, the paperwork, this document | E1 ✅ · E2 · E3 ⏳ |
| 1 | **H0** | `@layer` in the concatenated sheet (finding 5) + the value guards (findings 2, 10) | **E4 ✅ · E5 ✅**, 13 Sep — §7b |
| 2 | **U6a** | Style variations (docs/10 §5.2) — `variations:`, `theme.variation`, `theme › set variation`, `editorial` × 3 — with OKLCH and relative colour | **done, 13 Sep** — §7b |
| 3 | **B1** | The font pass: one subsetted variable WOFF2, metric-matched fallback, the `page.font.kb` lane | **done, 13 Sep** — §7b |
| 3b | **I0** | **unplanned, 13 Sep** — install → onboarding → deploy, measured end to end; the `install.*` lane; one install in the PR workflow | docs/08 **F8 ✅** — §7b |
| 4 | **U6b** | `technical` from the contract + the `build-theme` prompt + the design pass at 390 and 1280; `text-wrap` and `@view-transition` fold in here | **D8 ✅**, 13 Sep — §7b |
| 5 | **X1** | `snypd check theme` / `check plugin` + `snypd new theme\|plugin` scaffolds | **E8 ✅**, 13 Sep — §7b |
| 6 | **H2** | Finding 1 — the build-time JS assertion and the raw-HTML lint rule | **E6 ✅**, 14 Sep — §7b |
| 7 | **H3** | Findings 3, 7, 8 — hash threshold, WAL + busy timeout, build generations | E7 (half) |
| 8 | **H4** | Finding 4 — `fast-check`, six properties, a seeded corpus, a CI lane | E7 |
| 9 | **F1** | The phase split published; `build.cold.1000`; the parallelism decision recorded either way | §4 |
| 10 | **S19d · S20** | Phase 4 as scheduled — branch previews; the markdown-engine report and speed pass | docs/07 exits |
| 11 | **S21** | Kill test × 3 models, with all four plugins enabled | D1, D4 |
| 12 | **S22 · L1** | The bench page + `/themes` and `/plugins` + the gallery screenshots | D12, E9 |
| 13 | **L2** | Launch assets, clean-machine runs on three platforms, the maker post as a draft | D13; **Gate D** |

**Calendar.** Thirteen sessions at the observed pace since 6 Sep (~1.1/day) is about twelve working days
from 13 Sep, which lands Gate D around **26 September** with a week of slack for CI, screenshots and the
recording. **Launch: Tuesday 6 October 2026, 00:01 Pacific** (decision 117). Findings 9 and 11 —
the supply-chain rows and the deprecation policy — ride along in whichever session touches their files;
neither is worth a session of its own.

---

## 7b. Session log

The shape docs/07 §5 and docs/09 §7b use: one row, one PR, a bench diff, and what it found. A session
with no bench diff is a session that did not measure.

| S | Date | PR | Bench diff | Notes |
|---|---|---|---|---|
| H0 | 2026-09-13 | #19 | **From CI on this tree** (run 34744620791, green on both lanes, 1.4.0 and 1.3.14): `build.cold.100` **296.1 ms** / 2000 · `build.incremental.100` **10.6 ms** / 300 · `lint.100` **8.4 ms** / 100 · `page.js.kb` **0** / 0 · `page.cls` **0** / 0.05 · `page.a11y.violations` **0** across 12 route/viewport pairs — a cascade layer moved no vital, which is the whole claim of decision 119 being a no-op today. No clocks from this box (memory: not comparable). `bench --quick` here, against the U3 record: `tokens.tools` 2230 → **2230**, `tokens.learn` 4564 → **4564**, `tokens.learn.editorial` 4708 → **4708**, `tokens.page.md` 510 → **510**, `tokens.page.html` 1510 → **1510** — every agent-facing row byte-identical, because a cascade layer is CSS and an agent reads neither. Every gated row green, none within 80 % of budget. The one number that moved is not a bench row: `assets/theme.css` on snypd.rocks, **11,387 → 11,492 bytes** (+105, the layer statement and three wrappers), and nothing else in `dist/` moved at all. tests 368 → 374 (373 pass, 1 todo), 0 fail; typecheck clean | **The cascade is a contract, and a value cannot rewrite the sheet it lands in.** Three of the eleven findings close. **Finding 5 (decision 119):** `styleSheet()` is now the one place the stylesheet is assembled — the build and both preview paths called `tokensCss(tokens) + theme.css` separately, which was three places to forget the layer statement — and it emits `@layer snypd.tokens, snypd.base, snypd.theme, snypd.site;` first. `loadTheme` wraps each sheet as it concatenates: the chain's *root* is `snypd.base`, and every theme extending it takes its own sublayer of `snypd.theme`, named for itself. The sublayer per theme is the part a two-theme tree would not have caught — with `mid` and `top` sharing one layer, a three-deep chain is back where the two-deep one started, and the E4 test is three deep for that reason. `snypd.site` is declared and empty: naming it now is what stops adding a site stylesheet later from being a breaking change, and unlayered CSS still beats all four, which is the escape hatch a person editing their own site should keep. **Finding 2 (decision 120):** `cssValue` in `@snypd/core` — a character allow list (no `{ } ; < @ \\ !`), balanced brackets and quotes, no comment sequences, and a **function allow list** rather than a deny list, because a deny list is wrong the day CSS adds a fifty-first function. It runs over every token in the merged map, so a theme's own default and a site's override are checked on the same pass and provenance names whichever file wrote the refused one; over `color`, `size` and `font` settings; and over a `set_tokens` patch *before* any of it is written. **Finding 10:** `link_list` items get the `url` setting's scheme rule; markdown links and images get CommonMark's own — a deny list there, because content links are `../about` and `#top` as often as they are absolute, and an allow list would refuse the web. The renderer drops the attribute and keeps the words; lint rule 12 `unsafe-url` is what tells the author. **Three things H0 found:** (1) an `@import` inside a cascade layer is invalid CSS and is dropped *silently*, so wrapping a stranger's sheet would have broken it with no diagnostic — hence decision 126, and `atImport` scans rather than greps, because `content: "@import"` is text; (2) escaping was never the defence anyone thought it was — `<a href="javascript:…">` was well-formed and escaped the whole time, and the two shapes that reach the renderer as `javascript:` are a pointed destination holding a tab, which browsers ignore inside a scheme, and a character reference, which micromark decodes before anything downstream sees it; both are in the test; (3) `set_tokens` wrote key by key while `set_settings` refused the whole patch first, so a two-token patch whose second value was refused left the first one written — the rule was already next door in the same file, and now there is something for it to check. No post: decision 97 |

---

| U6a | 2026-09-13 | — | **Counts from this box** (clocks belong to CI, and none of these are clocks): `tokens.learn` 4564 → **4564** (unmoved — `base` ships no variations) · `tokens.learn.editorial` 4708 → **4745** (+37 against a 4800 CI line, 55 to spare) · `tokens.tools` 2230 → **2230** (the `theme` tool is deferred, so a new argument on it costs no turn) · `tokens.page.md` **510** / 2500 · `page.js.kb` **0** / 0 · `page.cls` **0** / 0.05 · `page.a11y.violations` **0** across 12 route/viewport pairs, run on **each of the three variations** — the only gate that can tell whether relative colour syntax resolved. The `dist/` byte-diff of `corpora/theme` on the *default* variation, against HEAD: one file, `assets/theme.css`, **11,492 → 11,594 bytes** (+102), and nothing else in `dist/` moved at all. tests 374 → 382 (381 pass, 1 todo), 0 fail; typecheck clean | **A theme ships more than one complete look, and choosing one is a word.** `variations:` in `theme.yaml` is a map of named token *value* sets; `theme.variation` in `snypd.yaml` picks one; precedence is theme defaults ← variation ← the site's own `theme.tokens`, so a hand override still wins over a look chosen afterwards. It is merged as **its own layer** rather than folded into the token map, which is what keeps provenance: `snypd://config` says `editorial/theme.yaml:55 (theme editorial › ink), overrides editorial/theme.yaml:87`, naming the line inside the variation that wrote the value. `editorial` ships **paper** (its own tokens, named so a site can switch back), **ink** (dark only, cool near-black, one cyan) and **broadsheet** (wider column, sans headlines, tighter leading, press blue) — eleven tokens, seven tokens and none. Colour is OKLCH and *derived* where a value really is derived: `oklch(from var(--color-bg) calc(l + 0.045) c h)` is "the background, lifted", and stays that as the background moves, where a second hex is a number to keep in sync by hand. That is why `ink` is eleven tokens and not thirty — the viz palette is `light-dark()` pairs, and `color.scheme: dark` resolves every one of them to its dark side. **Two new tokens in `editorial`,** both no-ops at their defaults and both the reason a variation can reach past colour: `color.scheme` (`theme.css` now reads `color-scheme: var(--color-scheme)`) so `ink` can commit to dark rather than be editorial dimmed — a page that paints itself dark while the browser still thinks it is light gets light form controls and a light scrollbar — and `font.heading`, defaulting to `var(--font-body)`, which is what headings already inherited. **Four things U6a found:** (1) `themeTokens`' `overridden` meant "not the shape the theme declared", a proxy for "the site moved it" that was sound only while the site layer was the only thing that could write a bare scalar onto a declared token — a variation writes bare scalars too, so eleven of `ink`'s tokens read as site overrides and `theme` › set would have reported them as stranded on the next theme switch; the provenance layer name was the thing being asked about all along, and `TokenInfo` now carries `variation` beside it. (2) `null` is a *value* in `theme › set` — "back to the theme's own tokens" — and `wantVariation ?? beforeVariation` quietly turned a clear into a no-op; the resulting state is now spelled out rather than reached for with `??`. (3) The descriptions started in `snypd://theme/tokens`, where a `variations:` map sits at the same indent as the token names under `tokens:` — and the kill test's driver, which reads that resource by shape the way an agent does, picked `ink` out of it as a token name and had its whole retune refused as one bad key, which is the failure its own comment already warned about once. Hence `snypd://theme/variations`: one read, one question, like `/tokens`, `/settings` and `/coverage`. (4) Putting the descriptions in `snypd://theme` instead cost 128 tokens and took `tokens.learn.editorial` to 4836, past CI's 80 % line — the row's headroom was 92 tokens and had been for a while. Names there, sentences one read deeper, and the budget is the thing that caught it rather than something reclassified to let it pass. No post: decision 97 |

| B1 | 2026-09-13 | — | **Counts and bytes from this box; the vitals are Chrome 145's.** New lane: `page.font.kb` **30.43 KB** / 31 — the budget is `editorial`'s own `font.kb`, not a constant. `page.cls` **0** / 0.05 and `desk.cls`/`desk.first.cls` **0** / 0.05, on 12 + 4 + 4 route/viewport pairs; `page.js.kb` **0** / 0; `page.a11y.violations` **0**. `page.bytes.kb` 30.31 → **60.7** report-only, which is the whole of what a webfont costs and is now itemised in the note. Agent-facing rows all byte-identical to U6a: `tokens.learn` **4564**, `tokens.learn.editorial` **4745**, `tokens.tools` **2230**, `tokens.page.md` **510** — a reader pays 30 KB for the face and an agent pays nothing, which is the right answer and was not the first one (below). `dist/` byte-diff of `corpora/theme` against HEAD: `assets/theme.css` **11,594 → 11,920** (+326, the two `@font-face` blocks less a shorter stack), **+120 bytes on every HTML page** (the preload), two new files — `assets/fonts/source-serif-4-latin.woff2` (31,056) and `assets/fonts/OFL.txt` (4,400) — and nothing else in `dist/` moved. tests 382 → 392 (390 pass, 1 todo), 0 fail; typecheck clean | **One webfont, declared like a budget and not discovered like a bill.** `font:` in `theme.yaml` names the family, the file, the weight range, what it claims to cost and the fallback face's four metric overrides; `loadTheme` refuses a claim over decision 118's 40 KB and a *file* over its own claim, and `page.font.kb` gates the bytes on the wire against the same number. **Nearest declarer wins**, as for primitives, parts and tokens — a child inherits its parent's face until it names its own, which is what stops two faces stacking up to 80 KB by inheritance. The face is **Source Serif 4** (Adobe, OFL 1.1), Latin-subsetted with `opsz` pinned and `wght` left as 400–700 so body, headings and `strong` come out of one file: **30.33 KB**. `scripts/vendor-font.sh` is what made it and what prints the `font:` block, including the overrides, computed from both fonts' `hmtx` and `OS/2` rather than chosen — so `kb:` is a claim that can be re-checked by re-running one script. **Six things B1 found:** (1) **The italic does not fit, and the measurements say why.** Roman 30.33 KB + italic 19.43 KB + the bold in the weight range is not 40 KB; the pair that *does* fit is roman and italic as single weights at 38.95 KB, which buys a real `<em>` and pays for it with a synthesised heading on every page. Emphasis is the cheaper thing to lose, and `theme.css` already turns off synthesised weight and not synthesised style, which is now the reason and not a coincidence. If the lane moves, the italic is the first thing to buy. (2) **The preload is load-bearing, and the Desk proved it.** `desk.cls` came back **0.0005** while the public routes stayed at 0 — on a localhost where the font arrives in a millisecond. The difference was one line: `base`'s shell preloads the face and `desk.ts` wrote its own `<head>`. With the preload it is 0. A metric-matched fallback makes a late swap cheap; it does not make it free. (3) **`font:` merged into the config and cost 14 tokens of `tokens.learn.editorial`** — `snypd://config` carried `font: <theme editorial default — editorial/theme.yaml:34>`, a block that reads like configuration and that no site can answer. It is a declaration, like `settings:` and `variations:`, and decision 131 says so; with it stripped the row is 4745, exactly what U6a left it at. The budget is what found it, again. (4) **A bundled theme had nowhere to put bytes.** `bundled.gen.ts` had two categories, text and module, and a `.woff2` is neither — as a module it is an `import()` that cannot resolve, and as text it is a font that has been through UTF-8 and is not a font any more. A third category, base64, and `themeBinary` beside `themeFile` at the same seam — checked end to end rather than by unit: a `bun build --compile` binary, run in a directory with no `themes/` anywhere, emits `assets/fonts/source-serif-4-latin.woff2` byte-identical to the file in this repo, with the licence and the preload. (5) **The webfont killed two entries in `editorial`'s own stack.** Iowan Old Style is macOS-only and Palatino Linotype is Windows-only, and both of those machines have Georgia — which the fallback face now matches two entries earlier. Neither could ever be reached again, so they came out. (6) **The vendoring script was not reproducible, and re-running it is what proved it** — two runs a minute apart gave three different files, because the source URL tracked `main` and fontTools stamps `head.modified` with the clock, which moves what brotli sees. Pinning the upstream commit and `SOURCE_DATE_EPOCH` makes it a function of its own text; without both, "re-run it and diff the bytes" is a ritual. The pin then found the next one: the .ttf and the OFL were last touched four years apart, the font's commit predates the licence at that path, and `curl -sSL` wrote `404: Not Found` into `OFL.txt` and shipped it as the notice — a build away from a site redistributing an OFL font with the licence replaced by an HTTP error. Two refs and `--fail`, and the test that reads the licence is what caught it. `page.font.kb` is the one lane here marked `exact`: a file is 31,056 bytes on every machine that reads it, and `CI_FACTOR` is headroom for a clock. No post: decision 97 |


| I0 | 2026-09-13 | — | **A new lane, and the first numbers this repository has ever had for its own install.** `install.download.mb` **36.27** · `install.binary.mb` **83.85** · `install.code.mb` **5.14** / 8 ✅ — the third is the binary minus a one-line program compiled by the same `compile()`, so Bun cancels and what is left is snypd. The first two are report-only *by construction*: ~94 % of the download is Bun's runtime, and a budget on a number no commit here can move is how a suite teaches people to ignore it. Nothing else can move, and that is checkable rather than measured: this session touches `bench`, one generated CI file and two comments — nothing in `render`, nothing on `loadConfig`'s path, nothing in a tool schema or a resource — so no built byte and no token count has a route to change. `bench --quick` on this box agrees, against a record that is CI's: `tokens.learn` **4564**, `tokens.learn.editorial` **4745**, `tokens.tools` **2230**, `tokens.page.md` **510**, all identical to B1. The one generated artefact that *did* change is `.github/workflows/snypd.yml`, which only exists in a scaffolded site — no site in this repository has one, which is exactly why the test asserts its shape. tests 392 → 393 (392 pass, 1 todo), 0 fail; typecheck clean | **The wait nobody had counted.** Asked to check the local path and improve install → onboarding → deploy, the first finding was that only the middle third had ever been measured: `onboard.ttfp` starts its clock after the binary exists, and `mcp.coldStart.binary` measures the binary rather than what a harness spawns. **Four things I0 found.** (1) **The binary is 6 % snypd.** 83.85 MB against a 78.71 MB hello-world through the same recipe. Code-size work cannot move the install; only not shipping a second Bun runtime can, which is §10 question 5 and is a distribution decision, not an optimisation. (2) **The deploy pays the whole install again, every time.** `buildCommand` is an `npx -y` into a container with no cache — ~37 MB and ~7 s in front of a build measured at 0.79 s, so **the install is ~90 % of deploy time**. (3) **`npx` costs 2.2 s a call and pinning does not help** — 2.2 s pinned, 2.6 s unpinned, both against an already-cached package, because `npx` re-verifies its tree on every invocation. The generated PR workflow was three of them; it is now one `npm install -g` and three bare `snypd` calls, with `~/.npm` cached on the pinned version, since a content repo has no lockfile to key on. (4) **The launcher's own comment was wrong by 3×** — it guessed the Node boot at 25–40 ms and it is +94 ms, which matters because D2's entire budget is 50 ms. **What was deliberately not changed:** `init` still writes `bunx`/`npx` into the committed `.mcp.json`, which costs +240 ms a session on `bunx` and +2.2 s on `npx`. A durable hardlink fixes it for the person who ran `init` and breaks it for the clone that is the file's second reader — §10 question 6, and not a trade to take quietly in a session that was asked to measure. No post: decision 97 |
| U6b | 2026-09-13 | — | **Counts and bytes from this box; the vitals and the view transition are Chrome 145's.** New lane: **`tech.*`**, the second theme over the same fixture at the same two widths — `tech.js.kb` **0** / 0 · `tech.font.kb` **0** / **0** (no theme in the chain declares a face, so the budget is nothing, which is what makes decision 132's budget mean something) · `tech.a11y.violations` **0** across 12 route/viewport pairs · `tech.cls` **0** / 0.05 · `tech.bytes.kb` **32.19** report-only against `page.bytes.kb` **60.76** — the difference is the webfont and it is the whole difference. Editorial's own rows unmoved: `page.js.kb` **0** / 0 · `page.font.kb` **30.43** / 31 · `page.a11y.violations` **0** · `page.cls` **0**; `desk.*` and `desk.first.*` unmoved. The `phosphor` variation run through the same suite out of band: **0** violations, **0** CLS, **0** KB JS over its own 12 pairs. **Horizontal overflow checked directly** — every route × {390, 1280} × {light, dark} on both themes, `scrollWidth - clientWidth` and every element whose box leaves the viewport, excluding the deliberate `.snypd-scroll` containers: **zero, everywhere**. Agent-facing rows: `tokens.tools` 2230 → **2230** byte-identical (a prompt is never in the always-listed set, and the `toc` part changed no schema) · `tokens.learn` 4564 → **4566** and `tokens.learn.editorial` 4745 → **4747**, +2 each, which is `snypd://theme/coverage`'s description going from four parts to five · `tokens.page.md` **510** / 2500 unchanged. `install.code.mb` **5.18** / 8. `dist/` byte-diff of `corpora/theme` under **editorial** against HEAD: **one file** — `assets/theme.css` **11,920 → 11,989** (+69, the two `@view-transition` declarations) — and every HTML page, every artefact, both rasters, the font and its licence byte-identical, which is the measurement decision 135 rests on. tests 392 → **401** (400 pass, 1 todo), 0 fail; typecheck clean. `mcp.coldStart.binary` read 42.6 ms here against a 50 ms budget — a loaded box, and clocks belong to CI (memory: not comparable). **Checked through the compiled artefact** (the S18a rule): `bun build --compile --splitting`, then that binary run in a directory with **no `themes/` anywhere** — it builds the fixture on `technical` + `phosphor`, emits the contents list, resolves the variation's OKLCH, writes no `assets/fonts/`, and over stdio lists `build-theme` beside the other two prompts and reports `parts: shell inherited, header own, footer inherited, entries inherited, toc own`. | **A second theme is a second argument, and the contract was one part short of being able to make it.** `technical` is documentation rather than a recolour of `editorial`: a 44rem measure against 34, mono for every heading and every label, tables and code blocks promoted into the breakout track because here they are the content, and a contents list built from the heading tree. It declares **no layouts, no primitives and no font** — 13/13 inherited from `base`, five layouts inherited, two parts its own — which is **D8**, evidenced by `snypd://theme/coverage` out of the compiled binary rather than by reading the yaml. Two variations (`graphite`, `phosphor`), eight settings, 40 tokens. **`build-theme` (docs/10 §5.3) is written after the theme and not before it**, because U6b's job was to find out whether the contract is enough to build one from and the prompt is that finding written for an agent — including its last step, which is the one with teeth: *look at it*. A theme is the only thing here whose defects are invisible to every other gate; the build is green, the lint is clean, the tokens validate, and the masthead still wraps into three lines on a phone with a slash stranded at the start of one of them. **Five things U6b found:** (1) **a contents list needed two things the contract did not have** — a slot in the post layout that is not a plugin slot, and the heading tree of the body; both are decisions 135 and 136, and both are shaped so a theme that ignores them pays nothing, which the byte-diff is the proof of. (2) **The first contents list included the `faq`'s questions**, because a directive's markdown children are rendered by the same recursion with the same options and get ids exactly as a section heading does. The ids are right — they are linkable — and the list was wrong: an `faq` is one block that happens to contain six questions, and naming all six describes the markup instead of the argument. Direct children of the root only. (3) **The obvious responsive-table trick costs the table its role.** `display: block; overflow-x: auto` is what every guide recommends and it takes the table out of the accessibility tree, on the one element in this theme whose entire meaning is rows and columns. `max-width: 100%` with cells that wrap costs a few more lines on a phone and costs nobody the table; `tech.a11y.violations` is 0 either way, which is exactly why this had to be reasoned about rather than gated. (4) **Three fixes came from nothing but a screenshot** — `h3` set in the muted colour, which makes a sub-heading quieter than the body under it; the tagline's leading `/`, which at 390 wraps onto its own line and reads as a glyph somebody forgot to delete (it belongs to the *name*, not the tagline); and term pills sitting on a flex line's stretch rather than a shared baseline. None of them is visible to a test. (5) **`@view-transition` is not `@import`** — decision 138. `text-wrap: balance` on headings and `pretty` on prose were already in `editorial` and are in `technical` from the first line, so docs/11 §5.3's five Baseline items are now four done and container queries unclaimed. No post: decision 97 |
| X1 | 2026-09-13 | — | **`bench --quick` on this box, against the U6b record.** Every agent-facing row byte-identical: `tokens.tools` **2230**, `tokens.learn` **4566**, `tokens.learn.editorial` **4747**, `tokens.page.md` **510** — which is the claim, because two new verbs and a colour engine must cost an agent's session nothing, and `@snypd/render/check` is a lazy import so `mcp.coldStart.binary` is **32 ms / 50** unmoved. The one row that moved is the one that should: `install.code.mb` **5.18 → 5.21 / 8** — about 31 KB of new code, all of it reachable only from a verb. tests 401 → **413** (412 pass, 1 todo), 0 fail; typecheck clean | **A stranger's theme, judged by a machine — E8.** `snypd check theme` and `snypd check plugin`, sixteen named rules and seven, and the name is the deliverable: decision 123 makes this the gate for the shelf, and a refusal a submitter cannot argue with *by rule* is a refusal that gets argued with by email. Fifteen of the sixteen read a refusal the loader or `loadConfig` already makes — the missing layout, the `@import` (126), the font over its declaration (118), the variation that invents a token (127), the strict theme.yaml pass (73) — and put them in front of a third audience: not the build that stops, not the agent reading a diagnostic, but the author deciding whether to submit. **The one new thing is the contrast gate §5 item 4 has been asking for since this document was written** (decisions 140–142): seven pairs, every look, every side of `light-dark()` that look renders, computed from the tokens with no browser. All three shipped themes pass — read out of a `--compile` binary in a directory with no `themes/`, which is the S18a rule — and the tightest ratio on the shelf is `phosphor`'s muted on a raised block at **4.97:1**. **Four findings.** (1) `loadConfig` silently loses the theme layer when the root has no `snypd.yaml`: validation fails on `site.name`, `config` falls back to spec defaults, nothing throws, and `phosphor` reported `graphite`'s numbers in a light mode it does not have — decision 142. (2) The scaffold has written `var(--color-bg)` since U1 over a `base` that declares no tokens, so every theme ever made this way rendered unstyled, and the palette in its comment was the *active* theme's — decision 144. (3) A scaffolded `personality:` passed the shelf gate, which would have put “Describe how this theme reads” on a listing — decision 143. (4) `snypd theme check` was the planned spelling and is not the one shipped: a noun as a verb promises a family that lives over MCP and is never coming to the CLI — decision 139. One scaffold now, two front doors: `theme` › scaffold and `snypd new theme` write the same files from `packages/core/src/scaffold.ts` |
| H2 | 2026-09-14 | — | **`bench --quick` on this box, against the X1 record.** Every agent-facing row byte-identical — `tokens.tools` **2230**, `tokens.learn` **4566**, `tokens.learn.editorial` **4747**, `tokens.page.md` **510** — because a gate in the build and a lint rule change no schema and no resource. `install.code.mb` 5.21 → **5.22** / 8. `mcp.coldStart.binary` **39.3 ms** / 50 on a loaded box (clocks belong to CI; memory: not comparable). **The one cost that is new, measured on its own** rather than read off a noisy build clock: the weighing pass over `corpora/1000`'s built output — 1,013 pages, 7.54 MB of HTML — median **125 ms**, **124 µs a page**, fifteen runs. That is ~12 ms on a cold `build.cold.100` (CI 296 ms / 2000), a fraction of a millisecond on an incremental build, which weighs only what it rendered, and ~125 ms on the 1000-page cold build F1 will publish. **`OUTPUT_FORMAT` s7 → s8**, so the first build after upgrading is cold, once: an index written before the gate describes pages nothing weighed. Checked against every real site in the tree — `corpora/theme`, `corpora/100`, `corpora/kill`, `corpora/suggest`, `sites/snypd.rocks`, `sites/p4` — all build. tests 413 → **419** (418 pass, 1 todo), 0 fail; typecheck clean | **The 0 KB claim, enforced on the site that makes it — E6.** Finding 1 said raw HTML renders verbatim and lint skipped `html` nodes, so anything that could write a content file could put a `<script>` on a live site; since decision 80 that includes an agent that has read the open web. The answer was never to sanitise (decision 147): `packages/core/src/script.ts` is one definition of what counts as script — an executable `<script>` by the browser's own `type` test, a `src`, an `on…` handler, a `javascript:`/`vbscript:` destination in any of nine url attributes — and it has two readers. **`build()`** weighs each page it wrote, inside the index transaction and after the loop, against `bench.budgets.jsKb`, and throws one message listing every page over with the line, the truncated source and the bytes; the throw rolls the index back, so the next build refuses again instead of finding a warm cache. **Lint rule 13 `inline-script`** reads the same scanner over the document's `html` nodes and puts the refusal on the source line, before the build does (decision 149). **Three things H2 found.** (1) **The first version refused the first-party analytics plugin.** `sites/p4` runs `analytics` at a 3 KB budget, and a Plausible beacon is a file on Plausible's origin — unweighable, and the first rule said unweighable is over every budget. The fix is attribution, not a host allow list (decision 148): `slot()` now records the signature of every script site a plugin's slot rendered, and a remote script a slot put there is charged at that plugin's `client:` declaration — the one number P2 already checked against this budget. The same url pasted into a post on a site without the plugin is still refused, and a test says so. (2) **A media script that grew was invisible to the route cache.** `content/media/**` is copied byte for byte, but the media part of every key was image dimensions only, so a page loading `/media/app.js` stayed cached, and unweighed, while the file doubled. The size of every `.js`/`.mjs`/`.cjs` media file is now in the key. What the key still does not see is a file a plugin's `emit` stage writes with new bytes from unchanged code; that is the plugin's declaration to keep, and `page.js.kb` is what holds it to it. (3) **The spec always fills `bench.budgets.jsKb`,** so a branch written to say "unset, so 0" could never run; the test failed on it, and it went rather than being faked. No post: decision 97 |

---

## 8. Decisions

**117. The launch moves to Tuesday 6 October 2026**, 00:01 Pacific — the fallback docs/10 already named,
taken deliberately on 13 Sep rather than discovered on 25 Sep. The date was never announced, so it costs
nothing; decision 93 still holds, and the gate is still the gate. What the extra week buys is sessions
1–9 rather than a smaller Gate D.

**118. A theme may ship one webfont, declared and budgeted.** Self-hosted, subsetted, variable, WOFF2,
with a metric-matched fallback face so the swap shifts nothing. New lane `page.font.kb`: **0 for `base`,
≤ 40 KB for a themed one**, measured on the wire like `page.js.kb`. This reverses `editorial`'s own
comment, which is why it is a numbered decision and not a commit.

**119. The stylesheet is emitted in cascade layers.** `@layer snypd.tokens, snypd.base, snypd.theme,
snypd.site;`, each sheet wrapped as it is concatenated. Before third-party themes exist this is a no-op;
after, it is a breaking change to everyone's CSS. It happens in session 1.

**120. A value may not change the meaning of the sheet.** Token values and settings of kind `color`,
`size` and `font` are validated against a conservative CSS-value grammar; the refusal names the token and
the line, like every other refusal in this codebase.

**121. The 0 KB claim is enforced on the user's own build**, not only on the bench corpus. A build that
emits script beyond what plugins declared fails with the file and the line — the same treatment a plugin
over its client declaration already gets.

**122. Raw HTML in content is `warn` by default.** `content.rawHtml: allow | warn | refuse` in config.
Never silently stripped: the source file *is* the `.md` twin (docs/01 §2), and a renderer that rewrote it
would be decision 102's failure arriving by another door.

**123. `theme check` is the gate for the shelf.** `/themes` and `/plugins` list nothing that does not
pass it. Ghost's marketplace is curated and machine-validated first, which is why its listings mean
something; this is that rule, made once, before the first submission rather than after.

**124. Parallelism is not adopted on assertion.** F1 publishes the phase split first. Either answer gets
written down.

**125. L0 is a session.** A licence file and a merged `main` are launch blockers in a way a third theme is
not, and the work was invisible precisely because no session owned it.

**126. A theme's stylesheet may not `@import`.** An `@import` inside a cascade layer is invalid CSS and
is dropped without a word, so decision 119 would have silently unloaded any sheet that had one. Refused by
name and line at `loadTheme`, which is the treatment every other bad theme file gets — and it is the
honest rule anyway: a theme ships one stylesheet, decision 118's budget counts what that sheet ships, and
an import is the network arriving somewhere nothing measures. `@font-face` inside a layer is valid and
untouched, so B1 is unaffected. X1's `theme check` inherits the rule.

**127. A variation is token values, never declarations.** `variations:` may retune a token the theme declares; it may not add one, change its `kind`, or move `customisable`. An invented token has no description and nothing for `theme` › set_tokens to check against — it is a custom property the theme's own stylesheet never reads. Warned by name and line at `loadConfig`; X1's `theme check` is where the same finding stops a theme reaching the shelf. This is the line between a variation and a child theme, and it is what makes "switching changes exactly the tokens it names" assertable.

**128. `variations:` does not merge into the config, and `theme.variation` is the answer.** The rule `settings:` already has (decision 116), one step further on: a site that could write `theme.variations` in `snypd.yaml` would be writing a look nothing could ever apply, because the site layer merges at step 4 and the chosen variation's tokens land at step 2.5. Better to not have the key than to have to warn about it.

**129. `snypd://theme` carries the variation names; `snypd://theme/variations` carries what they are.** The bargain the palette has had since S16, applied to the same read. What each look *is* costs a sentence each, and a sentence per variation on the resource every session reads is a tax on the sessions that never restyle — it took `tokens.learn.editorial` to 4836 against a CI line of 4800. It is also its own resource rather than a block in `snypd://theme/tokens`, because two YAML maps at the same indent in one resource is a resource that gets misread, and this one was, by the kill test, within the hour.

**130. `theme.variation` is cleared by a theme switch.** A variation is a name in one theme's vocabulary. Carrying `ink` across to a theme that never heard of it is how a site acquires a stranded value that warns on every load, so `theme` › set drops it unless the same call names a new one — and when a call names both, the pair is checked against the theme being switched *to* before either is written.

**131. `font:` is a declaration, so it does not merge into the config.** The third key of `theme.yaml` to be read and dropped rather than merged, after `settings:` (116) and `variations:` (128), and the rule is the same one: `theme.*` is what a *site* answered, and there is no question here for it to answer — a webfont is a file in the theme's own directory at a size the theme claims, and a site cannot move either. Left in, it put `font: <theme editorial default — editorial/theme.yaml:34>` on `snypd://config` and 14 tokens on `tokens.learn.editorial`, which is how it was found. `theme.font` written in `snypd.yaml` is now a warning naming the line, and so is `theme.variations` — the loose end decision 128 left, closed in the session that would otherwise have added a second one.

**132. The font budget is the theme's number, and `page.font.kb` is `exact`.** A site affords its plugins a script budget because it chose the plugins (84); it affords its theme nothing, because the theme *is* what it chose — so the lane's budget is `font.kb` from `theme.yaml`, capped at 40, and 0 for a theme that ships none. It passes CI at `≤ budget` and not at 80 % of it, for the reason `Metric.exact` exists (S19c): `CI_FACTOR` is headroom for a clock, a file is 31,056 bytes on every machine that ever reads it, and 80 % of a declared 31 KB is 24.8 KB — a budget nobody wrote down. The slack that is real is already in the declaration, which is the round number above the file.

**133. The install gets a lane, and only the part this repository owns gets a budget.** `install.download.mb` and `install.binary.mb` are report-only and are meant to stay that way: 94 % of both is Bun's runtime, and a gate that fails on somebody else's release is a gate people learn to re-run until it passes. The budgeted row is `install.code.mb` — the release binary minus a one-line program through the same `compile()`, so the runtime cancels on both sides and what is left is every dependency, every bundled theme and the spec: **5.14 MB against 8**. The floor is compiled on the spot rather than remembered, because a constant there would be a claim about a Bun version and the subtraction is only honest if both numbers come from the same compiler on the same afternoon. This is decision 54's rule pointed at the one surface it had never been pointed at: a thing no suite visits has no gates, and until now the thing 100 % of users wait for was that thing.

**134. A generated workflow installs once.** Three `npx -y` lines were three tree verifications of the same pinned package, at 2.2 s each — pinning buys reproducibility and not speed, which was measured rather than assumed — on top of a 37 MB download nothing was keeping between runs. One `npm install -g @snypd/cli@<version>`, three bare `snypd` calls, and `~/.npm` cached on the version the install is pinned to: a content repo has no lockfile, so the pin is the only honest cache key there is. The test asserts the *shape* and not the seconds — one registry step, no `npx` in any `run:` line — because the regression this guards against is a fourth verb added later as another `npx -y`, with the install silently paid again.

**135. The post layout has a contents slot, and `base` fills it with nothing.** `technical` wanted a table of contents, and the two ways to get one without this were both wrong: fork `base`'s post layout, which D8 forbids because a copied markup contract drifts the first time the original changes, or give every theme a contents list whether it asked for one or not. So `parts:` gains a fifth name — `toc` — the post layout renders it between the byline and the body, and `base`'s version returns an empty fragment. A theme that says nothing about it emits the bytes it emitted before the part existed, which is not an argument but a measurement: the whole of `corpora/theme` under `editorial` is byte-identical against HEAD except `assets/theme.css`, and that moved for `@view-transition`. The general rule this sets: **a slot a theme may want is a part with an empty default, never a layout fork and never a conditional in `base`.**

**136. The heading tree comes out of the render that issued the ids, and it is the document's own headings.** A toc built from a second pass over the markdown is a toc whose anchors can be wrong — the ids are de-duplicated as they are handed out, so only the renderer knows that the second "Notes" is `notes-1`. `toHtml` takes an out-parameter and fills it; `renderDoc` returns it; `Page.headings` carries it. It collects **direct children of the root only**, which is a filter and was found by looking: an `faq`'s `###` questions are rendered by the same recursion with the same options and get ids exactly as a section heading does — correctly, because they are linkable — and the first contents list this session built named all of them, describing the page's markup instead of its argument. They keep their ids and stay out of the array.

**137. A theme that declares no `font:` is budgeted at nothing, and `technical` is that theme.** Decision 132 gave the lane a theme's own number; this is the other half of it being true, and the reason `technical` ships no face is not thrift. The face that carries a monospace-led theme is the monospace, and monospace is the one category where the system stack is already excellent on every platform — SF Mono, Cascadia, JetBrains Mono, Consolas, DejaVu. Thirty kilobytes to replace a good face with a different good face is thirty kilobytes for a preference. Measured: `tech.font.kb` **0 / 0**, no `@font-face`, no preload, no `assets/fonts/` in `dist/`, and `tech.bytes.kb` **32.19** against `page.bytes.kb` **60.76** — the difference is the font, and it is the whole difference.

**138. `@view-transition` survives a cascade layer, and that was measured rather than assumed.** `@import` inside `@layer` is invalid and is dropped *silently* (decision 126), which made this the obvious next worry for a declaration `loadTheme` wraps in `@layer snypd.theme.<name>` before anybody sees it. It is not the same: it parses as a `CSSViewTransitionRule` inside both `@layer` and `@media`, and a real cross-document navigation between two layered pages fires `pagereveal` carrying a `viewTransition` — checked in Chrome, on two pages served over HTTP, because `document.styleSheets` proving a rule parsed is not the same claim as a browser honouring it. Both themes get it and both get `navigation: none` under `prefers-reduced-motion`. Sixty-nine bytes on `editorial`'s stylesheet, zero JavaScript, and nothing at all on a browser that has never heard of it.

**139. Two verbs, and neither of them is a noun.** X1's spelling is `snypd new theme|plugin` and `snypd check theme|plugin`, not `snypd theme check`. A noun used as a verb promises a family — `theme set`, `theme list`, `theme install` — and that family exists, over MCP, and is never coming to the CLI: writing is over MCP and only over MCP (decision 51, docs/08 §2), and a second front door for it is the thing this product has refused since S4. What a terminal is for is the one artefact that is *not* content. A theme author is a person with an editor open, and two verbs — make one, judge one — is the whole of what they do here. `theme` › scaffold keeps its MCP door and now calls the same function, so there is one starter file rather than two that drift.

**140. `skip` is a status, it is printed, and it is never a pass.** A checker that cannot reach an answer has to say so out loud. `base` declares no colours, so the contrast rules over it report *not checked* rather than passing; a value in a colour space this build does not implement does the same. The tally line counts skips separately for the same reason. A badge awarded by a parser that gave up is worse than no badge, because the shelf's whole claim (123) is that a listing means something.

**141. The contrast gate is arithmetic, and the subset it implements is written down.** The honest way to resolve `light-dark(oklch(from var(--color-bg) calc(l + 0.045) c h), …)` is to ask a browser, and the bench already drives one — but `snypd check theme` is typed on machines with no display, and a check that needs Chromium is a check nobody runs. So OKLCH/OKLab ↔ sRGB, `light-dark()`, `var()`, `color-mix()`, relative colour and a small `calc()` live in `packages/core/src/color.ts`, tested against values fixed from outside it (white on black is 21:1 by definition; `oklch(1 0 0)` is white by definition). Out-of-gamut colours are clamped rather than gamut-mapped, which is the conservative direction — it never reports a colour as further from its background than it is. Everything outside the subset is decision 140's business.

**142. `check theme` judges the theme, not the site it was run from.** A token the site has moved off its default is read back at the theme's default before any rule sees it, and a diagnostic attributed to `snypd.yaml` is not the theme's finding. Otherwise the same theme passes from one directory and fails from another, which would make the shelf's verdict a property of whoever submitted it. The corollary is that a root with no `snypd.yaml` gets the smallest site that loads, in a temp directory, with the real root as a search path — forced by a bug this verb found on its first run: `loadConfig` validates the whole config, a missing `site.name` fails that validation, and `config` then falls back to the spec's defaults with the theme layer simply absent. Nothing threw. Every variation reported the same tokens, and `phosphor` was measured in a light mode it does not have.

**143. A scaffold's own sentence fails the gate.** `personality:` and `description:` are what a listing prints and what an agent picks on, so the scaffold has to write *something* there — an empty key teaches nothing. But a shelf full of "Describe how this theme reads" is a shelf that has stopped meaning anything. The two strings are declared once, in `scaffold.ts`, and `check` compares against them: the only place in this product where *unchanged since the scaffold* is itself the finding. A freshly scaffolded theme therefore fails exactly one rule, and the rule names the sentence its author has to write.

**144. A theme scaffolded over `base` declares its own palette, because `base` declares none.** Found by running the two new verbs back to back, which is the loop they exist to close. The starter stylesheet has said `background: var(--color-bg)` since U1 and `base` has never declared `color.bg` — so a theme made this way came out referencing eight custom properties that resolve to nothing, and rendered unstyled. The comment above the stylesheet even listed a palette: the *active* theme's, which the new theme does not extend and cannot see. The scaffold now writes twelve declared, described, `customisable` tokens when the parent declares none, and their values clear 4.5:1 on all seven pairs in both modes — asserted by the checker shipped beside them, because a scaffold that fails its own gate is a scaffold nobody should start from.

**145. There will never be a visual designer, a dashboard, or a WYSIWYG.** Super is building one, and says why: *"those without coding knowledge struggle to make their site look how they want."* That is a true problem for their user and not one ours has — ours arrives with an agent that writes CSS, and `snypd new theme` → `snypd check theme` already closes the loop with real WCAG numbers rather than a preview. Building one would contradict principle 1 outright (*if it isn't a resource, tool or prompt, it doesn't exist*) and would solve a problem we do not have, at the cost of the only thing that makes the product coherent. This is recorded as a decision and not a preference because it is the most likely piece of well-meant competitive advice we will receive, and the next person to propose it is owed an argument rather than a shrug. Sunny's call, 13 Sep 2026, on docs/13 §2 Q4.

**146. The tagline is reordered, not renamed.** *"Publish a website from the harness you already have open"* leads; *"Your CMS is wherever your agent is"* becomes the strapline; *"A CMS your agent can actually use — markdown in your repo, static HTML out, zero JS"* is the sub-paragraph. All three sentences are already in docs/00 §One paragraph and all three are already true, so nothing here is a claim that has to be earned — the only change is which one is set largest. The current line names a *location*, which is a good second sentence and a weak first one: it presumes the reader already accepts that a CMS has a location worth arguing about, and a launch visitor gives that premise about four seconds. Decided 13 Sep on docs/13 §2 Q1 (candidate C), ahead of its session-12 deadline, because L1 sets the hero and re-cutting at L2 costs screenshots. **The edit itself rides L2** (docs/13 §3.1): README and the snypd.rocks hero, one ordering change in each.

**147. Script is weighed, never stripped.** docs/11 §3 already ruled out sanitising (the source is the twin, docs/01 §2; decision 102), and H2 makes the alternative concrete: the build scans the page it just wrote, sums the script on it against `bench.budgets.jsKb`, and refuses the whole build with one message naming every page over — page, line, source, bytes. The number is deliberately the one P2 already had, so the site states what it affords in one place and there are exactly three readers of it: what a plugin *declared* (`loadPlugin`), what the build *wrote* (`assertClientBudget`), what the browser *fetched* (`page.js.kb`). A site-local `src` is weighed by the file the build wrote; a data block (`application/ld+json`, any non-JavaScript `type`) is not script, by the browser's own test. The check runs inside the index transaction so a refusal leaves no route row claiming bytes nothing approved.

**148. A declaration may stand in for bytes only for script its own plugin rendered.** A remote script cannot be weighed before it runs. The first rule — unweighable is over every budget — refused `analytics`, which is the plugin decision 84 was written for, so the rule is now: `slot()` records the signature of each script site a plugin's slot rendered, and when a page carries a remote script with that plugin's signature, the plugin is charged the larger of the bytes the build could weigh and its `client:` declaration. Attribution is by *who rendered it*, not by host: a host allow list would pass the same `<script src>` pasted into a post, which is finding 1 with extra steps. A plugin that declared nothing has nothing to stand in; a remote script from a content file, a layout or an agent has no plugin and no declaration, and is over any budget, however large.

**149. Lint rule 13 fires on script, not on raw HTML.** Raw HTML is correct CommonMark and the reason an iframe embed, a `<details>` or a `<video>` works; a rule against it would be noise on every legitimate post and would teach authors to ignore rule numbers. `inline-script` is an **error** because it is not advice — it reports the thing the build will refuse, on the source line, earlier. Code fences and inline code are not raw HTML, so a post *about* script stays writable.

---

## 9. Risks

| Risk | L | Mitigation |
|---|---|---|
| **The npm credential blocks E3, and E3 carries D7** | High | It is one secret and one re-run; the durable form (trusted publishing) removes the class. Nothing downstream is blocked meanwhile — sessions 1–9 do not need a release |
| **Nine new sessions is docs/10's "scope grows to the date" risk, again** | High | The date moved *first*, with slack, rather than the scope shrinking under pressure. If 6 Oct is at risk, sessions 6–9 go post-launch before sessions 2–5 do — hardening nobody sees loses to the gallery everyone sees |
| ~~**The webfont costs more than 40 KB, or the metric match is imperfect and CLS moves**~~ | — | **Closed, 13 Sep (B1).** 30.33 KB of 40, `page.cls` 0 on both viewports and every route. The cost it did land on was the *italic*, not the budget — see §7b |
| **`@layer` changes how an existing sheet resolves** | Medium | Only two sheets exist and one is empty. The byte-diff of `dist/` across the change is the test |
| ~~**`theme check` becomes a second product**~~ | — | **Closed, 13 Sep (X1).** Sixteen rules; fifteen of them read a refusal the loader or `loadConfig` already makes. The exception was allowed on purpose and is the one §5 item 4 asked for: the contrast gate, ≈100 lines of colour arithmetic, with the subset it implements written down and everything outside it reported as *not checked* (decisions 140, 141) |
| **A property test finds something large the week before launch** | Medium | That is the point of running it in session 8 and not session 12. A finding with three weeks left is a fix; the same finding on 5 Oct is the fallback date |

---

## 10. Open questions — the calls that are Sunny's

1. **The npm credential: a new token now, or trusted publishing now?** The token is five minutes and
   expires again; trusted publishing is twenty and does not. Recommended: the token to unblock 0.1.4
   today, trusted publishing in the same session that touches the supply-chain rows (finding 9).
2. **Raw HTML: `warn` or `refuse` by default?** Decision 122 says `warn`. `refuse` makes the claim
   absolute and annoys the first person who wants an embed.
3. **Does the GitHub name matter enough to chase?** `github.com/SNYPD` is a dormant 2023 user account, so
   the org name is not available. Options: a suffixed org, a name-release request to GitHub, or stay on
   the personal account and let the domain carry the brand. One email, not a blocker.
4. **Trademark before or after launch?** MIT gives away everything except the name. Before is cheaper to
   argue; after is cheaper to afford.
5. **Do we keep shipping a Bun runtime to people who already have one?** I0 measured it: the release
   binary is 83.85 MB, a one-line program through the same recipe is 78.71 MB, and **snypd is 5.14 MB of
   it — 6 %**. So 37 MB crosses the wire for the person, and 37 MB again for the host on every deploy,
   and ~94 % of it is a second copy of the runtime that `bunx` proves is already installed. The fix is not
   an optimisation, it is a distribution shape: `@snypd/cli` stops listing the five binaries as
   `optionalDependencies`, ships the bundle instead (~5 MB), runs it on a `bun` it finds, and fetches a
   binary on first run only for a machine that has none. **The cost is the thing S18d′ bought:** today
   every byte arrives through npm with provenance, in one resolution, and works offline after it. A
   first-run fetch is a second trust story and a second failure mode. Recommended: not before launch —
   the number is now measured and the row is in `bench/latest.md`, which is enough to decide it later with
   evidence rather than now with a deadline.
6. **May `init` write a durable path into `.mcp.json` instead of `bunx`/`npx`?** Branch 2 exists because
   the file is committed and a clone on another machine is its second reader (docs/08 §12.8, F5). The
   cost of that portability is **+240 ms per session on `bunx` and +2.2 s on `npx`** — against a D2 budget
   of 50 ms for the whole cold start — plus the case nobody has hit yet: a collected cache puts a 37 MB
   download in front of `initialize`, with no error on any surface. Hardlinking the running binary into
   `~/.snypd/bin/snypd-<version>` costs 0.1 ms on one filesystem and 1.0 s across two, and takes session
   start to 25 ms. It breaks the clone. Options: take the trade and have `site` › doctor repair a clone;
   keep branch 2 and accept the seconds; or write the durable path *and* teach doctor to rewrite it —
   which is the two-reader problem solved rather than chosen between, and about a session of work.

---

## 11. Ready to start

~~Session 1 is **H0**~~ · ~~session 2 is **U6a**~~ · ~~session 3 is **B1**~~ — all three landed 13 Sep
(§7b). Each one paid for the next. H0's `cssValue` already had `oklch`, `color-mix` and the relative
colour syntax on its allow list, so every value in U6a's three variations was checked by machinery
written the day before; U6a's `font.heading` is the token B1's face attaches to, and its variation layer
is the precedent that made `font:` a declaration rather than configuration — the same rule, found the
same way, by the same budget row.

**I0 came in sideways**, between sessions 3 and 4 and not on this list: asked to check the local path and
improve install → onboarding → deploy, it found that only the middle third had ever been measured and that
the outer two are where the time is — ~37 MB and ~7 s at the front, and the same again on every deploy,
in front of a build that takes 0.79 s. It left two calls in §10 rather than taking them (questions 5 and 6),
because both trade something S18d′ and S18j bought deliberately.

~~Session 4 is **U6b**~~ — **done, 13 Sep** (§7b). The guess above was right twice and wrong once. Right
that `technical` would not want a face: it ships none, and that is decision 137 rather than thrift — the
face that carries a mono-led theme is the mono, and every platform already has a good one. Right that
`font:` being in the contract meant no new machinery for it. **Wrong that a second theme needed no new
machinery at all**: the contents list turned out to be one part and one field short of buildable, which
is exactly the question the session was for, and both additions are shaped so a theme that ignores them
pays nothing — measured, not argued (decisions 135, 136).

~~Session 5 is **X1**~~ — **done, 13 Sep** (§7b). It did start better off, and for the reason given: five of
the six surfaces it checks were built in the four sessions before it, and fifteen of sixteen rules are a
refusal something else already makes, worn by a third audience. The paragraph was wrong about the sixth.
The contrast gate was not cheap because the values were *there*; it was cheap only if the values could be
read, and `oklch(from var(--color-bg) calc(l + 0.045) c h)` — which is what a good 2026 theme writes, and
what both of ours do — is not a number until something converts it. That something is now a hundred lines
in `core/src/color.ts` with its subset declared and everything outside it reported as not checked
(decisions 140, 141). It was also wrong about the spelling: `snypd theme check` became `snypd check theme`,
because a noun used as a verb promises a family that lives over MCP (139).

The session's own loop — scaffold a theme, then check it — found three things no test could have: a
scaffold whose stylesheet named eight properties `base` has never declared (144), a placeholder sentence
that passed the gate for the shelf (143), and a config loader that silently drops the theme layer when
there is no site to load (142). Which is the argument for building `new` and `check` in one session rather
than two.

Session 6 is **H2**: finding 1 — the build-time JavaScript assertion and the raw-HTML lint rule — whose
exit is **E6**, *the 0 KB claim enforces itself, on the user's site and not the corpus*. It is the first
of four sessions with no visible surface at all, and the last one for a while that is about what the
product promises rather than what it looks like. Two things X1 leaves it. The `skip`-is-never-a-pass rule
(140) is the shape E6 needs: a site whose script budget cannot be measured must fail loudly rather than
build quietly. And the raw-HTML default is still open — `warn` or `refuse`, §10's oldest unanswered
question, and H2 is where it stops being deferrable because H2 is the session that writes the rule.
