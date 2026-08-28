# snypd bench — page

**Version** 0.1.0-s13 · **Bun** 1.4.0 · **Date** 2026-08-28T06:05:31.055Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `page.js.kb` | 0 KB | 0 KB | ✅ | editorial: 6 routes — /posts/every-primitive-once/, /about/, /authors/sunny/, /, /category/engineering/, /tag/markdown/; worst /posts/every-primitive-once/ (0 B loaded + 0 B inline/handlers). JSON-LD excluded: it is data |
| `page.a11y.violations` | 0 violations | 0 violations | ✅ | axe-core, 0 on 6 routes (worst /posts/every-primitive-once/) |
| `page.bytes.kb` | 27.83 KB | — | report | worst route /posts/every-primitive-once/: 13.99 KB html + 10.66 KB css + 3.19 KB img, 3 requests; report-only |
| `page.lcp` | 88 ms | — | report | worst route /; localhost, unthrottled — the shape of the page, not a field number; report-only |
| `page.cls` | 0  | — | report | worst route /posts/every-primitive-once/; layout shift is theme-caused and *is* comparable off localhost; report-only until the editorial pass lands (S14) |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
