import { part, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * The archive of a `work` type (S29 · R3, docs/20 §3 · 1): the build prefers `<type>-index` when a theme
 * declares it. The same cards as everywhere on this theme, under the archive's title — the menu's word
 * for it — and one line that says what the grid holds: how many, and the years they span, read from the
 * entries and never typed. `/posts/` keeps `base`'s index: the notes are a list, and that contrast is the
 * point of a second template.
 */
export default function WorkIndex({ ctx, entries, archive, route, title, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const years = entries.map((e) => e.date?.slice(0, 4)).filter((y): y is string => !!y);
  const span = years.length ? (years[0] === years[years.length - 1] ? years[0] : `${years[years.length - 1]}–${years[0]}`) : undefined;
  const n = entries.length;
  const what = archive?.type === "work" || !archive ? (n === 1 ? "case" : "cases") : n === 1 ? archive.type : `${archive.type}s`;
  return (
    <Shell ctx={ctx} title={title} route={route} jsonLd={jsonLd}>
      <main class="snypd-work-index">
        <h1>{title}</h1>
        {n ? <p class="snypd-lede">{n} {what}{span ? `, ${span}` : ""}.</p> : null}
        <Slot name="before-content" ctx={ctx} route={route} title={title} />
        <Entries ctx={ctx} entries={entries} />
        <Slot name="after-content" ctx={ctx} route={route} title={title} />
      </main>
    </Shell>
  );
}
