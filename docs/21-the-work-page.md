# 21 — The work page: a case as three bands, held to the standard

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 18 Sep 2026 (S29 · R3)
**What this is:** the outcome of docs/20 §2.3 — the studio theme's own layout for a `work` type, its archive, and the audit that held both to docs/18 §1's standard. Short, because the standard and the capture pattern are docs/18's and docs/19's; this records what was built and the numbers.

## 1. What was built

- **`themes/studio/layouts/work.tsx`** — a case as three bands. The hero on the scheme `bands` starts with: the author's `::cover` (or one from frontmatter — eyebrow, display title, the description as subtitle, the picture), the picture capped at 72 vh so the facts never fall below the fold on a tall cover; under it the **facts strip** on the wide track, one hairline, one cell per fact: *Client* (the `client` field docs/20 §2.1 declares), one cell per taxonomy the type declares, grouped and labelled by the taxonomy's name (*Services*, *Industry*), every term a link, and *Year* (`year`, else the date's). The body band in the reading column on one scheme, its `##` numbered as the front page's bands are. The close band on the opposite scheme: the studio's call to action — two settings, `caseCtaTitle` and `caseCtaHref` (`caseCtaLabel` defaults to *Talk to the studio*), nothing shown without the link — beside the **next case** as one card, from the neighbours the build now hands every dated item (`LayoutProps.adjacent`, decision 198); under a hairline, *Led by …*, the date, the Markdown twin.
- **`themes/studio/layouts/work-index.tsx`** — the archive: the title (the menu's word, R1), a lede read from the entries (*5 cases, 2025–2026.*), the cards. `/posts/` keeps `base`'s index, so the notes are a list and the cases a grid on one site.
- **Cards carry a term.** The studio card's eyebrow read `frontmatter.category`, which a `work` does not have; every listed entry now carries its `terms` (decision 198) and the card shows the first — *Product* on a case, *Process* on a note.
- **The sheet** (`themes/studio/theme.css`): the case's `main` is a plain block like the front page's, each band the grid; the facts grid 4 → 2 → 1 with `data-count` for a type with fewer cells; the close band's two columns stack under 64 rem; the footer keeps the alternation after a case as it does after the front page.
- **theme.yaml** restates the six layouts and adds `work` and `work-index` — arrays replace up the chain, so a theme that adds one layout writes eight names.

## 2. The audit

Playwright, Chrome, `examples/studio/dist` served locally, `/work/kiln-to-table/` and `/work/`, light scheme.

| | 1280 | 390 |
|---|---|---|
| Left edge of cover, h1, facts, body prose, body `##`, stat row, cta, meta, footer | **121** on every one | **32** on every one |
| The next card (second column of the close grid) | 611 | 32 (stacked) |
| Cover picture height (cap 72 vh) | 648 | 207 |

One edge (decision 188) on the first capture after the fix below. axe-core over `/work/`, three cases, `/posts/`, a note and a term page at 1280 and 390: **0 violations across 14 pairs**, 0 one viewport down; js 0 KB; font 32.74 KB against 33 declared; cls 0; `media.kb` 708 worst (a case with a clip). `check theme studio` passes, 18 rules, `coverage.layouts` reads *the six, and work, work-index*.

**The one finding, fixed before the numbers above:** the first build nested the bands inside the reading column — `main:not(.snypd-home)` made the case's `main` the three-track grid, so `article` sat in the text column and every band was a grid 40 rem wide: every edge measured 345 at 1280, and axe found one contrast node on two cases. The front page's rule, applied: `main.snypd-work` is a plain block, `.snypd-page` is `display: contents`, each band is the grid.

## 3. Not done, and why

- The stat counters read 0 in a full-page capture (docs/18, known: the `view()` timeline never fires in a capture that scrolls nothing).
- The facts strip reads `client` and `year` by name because docs/20 §2.1 declares them on the demo's type; a `work` without them shows the cells it has. A type declaring other fields would need its own layout — that is what a layout is for.
- `sourceOrganization` in the schema (docs/20 §3 · 3) stays undone; decision 196 says why.
