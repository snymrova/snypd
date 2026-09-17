import type { PrimitiveProps, Html } from "@snypd/render";
import { inline, transitionName } from "@snypd/render";
/**
 * The post header, when the author writes one. A leading `::cover` is lifted out of the body by the
 * renderer and handed to the layout as `page.cover` (S14), so this *is* the page's title block — it owns
 * the `<h1>`, and the layout draws no header of its own. Before that lift the two stacked: the layout's
 * frontmatter cover, then a second title block a few paragraphs down.
 *
 * Its image is the one image on the page that is *above* the fold, so it loads eagerly at high priority —
 * a cover marked `loading="lazy"` is the classic way to lose the Largest Contentful Paint you already had.
 *
 * `media` (S29, docs/17 §4.1) is a second thing a cover may carry: a picture or a clip the theme sets
 * behind or beside the title — the reference's showreel. It is decorative by contract (the spec says
 * so), which is why it has no `alt` of its own and is hidden from a screen reader, and a clip is a
 * `<video>` on the same terms as a figure's: the platform's controls and nothing fetched before play,
 * unless the author says `autoplay`, in which case the four attributes that keep an autoplaying clip
 * honest are written here and not by the author (§4.2): muted, looping, inline, and a poster — repeated
 * as a still that `base`'s own sheet shows instead of the clip when the reader asked for reduced motion.
 */
export default function Cover({ props, ctx, page }: PrimitiveProps): Html {
  const title = (props.title as string | undefined) ?? page?.title;
  const src = props.image as string | undefined;
  const size = src ? ctx.media[src] : undefined;
  return (
    <header class="snypd-cover">
      {props.eyebrow ? <p class="snypd-eyebrow">{props.eyebrow as string}</p> : null}
      {/* The same `view-transition-name` the entry list gave this title (U7, docs/14 §4.4), when this cover is a page's. */}
      <h1 style={page ? `view-transition-name: ${transitionName(page)}; view-transition-class: snypd-title` : undefined}>{title}</h1>
      {props.subtitle ? <p class="snypd-subtitle">{inline(props.subtitle as string)}</p> : null}
      {src ? <img src={src} alt={(props.alt as string | undefined) ?? ""} decoding="async" fetchpriority="high"
        width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} /> : null}
      {media(props, ctx)}
    </header>
  );
}

/** The two containers a browser plays without a plugin; anything else `media` names is a picture. */
const isVideo = (src: string) => /\.(?:mp4|webm)(?:[?#].*)?$/i.test(src);

function media(props: PrimitiveProps["props"], ctx: PrimitiveProps["ctx"]): Html | null {
  const src = props.media as string | undefined;
  if (!src) return null;
  const poster = props.poster as string | undefined;
  const size = ctx.media[isVideo(src) ? (poster ?? src) : src];
  const w = size ? String(size.width) : undefined, h = size ? String(size.height) : undefined;
  if (!isVideo(src)) return <img class="snypd-cover-media" src={src} alt="" decoding="async" fetchpriority="high" width={w} height={h} />;
  if (props.autoplay !== true) return <video class="snypd-cover-media" src={src} poster={poster} controls preload="metadata" playsinline width={w} height={h} aria-hidden="true" tabindex="-1"></video>;
  return (
    <>
      <video class="snypd-cover-media" src={src} poster={poster} autoplay muted loop playsinline preload="none" width={w} height={h} aria-hidden="true" tabindex="-1"></video>
      {poster ? <img class="snypd-cover-media snypd-still" src={poster} alt="" decoding="async" width={w} height={h} /> : null}
    </>
  );
}
