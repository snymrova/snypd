/**
 * The entry list as cards (docs/17 §3, "hover image swap on a card"): each item is its cover, when the
 * post has one, then the date, the title and the description, the whole card one link. The reference's
 * case cards swap their image on hover with a script; here the stylesheet scales the one image — a card
 * is one picture, and the second `<img>` a crossfade would need is a request this page does not make.
 *
 * `base`'s list is what the index, term and author layouts render; this replaces it on every one of
 * them, so a category page reads as the same grid the front page ends with. The same two settings and
 * the same `view-transition-name` rule as `base` (U3, U7): the first six titles morph into the post's.
 */
import { formatDate, settingFlag, settingText, transitionName, type EntriesProps, type Html } from "@snypd/render";

export default function Entries({ ctx, entries }: EntriesProps): Html {
  if (!entries.length) return <p>Nothing published yet.</p>;
  const dates = settingFlag(ctx, "showDates", true);
  const format = settingText(ctx, "dateFormat");
  // The card's word for the item: its first term (R3 — *Product* for a case filed under product, *Process* for a note), which the build hands every listed entry; a site with no taxonomies shows none.
  const kindOf = (e: EntriesProps["entries"][number]) => e.terms?.[0]?.title ?? (typeof e.frontmatter.category === "string" ? e.frontmatter.category : undefined);
  // When every card in the list would say the same word — six posts, all *Building in public* — the word tells a reader nothing and the date stands alone.
  const kinds = new Set(entries.map(kindOf));
  const uniform = entries.length > 1 && kinds.size === 1;
  return (
    <ol class="snypd-entries" reversed>
      {entries.map((e, i) => {
        const cover = e.frontmatter.cover as { image?: string } | undefined;
        const src = cover?.image;
        const size = src ? ctx.media[src] : undefined;
        const kind = uniform ? undefined : kindOf(e);
        return (
          <li class="snypd-card">
            <a href={`${e.route}/`}>
              {/* Decorative here: the card's text is its name, so the picture says nothing a reader loses. */}
              {src ? <img class="snypd-card-image" src={src} alt="" loading="lazy" decoding="async"
                width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} /> : null}
              <span class="snypd-card-meta">
                {kind ? <span>{kind}</span> : null}
                {e.date && dates ? <time datetime={e.date}>{formatDate(e.date, format)}</time> : null}
              </span>
              <span class="snypd-card-title" style={i < 6 ? `view-transition-name: ${transitionName(e)}; view-transition-class: snypd-title` : undefined}>{e.title}</span>
              {e.description ? <span class="snypd-card-text">{e.description}</span> : null}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
