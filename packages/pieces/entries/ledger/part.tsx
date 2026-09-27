/**
 * entries/ledger, carved from folio (docs/25 §3): a dated type as ruled rows — the title, a small muted line under it, the date
 * at the right. The line says what kind of entry it is and the entry's own mark: *Shipped · S32* for a
 * log entry, *v0.1.4* for a release (*Breaking · v0.2.0* when it says so), and for a post, which has no
 * mark, the first term it is filed under. Registered as `entries` too, so `/posts/`, a term page and an
 * author page are the same rows. The archives show the description under the line; the front page's
 * rows do not (the sheet's call, not this part's).
 *
 * The build orders a list by date and then by route, so four sessions on one day read R1, R2, R3, R4
 * under a heading that promises newest first. Within a day the mark decides — R4 above R1, v0.1.4
 * above v0.1.3 — compared as a number where it is one; the day order is the build's and stands.
 */
import { formatDate, settingFlag, settingText, transitionName, type EntriesProps, type Html } from "@snypd/render";

type Entry = EntriesProps["entries"][number];
const markOf = (e: Entry): string | undefined => {
  const fm = e.frontmatter as { session?: unknown; version?: unknown };
  return typeof fm.session === "string" ? fm.session : typeof fm.version === "string" ? `v${fm.version}` : undefined;
};

export default function Ledger({ ctx, entries }: EntriesProps): Html {
  if (!entries.length) return <p class="snypd-ledger-empty">Nothing yet.</p>;
  const dates = settingFlag(ctx, "showDates", true);
  const format = settingText(ctx, "dateFormat");
  const byMark = new Intl.Collator("en", { numeric: true });
  const rows = [...entries].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || byMark.compare(markOf(b) ?? "", markOf(a) ?? ""));
  return (
    <ol class="snypd-ledger" reversed>
      {rows.map((e, i) => {
        const breaking = (e.frontmatter as { breaking?: unknown }).breaking === true;
        const meta = [breaking ? "Breaking" : e.terms?.[0]?.title, markOf(e)].filter((s): s is string => !!s).join(" · ");
        return (
          <li>
            <a class="snypd-ledger-row" href={`${e.route}/`}>
              <span class="snypd-ledger-what">
                <span class="snypd-ledger-title" style={i < 6 ? `view-transition-name: ${transitionName(e)}; view-transition-class: snypd-title` : undefined}>{e.title}</span>
                {meta ? <span class="snypd-ledger-meta">{meta}</span> : null}
                {e.description ? <span class="snypd-ledger-text">{e.description}</span> : null}
              </span>
              {e.date && dates ? <span class="snypd-ledger-when"><time datetime={e.date}>{formatDate(e.date, format)}</time></span> : null}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
