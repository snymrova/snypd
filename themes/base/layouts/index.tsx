import { part, Slot, type LayoutProps, type Html } from "@snypd/render";

export default function Index({ ctx, entries, route, title, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  return (
    <Shell ctx={ctx} title={title} route={route} jsonLd={jsonLd}>
      <main>
        <h1>{title}</h1>
        <Slot name="before-content" ctx={ctx} route={route} title={title} />
        <Entries ctx={ctx} entries={entries} />
        <Slot name="after-content" ctx={ctx} route={route} title={title} />
      </main>
    </Shell>
  );
}
