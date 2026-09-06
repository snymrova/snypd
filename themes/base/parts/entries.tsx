/** A list of content items: title, date, description. Shared by index, term and author layouts. */
import type { EntriesProps, Html } from "@snypd/render";

export default function Entries({ entries }: EntriesProps): Html {
  if (!entries.length) return <p>Nothing published yet.</p>;
  return (
    <ol class="snypd-entries" reversed>
      {entries.map((e) => (
        <li>
          <a href={`${e.route}/`}>{e.title}</a>
          {e.date ? <> <time datetime={e.date}>{e.date}</time></> : null}
          {e.description ? <p>{e.description}</p> : null}
        </li>
      ))}
    </ol>
  );
}
