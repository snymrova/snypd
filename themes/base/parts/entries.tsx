/** A list of content items: title, date, description. Shared by index, term and author layouts. */
import { formatDate, settingFlag, settingText, type EntriesProps, type Html } from "@snypd/render";

export default function Entries({ ctx, entries }: EntriesProps): Html {
  if (!entries.length) return <p>Nothing published yet.</p>;
  // Two settings, and neither is declared here (U3): `base` declares none, so both fall back to what
  // this part did before they existed. A theme that extends `base` declares `showDates` or `dateFormat`
  // in its own `theme.yaml` and this list honours it — the ids are `base`'s half of that contract,
  // which is why they are named in a part and not in a layout a child would have to fork.
  const dates = settingFlag(ctx, "showDates", true);
  const format = settingText(ctx, "dateFormat");
  return (
    <ol class="snypd-entries" reversed>
      {entries.map((e) => (
        <li>
          <a href={`${e.route}/`}>{e.title}</a>
          {e.date && dates ? <> <time datetime={e.date}>{formatDate(e.date, format)}</time></> : null}
          {e.description ? <p>{e.description}</p> : null}
        </li>
      ))}
    </ol>
  );
}
