import { part, type LayoutProps, type Html } from "@snypd/render";

export default function Page({ ctx, page, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell");
  const p = page!;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main>
        <article class="snypd-page">
          {p.cover ?? <h1>{p.title}</h1>}
          {p.body}
        </article>
      </main>
    </Shell>
  );
}
