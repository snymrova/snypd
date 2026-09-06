/**
 * The document around every layout: head, then the `header` and `footer` parts around the layout's
 * content. Content routes advertise their .md twin.
 *
 * Social metadata is emitted here, from frontmatter and site config, because every site needs it and
 * WordPress's worst onboarding lesson is that basics need a plugin (docs/10 §5.1, decision 90). A route
 * with a `cover.image` shares that; otherwise `site.image`; otherwise the card is text only.
 */
import { raw, part, type Html, type ShellProps } from "@snypd/render";

export default function Shell({ ctx, title, description, markdownUrl, route, jsonLd, page, children }: ShellProps): Html {
  const full = route === "/" ? ctx.site.name : `${title} - ${ctx.site.name}`;
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
          <meta property="og:title" content={route === "/" ? ctx.site.name : title} />
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
        </head>
        <body>
          <Header ctx={ctx} route={route} title={title} page={page} />
          {children}
          <Footer ctx={ctx} route={route} title={title} page={page} />
        </body>
      </html>
    </>
  );
}
