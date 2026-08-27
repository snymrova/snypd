import type { LayoutProps, Html } from "@snypd/render";
import Shell from "./shell";
import Entries from "./entries";

export default function Author({ ctx, page, entries, route, title, description, jsonLd }: LayoutProps): Html {
  const p = page!;
  const avatar = p.frontmatter.avatar as string | undefined;
  const url = p.frontmatter.url as string | undefined;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd}>
      <main>
        <article class="snypd-author">
          {avatar ? <img src={avatar} alt="" /> : null}
          <h1>{p.title}</h1>
          {url ? <p><a href={url} rel="me">{url}</a></p> : null}
          {p.body}
        </article>
        <Entries entries={entries} />
      </main>
    </Shell>
  );
}
