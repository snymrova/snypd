import { part, type LayoutProps, type Html } from "@snypd/render";

export default function Author({ ctx, page, entries, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const p = page!;
  const avatar = p.frontmatter.avatar as string | undefined;
  const url = p.frontmatter.url as string | undefined;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main>
        <article class="snypd-author">
          {avatar ? <img src={avatar} alt="" /> : null}
          <h1>{p.title}</h1>
          {url ? <p><a href={url} rel="me">{url}</a></p> : null}
          {p.body}
        </article>
        <Entries ctx={ctx} entries={entries} />
      </main>
    </Shell>
  );
}
