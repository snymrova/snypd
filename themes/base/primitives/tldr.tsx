import type { PrimitiveProps, Html } from "@snypd/render";
import { settingText } from "@snypd/render";
/**
 * The label is the author's `label`, else the theme's `tldrLabel` setting, else "TL;DR" (docs/18 §2 · 10):
 * a blog's word on a studio's front page is the theme's to change, and an author who wants another word
 * on one page writes it once.
 */
export default function Tldr({ props, body, ctx }: PrimitiveProps): Html {
  const label = (props.label as string | undefined) ?? settingText(ctx, "tldrLabel") ?? "TL;DR";
  return <section class="snypd-tldr" aria-label="Summary"><p><strong>{label}</strong></p>{body}</section>;
}
