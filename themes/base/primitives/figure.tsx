import type { PrimitiveProps, Html } from "@snypd/render";
import { inline } from "@snypd/render";
/**
 * The size attributes are not decoration: without them the browser cannot reserve the image's box and the
 * text below it jumps when the bytes land — Cumulative Layout Shift. The build reads the intrinsic size of
 * everything in `content/media/` and puts it on `ctx.media` (S13); an external url or an unrecognised
 * format is simply absent there, and the attributes are omitted rather than guessed.
 *
 * The lightbox (U7, docs/14 §4.2) is a `<dialog>` and a button that opens it — `commandfor` / `command`
 * are the platform's own invoker, Baseline since late 2025, so the focus trap, Escape, the backdrop and
 * the close-on-outside-click (`closedby`) all come from the browser and the page still ships no script.
 * The dialog's image is the same url as the figure's, so it costs no request: a lazy image in a closed
 * dialog is never fetched, and when it opens the bytes are already in the cache. The button wraps the
 * image, so the picture is the control; `base`'s own sheet takes the button's chrome off, which is why
 * a theme that says nothing about it still gets a plain picture that opens. `lightbox=false` is the
 * author's opt-out, per image, because whether a picture is worth opening is a fact about the picture.
 */
export default function Figure({ props, ctx, block }: PrimitiveProps): Html {
  // `src` is required, and still absent here when lint refused it — an executing scheme (decision 155),
  // an empty value — so the figure degrades to a broken image and a caption, and never to a throw.
  const src = (props.src as string | undefined) ?? "", alt = (props.alt as string | undefined) ?? "";
  const size = ctx.media[src];
  const w = size ? String(size.width) : undefined, h = size ? String(size.height) : undefined;
  // One id per figure on the page: the block's source line is unique to it, and a tree without positions
  // (a plugin's transform can build one) falls back to the url, which is unique enough for one figure.
  const id = `lb-${block.node.position?.start.line ?? src.replace(/[^\w-]+/g, "-")}`;
  const lightbox = !!src && props.lightbox !== false;
  return (
    <figure class="snypd-figure" data-width={props.width as string}>
      {lightbox
        ? <button type="button" class="snypd-figure-open" commandfor={id} command="show-modal" aria-label={alt ? `View larger: ${alt}` : "View larger"}>
            <img src={src} alt={alt} loading="lazy" decoding="async" width={w} height={h} />
          </button>
        : <img src={src || undefined} alt={alt} loading="lazy" decoding="async" width={w} height={h} />}
      {props.caption ? <figcaption>{inline(props.caption as string)}</figcaption> : null}
      {lightbox ? (
        <dialog id={id} class="snypd-lightbox" closedby="any" aria-label={alt || "Image"}>
          <img src={src} alt={alt} loading="lazy" decoding="async" width={w} height={h} />
          <button type="button" class="snypd-lightbox-close" commandfor={id} command="close">Close</button>
        </dialog>
      ) : null}
    </figure>
  );
}
