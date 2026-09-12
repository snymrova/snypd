import { formatDate, part, settingFlag, settingText, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * The header is the author's `::cover` when the body opens with one, and otherwise one built from
 * frontmatter — never both (S14). The byline sits under whichever it was, so a post's date and author
 * do not disappear just because the author wrote their own cover.
 */
export default function Post({ ctx, page, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell");
  const p = page!;
  const fm = p.frontmatter.cover as { image?: string; alt?: string; eyebrow?: string } | undefined;
  const size = fm?.image ? ctx.media[fm.image] : undefined;
  // The same two settings the entry list reads (U3), with the same fallbacks: `base` declares neither,
  // so a theme that does not either renders the byline it always did.
  const dates = settingFlag(ctx, "showDates", true);
  const format = settingText(ctx, "dateFormat");
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main>
        <article class="snypd-post">
          {p.cover ?? (
            <header class="snypd-cover">
              {fm?.eyebrow ? <p class="snypd-eyebrow">{fm.eyebrow}</p> : null}
              <h1>{p.title}</h1>
              {fm?.image ? <img src={fm.image} alt={fm.alt ?? ""} decoding="async" fetchpriority="high"
                width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} /> : null}
            </header>
          )}
          <p class="snypd-byline">
            {p.date && dates ? <time datetime={p.date}>{formatDate(p.date, format)}</time> : null}
            {p.updated && dates ? <> (updated <time datetime={p.updated}>{formatDate(p.updated, format)}</time>)</> : null}
            {p.author ? <> by {p.author.page ? <a href={`${p.author.route}/`} rel="author">{p.author.title}</a> : p.author.title}</> : null}
          </p>
          <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
          {p.body}
          <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
          <footer class="snypd-post-footer">
            {p.terms.length ? (
              <ul class="snypd-terms">{p.terms.map((t) => <li><a href={`${t.route}/`} rel="tag">{t.title}</a></li>)}</ul>
            ) : null}
            <p class="snypd-twin"><a href={p.markdownUrl} type="text/markdown">Markdown twin</a></p>
          </footer>
        </article>
      </main>
    </Shell>
  );
}
