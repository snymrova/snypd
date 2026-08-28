import type { LayoutProps, Html } from "@snypd/render";
import Shell from "./shell";

/**
 * The header is the author's `::cover` when the body opens with one, and otherwise one built from
 * frontmatter — never both (S14). The byline sits under whichever it was, so a post's date and author
 * do not disappear just because the author wrote their own cover.
 */
export default function Post({ ctx, page, route, title, description, jsonLd }: LayoutProps): Html {
  const p = page!;
  const fm = p.frontmatter.cover as { image?: string; alt?: string; eyebrow?: string } | undefined;
  const size = fm?.image ? ctx.media[fm.image] : undefined;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd}>
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
            {p.date ? <time datetime={p.date}>{p.date}</time> : null}
            {p.updated ? <> (updated <time datetime={p.updated}>{p.updated}</time>)</> : null}
            {p.author ? <> by <a href={`${p.author.route}/`} rel="author">{p.author.title}</a></> : null}
          </p>
          {p.body}
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
