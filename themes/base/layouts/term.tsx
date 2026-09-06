import { part, Slot, type LayoutProps, type Html } from "@snypd/render";

export default function Term({ ctx, entries, route, title, description, term, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  return (
    <Shell ctx={ctx} title={title} description={description} route={route} jsonLd={jsonLd}>
      <main>
        <h1><small>{term?.taxonomy}</small> {title}</h1>
        {description ? <p>{description}</p> : null}
        <Slot name="before-content" ctx={ctx} route={route} title={title} />
        <Entries ctx={ctx} entries={entries} />
        <Slot name="after-content" ctx={ctx} route={route} title={title} />
      </main>
    </Shell>
  );
}
