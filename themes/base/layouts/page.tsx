import { part, Slot, type LayoutProps, type Html } from "@snypd/render";

export default function Page({ ctx, page, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell");
  const p = page!;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main>
        <article class="snypd-page">
          {p.cover ?? <h1>{p.title}</h1>}
          <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
          {p.body}
          <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
        </article>
      </main>
    </Shell>
  );
}
