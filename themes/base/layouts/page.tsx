import type { LayoutProps, Html } from "@snypd/render";
import Shell from "./shell";

export default function Page({ ctx, page, route, title, description, jsonLd }: LayoutProps): Html {
  const p = page!;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd}>
      <main>
        <article class="snypd-page">
          {p.cover ?? <h1>{p.title}</h1>}
          {p.body}
        </article>
      </main>
    </Shell>
  );
}
