import type { PrimitiveProps, Html } from "@snypd/render";
/**
 * An explicit cover replaces the one the post layout builds from frontmatter; the layout's stays as the h1.
 * Its image is the one image on the page that is *above* the fold, so it loads eagerly at high priority —
 * a cover marked `loading="lazy"` is the classic way to lose the Largest Contentful Paint you already had.
 */
export default function Cover({ props, ctx, page }: PrimitiveProps): Html {
  const title = (props.title as string | undefined) ?? page?.title;
  const src = props.image as string | undefined;
  const size = src ? ctx.media[src] : undefined;
  return (
    <header class="snypd-cover snypd-cover--explicit">
      {props.eyebrow ? <p class="snypd-eyebrow">{props.eyebrow as string}</p> : null}
      <p class="snypd-cover-title"><strong>{title}</strong></p>
      {props.subtitle ? <p>{props.subtitle as string}</p> : null}
      {src ? <img src={src} alt={(props.alt as string | undefined) ?? ""} decoding="async" fetchpriority="high"
        width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} /> : null}
    </header>
  );
}
