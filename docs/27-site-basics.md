# 27 — Site basics: the icon, the not-found page, share cards, and pages that are already there

**Owner:** PM · **Engineer:** Claude Code · **Decider:** Sunny · **Written:** 18 Sep 2026 · **Session:** S36, branch `s36-site-basics`
**Asked for:** *"run an audit on our cms that if it provide og image, opengraph tags, good seo, agentic friendliness, favicon and all other such needs of a great website"* — then *"cms can guide the agent to create site icon using svg · guide agent to create 404 pages · provide a script to create image as per the page and style of the theme"* — then *"the page loads, there should be absolutely no loading of any kind, it should be instant."*
**Status:** built and tested 18 Sep 2026; decisions 211–217 in docs/11 §8. The three calls in §3 were Sunny's, answered before the build.

---

## 1. The audit, in one table

Measured against the live snypd.rocks and the code that makes it (`themes/base/parts/shell.tsx`, `packages/render/src/emit.ts`, `build.ts`).

| Already right | Missing (before S36) |
|---|---|
| title, description, canonical, `lang`, viewport | **no favicon**: `site.icon` unset, `/favicon.ico` 404 on every page; no touch icon |
| `og:*` with image size, `article:*` times, `twitter:card` | **404 was an empty body** — `dist/` had no `404.html` |
| JSON-LD: WebSite, BlogPosting, Person, WebPage, FAQPage, HowTo | **one share image for every page** without a `cover` |
| sitemap with lastmod, robots, RSS, `llms.txt`, `.md` twins, JSON API | `og:image:alt` only from `cover.alt` |
| preview builds `noindex` + `Disallow` | `noindex:` frontmatter declared by the spec since v0.1, **read by nothing** |
| `_redirects` + meta-refresh pages, IndexNow plugin | every asset `max-age=0` — each navigation revalidates CSS, font, logo before painting |
| | a 160–180 ms root crossfade on every navigation, which reads as loading |

Still open after S36, deliberately (§5): `llms.txt` promises `Accept: text/markdown`, which only the local server honours; no `og:locale`/`twitter:site`; no BreadcrumbList; no security headers; no Organization/logo node.

## 2. What was built

**Icon (the agent draws it).** The `site-basics` prompt gives the rules an SVG favicon has to meet — 32-unit square viewBox, one mark, paths only and no `<text>`, strokes ≥ 2 units, token colours as hex, a `prefers-color-scheme` flip inside the file, under 1 KB — then `site.icon = /media/icon.svg`. The shell links an SVG icon as `image/svg+xml`. `snypd cards` rasterises it into `content/media/icons/favicon.ico` (a PNG inside an ICO — no encoder) and a 180 px `apple-touch-icon.png` on the theme's ground; the build serves both from `/` too, and the shell links the touch icon.

**Not-found page (the agent writes it; the build never leaves it blank).** A page at `/404` is also written as `/404.html`. A site without one gets the theme's `page` layout over three plain sentences, so a miss wears the site's header, menus and footer from day one. Either is `noindex`, has no canonical, and is kept out of the sitemap and `llms.txt`. `wrangler.toml` (template and snypd.rocks) gets `not_found_handling = "404-page"`; `snypd dev`/`serve` serve it on a miss with a 404 status.

**Share cards (a script, in the theme's style).** `snypd cards [root] [--force]` builds the site, reads the JSON API for every listed page without a `cover.image`, and photographs a 1200 × 630 card per page with the bench's own CDP driver on the built site's origin, wearing `theme.css`: the theme's `logo` setting (or icon + name), an eyebrow (type · date), the title, the description, the URL. Markup is `.snypd-card-*` `div`s with defaults in `snypd.base`, so a theme restyles a card from its own sheet; `h1`/`p` were tried first and lost to the theme's page-sized rules. Incremental through `content/media/cards/.cards.json`. The shell shares `cover.image` → the page's card → `site.image`, except at `/`, where `site.image` wins. Lint rule 20 treats `cards/` and `icons/` as named by the build.

**`noindex:` works.** The field the spec declared is now honoured: `<meta name="robots" content="noindex">`, no canonical, out of the sitemap, the feed and `llms.txt`.

**Instant pages.**
- `<script type="speculationrules">` in the shell: Chrome and Edge prerender a same-origin page on hover/pointerdown (`moderate`), excluding the Desk, `/api/`, `/media/` and non-HTML files. A data block, not script: the build's JS gate already skipped it by type; `page.js.kb` counted every non-JSON `<script>` and now counts only executable types.
- `theme.css?v=<hash>` and the font's `?v=<hash>` (the `@font-face` src and the preload name the same url), and a `_headers` file: `/assets/*` immutable for a year, `/media/*` an hour + a week stale-while-revalidate. A navigation no longer waits on three revalidations before it paints.
- The root crossfade is gone from folio and all three bundled themes (`animation: none`); the title morph stays.

**Guidance.** Prompt `site-basics` (icon → 404 → descriptions → cards → check). `site` › doctor gains four rows on a site with content: icon, not-found page, cards, items with no description — each naming the prompt or command that finishes it. `get-started` branch C offers `site-basics`; `write-post` mentions `snypd cards` where a site has cards.

## 3. Calls Sunny made (18 Sep 2026)

| Question | Answer |
|---|---|
| Prerender with `speculationrules`, a script tag that runs nothing? | Yes, prerender, `moderate` |
| The navigation animation | Drop the root crossfade, keep the title morph |
| Cards drawn by a local Chrome, PNGs committed | Yes — the host never needs a browser |

## 4. Decisions

- **211** — Share cards are drawn by a browser from the theme's CSS, locally, and committed; never by the host's build. SVG cards were rejected: the networks that matter do not accept SVG as `og:image`.
- **212** — Image precedence for sharing: `cover.image` → the page's card → `site.image`; at `/`, `site.image` before the card.
- **213** — Every build writes `/404.html`; a page at `/404` replaces the default. The not-found page is `noindex` and unlisted.
- **214** — `noindex: true` is honoured: robots meta, no canonical, out of the sitemap, the feed and `llms.txt` (the feed was added after E7's property caught a stale feed keyed on a surface that left the item out).
- **215** — Assets under `/assets/` are content-versioned and immutable; `_headers` is emitted on every build.
- **216** — Pages prerender on intent through speculation rules. "0 KB JS" is measured by executable type, and a data block is not JS.
- **217** — No crossfade between pages in any bundled theme; a theme may morph named elements.

## 5. Open, for Sunny

1. **The `Accept: text/markdown` line in `llms.txt`** is false on Cloudflare. Drop the sentence, or ship a small Worker rule? Recommend: drop it now, Worker later.
2. **snypd.rocks** needs its own icon, 404 page and cards run — the `site-basics` prompt on the site repo, then a commit and deploy.
3. Vercel ignores `_headers`; `vercel.json` would need the same two rules under `headers`.
