import { formatDate, isFeatureType, nounOf, part, settingText, typeDescription, Slot, type LayoutProps, type Html } from "@snypd/render";

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
  const lede = type && isFeatureType(ctx.config, type) && entries.length ? `${entries.length} ${nounOf(ctx.config, type, entries.length)}${span(entries.map((e) => e.date?.slice(0, 10)).filter((d): d is string => !!d), settingText(ctx, "dateFormat"))}.` : undefined;
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

/** `, 2025–2026` across years; `, 12 Sep 2026 to 25 Sep 2026` within one; `, on 25 Sep 2026` for one day. Newest first. */
function span(days: string[], format?: string): string {
  if (!days.length) return "";
  const last = days[0]!, first = days[days.length - 1]!;
  if (first.slice(0, 4) !== last.slice(0, 4)) return `, ${first.slice(0, 4)}–${last.slice(0, 4)}`;
  const when = (d: string) => formatDate(d, !format || format === "iso" ? "short" : format);   // a sentence, not a table
  return first === last ? `, on ${when(last)}` : `, ${when(first)} to ${when(last)}`;
}
