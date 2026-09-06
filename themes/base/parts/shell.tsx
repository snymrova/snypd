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
import { raw, part, Slot, type Html, type ShellProps } from "@snypd/render";

export default function Shell({ ctx, title, description, markdownUrl, route, jsonLd, page, children }: ShellProps): Html {
  // At `/` the title *is* the site's name (the index layout passes it), so it is not repeated; it is still
  // `title` and not `ctx.site.name`, so a `title` filter (P2) reaches the front page too.
  const full = route === "/" ? title : `${title} - ${ctx.site.name}`;
  const url = `${ctx.site.url}${route === "/" ? "/" : `${route}/`}`;
  const cover = page?.frontmatter.cover as { image?: string; alt?: string } | undefined;
  const image = cover?.image ?? ctx.site.image;
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
          <link rel="canonical" href={url} />
          {markdownUrl ? <link rel="alternate" type="text/markdown" href={markdownUrl} /> : null}
          <link rel="alternate" type="application/rss+xml" title={ctx.site.name} href={ctx.assets.feed} />
          {ctx.assets.css ? <link rel="stylesheet" href={ctx.assets.css} /> : null}
          {/* Without this every page logs a 404: browsers ask for /favicon.ico whether or not one exists. */}
          {ctx.site.icon ? <link rel="icon" href={ctx.site.icon} /> : null}
          <meta name="generator" content="snypd" />
          <meta property="og:site_name" content={ctx.site.name} />
          <meta property="og:type" content={article ? "article" : "website"} />
          <meta property="og:title" content={title} />
          {description ? <meta property="og:description" content={description} /> : null}
          <meta property="og:url" content={url} />
          {imageUrl ? <meta property="og:image" content={imageUrl} /> : null}
          {imageUrl && cover?.alt ? <meta property="og:image:alt" content={cover.alt} /> : null}
          {imageUrl && size ? <meta property="og:image:width" content={String(size.width)} /> : null}
          {imageUrl && size ? <meta property="og:image:height" content={String(size.height)} /> : null}
          {article && page?.date ? <meta property="article:published_time" content={page.date} /> : null}
          {article && page?.updated ? <meta property="article:modified_time" content={page.updated} /> : null}
          <meta name="twitter:card" content={imageUrl ? "summary_large_image" : "summary"} />
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
