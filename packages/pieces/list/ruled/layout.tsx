import { formatDate, nounOf, part, plural, settingText, titleCase, typeDescription, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * `list/ruled`, drawn (W4, docs/37 §7): an archive as a heading, an intro and the terms as a filter row —
 * the row set between two rules, which is the piece's one signature detail. The heading is the archive's
 * word; the intro is what the list holds, counted and dated from the entries (for every type, where
 * `list/plain` counts only a type with roles), then the type's own sentence. The filter row is one line
 * per taxonomy the listed entries carry: *All*, then each term with how many, each a link to its page —
 * read off the entries themselves, so a term nothing listed carries is not offered. On a term's page the
 * taxonomy is the kicker inside the heading, the term's description is the intro, and the term is marked
 * current in the row. The rows are the `entries` piece's, and it sets the row's track as it sets the lede's.
 */
type Entry = LayoutProps["entries"][number];
type Term = NonNullable<Entry["terms"]>[number];

/** `, 2025–2026` across years; `, 12 Sep 2026 to 25 Sep 2026` within one; `, on 25 Sep 2026` for one day. Newest first. */
function span(days: string[], format?: string): string {
  if (!days.length) return "";
  const last = days[0]!, first = days[days.length - 1]!;
  if (first.slice(0, 4) !== last.slice(0, 4)) return `, ${first.slice(0, 4)}–${last.slice(0, 4)}`;
  const when = (d: string) => formatDate(d, !format || format === "iso" ? "short" : format);
  return first === last ? `, on ${when(last)}` : `, ${when(first)} to ${when(last)}`;
}

/** The terms the entries carry, by taxonomy in the type's declared order, each with its count; newest entry first decides nothing here. */
function filters(ctx: LayoutProps["ctx"], entries: Entry[], type: string | undefined): { taxonomy: string; terms: (Term & { n: number })[] }[] {
  const by = new Map<string, Map<string, Term & { n: number }>>();
  for (const e of entries) for (const t of e.terms ?? []) {
    const tax = by.get(t.taxonomy) ?? new Map(); by.set(t.taxonomy, tax);
    const have = tax.get(t.term); if (have) have.n++; else tax.set(t.term, { ...t, n: 1 });
  }
  const order = type ? ctx.config.types[type]?.taxonomies ?? [] : [];
  const rank = (t: string) => { const i = order.indexOf(t); return i < 0 ? order.length : i; };
  return [...by.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([taxonomy, tax]) => ({ taxonomy, terms: [...tax.values()].sort((a, b) => b.n - a.n || a.title.localeCompare(b.title)) }));
}

/** `all` is where *All* goes: the archive the build names (the page itself on `/`, the type's on a term's page), or nowhere. */
function Head({ ctx, entries, route, title, kicker, intro, type, current, all }: { ctx: LayoutProps["ctx"]; entries: Entry[]; route: string; title: string; kicker?: string; intro?: string; type?: string; current?: Term; all?: string }): Html {
  const lede = entries.length && type ? `${entries.length} ${nounOf(ctx.config, type, entries.length)}${span(entries.map((e) => e.date?.slice(0, 10)).filter((d): d is string => !!d), settingText(ctx, "dateFormat"))}.` : undefined;
  const about = intro ?? (type ? typeDescription(ctx.config, type) : undefined);
  return (
    <>
      <h1>{kicker ? <small class="snypd-list-kicker">{kicker}</small> : null}{title}</h1>
      {lede || about ? <p class="snypd-lede">{[lede, about].filter(Boolean).join(" ")}</p> : null}
      <Slot name="before-content" ctx={ctx} route={route} title={title} />
      {filters(ctx, entries, type).map((f, i) => (
        <nav class="snypd-list-filter" aria-label={`${titleCase(f.taxonomy)}: filter the list`}>
          <span class="snypd-list-filter-name">{titleCase(plural(f.taxonomy))}</span>
          {/* *All* once, on the first line; its count is the archive's, which a term's page does not know. */}
          {all && i === 0 ? <a href={all.endsWith("/") ? all : `${all}/`} aria-current={current ? undefined : "page"}>All{current ? "" : <> <span class="snypd-list-count">{entries.length}</span></>}</a> : null}
          {f.terms.map((t) => <a href={`${t.route}/`} aria-current={current && current.taxonomy === t.taxonomy && current.term === t.term ? "page" : undefined}>{t.title === t.term ? titleCase(t.term) : t.title} <span class="snypd-list-count">{t.n}</span></a>)}
        </nav>
      ))}
    </>
  );
}

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
