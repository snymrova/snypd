import { part, type LayoutProps, type Html } from "@snypd/render";

export default function Index({ ctx, entries, route, title, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  return (
    <Shell ctx={ctx} title={title} route={route} jsonLd={jsonLd}>
      <main>
        <h1>{ctx.site.name}</h1>
        <Entries ctx={ctx} entries={entries} />
      </main>
    </Shell>
  );
}
