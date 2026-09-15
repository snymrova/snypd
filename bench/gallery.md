# snypd bench — gallery

**Version** 0.1.4 · **Bun** 1.4.0 · **Date** 2026-09-15T10:14:48.894Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `gallery.looks` | 6 looks | — | report | editorial-paper, editorial-ink, editorial-broadsheet, base, technical-graphite, technical-phosphor — /posts/every-primitive-once/ at 1280/390 px, viewer prefers light; PNGs in sites/snypd.rocks/content/media/gallery/ |
| `gallery.editorial-paper.js.kb` | 0 KB | 0 KB | ✅ | editorial › paper; worst @ 1280 |
| `gallery.editorial-paper.font.kb` | 30.43 KB | 31 KB | ✅ | editorial › paper; worst @ 1280; budget 31 KB is the theme's own font.kb |
| `gallery.editorial-paper.a11y.violations` | 0 violations | 0 violations | ✅ | editorial › paper; axe-core, 0 at both widths |
| `gallery.editorial-ink.js.kb` | 0 KB | 0 KB | ✅ | editorial › ink; worst @ 1280 |
| `gallery.editorial-ink.font.kb` | 30.43 KB | 31 KB | ✅ | editorial › ink; worst @ 1280; budget 31 KB is the theme's own font.kb |
| `gallery.editorial-ink.a11y.violations` | 0 violations | 0 violations | ✅ | editorial › ink; axe-core, 0 at both widths |
| `gallery.editorial-broadsheet.js.kb` | 0 KB | 0 KB | ✅ | editorial › broadsheet; worst @ 1280 |
| `gallery.editorial-broadsheet.font.kb` | 30.43 KB | 31 KB | ✅ | editorial › broadsheet; worst @ 1280; budget 31 KB is the theme's own font.kb |
| `gallery.editorial-broadsheet.a11y.violations` | 0 violations | 0 violations | ✅ | editorial › broadsheet; axe-core, 0 at both widths |
| `gallery.base.js.kb` | 0 KB | 0 KB | ✅ | base; worst @ 1280 |
| `gallery.base.font.kb` | 0 KB | 0 KB | ✅ | base; the theme declares no font, so the budget is 0 |
| `gallery.base.a11y.violations` | 0 violations | 0 violations | ✅ | base; axe-core, 0 at both widths |
| `gallery.technical-graphite.js.kb` | 0 KB | 0 KB | ✅ | technical › graphite; worst @ 1280 |
| `gallery.technical-graphite.font.kb` | 0 KB | 0 KB | ✅ | technical › graphite; the theme declares no font, so the budget is 0 |
| `gallery.technical-graphite.a11y.violations` | 0 violations | 0 violations | ✅ | technical › graphite; axe-core, 0 at both widths |
| `gallery.technical-phosphor.js.kb` | 0 KB | 0 KB | ✅ | technical › phosphor; worst @ 1280 |
| `gallery.technical-phosphor.font.kb` | 0 KB | 0 KB | ✅ | technical › phosphor; the theme declares no font, so the budget is 0 |
| `gallery.technical-phosphor.a11y.violations` | 0 violations | 0 violations | ✅ | technical › phosphor; axe-core, 0 at both widths |

CI passes at ≤ 80 % of budget (docs/07 §3), except where a row is a counted design statement rather than a clock, which passes at ≤ budget. Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.


| Look | Width | File | Page weight | axe | Reads as |
|---|---|---|---|---|---|
| editorial › paper | 1280 | sites/snypd.rocks/content/media/gallery/editorial-paper-1280.png | 67.7 KB | 0 | Warm cream, oxblood accent, serif throughout — the theme as written. |
| editorial › paper | 390 | sites/snypd.rocks/content/media/gallery/editorial-paper-390.png | 67.5 KB | 0 | Warm cream, oxblood accent, serif throughout — the theme as written. |
| editorial › ink | 1280 | sites/snypd.rocks/content/media/gallery/editorial-ink-1280.png | 67.82 KB | 0 | Dark only: a cool near-black, one cyan, the same measure. |
| editorial › ink | 390 | sites/snypd.rocks/content/media/gallery/editorial-ink-390.png | 67.62 KB | 0 | Dark only: a cool near-black, one cyan, the same measure. |
| editorial › broadsheet | 1280 | sites/snypd.rocks/content/media/gallery/editorial-broadsheet-1280.png | 67.71 KB | 0 | A wider column, sans headlines, tighter leading, a press blue. |
| editorial › broadsheet | 390 | sites/snypd.rocks/content/media/gallery/editorial-broadsheet-390.png | 67.52 KB | 0 | A wider column, sans headlines, tighter leading, a press blue. |
| base | 1280 | sites/snypd.rocks/content/media/gallery/base-1280.png | 22.33 KB | 0 | Unstyled. Semantic HTML only, one class per primitive (`snypd-<name>`), so a child theme styles it without touching markup. |
| base | 390 | sites/snypd.rocks/content/media/gallery/base-390.png | 24.81 KB | 0 | Unstyled. Semantic HTML only, one class per primitive (`snypd-<name>`), so a child theme styles it without touching markup. |
| technical › graphite | 1280 | sites/snypd.rocks/content/media/gallery/technical-graphite-1280.png | 38.52 KB | 0 | Cool neutral, one blue, follows the reader's light or dark — the theme as written. |
| technical › graphite | 390 | sites/snypd.rocks/content/media/gallery/technical-graphite-390.png | 38.52 KB | 0 | Cool neutral, one blue, follows the reader's light or dark — the theme as written. |
| technical › phosphor | 1280 | sites/snypd.rocks/content/media/gallery/technical-phosphor-1280.png | 38.55 KB | 0 | Dark only: amber on near-black, mono throughout, the terminal it is named for. |
| technical › phosphor | 390 | sites/snypd.rocks/content/media/gallery/technical-phosphor-390.png | 38.55 KB | 0 | Dark only: amber on near-black, mono throughout, the terminal it is named for. |
