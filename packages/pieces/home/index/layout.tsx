import { nounOf, part, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * The layout of `home/index`, drawn (W4, docs/37 §7): the front page *is* the ruled index. What sits above
 * the list is a line of intro — the page's title at prose size and everything before its first `##` — and
 * nothing else: no hero, no cover media, no button. The page's `::cover`, if it has one, is not drawn; a
 * front page that wants its film is `home/split` or `home/bands`.
 *
 * The index is every dated type the build hands the page (`lists`, decision 200) as one list, newest
 * first, in groups by year with the year as the group's mark — the rows themselves are the `entries`
 * piece's, so a ledger, a card grid or plain rows are all this front page. How many is the `homeEntries`
 * setting this piece declares (the build reads it, W4); the way to each archive is one line under the
 * list. The page's own `##` sections come after the index, as an afterword — a colophon, an about — so
 * the list is what a reader lands on and the site's own words are what they leave with.
 */
type Entry = LayoutProps["entries"][number];

export default function Home({ ctx, page, entries, archive, lists = [], route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const p = page!;
  const { lead, sections } = p.sections;
  const all = lists.length ? lists.flatMap((l) => l.entries) : entries;
  const rows = [...all].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.route.localeCompare(b.route));
  const years: { year: string; entries: Entry[] }[] = [];
  for (const e of rows) {
    const year = e.date?.slice(0, 4) ?? "Undated";
    const last = years[years.length - 1];
    if (last && last.year === year) last.entries.push(e); else years.push({ year, entries: [e] });
  }
  const archives = lists.length ? lists : archive ? [archive] : [];
  // *Every post · Every release*: the type's own word for one of it (`noun:`, else its name), so the line
  // reads right for any type — never *The whole releases*.
  const wayTo = (a: { type: string }) => `Every ${nounOf(ctx.config, a.type, 1)}`;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main class="snypd-home snypd-index">
        <header class="snypd-index-intro">
          <h1>{p.title}</h1>
          {lead}
          <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
        </header>
        {years.map((g) => (
          <section class="snypd-index-year" aria-labelledby={`snypd-year-${g.year}`}>
            <h2 class="snypd-index-mark" id={`snypd-year-${g.year}`}>{g.year}</h2>
            <Entries ctx={ctx} entries={g.entries} year={g.year === "Undated" ? undefined : g.year} />
          </section>
        ))}
        {archives.length ? (
          <p class="snypd-index-more">
            {archives.map((a, i) => <>{i ? " · " : ""}<a href={`${a.route}/`}>{wayTo(a)}</a></>)}
          </p>
        ) : null}
        {sections.map((s) => (
          <section class="snypd-index-after" aria-labelledby={s.id}>
            <h2 id={s.id}>{s.title}</h2>
            {s.body}
          </section>
        ))}
        <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
      </main>
    </Shell>
  );
}
