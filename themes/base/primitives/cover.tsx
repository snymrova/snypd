import type { PrimitiveProps, Html } from "@snypd/render";
import { inline } from "@snypd/render";
/**
 * The post header, when the author writes one. A leading `::cover` is lifted out of the body by the
 * renderer and handed to the layout as `page.cover` (S14), so this *is* the page's title block — it owns
 * the `<h1>`, and the layout draws no header of its own. Before that lift the two stacked: the layout's
 * frontmatter cover, then a second title block a few paragraphs down.
 *
 * Its image is the one image on the page that is *above* the fold, so it loads eagerly at high priority —
 * a cover marked `loading="lazy"` is the classic way to lose the Largest Contentful Paint you already had.
 */
export default function Cover({ props, ctx, page }: PrimitiveProps): Html {
  const title = (props.title as string | undefined) ?? page?.title;
  const src = props.image as string | undefined;
  const size = src ? ctx.media[src] : undefined;
  return (
    <header class="snypd-cover">
      {props.eyebrow ? <p class="snypd-eyebrow">{props.eyebrow as string}</p> : null}
      <h1>{title}</h1>
      {props.subtitle ? <p class="snypd-subtitle">{inline(props.subtitle as string)}</p> : null}
      {src ? <img src={src} alt={(props.alt as string | undefined) ?? ""} decoding="async" fetchpriority="high"
        width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} /> : null}
    </header>
  );
}
