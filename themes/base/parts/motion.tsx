/**
 * The motion control (docs/18 §2 · 7, decision 190): one visible checkbox, rendered only on a page that
 * carries something that moves by itself — a cover's autoplaying clip, a marquee wall — and nothing
 * else. WCAG 2.2.2 asks that moving content which starts on its own and runs past five seconds can be
 * paused by everyone, not only by a reader whose system asks for reduced motion; this is the mechanism,
 * with no script: `base`'s sheet reads `#snypd-motion:checked` and shows the still in place of the clip,
 * and a theme that animates a marquee or reveals stops them on the same selector. Per page, no memory —
 * the criterion asks for the control, not persistence.
 *
 * A part, so a theme places it where its chrome wants it (the masthead, the hero's corner) by calling
 * `part(ctx, "motion")` from its own header; `base`'s header renders it last. The label is one word.
 */
import type { Html, PartProps } from "@snypd/render";

export default function Motion({ page }: PartProps): Html | null {
  const html = `${page?.cover?.html ?? ""}${page?.body.html ?? ""}`;
  const moving = / autoplay[ >]/.test(html) || html.includes('class="snypd-marquee"');
  if (!moving) return null;
  return (
    <p class="snypd-motion">
      <input type="checkbox" id="snypd-motion" />
      <label for="snypd-motion">Motion</label>
    </p>
  );
}
