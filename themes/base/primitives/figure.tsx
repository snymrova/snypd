import type { PrimitiveProps, Html } from "@snypd/render";
/**
 * The size attributes are not decoration: without them the browser cannot reserve the image's box and the
 * text below it jumps when the bytes land — Cumulative Layout Shift. The build reads the intrinsic size of
 * everything in `content/media/` and puts it on `ctx.media` (S13); an external url or an unrecognised
 * format is simply absent there, and the attributes are omitted rather than guessed.
 */
export default function Figure({ props, ctx }: PrimitiveProps): Html {
  const size = ctx.media[props.src as string];
  return (
    <figure class="snypd-figure" data-width={props.width as string}>
      <img src={props.src as string} alt={(props.alt as string | undefined) ?? ""} loading="lazy" decoding="async"
        width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} />
      {props.caption ? <figcaption>{props.caption as string}</figcaption> : null}
    </figure>
  );
}
