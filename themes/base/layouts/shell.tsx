/** The document around every layout: head, header, footer. Content routes advertise their .md twin. */
import { raw, type Html, type SiteCtx } from "@snypd/render";

export interface ShellProps { ctx: SiteCtx; title: string; description?: string; markdownUrl?: string; route: string; jsonLd?: string; children: Html }

export default function Shell({ ctx, title, description, markdownUrl, route, jsonLd, children }: ShellProps): Html {
  const full = route === "/" ? ctx.site.name : `${title} - ${ctx.site.name}`;
  return (
    <>
      {raw("<!doctype html>\n")}
      <html lang={ctx.config.site.defaultLocale}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{full}</title>
          {description ? <meta name="description" content={description} /> : null}
          <link rel="canonical" href={`${ctx.site.url}${route === "/" ? "/" : `${route}/`}`} />
          {markdownUrl ? <link rel="alternate" type="text/markdown" href={markdownUrl} /> : null}
          <link rel="alternate" type="application/rss+xml" title={ctx.site.name} href={ctx.assets.feed} />
          {ctx.assets.css ? <link rel="stylesheet" href={ctx.assets.css} /> : null}
          {/* Without this every page logs a 404: browsers ask for /favicon.ico whether or not one exists. */}
          {ctx.site.icon ? <link rel="icon" href={ctx.site.icon} /> : null}
          <meta name="generator" content="snypd" />
          {jsonLd ? raw(`<script type="application/ld+json">${jsonLd.replace(/<\//g, "<\\/")}</script>\n`) : null}
        </head>
        <body>
          <header><a href="/" rel="home">{ctx.site.name}</a></header>
          {children}
          <footer><p>{ctx.site.name}</p></footer>
        </body>
      </html>
    </>
  );
}
