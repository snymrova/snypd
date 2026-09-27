import { ArchiveHead, coverFrame, coverOf, formatDate, part, settingFlag, settingText, Slot, termTitle, titleCase, transitionName, withoutYear, type LayoutProps, type Html } from "@snypd/render";

/**
 * `list/grid`, drawn (W4, docs/37 §7): an archive for a type that is its pictures. The head is
 * `list/ruled`'s — the heading, the count and dates, the type's sentence, the terms as a filter row — and
 * under it every entry is a tile: its cover cropped to a frame every tile shares, then the title, then the
 * date and the first term. The frame is the shape of the list's typical cover (`coverFrame`), so a list of
 * landscape covers is cropped least. An entry with no cover is its name in the frame.
 *
 * The one signature detail: when the list spans more than one year, the grid breaks at each year's turn,
 * and a rule across the grid carries the year — so a wall of pictures still reads as a timeline, and the
 * tiles under it drop the year from their dates. A list inside one year is one grid, and each date is whole.
 * It draws its own tiles; the theme's `entries` piece is not asked.
 */
type Entry = LayoutProps["entries"][number];

function Tiles({ ctx, entries, year, eager, frame }: { ctx: LayoutProps["ctx"]; entries: Entry[]; year?: string; eager: number; frame: number }): Html {
  const dates = settingFlag(ctx, "showDates", true), format = settingText(ctx, "dateFormat");
  const when = (e: Entry) => {
    if (!e.date || !dates) return undefined;
    const full = formatDate(e.date, format);
    return year && e.date.startsWith(year) ? withoutYear(full, year) : full;
  };
  return (
    <ol class="snypd-tiles" style={`--tile-frame: ${frame}`}>
      {entries.map((e, i) => {
        const src = coverOf(e), size = src ? ctx.media[src] : undefined;
        const date = when(e), term = e.terms?.[0];
        return (
          <li class="snypd-tile">
            <a href={`${e.route}/`}>
              {/* Decorative: the name under it says what the picture would. */}
              <span class="snypd-tile-frame" data-empty={src ? undefined : ""}>
                {src ? <img src={src} alt="" loading={eager + i < 4 ? undefined : "lazy"} decoding="async"
                  width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} /> : <span aria-hidden="true">{e.title}</span>}
              </span>
              <span class="snypd-tile-name" style={eager + i < 6 ? `view-transition-name: ${transitionName(e)}; view-transition-class: snypd-title` : undefined}>{e.title}</span>
              {date || term ? <span class="snypd-tile-label">{date ? <time datetime={e.date}>{date}</time> : null}{date && term ? " · " : ""}{term ? termTitle(term) : ""}</span> : null}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** The entries by year, newest first — one group when they are all one year's, or undated. */
function byYear(entries: Entry[]): [string | undefined, Entry[]][] {
  const years = new Map<string, Entry[]>();
  for (const e of entries) { const y = e.date?.slice(0, 4) ?? ""; years.set(y, [...(years.get(y) ?? []), e]); }
  return years.size > 1 ? [...years.entries()].map(([y, es]) => [y || undefined, es]) : [[undefined, entries]];
}

function Grid({ ctx, entries }: { ctx: LayoutProps["ctx"]; entries: Entry[] }): Html {
  if (!entries.length) return <p>Nothing published yet.</p>;
  // One frame for the whole list, not one a year: a year of tall covers keeps the wall's shape.
  const frame = coverFrame(ctx, entries);
  let seen = 0;
  return (
    <>
      {byYear(entries).map(([year, es]) => {
        const eager = seen; seen += es.length;
        return year ? (
          <section class="snypd-tiles-year" aria-labelledby={`y${year}`}>
            <h2 class="snypd-tiles-mark" id={`y${year}`}>{year}</h2>
            <Tiles ctx={ctx} entries={es} year={year} eager={eager} frame={frame} />
          </section>
        ) : <Tiles ctx={ctx} entries={es} eager={eager} frame={frame} />;
      })}
    </>
  );
}

export function Index({ ctx, entries, archive, route, title, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell");
  return (
    <Shell ctx={ctx} title={title} route={route} jsonLd={jsonLd}>
      <main class="snypd-list">
        <ArchiveHead ctx={ctx} entries={entries} route={route} title={title} type={archive?.type ?? entries[0]?.type} all={archive?.route ?? route} />
        <Grid ctx={ctx} entries={entries} />
        <Slot name="after-content" ctx={ctx} route={route} title={title} />
      </main>
    </Shell>
  );
}

export function Term({ ctx, entries, archive, route, title, description, term, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell");
  return (
    <Shell ctx={ctx} title={title} description={description} route={route} jsonLd={jsonLd}>
      <main class="snypd-list">
        <ArchiveHead ctx={ctx} entries={entries} route={route} title={title} kicker={term ? titleCase(term.taxonomy) : undefined} intro={description} type={archive?.type ?? entries[0]?.type} current={term} all={archive?.route} />
        <Grid ctx={ctx} entries={entries} />
        <Slot name="after-content" ctx={ctx} route={route} title={title} />
      </main>
    </Shell>
  );
}

export default Index;
