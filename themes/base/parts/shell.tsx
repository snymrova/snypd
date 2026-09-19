/**
 * The document around every layout: head, then the `header` and `footer` parts around the layout's
 * content. Content routes advertise their .md twin.
 *
 * Social metadata is emitted here, from frontmatter and site config, because every site needs it and
 * WordPress's worst onboarding lesson is that basics need a plugin (docs/10 §5.1, decision 90). A route
 * with a `cover.image` shares that; otherwise `site.image`; otherwise the card is text only.
 *
 * Three of the six slots live here (P2, docs/10 §4.3): `head` last in `<head>`, `body-start` first in
 * `<body>`, `body-end` last before `</body>` — where a beacon goes. The theme decides where a slot is;
 * a plugin decides what goes in it, and a site with no plugin renders nothing here at all.
 */
import { raw, part, Slot, cardUrl, TOUCH_ICON, type Html, type ShellProps } from "@snypd/render";

/**
 * Pages open at once (S36, then S38): two rules over the same set of links. **Prefetch, immediately** —
 * the HTML of every same-origin page this one links to is fetched as soon as it is idle, a few KB each,
 * so a click that beats the prerender still has its document in memory and only CSS and a font that are
 * already immutable in the cache. **Prerender, on intent** — Chrome and Edge draw the page on hover or
 * pointerdown, so the click shows a page that is already painted. A data block, not script — the
 * browser runs nothing, and the build's JS gate and `page.js.kb` both skip it by type. Files that are not
 * pages, and the Desk, are left alone: prerendering an approval page is not a thing to do speculatively.
 */
const PAGES = { and: [{ href_matches: "/*" }, ...["/_snypd/*", "/api/*", "/media/*", "/*.md", "/*.xml", "/*.txt"].map((p) => ({ not: { href_matches: p } }))] };
const SPECULATION = JSON.stringify({ prefetch: [{ where: PAGES, eagerness: "immediate" }], prerender: [{ where: PAGES, eagerness: "moderate" }] });

export default function Shell({ ctx, title, description, markdownUrl, route, jsonLd, page, children }: ShellProps): Html {
  // At `/` the site comes first: the index layout passes the site's name as the title, so the tab is the
  // name alone; a `home: true` page passes its own (decision 206), and the tab reads `name - pitch` — the
  // one place the order flips, because a front page's tab is the site's before it is the page's. Decided
  // on the page, not on the string: a `title` filter (P2) may have rewritten `title`, and it reaches the
  // front page too. A home page titled after the site gets the name alone.
  const full = route !== "/" ? `${title} - ${ctx.site.name}` : page && page.title !== ctx.site.name ? `${ctx.site.name} - ${title}` : title;
  const url = `${ctx.site.url}${route === "/" ? "/" : `${route}/`}`;
  const cover = page?.frontmatter.cover as { image?: string; alt?: string } | undefined;
  // Cover, then the page's own share card when `snypd cards` has drawn one (S36), then the site's. At `/`
  // a `site.image` wins over the card: the front page *is* the site, and its image was chosen for it.
  const card = !cover?.image && !(route === "/" && ctx.site.image) && ctx.media[cardUrl(route)] ? cardUrl(route) : undefined;
  const image = cover?.image ?? card ?? ctx.site.image;
  const imageAlt = cover?.image ? cover.alt : card ? title : ctx.config.site.imageAlt;
  // A page the author marked `noindex`, the not-found page, and every page of a preview (S19d).
  const noindex = ctx.preview || page?.frontmatter.noindex === true || route === "/404";
  const imageUrl = image ? (/^[a-z]+:\/\//i.test(image) ? image : `${ctx.site.url}${image.startsWith("/") ? "" : "/"}${image}`) : undefined;
  const size = image ? ctx.media[image] : undefined;
  const article = !!page?.date;
  const Header = part(ctx, "header"), Footer = part(ctx, "footer");
  return (
    <>
      {raw("<!doctype html>\n")}
      <html lang={ctx.config.site.defaultLocale}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{full}</title>
          {description ? <meta name="description" content={description} /> : null}
          {/* A preview build with drafts in it (S19d): the canonical still names production, and `noindex` keeps the preview out of the index. A page that is itself `noindex` names no canonical — the two would contradict each other. */}
          {noindex && !ctx.preview ? null : <link rel="canonical" href={url} />}
          {noindex ? <meta name="robots" content="noindex" /> : null}
          {markdownUrl ? <link rel="alternate" type="text/markdown" href={markdownUrl} /> : null}
          <link rel="alternate" type="application/rss+xml" title={ctx.site.name} href={ctx.assets.feed} />
          {ctx.assets.css ? <link rel="stylesheet" href={ctx.assets.css} /> : null}
          {/*
            The theme's webfont (B1, decision 118), preloaded. Without this the browser finds the face
            only after it has fetched and parsed the stylesheet, which is a second round trip before the
            first one starts — and `font-display: swap` then swaps a paragraph the reader is already in.
            `crossorigin` is not optional even same-origin: a font is fetched in CORS mode, and a preload
            without it is a second, separate download rather than a warm cache entry.
          */}
          {ctx.assets.font ? <link rel="preload" href={ctx.assets.font} as="font" type="font/woff2" crossorigin="anonymous" /> : null}
          {/* Without this every page logs a 404: browsers ask for /favicon.ico whether or not one exists. */}
          {ctx.site.icon ? <link rel="icon" href={ctx.site.icon} {...(/\.svg$/i.test(ctx.site.icon) ? { type: "image/svg+xml" } : {})} /> : null}
          {ctx.media[TOUCH_ICON] ? <link rel="apple-touch-icon" href="/apple-touch-icon.png" /> : null}
          <meta name="generator" content="snypd" />
          <meta property="og:site_name" content={ctx.site.name} />
          <meta property="og:type" content={article ? "article" : "website"} />
          <meta property="og:title" content={title} />
          {description ? <meta property="og:description" content={description} /> : null}
          <meta property="og:url" content={url} />
          {imageUrl ? <meta property="og:image" content={imageUrl} /> : null}
          {imageUrl && imageAlt ? <meta property="og:image:alt" content={imageAlt} /> : null}
          {imageUrl && size ? <meta property="og:image:width" content={String(size.width)} /> : null}
          {imageUrl && size ? <meta property="og:image:height" content={String(size.height)} /> : null}
          {article && page?.date ? <meta property="article:published_time" content={page.date} /> : null}
          {article && page?.updated ? <meta property="article:modified_time" content={page.updated} /> : null}
          <meta name="twitter:card" content={imageUrl ? "summary_large_image" : "summary"} />
          {raw(`<script type="speculationrules">${SPECULATION}</script>\n`)}
          {jsonLd ? raw(`<script type="application/ld+json">${jsonLd.replace(/<\//g, "<\\/")}</script>\n`) : null}
          <Slot name="head" ctx={ctx} route={route} title={title} page={page} />
        </head>
        <body>
          <Slot name="body-start" ctx={ctx} route={route} title={title} page={page} />
          <Header ctx={ctx} route={route} title={title} page={page} />
          {children}
          <Footer ctx={ctx} route={route} title={title} page={page} />
          <Slot name="body-end" ctx={ctx} route={route} title={title} page={page} />
        </body>
      </html>
    </>
  );
}
