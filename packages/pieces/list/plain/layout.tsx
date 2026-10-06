import { archiveCount, isFeatureType, part, typeDescription, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * An archive (W3, docs/37 §7): base's index — the title, the entries — and, when the archive is a feature
 * type's (a type whose fields carry a `role:`), one line under the title that says what it holds: how many,
 * by the type's own noun, and when — the years they span, or the days when they are all one year's — read
 * from the entries and never typed; then the type's `description:`. Carved from studio's `work-index` and
 * folio's `log-index`, which were this line twice with the noun written in. `/posts/` and `/` are unchanged.
 */
export default function Index({ ctx, entries, archive, route, title, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const type = archive?.type;
  const lede = type && isFeatureType(ctx.config, type) && entries.length ? archiveCount(ctx, entries, type) : undefined;
  const about = type ? typeDescription(ctx.config, type) : undefined;
  return (
    <Shell ctx={ctx} title={title} route={route} jsonLd={jsonLd}>
      <main>
        <h1>{title}</h1>
        {lede ? <p class="snypd-lede">{lede}{about ? ` ${about}` : ""}</p> : null}
        <Slot name="before-content" ctx={ctx} route={route} title={title} />
        <Entries ctx={ctx} entries={entries} />
        <Slot name="after-content" ctx={ctx} route={route} title={title} />
      </main>
    </Shell>
  );
}

