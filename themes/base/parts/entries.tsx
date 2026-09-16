/** A list of content items: title, date, description. Shared by index, term and author layouts. */
import { formatDate, settingFlag, settingText, transitionName, type EntriesProps, type Html } from "@snypd/render";

export default function Entries({ ctx, entries }: EntriesProps): Html {
  if (!entries.length) return <p>Nothing published yet.</p>;
  // Two settings, and neither is declared here (U3): `base` declares none, so both fall back to what
  // this part did before they existed. A theme that extends `base` declares `showDates` or `dateFormat`
  // in its own `theme.yaml` and this list honours it — the ids are `base`'s half of that contract,
  // which is why they are named in a part and not in a layout a child would have to fork.
  const dates = settingFlag(ctx, "showDates", true);
  const format = settingText(ctx, "dateFormat");
  // The title's `view-transition-name` (U7, docs/14 §4.4): the same name the post's `<h1>` carries, so
  // the title in this list becomes the title of the page in a browser that animates the navigation.
  // The first six only — a name must be unique per page, and every entry named is a group the browser
  // captures and animates; a 40-group index is a mess, and six is what is above the fold.
  return (
    <ol class="snypd-entries" reversed>
      {entries.map((e, i) => (
        <li>
          <a href={`${e.route}/`} style={i < 6 ? `view-transition-name: ${transitionName(e)}; view-transition-class: snypd-title` : undefined}>{e.title}</a>
          {e.date && dates ? <> <time datetime={e.date}>{formatDate(e.date, format)}</time></> : null}
          {e.description ? <p>{e.description}</p> : null}
        </li>
      ))}
    </ol>
  );
}
