import { ArchiveHead as Head, part, titleCase, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * `list/ruled`, drawn (W4, docs/37 §7): an archive as a heading, an intro and the terms as a filter row —
 * the row set between two rules, which is the piece's one signature detail. The heading is the archive's
 * word; the intro is what the list holds, counted and dated from the entries (for every type, where
 * `list/plain` counts only a type with roles), then the type's own sentence. The filter row is one line
 * per taxonomy the listed entries carry: *All*, then each term with how many, each a link to its page —
 * read off the entries themselves, so a term nothing listed carries is not offered. On a term's page the
 * taxonomy is the kicker inside the heading, the term's description is the intro, and the term is marked
 * current in the row. The rows are the `entries` piece's, and it sets the row's track as it sets the lede's.
 * The head is `@snypd/render`'s `ArchiveHead`, which `list/grid` draws too.
 */
export function Index({ ctx, entries, archive, route, title, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  return (
    <Shell ctx={ctx} title={title} route={route} jsonLd={jsonLd}>
      <main class="snypd-list">
        <Head ctx={ctx} entries={entries} route={route} title={title} type={archive?.type ?? entries[0]?.type} all={archive?.route ?? route} />
        <Entries ctx={ctx} entries={entries} />
        <Slot name="after-content" ctx={ctx} route={route} title={title} />
      </main>
    </Shell>
  );
}

export function Term({ ctx, entries, archive, route, title, description, term, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  return (
    <Shell ctx={ctx} title={title} description={description} route={route} jsonLd={jsonLd}>
      <main class="snypd-list">
        <Head ctx={ctx} entries={entries} route={route} title={title} kicker={term ? titleCase(term.taxonomy) : undefined} intro={description} type={archive?.type ?? entries[0]?.type} current={term} all={archive?.route} />
        <Entries ctx={ctx} entries={entries} />
        <Slot name="after-content" ctx={ctx} route={route} title={title} />
      </main>
    </Shell>
  );
}

export default Index;
