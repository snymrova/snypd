# snypd bench — page

**Version** 0.1.0-s18c · **Bun** 1.4.0 · **Date** 2026-08-31T14:46:04.689Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `page.js.kb` | 0 KB | 0 KB | ✅ | editorial: 6 routes × 1280/390 px — /posts/every-primitive-once/, /about/, /authors/sunny/, /, /category/engineering/, /tag/markdown/; worst /posts/every-primitive-once/ @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `page.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 12 route/viewport pairs |
| `page.bytes.kb` | 27.11 KB | — | report | worst /posts/every-primitive-once/ @ 1280: 14.12 KB html + 9.8 KB css + 3.19 KB img, 3 requests — uncompressed, which no host serves; report-only |
| `page.lcp` | 544 ms | — | report | worst /posts/every-primitive-once/ @ 390; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `page.cls` | 0  | 0.05  | ✅ | worst /posts/every-primitive-once/ @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |
| `desk.js.kb` | 0 KB | 0 KB | ✅ | desk: 2 routes × 1280/390 px — /_snypd, /_snypd/review/post/a-draft-in-flight; worst /_snypd @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `desk.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 4 route/viewport pairs |
| `desk.bytes.kb` | 17.23 KB | — | report | worst /_snypd @ 1280: 7.41 KB html + 9.83 KB css + 0 KB img, 2 requests — uncompressed, which no host serves; report-only |
| `desk.lcp` | 508 ms | — | report | worst /_snypd @ 1280; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `desk.cls` | 0  | 0.05  | ✅ | worst /_snypd @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |
| `desk.first.js.kb` | 0 KB | 0 KB | ✅ | first run: 2 routes × 1280/390 px — /_snypd, /; worst /_snypd @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `desk.first.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 4 route/viewport pairs |
| `desk.first.bytes.kb` | 18.52 KB | — | report | worst /_snypd @ 1280: 8.69 KB html + 9.83 KB css + 0 KB img, 2 requests — uncompressed, which no host serves; report-only |
| `desk.first.lcp` | 368 ms | — | report | worst /_snypd @ 390; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `desk.first.cls` | 0  | 0.05  | ✅ | worst /_snypd @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
