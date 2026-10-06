# B: Section libraries, theme systems and kit precedents, mapped onto snypd's slots

Research for docs/37 (§2 whole site, §4 kits, §7 the shelf). 25 Sep 2026.
Method: primary sources wherever they could be reached. For GitHub repos: `gh api` on the real `package.json`, `theme.json` and pattern directories. For pages behind a login wall (Tailwind Plus): Wayback Machine snapshots. For live sites: fetched directly, with every exemplar URL checked for HTTP 200 on 25 Sep 2026. Where a claim comes from a secondary source, the line says so.

---

## 0. The findings that matter, up front

1. **Every serious precedent already separates structure from style, and snypd's "piece reads tokens" design matches the best of them.**
   - Relume goes sitemap → wireframe (structure only, unstyled components) → Style Guide (colour, type, UI settings applied site-wide in one step).
   - WordPress Twenty Twenty-Five splits a whole look into **colour presets × typography presets × section styles**: 8 colour sets, 7 type pairings and 5 section styles, each a separate JSON file. The 8 "style variations" are named combinations of those.
   - daisyUI keeps a theme down to ~30 tokens, and one of them is `data-theme="lofi"`.
   - **The lesson: kits = named combinations of independent axes.** That is what docs/37 §4 already proposes.
2. **Ghost's official themes are the closest precedent for "a slot with 3–5 named variants".** They are MIT, and their `package.json` `config.custom` is machine-readable. The recurring axes, read from the real files:
   - `navigation_layout`: *Logo on the left / Logo in the middle / Stacked*, in 15 of 17 themes. That is snypd's masthead slot, and three variants is the industry norm.
   - Home header: Source has *Landing / Highlight / Magazine / Search / Off*. Solo has *Side by side / Large background / Typographic profile*. Edition has *Fullscreen / Half screen*. Casper has *Center aligned / Left aligned / Hidden*.
   - Feed: Source has *List / Grid*. Casper has *Classic / Grid / List*. Edition has *Expanded / Right thumbnail / Text-only / Minimal*. Solo has *Classic / Typographic / Parallax*.
   - Post image: Casper has *Wide / Full / Small / Hidden*. Digest and Bulletin have *Full / Wide / Small*.
   - Fonts: *Modern sans-serif / Elegant serif / Consistent mono* is a three-way "face" switch, not a font picker.
3. **WordPress Twenty Twenty-Five ships four whole "blog kits" as template families: `text-blog`, `news-blog`, `photo-blog`, `vertical-header-blog`.** Each one covers home, archive, search, single and page. That is the "kit" idea in the default theme of 43 % of the web, named after what the site *is*.
4. **Commercial libraries count variants in the dozens, but their *archetypes* per section are few (4–8).**
   - Tailwind Plus has 7 blog sections, 7 footers, 11 headers and 6 logo clouds. HyperUI has 12 footers. Relume has many numbered variants per category ("Blog 1 … Blog 68" is visible in its page source).
   - The names are descriptive ("With featured post", "4-column with newsletter", "Split with logos on right").
   - Relume and Cargo use opaque numbers ("Header 44", "P402"). The numbers work for a human scrolling pictures and fail an agent choosing from text. **snypd's one-plain-word names plus a `line:` are better for an agent than either scheme.** Keep them.
5. **Licensing: what we can study versus copy.**
   - Study freely, borrowing ideas and even code (with notice): Ghost themes, daisyUI, HyperUI, shadcn, Hugo and Astro themes, Tufte CSS (all MIT), and WordPress core themes (GPL).
   - Study only, never copy code or assets: Tailwind Plus, Relume, Flowbite Pro, Framer/Webflow/Squarespace/Cargo/Readymag templates, and Once UI's Magic Portfolio (CC BY-NC).
   - Since snypd *draws* pieces in its own CSS from its own tokens, learning layout archetypes from any of them is fine. Layout ideas are not copyrightable. Code, images and exact visual compositions are.

---

## 1. Section taxonomies: the libraries

### 1.1 Relume (commercial; relume.ai)

- **Flow:**
  1. The AI writes a **sitemap** from a brief (pages → sections).
  2. Each sitemap section becomes an unstyled **wireframe** component ("Each section of the sitemap is linked directly to a section in the wireframes"). You can "replace a component but keep the same copy", and "choosing different variants actually changes the entire component in the background".
  3. The **Style Guide builder** suggests colours, typography (Google Fonts, heading + body) and base UI settings. You "shuffle" palettes with the spacebar while keeping type, and it "instantly applies your Style Guide … across your entire site".

  Sources:
  - https://www.relume.ai/resources/docs/how-to-create-and-edit-wireframes-in-the-relume-site-builder
  - https://www.relume.ai/style-guide
  - https://www.relume.ai/resources/docs/concept-creation-using-the-relume-style-guide-builder
  - https://www.relume.ai/whats-new/july-2025-release ("Design View, Smarter Style Guide Generation")
- **Direct analogy:** sitemap ≈ snypd's routes and types. Wireframe component swap ≈ `compose { change: { home: "split" } }`. Style guide shuffle ≈ `seed` + `face`. Relume proves that *keeping the copy while swapping the component* is the UX people want. snypd gets this for free, because content never lives in the piece.
- **Categories (from https://www.relume.ai/components, fetched):**
  - Marketing: Navbars, Footers, Hero Header Sections, Header Sections, Feature, CTA, Contact, Pricing, FAQ, Testimonial, Logo Sections, Team, **Blog Header Sections, Blog Sections, Blog Post Headers**, Career, **Gallery Sections**, **Portfolio Headers, Portfolio Sections**, Banners, Event Item Headers / Event Headers / Event Sections, Multi-step Forms, Stats, **Long Form Content Sections**, Loaders, Comparison, Link Pages, Cookie Consent, **Timeline Sections**.
  - Application UI: shells, sidebars, page and section headers, tables, stacked and grid lists, description lists.
  - Ecommerce: product list, product header, filters.
- **Size:** "1,000+ components". Variants are numbered per category (the Blog category reaches at least `section_blog68` in the page source).
- **Notable:** Relume splits *"Blog Header"* (the top of the list page) from *"Blog Sections"* (the entries) from *"Blog Post Header"* (the post cover). That is exactly snypd's new **list** slot versus **entries** versus **cover**, which validates the `list` slot in docs/37 §7. It also has *Portfolio Header* versus *Portfolio Section*, which maps to **feature**'s cover and facts.
- **Licence:** commercial. You may use it in client projects; you may not redistribute components. Study only.

### 1.2 Tailwind Plus / Tailwind UI (commercial)

Counts are from the Wayback snapshot of https://tailwindcss.com/plus/ui-blocks/marketing; the live site is behind a login.

- **Marketing sections and their counts:**
  - Hero 12, Feature 15, CTA 11, Bento Grids 3, Pricing 12, Header Sections 8, Newsletter 6, Stats 8, Testimonials 8.
  - **Blog Sections 7**, Contact 7, Team 9, **Content Sections 7**, **Logo Clouds 6**, FAQs 7, **Footers 7**.
  - Elements: **Headers 11**, Flyout Menus 7, Banners 13. Feedback: 404 Pages 5.
  - Page examples: Landing 4, Pricing 3, About 3.
- **Variant names** (read from the page JSON):
  - **Blog sections:** Single-column · Single-column with images · Three-column · Three-column with images · Three-column with background images · **With featured post** · **With photo and list**.
  - **Footers:** Simple centered · Simple with social links · 4-column simple · 4-column with call-to-action · 4-column with company mission · 4-column with newsletter · 4-column with newsletter below.
  - **Headers (site nav):** Constrained · Full width · On brand background · With call-to-action · **With centered logo** · With left-aligned nav · With right-aligned nav · With full width / multiple / stacked flyout menu · With icons in mobile menu.
  - **Header sections (page intro, i.e. snypd's `list` head):** Simple · Simple with eyebrow · Simple with background image · Centered · Centered with eyebrow · Centered with background image · With cards · With stats.
  - **Logo clouds (the `wall` slot):** Simple · Simple with heading · Simple left-aligned · Simple with call-to-action · Grid · Split with logos on right.
  - **Content sections (≈ prose + figures on a landing page):** Centered · Split with image · Two columns with screenshot · With image titles · With sticky product screenshot · With testimonial · With testimonial and stats.
- **Templates** (Wayback of /plus/templates; Next.js, $99 each):

  | Template | Kind | Editorial? |
  |---|---|---|
  | **Spotlight** | personal site | ✔ blog + projects + about. The home page is a hero, a photo strip, then article cards beside a sidebar with a newsletter box and a work-history list |
  | **Syntax** | documentation | ✔ docs |
  | **Protocol** | API reference | ✔ docs/reference |
  | **Studio** | agency | ✔ portfolio. The work index has the logo left, then name, "service · date" metadata, a pull quote and "Read case study". The case study has a Client / Year / Service facts strip. Office addresses sit in the footer |
  | **Commit** | changelog | ✔ product log. A single-column timeline, each release a dated card with an image and bullets |
  | Transmit | podcast | episodic list |
  | Compass | course | — |
  | Radiant, Salient, Pocket, Primer, Keynote | marketing | — |
  | Oatmeal | "multi-theme marketing site kit" (2025) | — |

  **Oatmeal is Tailwind's own step toward snypd's kit idea:** one marketing kit, several themes.

  Live demos (all 200):
  - https://spotlight.tailwindui.com
  - https://studio.tailwindui.com/work/family-fund
  - https://commit.tailwindui.com
  - https://syntax.tailwindui.com
  - https://protocol.tailwindui.com
- **Catalyst** is the application UI kit, not relevant to the reading routes.
- **Licence** (https://tailwindcss.com/plus/license): you may build unlimited End Products. You may **not** make "themes, UI kits, page builders" or redistribute components or derivatives. **snypd is a theme and page-builder product, so no Tailwind Plus code or close derivative may enter the shelf.** Study the archetypes and names only.

### 1.3 shadcn/ui blocks (MIT; https://ui.shadcn.com/blocks)

The blocks are mostly app UI: dashboard, sidebar (at least 16), login, signup, calendar, charts. There are no editorial sections. They matter to snypd only as a *registry* precedent: blocks are installed by name through the CLI (`npx shadcn add sidebar-07`). The name is numbered, but the registry is JSON with descriptions.

### 1.4 Once UI (https://once-ui.com)

The core library is MIT. **Magic Portfolio** (a Next.js portfolio + blog template) is **CC BY-NC 4.0**: non-commercial, so study it, never copy (https://github.com/once-ui-system/magic-portfolio/blob/main/LICENSE). Its idea worth noting: the whole look is set by a handful of token switches (theme, neutral, brand, accent, solid style, border, surface, transition) in one config file, which amounts to one line per axis.

### 1.5 Flowbite (core MIT; Blocks partly MIT, Pro under an EULA)

Flowbite Blocks (https://flowbite.com/blocks/) has marketing categories similar to Tailwind's: hero, feature, CTA, blog, content, footer, header, logo cloud, team, testimonial, pricing, FAQ, portfolio, event schedule. The free subset is MIT. Pro is paid under an EULA (https://flowbite.com/license/). Study only.

### 1.6 HyperUI (MIT; https://github.com/markmead/hyperui)

Read from `src/content/collection/marketing/*.mdx`.

- **Marketing categories:** announcements, banners, **blog-cards**, buttons, cards, CTAs, contact forms, empty content, FAQs, feature grids, **footers**, **headers**, **logo clouds**, newsletter signup, pricing, product cards and collections, sections, team, testimonials. There is also a **neobrutalism** collection (a style set applied to the same components) and templates (portfolio, SaaS landing, storefront).
- **Blog cards (7):** "Bordered with image, date, title and excerpt, shadow on hover" · "Floating image with title and excerpt" · "Bordered with image, title, excerpt and CTA" · "Gradient border with date, title and tags" · "Bordered with icon…" · "Artistic with rotated date, image…" · "Background image with overlay containing date, title and excerpt".
- **Footers (12):** Large with newsletter · Simple stacked · Simple row · CTA with gradient · Split with company info, links and image · Split with company info, links and CTA · Newsletter form as priority · **Centered with branding** · Slim with branding and link top · Company info and links · Inline with logo and copyright · With CTA.
- **Logo clouds (4):** Base · Base with title · Base with title left aligned · Grid.
- **The naming lesson:** HyperUI names are the *recipe* ("X with Y and Z"). snypd's `line:` should read the same way, with the plain word as the handle.

### 1.7 daisyUI themes (MIT; https://github.com/saadeghi/daisyui)

- **35 themes:** light, dark, cupcake, bumblebee, emerald, corporate, synthwave, retro, cyberpunk, valentine, halloween, garden, forest, aqua, lofi, pastel, fantasy, wireframe, black, luxury, dracula, cmyk, autumn, business, acid, lemonade, night, coffee, winter, dim, nord, sunset, caramellatte, abyss, silk.
- **Each theme is about 30 variables** (for example `packages/daisyui/src/themes/lofi.css`):
  - colours as OKLCH: base-100/200/300/content, primary, secondary, accent and neutral (each with a `-content` pair), info, success, warning, error;
  - **shape tokens:** `--radius-selector`, `--radius-field`, `--radius-box`, `--size-selector`, `--size-field`, `--border`, `--depth` (0|1) and `--noise` (0|1).
- **Two lessons for snypd.**
  - daisyUI puts *shape character* (radius, depth, noise) inside the theme, not only colour. snypd's seed plus face covers colour and type. A kit may also want a **shape triple** (radius, border weight, depth) as tokens, which a `blocks` piece like `ink` or `surface` would read.
  - OKLCH colour with paired `-content` tokens is the same model as snypd's seed.

---

## 2. Theme and kit precedents

### 2.1 WordPress block themes (GPL-2.0+)

Source: `gh api` on WordPress/wordpress-develop at `src/wp-content/themes/twentytwentyfive` and `twentytwentyfour`.

- **The mechanism.** `theme.json` holds tokens: palette, font families, font sizes, spacing scale. Any `styles/*.json` file is a **style variation** that overrides part of `theme.json`. Since WP 6.6, variations can be *partial*: `styles/colors/*.json` and `styles/typography/*.json` are offered as independent pickers, and `styles/sections/*.json` are **section styles** (a named colour treatment any group or column can take).
  - This is exactly palette × face × section treatment as separate axes, which WP recombines in the Site Editor.
- **Twenty Twenty-Five (2025):**
  - **8 full style variations:** Evening, Noon, Dusk, Afternoon, Twilight, Morning, Sunrise, Midnight.
  - **8 colour presets** (the same names, `styles/colors/`). Each preset has 8 slots: `base`, `contrast` and `accent-1…6`. That is compact, and similar to snypd's seed.
  - **7 typography presets**, each a *pairing*: Beiruti & Literata · Vollkorn & Fira Code · Platypi & Ysabeau Office · Roboto Slab & Manrope · Literata & Ysabeau Office · Platypi & Literata · Literata & Fira Sans. All are Google Fonts under OFL.
  - **5 section styles** (Style 1–5) and **4 block styles** (display, subtitle, annotation, post-terms).
  - **~95 patterns**, including:
    - **Four blog kits:** `template-{home,archive,search,single,page,query-loop}-{text,news,photo,vertical-header}-blog`. The news blog has three homes: `home-news-blog`, `home-posts-grid-news-blog` and `home-with-sidebar-news-blog`.
    - **Headers:** `header` · `header-centered` · `header-columns` · `header-large-title` · `vertical-header`.
    - **Footers:** `footer` · `footer-centered` · `footer-columns` · `footer-newsletter` · `footer-social`.
    - **Pages:** `page-portfolio-home`, `page-cv-bio`, `page-business-home`, `page-link-in-bio-*` (3), `page-landing-{book,event,podcast}`, `page-coming-soon`, `page-shop-home`.
    - **Single posts:** `template-single-left-aligned-content`, `template-single-offset`.
    - **Others:** `more-posts`, `post-navigation`, `hidden-written-by`, `logos`, `media-instagram-grid`, `grid-with-categories`, `text-faqs`, `banner-poster`, `binding-format`.
  - Docs:
    - https://wordpress.org/documentation/article/twenty-twenty-five/
    - https://make.wordpress.org/core/2024/08/15/introducing-twenty-twenty-five/
- **Twenty Twenty-Four (2024):**
  - **7 style variations:** Ember, Fossil, Ice, Maelstrom, Mint, Onyx, Rust.
  - **Home templates for three site kinds:** `template-home-{blogging,business,portfolio}`, the same for index, archive and search, and `template-single-portfolio`.
  - **Post lists** are named by *shape*: `posts-1-col`, `posts-3-col`, `posts-grid-2-col`, `posts-images-only-3-col`, `posts-images-only-offset-4-col`, `posts-list`.
  - **Galleries:** `gallery-offset-images-grid-{2,3,4}-col`, `gallery-full-screen-image`, `gallery-project-layout`.
  - **Project facts:** `text-project-details`, `banner-project-description`. This is the WordPress version of snypd's **feature/facts**.
  - **Footers:** `footer`, `footer-centered-logo-nav`, `footer-colophon-3-col`. The last one is literally named *colophon*.
- **Pattern directory:** https://wordpress.org/patterns/ (categories include Header, Footer, Posts, Gallery, Banners, Call to action, Text, About, Portfolio). The patterns are GPL and the images CC0.
- **What to take:**
  - (a) Name kits after the *kind of site* (text, news, photo, portfolio).
  - (b) Make colour sets and type pairings independent axes with named presets (8 × 7 in TT5).
  - (c) Name post lists by shape.
  - (d) WordPress confirms a `colophon` footer and a `vertical-header` masthead as archetypes.

### 2.2 Ghost official themes (all MIT; https://github.com/TryGhost/*)

Settings read from each repo's `package.json` → `config.custom`. **This is the best "slot × variant" precedent:** each select is a slot and each option is a variant.

| Theme | Kind | Nav | Home / header | Feed | Post | Fonts |
|---|---|---|---|---|---|---|
| **Source** (the default since 2023) | general / newsletter | Logo in the middle · Logo on the left · Stacked | `header_style`: **Landing · Highlight · Magazine · Search · Off**; plus `show_featured_posts`, background image, publication-info sidebar | **List · Grid**; images, author and date toggles | metadata, **drop caps**, related articles | title: Modern sans · Elegant serif · Consistent mono; body: sans · serif. Header/footer colour: background or accent |
| **Casper** | classic blog | Logo on cover · in the middle · Stacked | Center aligned · Left aligned · Hidden; publication cover | **Classic · Grid · List** | post image **Wide · Full · Small · Hidden**; recent posts in the footer | sans/serif ×2; scheme Light · Dark · Auto |
| **Edition** | newsletter | left · middle · stacked | cover **Fullscreen · Half screen**; featured posts | **Expanded · Right thumbnail · Text-only · Minimal** | author, related | sans/serif |
| **Solo** | personal / one person | left · middle · stacked | **Side by side · Large background · Typographic profile** | **Classic · Typographic · Parallax** | — | Modern sans · Elegant serif · Consistent mono |
| **Headline** | news / magazine | left · middle · stacked | tag-slug **primary sections / secondary sections** (a front page of sections) | — | — | header Light · Accent · Dark |
| **Episode** | podcast | left · middle · stacked | two headers, platform links | — | — | typography Wide · Narrow |
| **Taste** | recipes | left · middle · stacked | header action Subscribe · Search · None; tag sections | — | — | style **Elegant · Playful** |
| Journal, London, Ruby, Edge, Dope, Dawn, Digest, Bulletin, Wave, Alto, Ease | various | mostly left · middle · stacked | featured toggle | — | Digest/Bulletin feature image Full · Wide · Small | sans/serif |

- **What Source's options give snypd:**
  - **Landing** is a big intro and signup → snypd `home: bands` or a hero.
  - **Highlight** is one big featured post plus a side list → proposed `home: lead`.
  - **Magazine** is a featured grid of mixed sizes → proposed `home: magazine`.
  - **Search** makes the header a search box → skip or park.
  - **Off** means no header, straight into the feed → `home: stream`/`index`.
  - Demo: https://source.ghost.io. Repo: https://github.com/TryGhost/Source. Theme marketplace: https://ghost.org/themes/.
- **Solo's "Typographic profile"** is the notebook/personal answer: the name set large as the only image.
- **Edition's feed options** name four densities of `entries`: *Expanded* (cards), *Right thumbnail* (rows), *Text-only* (list), *Minimal* (index).

### 2.3 Squarespace 7.1 (proprietary)

- **Site Styles** is one global panel (fonts, colours, buttons, spacing).
- **Colour:** a **5-colour palette** generates **10 colour themes** (Lightest 1 & 2, Light 1 & 2, Bright 1 & 2, Dark 1 & 2, Darkest 1 & 2), and **each section picks one theme**. That is Squarespace's version of WP section styles, and a strong idea for snypd's `bands`: a band says "darkest", not a colour.
  - https://support.squarespace.com/hc/en-us/articles/205815278-Changing-colors
- **Fluid Engine** is the section grid (a free-placement grid inside sections). Squarespace also offers pre-made section templates by purpose (intro, about, blog, portfolio, images, contact, and so on). Portfolio pages come in fixed layouts (grid simple, grid overlay, hover background, slides).
  - https://support.squarespace.com/hc/en-us/articles/360035611791-Portfolio-pages
- **Lesson:** the **ramp of 5–10 named surfaces** derived from a small palette is what lets any section sit on any "tone" without clashing. snypd's seed could expose `surface-1…4` plus `ink` for exactly that (see §4, `home: bands`).

### 2.4 Framer, Webflow and their AI builders (proprietary; marketplace templates under per-template licences)

- **Framer Wireframer (2025)** turns a prompt into structured, responsive sections, then refines them in natural language ("add a testimonials section", "change this to a grid layout"). The Framer marketplace sells whole-site templates (blog, portfolio, agency, changelog).
  - https://www.framer.com/wireframer/
  - https://framer.university/blog/the-new-ai-workflow-for-building-websites
- **Webflow's AI site builder** follows the same prompt → sections → style guide pattern. Relume exports into Webflow.
- **Lesson:** the "agent picks sections and then styles globally" loop is now the market default. snypd's edge is that the markup is fixed and content-driven, so "swap a section" never touches copy or structure.

### 2.5 Cargo, Readymag, Are.na (proprietary; design-led)

- **Cargo** (https://cargo.site/templates) has four template groups: *Basic* (Feed, Grid, Slideshow), *Graphic*, *Blank* and *Populated*. Designs have opaque codes (P402, F947, D042…). Cargo's three basic layouts, **Feed / Grid / Slideshow**, are the portfolio `home` archetypes.
- **Readymag** (https://readymag.com/templates/portfolio) has named templates (Grid, Bureau, Lotta, Half-full, Half-empty, Eclipse, Flagpole…). "Grid" is "a clean and orderly frame … sizeable image boxes, minimal captions on hover". The **Portfolio Workbench** is "pre-made combinations … grids, backgrounds, styles and galleries that users can choose, combine, edit" (https://readymag.com/templates/details/5647058/). That is a kit-of-pieces product.
- **Are.na** (https://www.are.na, https://www.are.na/editorial) is the canonical *block grid* of mixed media, plus a very plain editorial type. It is a reference for `entries: tiles` or `home: board` on a notebook or reading-list site.

### 2.6 Hugo, Astro and 11ty themes (MIT; studyable, even code)

| Theme | Stars | Home / layout variants | Colour schemes |
|---|---|---|---|
| **Hugo PaperMod** (https://github.com/adityatelange/hugo-PaperMod) | 13.9k | **Regular** (posts list) · **Home-Info** (first entry is an intro card) · **Profile** (full-page avatar, buttons, socials); an archive page, a search page, cover images, ToC, breadcrumbs | light/dark |
| **Blowfish** (https://blowfish.page/docs/homepage-layout/) | 2.9k | **Profile · Page · Hero · Background · Card · Landing · Custom**; recent posts as **card view or list** | 17 schemes in `assets/css/schemes`: autumn, avocado, bloody, blowfish, burufugu, congo, fire, forest, github, marvel, neon, noir, ocean, one-light, princess, slate, terminal |
| **Congo** (https://jpanther.github.io/congo/docs/homepage-layout/) | 1.7k | Page · Profile · Custom | 7 schemes: avocado, cherry, congo, fire, ocean, sapphire, slate |
| **AstroPaper** (https://github.com/satnaing/astro-paper) | 5.1k | minimal list home, featured + recent | light/dark |
| **Fuwari** (https://github.com/saicaca/fuwari) | 5.0k | card blog with a sidebar profile; hue slider | one hue |
| **Starlight** (https://starlight.astro.build) | 9.3k | the docs standard: sidebar, content, on-page ToC; a `splash` template for the landing page | accent + gray |
| **Astro Nano / Cactus**, **eleventy-base-blog** | 0.9–1.7k | minimalist index lists | — |

- **Scheme count as a precedent for "one line = whole look":** daisyUI 35, Blowfish 17, TT5 8 (×7 fonts), TT4 7, Congo 7, Squarespace 10 surfaces per palette.
- **Home layouts per theme:** usually **3–7**.
- **Feed styles:** **2–4**.
- **Nav:** **3**.

This supports docs/37's target of "at least three good answers where a slot decides the look". For `home` specifically, 5–7 is the norm in mature themes.

### 2.7 Summary: "one line = whole look" and variants per slot

| System | One-line preset | Axes it recombines | Variants per layout slot |
|---|---|---|---|
| daisyUI | `data-theme="lofi"` (35) | colour + shape tokens | — (the components are fixed) |
| WP TT5 | style variation (8) | colours (8) × type pairs (7) × section styles (5) | header 5, footer 5, blog kit 4, news home 3 |
| Ghost Source | none (settings) | nav 3 · header 5 · feed 2 · fonts 3×2 | 2–5 |
| Blowfish/Congo | `colorScheme = "ocean"` (17/7) | scheme × home layout (7/3) × card/list | 2–7 |
| Squarespace | site style + section theme (10) | palette → 10 surfaces | template-level |
| Relume | style guide (shuffle) | wireframe × style guide | ~30–150 per category |
| Tailwind Plus | template (Spotlight…) | none: fixed code | 6–15 per section |

**Nobody combines "a named kit" with "swap one slot and keep the rest as-is".** WordPress comes closest (style variation + pattern swap), but its patterns carry their own markup. snypd's fixed markup plus CSS-only pieces is the missing combination.

---

## 3. Licensing: learn from versus copy

| Source | Licence | What we may do |
|---|---|---|
| Ghost themes (Source, Casper, Edition, Solo, Headline…) | MIT | Study; code may even be adapted with the MIT notice. Safe to learn archetypes and option names |
| WordPress TT4/TT5 and patterns | GPL-2.0+ (images CC0) | Study freely. Copying GPL CSS into MIT snypd would pull GPL obligations in. **Learn, don't paste** |
| daisyUI, HyperUI, shadcn/ui, Flowbite core, Once UI core | MIT | Study; adapting is allowed with notice. Token models are free to learn |
| Hugo PaperMod, Blowfish, Congo, AstroPaper, Fuwari, Starlight, Cactus, 11ty base blog | MIT | Same |
| Tufte CSS (https://edwardtufte.github.io/tufte-css/) | MIT | The reference for `notes: sidenotes`, `prose: book` |
| Tailwind Plus (UI blocks + templates) | commercial; **explicitly forbids themes, UI kits and page builders** | **Look only.** No code, no close visual copies. Archetypes and names are ideas |
| Relume | commercial | Look only |
| Flowbite Pro blocks | EULA | Look only |
| Once UI Magic Portfolio | CC BY-NC 4.0 | Look only (non-commercial) |
| Framer, Webflow, Squarespace, Cargo, Readymag templates | proprietary / marketplace | Look only |
| Live editorial sites (craigmod.com, Pentagram, The Verge…) | all rights reserved | Look only; `refs:` may cite them as "what was taken" (an idea) |

**Rule for `piece.yaml refs:`:** cite any URL, write down *the idea taken* ("date in the margin", "facts strip in four columns above the fold"), and never paste CSS from a non-MIT/CC0 source. snypd pieces are built from snypd tokens, so compositions come out different by construction.

---

## 4. Mapping onto snypd's slots: archetypes, exemplars, proposed names

Format per archetype: **`proposed-name`** (existing / docs/37 name, or new), one line, then exemplars. All exemplar URLs returned HTTP 200 on 25 Sep 2026 unless marked.

### `home` (the front page)

| Name | Line | Library precedent | Exemplars |
|---|---|---|---|
| **`bands`** *(have)* | full-width sections, each on its own surface tone | Squarespace section themes; Relume landing; Ghost Source "Landing" | https://linear.app · https://www.stripe.press |
| **`stream`** *(docs/37, carve)* | the latest posts in full or long excerpt, newest first | Casper "Classic"; kottke-style | https://daringfireball.net · https://kottke.org · https://simonwillison.net |
| **`index`** *(docs/37, draw)* | a line of intro, then the whole archive as a ruled list | Ghost Source header "Off" + List; PaperMod Regular; TT5 text-blog | https://craigmod.com/essays/ (month over title over dek, newest first) · https://danluu.com · https://overreacted.io |
| **`split`** *(docs/37, carve from folio)* | heading or intro in a left column, content on the right | Solo "Side by side"; TT5 `vertical-header`; Tailwind "Split" | https://paco.me (left-set section heads) · https://rauno.me · https://commit.tailwindui.com |
| **`portfolio`** *(docs/37, draw)*; also consider the shorter **`grid`** | a grid of a type's covers, captions under or on hover | Cargo "Grid"; Readymag "Grid"; TT4 `page-home-portfolio`; Blowfish "Card" | https://www.pentagram.com/work (image cards, title, dek, sector tag, discipline and sector filters) · https://www.area17.com/work · https://koto.studio/work |
| **`lead`** *(new)* | one featured story large, the next few in a column beside it | Ghost Source "Highlight"; Tailwind blog "With featured post"; TT5 `home-with-sidebar-news-blog` | https://stripe.com/blog · https://vercel.com/blog · https://anthropic.com/news |
| **`magazine`** *(new)* | mixed-size grid by section or tag, a front page of departments | Ghost Source "Magazine", Headline "primary/secondary sections"; TT5 `home-posts-grid-news-blog` | https://www.theverge.com · https://www.itsnicethat.com · https://www.dezeen.com |
| **`profile`** *(new)* | the person first (name set large as the only image, a short bio, links), then a short list | PaperMod Profile; Blowfish Profile; Solo "Typographic profile"; TT5 `page-cv-bio`, link-in-bio | https://sive.rs · https://rsms.me · https://frankchimero.com |

**Recommendation:** v1 = bands, stream, index, split, portfolio (docs/37 §7), plus **`lead`**, which is cheap and covers the product-blog and newsroom case. `magazine` and `profile` come in v1.1.

### `list` (the page around the entries: heading, intro, term filter) — new slot

| Name | Line | Precedent | Exemplars |
|---|---|---|---|
| **`plain`** | the title and nothing else | TT5 `hidden-blog-heading` | https://overreacted.io · https://jvns.ca |
| **`ruled`** | a heading, an intro paragraph, the terms as a filter row, a rule | Relume "Blog Header"; Tailwind "Header section: Simple with eyebrow" | https://www.pentagram.com/work (discipline and sector filters) · https://github.blog/changelog/ · https://www.smashingmagazine.com/articles/ |
| **`grid`** | for image-led types: the head plus a grid context | Tailwind "Header section: With cards"; Cargo Grid | https://www.area17.com/work · https://koto.studio/work |
| **`banner`** *(new, optional)* | the heading on a full-width tone band, with a term count | Tailwind "Centered with background image"; Squarespace section theme | https://www.nngroup.com/articles/ · https://www.figma.com/blog/ |

### `entries` (a list of posts)

Edition's four densities are a good spine.

| Name | Line | Precedent | Exemplars |
|---|---|---|---|
| **`cards`** *(have)* | image, title, excerpt, boxed | Edition "Expanded"; Tailwind "Three-column with images"; HyperUI blog cards | https://vercel.com/blog · https://www.joshwcomeau.com |
| **`rows`** *(have)* | a thumbnail to one side, the text beside it | Edition "Right thumbnail"; Tailwind "With photo and list" | https://stripe.com/blog · https://every.to |
| **`list`** *(have)* | title and excerpt, no image | Edition "Text-only"; TT5 text-blog | https://jvns.ca · https://craigmod.com/essays/ |
| **`ledger`** *(docs/37, carve from folio)* | ruled rows as columns (date · title · type or tag), like a table | TT4 `posts-list`; Tailwind "Stacked lists" | https://brianlovin.com/writing · https://www.robinrendle.com |
| **`index`** *(docs/37, draw)* | title and date on one line, the date set in the margin | Edition "Minimal"; PaperMod archive | https://danluu.com · https://paco.me · https://manuelmoreale.com |
| **`tiles`** *(new, later)* | mixed-media blocks in a square grid, image or text alike | Are.na channel grid; TT4 `posts-images-only-3-col` | https://www.are.na · https://maggieappleton.com/garden · https://publicdomainreview.org |

### `feature` (a page for a site's own type: case study, log entry, release) — new slot

| Name | Line | Precedent | Exemplars |
|---|---|---|---|
| **`facts`** | cover, a facts strip (fields with `role: fact`), body, close | Tailwind Studio case study (Client / Year / Service); TT4 `text-project-details`; Relume Portfolio Header | https://studio.tailwindui.com/work/family-fund · https://www.pentagram.com/work (project pages carry discipline and sector) · https://www.wolffolins.com/work |
| **`log`** | dated, compact, many to a page, the date in the gutter | Tailwind Commit; Relume Timeline Sections | https://linear.app/changelog · https://posthog.com/changelog · https://github.blog/changelog/ |
| **`release`** | version as the title, a kicker (date · channel), grouped bullets (Added / Fixed), an image | Commit; Raycast | https://www.raycast.com/changelog · https://vercel.com/changelog · https://commit.tailwindui.com |
| **`record`** *(new, later)* | an item page for a reference type (book, recipe, talk): facts as a definition list in a side column, body beside it | Ghost Taste (recipes); Transmit (episodes) | https://publicdomainreview.org · https://thecreativeindependent.com |

### `cover` (the top of a post or page)

| Name | Line | Precedent | Exemplars |
|---|---|---|---|
| **`quiet`** *(have)* | title, a dek, a small byline, no image or a small one | Casper post image "Hidden/Small" | https://overreacted.io · https://jvns.ca |
| **`display`** *(have)* | an oversized display title, tight | Solo "Typographic"; TT5 `header-large-title` | https://www.joanwestenberg.com · https://pudding.cool |
| **`path`** *(have)* | breadcrumb or section path above the title (docs) | PaperMod breadcrumbs; Starlight | https://starlight.astro.build · https://tailwindcss.com/docs |
| **`page`** *(docs/37, draw)* | no date, no byline: the title and an optional lede (about, contact) | TT4/TT5 `page-no-title`, `page` | https://sive.rs · https://www.robinsloan.com |
| **`bleed`** *(new)* | a full-width image with the title below or overlaid, "a title on its own picture is a cover" | Casper "Full"; Edition "Fullscreen"; HyperUI "Background image with overlay" | https://www.theverge.com (features) · https://www.newyorker.com · https://www.itsnicethat.com |
| **`offset`** *(new, later)* | the title in the left track, the dek and meta in the right | TT5 `template-single-offset` | https://craigmod.com · https://www.stripe.press |

### `masthead`

Three variants is the universal norm: Ghost's *left / middle / stacked* in 15 of 17 themes, and Tailwind's *left-aligned nav / centered logo / right-aligned nav*.

| Name | Line | Precedent | Exemplars |
|---|---|---|---|
| **`bar`** *(have)* | name left, menu right, one row | Ghost "Logo on the left"; Tailwind "With right-aligned nav" | https://vercel.com/blog · https://linear.app |
| **`nameplate`** *(have)* | a newspaper nameplate: the name large and centred, a rule, the menu under | Ghost "Stacked"; TT5 `header-large-title` | https://www.newyorker.com · https://www.theverge.com |
| **`title-bar`** *(have)* | docs chrome: name, search, version | Starlight; Syntax | https://starlight.astro.build · https://syntax.tailwindui.com |
| **`plain`** *(docs/37, carve)* | just the name as a link, the menu inline | PaperMod | https://danluu.com · https://overreacted.io |
| **`centered`** *(docs/37, draw)* | name centred over a hairline, menu centred under | Ghost "Logo in the middle"; TT5 `header-centered`; Tailwind "With centered logo" | https://www.robinsloan.com · https://kottke.org |
| **`rail`** *(new, later)* | a vertical header in a narrow left column | TT5 `vertical-header` (a whole blog kit) | https://rsms.me · https://paco.me |

### `footer`

| Name | Line | Precedent | Exemplars |
|---|---|---|---|
| **`line`** *(have)* | one line: © · links | HyperUI "Inline with logo and copyright"; Tailwind "Simple centered" | https://jvns.ca · https://overreacted.io |
| **`colophon`** *(have)* | a short set paragraph: made with, set in, since | TT4 `footer-colophon-3-col` | https://craigmod.com · https://practicaltypography.com · https://solar.lowtechmagazine.com |
| **`close`** *(docs/37, carve from folio)* | a dark closing band (sign-off, CTA or newsletter), then the footer | Tailwind "4-column with call-to-action"; HyperUI "CTA with gradient" | https://www.stripe.press · https://linear.app |
| **`index`** *(docs/37, draw)* | the site's sections as columns of links | Tailwind "4-column simple"; TT5 `footer-columns`; Studio (office addresses + 3 columns) | https://vercel.com · https://stripe.com/blog · https://studio.tailwindui.com |
| **`mark`** *(new, later)* | the site name set enormous across the full width | a current agency trope; HyperUI "Centered with branding" | https://linear.app (bottom) · agency sites |

### `blocks` (callouts, figures, stats, steps, FAQs)

| Name | Line | Precedent / exemplar |
|---|---|---|
| **`hairline`** *(have)* | 1px rules, no fills | https://practicaltypography.com · https://edwardtufte.github.io/tufte-css/ |
| **`ruled`** *(have)* | heavier rules, labels in caps | https://www.gov.uk/guidance/content-design (GOV.UK inset and warning patterns) |
| **`surface`** *(have)* | tinted panels, radius | Starlight asides; Stripe docs · https://starlight.astro.build |
| **`ink`** *(docs/37, draw)* | text colour only: weight, size and rules carry everything, no tint | Tufte; https://gwern.net |
| **`solid`** *(new, later)* | daisyUI-style: an accent fill with the `-content` pair, bold radius, depth 1 | daisyUI "cupcake"/"retro"; HyperUI neobrutalism · https://www.joshwcomeau.com |

### `post-foot`

| Name | Line | Exemplars |
|---|---|---|
| **`band`** *(have)* | a tone band holding terms and the author | https://stripe.com/blog |
| **`pills`** *(have)* | terms as pills | https://vercel.com/blog |
| **`ruled`** *(have)* | a rule, terms inline, a source link | https://jvns.ca |
| **`facts`** *(docs/37, carve)* | a definition list: filed under, published, updated, source | https://gwern.net (metadata block) · https://www.robinsloan.com |
| **`next`** *(new)* | previous and next plus "more from this term" (TT5 `more-posts` + `post-navigation`; Casper "recent posts in footer") | https://overreacted.io · https://www.joshwcomeau.com |
| **`byline`** *(new, later)* | an author card with a portrait and bio (TT5 `hidden-written-by`; Edition "show_author") | https://every.to · https://www.smashingmagazine.com/articles/ |

### `wall` (logo wall)

| Name | Line | Precedent / exemplar |
|---|---|---|
| **`row`** *(have)* | one row, even gaps | Tailwind "Simple" · https://linear.app |
| **`marquee`** *(have)* | a scrolling row | common on Framer templates · https://vercel.com |
| **`grid`** *(new)* | a ruled grid of cells, each logo in its box | Tailwind/HyperUI "Grid" · https://studio.tailwindui.com ("You're in good company") |
| **`split`** *(new, later)* | a heading and line on the left, logos on the right | Tailwind "Split with logos on right" |

### `prose`

| Name | Line | Exemplars |
|---|---|---|
| **`book`** *(have; + `display-heads` switch)* | a serif column, old-style figures, generous leading | https://practicaltypography.com · https://edwardtufte.github.io/tufte-css/ · https://www.robinsloan.com |
| **`docs`** *(have)* | a sans column, anchored headings, dense lists | https://starlight.astro.build · https://tailwindcss.com/docs |
| **`display`** *(have)* | headings in the display face, big deks, pull quotes | https://www.newyorker.com · https://pudding.cool |
| **`essay`** *(new, later)* | book plus drop caps and small-caps lead-ins | Ghost Source `enable_drop_caps_on_posts` · https://www.stripe.press · https://craigmod.com |
| **`plain`** *(new, later)* | system-font minimalism, underlined links | https://danluu.com · https://herman.bearblog.dev · https://bearblog.dev |

`notes` (have: cards, plain, sidenotes; references Tufte and Gwern) and `toc` (have: block; later a sticky side `rail`, the Starlight or Syntax on-page ToC) are adequately covered.

---

## 5. Proposed kits (one word, one line, a variant per slot, a face pairing, a palette strategy)

Faces are taken from snypd's shelf (`packages/shelf`, all OFL: source-serif-4, crimson-pro, lora, ibm-plex-serif, instrument-serif, young-serif, gloock, bitter, instrument-sans, work-sans, ibm-plex-sans, source-sans-3, bricolage-grotesque, big-shoulders, barlow-condensed, ibm-plex-mono). Suggested additions (Google Fonts, OFL) are marked **+**.

Palette strategies:
- **restrained** means near-neutral paper and ink with one quiet accent.
- **tonal** means a surface ramp derived from one hue, in the Squarespace-10 style.
- **loud** means one saturated accent used in fills.
- **dark** means a dark scheme.

| Kit | Covers | Line | home | list | entries | feature | cover | masthead | prose | blocks | post-foot | footer | notes | wall | motion | Face (display / text / mono) | Palette |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **notebook** | blog / notebook | An architect's notebook: paper, one serif set large, figures out wide, a ruled index | index | ruled | index | facts | quiet | centered | book (+display-heads) | hairline | ruled | colophon | sidenotes | row | glide | instrument-serif / source-serif-4 / ibm-plex-mono | restrained, light; blue-grey ink accent |
| **reference** | docs / reference | A manual you trust: sans, anchored, the path always visible | stream (or index) | plain | list | release | path | title-bar | docs | surface | facts | index | plain | row | still | ibm-plex-sans / ibm-plex-sans / ibm-plex-mono | tonal, light and dark pair; one functional accent |
| **gazette** | magazine / publication | A weekly's front page: nameplate, departments, big deks | magazine (v1: lead) | banner (v1: ruled) | rows | facts | bleed (v1: display) | nameplate | display | ruled | byline (v1: band) | index | cards | grid | glide | gloock / crimson-pro / ibm-plex-mono | restrained; black on warm paper, one red accent |
| **studio** *(exists, re-express)* | portfolio / studio | A studio's book of work: big covers, a facts strip, a quiet close | portfolio | grid | cards | facts | bleed | bar | display | surface | facts | close | plain | marquee | glide | bricolage-grotesque / instrument-sans / ibm-plex-mono | tonal, dark close; accent from the work |
| **gallery** | portfolio / image-led (photo, illustration) | The pictures are the site: a grid, minimal captions, no chrome | portfolio | plain | tiles (v1: cards) | facts | bleed | plain | book | ink | ruled | line | plain | row | glide | instrument-sans / instrument-sans / ibm-plex-mono | restrained; near-white or near-black, no accent fill |
| **profile** | personal / CV | A person, set in type: the name is the only image, then what they do and write | profile (v1: split) | plain | index | facts | page | plain | book | hairline | next | line | sidenotes | row | still | young-serif / lora / ibm-plex-mono | restrained, light; a warm accent |
| **ledger** | product / changelog | The product log: dated entries, versions as titles, the gutter as a timeline | split | ruled | ledger | release + log | quiet | bar | docs | ruled | facts | close | plain | row | count | work-sans (+ **Geist** or **Inter Tight**) / work-sans / ibm-plex-mono | tonal dark or light; one bright functional accent |
| **essay** | long-form single author | Long reading: a wide margin, drop caps, notes beside the text | stream | plain | list | facts | offset (v1: display) | centered | essay (v1: book) | ink | ruled | colophon | sidenotes | row | still | crimson-pro / crimson-pro (+ **EB Garamond** or **Newsreader**) / ibm-plex-mono | restrained, cream paper |
| **poster** | loud / zine / event | Condensed type shouting in one colour: bands of tone, marquee logos | bands | banner | cards | facts | display | nameplate | display | solid | pills | mark (v1: close) | cards | marquee | glide | big-shoulders or barlow-condensed / source-sans-3 / ibm-plex-mono | loud; one saturated accent used as fills |
| **folio** *(exists, re-express)* | product / docs hybrid | snypd.rocks' own voice | split | ruled | ledger | log + release | display | plain | display | surface | facts | close | cards | row | count | (as today) | (as today) |

**Coverage check against the brief:**

| Category | Kits |
|---|---|
| blog / notebook | notebook, essay |
| docs / reference | reference |
| magazine | gazette |
| portfolio / studio | studio, gallery |
| personal | profile |
| product / changelog | ledger, folio |
| wild card | poster |

Together with the existing `editorial` and `technical`, that is 12. **Recommend shipping 6 in v1** (notebook, reference, gazette, studio, profile, ledger). Each one needs at most one new piece beyond docs/37 §7 (gazette → `lead`; profile → none if `split` stands in for `profile`). Then add essay, gallery and poster once `offset`, `tiles`, `bleed`, `solid` and `mark` are drawn.

**Dependencies:**

| New piece | Needed by | Also needs |
|---|---|---|
| `lead` (home) | gazette | — |
| `bleed` (cover) | studio, gazette, gallery | — |
| `banner` (list) | gazette, poster | — |
| `grid` (list, wall) | studio | — |
| `next`, `byline` (post-foot) | profile, gazette | — |
| `solid` (blocks) | poster | shape tokens: radius, border weight and depth, as in daisyUI (see §1.7). Consider adding `--radius-box`, `--border` and `--depth` to the contract with derived defaults |

---

## 6. Naming guidance distilled

- The library norm is descriptive recipes (Tailwind, HyperUI) or opaque numbers (Relume, Cargo, shadcn). **Neither suits an agent choosing from text.** snypd's *one plain noun plus a `line:` recipe* is better; keep it, and make the `line:` read like HyperUI's recipe ("title and date on one line, the date in the margin").
- **Reuse a word across slots only when the idea is the same** (`ruled`, `grid`, `index`, `facts`, `plain`). An agent learns "ruled means rules, no fills" once. Avoid words that mean different shapes in different slots: `index` as a front page versus as entries is fine, because both are "the ruled list".
- **Name kits after what the site is** (WordPress: text/news/photo blog; Ghost: theme names by use). Not after moods (daisyUI: cupcake, synthwave). Moods belong to *palettes* ("evening", "fossil") if snypd ever names seeds.

## 7. Source index (primary)

- **Tailwind Plus:**
  - marketing counts: https://web.archive.org/web/2025/https://tailwindcss.com/plus/ui-blocks/marketing
  - blog sections: …/marketing/sections/blog-sections
  - footers: …/sections/footers
  - headers: …/elements/headers
  - header sections: …/sections/header
  - logo clouds: …/sections/logo-clouds
  - content sections: …/sections/content-sections
  - templates: https://web.archive.org/web/2025/https://tailwindcss.com/plus/templates
  - licence: https://tailwindcss.com/plus/license
- **Relume:**
  - https://www.relume.ai/components
  - https://www.relume.ai/style-guide
  - https://www.relume.ai/resources/docs/how-to-create-and-edit-wireframes-in-the-relume-site-builder
  - https://www.relume.ai/resources/docs/building-a-sitemap-with-ai
- **WordPress:**
  - https://github.com/WordPress/wordpress-develop/tree/trunk/src/wp-content/themes/twentytwentyfive (patterns/, styles/{colors,typography,sections,blocks}/)
  - …/twentytwentyfour
  - https://wordpress.org/patterns/
- **Ghost:**
  - https://github.com/TryGhost/Source/blob/main/package.json (and Casper, Edition, Solo, Headline, Episode, Taste, Journal, Dawn, Digest, Bulletin, Wave, Alto, Ease, Edge, London, Ruby, Dope)
- **daisyUI:** https://github.com/saadeghi/daisyui/tree/master/packages/daisyui/src/themes
- **HyperUI:** https://github.com/markmead/hyperui/tree/main/src/content/collection/marketing
- **shadcn:** https://ui.shadcn.com/blocks
- **Flowbite:**
  - https://flowbite.com/blocks/
  - https://flowbite.com/license/
- **Once UI:** https://github.com/once-ui-system/magic-portfolio/blob/main/LICENSE
- **Hugo, Astro and 11ty themes:**
  - https://blowfish.page/docs/homepage-layout/
  - https://jpanther.github.io/congo/docs/homepage-layout/
  - https://github.com/adityatelange/hugo-PaperMod/wiki/Features
  - https://github.com/satnaing/astro-paper
  - https://starlight.astro.build
- **Squarespace:**
  - https://support.squarespace.com/hc/en-us/articles/205815278-Changing-colors
  - https://support.squarespace.com/hc/en-us/articles/360035611791-Portfolio-pages
- **Framer and Readymag:**
  - https://www.framer.com/wireframer/
  - https://cargo.site/templates
  - https://readymag.com/templates/portfolio
  - https://readymag.com/templates/details/5647058/

**Caveats:**
- Relume's variant counts beyond "1,000+" and "Blog ≥68" were not enumerated; its page lazy-loads.
- The Squarespace, Framer and Webflow behaviour comes from their help pages and secondary write-ups, not hands-on use.
- The exemplar layout descriptions for craigmod.com, Pentagram, paco.me and the Tailwind demos were fetched. The others are well-known sites whose layouts are described from knowledge and were checked only for HTTP 200. Verify them visually before citing them in a `piece.yaml`.
