# snypd bench — page

**Version** 0.1.0-s14 · **Bun** 1.4.0 · **Date** 2026-08-28T07:38:43.583Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `page.js.kb` | 0 KB | 0 KB | ✅ | editorial: 6 routes × 1280/390 px — /posts/every-primitive-once/, /about/, /authors/sunny/, /, /category/engineering/, /tag/markdown/; worst /posts/every-primitive-once/ @ 1280 (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `page.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 across 12 route/viewport pairs |
| `page.bytes.kb` | 27.06 KB | — | report | worst /posts/every-primitive-once/ @ 1280: 14.08 KB html + 9.8 KB css + 3.19 KB img, 3 requests — uncompressed, which no host serves; report-only |
| `page.lcp` | 176 ms | — | report | worst /about/ @ 390; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `page.cls` | 0  | 0.05  | ✅ | worst /posts/every-primitive-once/ @ 1280; caused by the theme, not the network — the one vital localhost measures honestly |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
