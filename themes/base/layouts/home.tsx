import { part, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * The front page (S25, docs/16 §2): the page that carries `home: true`, rendered as the page layout
 * renders it — cover or title, the body with every primitive — and the newest posts under it. The list
 * itself lives at `/posts/` while a page holds `/`, so the section links there; a theme that wants the
 * posts elsewhere, or not at all, overrides this one file. `title` is the site's name (the build sets it),
 * which is what the shell puts in the tab; the page's own title is the heading.
 */
export default function Home({ ctx, page, entries, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const p = page!;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main>
        <article class="snypd-page snypd-home">
          {p.cover ?? <h1>{p.title}</h1>}
          <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
          {p.body}
          <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
        </article>
        <section class="snypd-home-entries" aria-labelledby="snypd-latest">
          <h2 id="snypd-latest"><a href="/posts/">Latest posts</a></h2>
          <Entries ctx={ctx} entries={entries} />
        </section>
      </main>
    </Shell>
  );
}
