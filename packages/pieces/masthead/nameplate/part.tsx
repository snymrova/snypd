/**
 * The header of `masthead/nameplate`, carved from editorial (docs/36 §2): the site's name — or its logo
 * (U3) — and under it a tagline that falls back to the site's description; beside them the `header` menu
 * when the site has one (U2).
 *
 * A part of its own rather than base's header: base shows a tagline only when the site sets one, and a
 * nameplate always carries a line under the name.
 */
import { settingText, SiteMenu, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const logo = settingText(ctx, "logo");
  // The logo's intrinsic size comes from `ctx.media`, the same lookup a `figure` uses, so a masthead
  // does not reflow while it loads. An off-site logo has no entry and gets no attributes, as S13 decided.
  const size = logo ? ctx.media[logo] : undefined;
  // Falls back to the site's own description, which is what this part read before the setting existed.
  const tagline = settingText(ctx, "tagline") ?? ctx.site.description;
  return (
    <header class="snypd-masthead">
      <div class="snypd-brand">
        <a href="/" rel="home">
          {logo
            ? <img class="snypd-logo" src={logo} alt={ctx.site.name} decoding="async"
                width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} />
            : ctx.site.name}
        </a>
        {tagline ? <p class="snypd-tagline">{tagline}</p> : null}
      </div>
      <SiteMenu ctx={ctx} route={route} />
    </header>
  );
}
