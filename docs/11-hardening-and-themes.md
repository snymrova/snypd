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

**Closed since.** Findings 5, 2 and 10 in H0 (§7b, decisions 119, 120, 126). The other eight stand as
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
and whatever your OS has*.

**2 · Variations** (U6a, already scheduled) are the cheapest breadth available: three complete token sets
per theme, each named and described. Worth pairing with OKLCH and relative colour syntax —
`oklch(from var(--color-accent) calc(l - .08) c h)` derives hover, border and surface from one accent
instead of declaring twelve, so a variation is a few lines and stays perceptually even.

**3 · The Baseline CSS that is free.** `@layer` (finding 5, and an extensibility fix before it is an
aesthetic one); container queries, so an entry card adapts to *its* column rather than the viewport;
`text-wrap: balance` on headings and `pretty` on prose; and `@view-transition`, which gives a static
multi-page site cross-document transitions with **zero JavaScript** and is silently ignored where
unsupported. None of these move `page.js.kb`, which is the point of choosing these five.

**4 · A contrast gate.** With finding 2's validation in place, WCAG ratios can be computed from the token
set at `theme check` time: a theme whose muted-on-background is below 4.5:1 fails before a human looks.

`technical` (U6b) should be a different argument rather than a recolour: a denser measure, mono for
headings, tables and code as first-class citizens, a table of contents from the heading tree. Three
themes × three variations is nine looks from one contract, and the gallery is what makes the shelf worth
visiting.

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
| E6 | The 0 KB claim enforces itself | a build emitting script beyond the declared client budget fails, **on the user's site, not the corpus** |
| E7 | An incremental build equals a cold build | a property, under interruption and under concurrency — not an example |
| E8 | A stranger's theme can be judged by a machine | `theme check` passes `base` and `editorial` and fails a deliberately broken fixture, naming which rule |
| E9 | The gallery is worth visiting | three themes × three variations; `page.font.kb` declared and met; `page.a11y.violations` 0 on every one |

### Sessions, in order

Thirteen, from 13 Sep. docs/10 §7.2's remaining six are unchanged and keep their names; everything new is
interleaved where its cost is lowest.

| # | Session | Deliverable | Exit |
|---|---|---|---|
| 0 | **L0** | **this session** — the fast-forward, v0.1.4, the paperwork, this document | E1 ✅ · E2 · E3 ⏳ |
| 1 | **H0** | `@layer` in the concatenated sheet (finding 5) + the value guards (findings 2, 10) | **E4 ✅ · E5 ✅**, 13 Sep — §7b |
| 2 | **U6a** | Style variations (docs/10 §5.2) — `variations:`, `theme.variation`, `theme › set variation`, `editorial` × 3 — with OKLCH and relative colour | switching changes exactly the named tokens; `tokens.learn` ≤ 6,000 |
| 3 | **B1** | The font pass: one subsetted variable WOFF2, metric-matched fallback, the `page.font.kb` lane | `page.cls` still 0; the lane is declared, not discovered |
| 4 | **U6b** | `technical` from the contract + the `build-theme` prompt + the design pass at 390 and 1280; `text-wrap` and `@view-transition` fold in here | D8 |
| 5 | **X1** | `snypd theme check` / `plugin check` + `snypd new theme\|plugin` scaffolds | E8 |
| 6 | **H2** | Finding 1 — the build-time JS assertion and the raw-HTML lint rule | E6 |
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

---

## 9. Risks

| Risk | L | Mitigation |
|---|---|---|
| **The npm credential blocks E3, and E3 carries D7** | High | It is one secret and one re-run; the durable form (trusted publishing) removes the class. Nothing downstream is blocked meanwhile — sessions 1–9 do not need a release |
| **Nine new sessions is docs/10's "scope grows to the date" risk, again** | High | The date moved *first*, with slack, rather than the scope shrinking under pressure. If 6 Oct is at risk, sessions 6–9 go post-launch before sessions 2–5 do — hardening nobody sees loses to the gallery everyone sees |
| **The webfont costs more than 40 KB, or the metric match is imperfect and CLS moves** | Medium | The budget lane is the stop rule: over 40 KB or `page.cls` ≠ 0 and B1 ships the system stack it started with, with the measurement written down |
| **`@layer` changes how an existing sheet resolves** | Medium | Only two sheets exist and one is empty. The byte-diff of `dist/` across the change is the test |
| **`theme check` becomes a second product** | Medium | Every check it runs already exists in the bench or the loader. If a check needs new machinery it is out of scope for X1 |
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

---

## 11. Ready to start

~~Session 1 is **H0**~~ — landed 13 Sep (§7b). Session 2 is **U6a**, and it needs nothing from anyone
either: H0 gave it the guard that makes a variation's tokens checkable and the layer the variation sheet
belongs in.
