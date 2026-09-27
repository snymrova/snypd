/**
 * entries/index, drawn (W4, docs/37 §7; refs in piece.yaml): a list as an index. Each entry is one line —
 * the title, a dotted leader, the date — and nothing under it: no description, no term, no cover. An index
 * is read down the titles, and the leader is what keeps a short title tied to a date set far off at the
 * column's edge.
 *
 * Under a year's heading (`year`, which `home/index` passes for each group) the date drops the year the
 * heading has already said: *09-12*, *12 Sep*. Everywhere else it is the whole date, in the site's format.
 * The order is the build's — newest first — and stands.
 */
import { formatDate, settingFlag, settingText, transitionName, withoutYear, type EntriesProps, type Html } from "@snypd/render";

export default function Index({ ctx, entries, year }: EntriesProps): Html {
  if (!entries.length) return <p class="snypd-entry-index-empty">Nothing yet.</p>;
  const dates = settingFlag(ctx, "showDates", true);
  const format = settingText(ctx, "dateFormat");
  return (
    <ol class="snypd-entry-index" reversed>
      {entries.map((e, i) => {
        const full = e.date && dates ? formatDate(e.date, format) : undefined;
        const label = full && year && e.date!.startsWith(year) ? withoutYear(full, year) : full;
        return (
          <li>
            <a class="snypd-entry-index-row" href={`${e.route}/`}>
              <span class="snypd-entry-index-title" style={i < 6 ? `view-transition-name: ${transitionName(e)}; view-transition-class: snypd-title` : undefined}>{e.title}</span>
              {label ? <><span class="snypd-entry-index-leader" aria-hidden="true" /><time class="snypd-entry-index-when" datetime={e.date}>{label}</time></> : null}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
