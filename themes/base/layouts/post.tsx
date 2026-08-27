import type { LayoutProps, Html } from "@snypd/render";
import Shell from "./shell";

export default function Post({ ctx, page, route, title, description }: LayoutProps): Html {
  const p = page!;
  const cover = p.frontmatter.cover as { image?: string; alt?: string; eyebrow?: string } | undefined;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route}>
      <main>
        <article class="snypd-post">
          <header class="snypd-cover">
            {cover?.eyebrow ? <p class="snypd-eyebrow">{cover.eyebrow}</p> : null}
            <h1>{p.title}</h1>
            <p>
              {p.date ? <time datetime={p.date}>{p.date}</time> : null}
              {p.updated ? <> (updated <time datetime={p.updated}>{p.updated}</time>)</> : null}
              {p.author ? <> by <a href={`${p.author.route}/`}>{p.author.title}</a></> : null}
            </p>
            {cover?.image ? <img src={cover.image} alt={cover.alt ?? ""} /> : null}
          </header>
          {p.body}
          {p.terms.length ? (
            <footer class="snypd-terms">
              <ul>{p.terms.map((t) => <li><a href={`${t.route}/`} rel="tag">{t.title}</a></li>)}</ul>
            </footer>
          ) : null}
        </article>
        <p><a href={p.markdownUrl} type="text/markdown">Markdown twin</a></p>
      </main>
    </Shell>
  );
}
