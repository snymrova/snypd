/**
 * The masthead: the site's name and, under it, its description as a tagline. One file, no layouts —
 * this is the override docs/09 U1 exists to make possible. The menu arrives with nav (U2).
 */
import type { Html, PartProps } from "@snypd/render";

export default function Header({ ctx }: PartProps): Html {
  return (
    <header class="snypd-masthead">
      <a href="/" rel="home">{ctx.site.name}</a>
      {ctx.site.description ? <p class="snypd-tagline">{ctx.site.description}</p> : null}
    </header>
  );
}
