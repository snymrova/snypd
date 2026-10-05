/**
 * The header of `masthead/title-bar`, carved from technical (docs/36 §2): the site's name — or its logo
 * (U3) — a tagline beside it rather than under it, the `header` menu (U2), and a `src` link to the
 * repository when the site sets one.
 *
 * A part of its own, not base's header with switches, because three things differ in markup: the tagline
 * is a `<span>` that falls back to the site's description, and the menu carries the `repo` item.
 */
import { settingText, SiteMenu, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const logo = settingText(ctx, "logo");
  const size = logo ? ctx.media[logo] : undefined;
  const tagline = settingText(ctx, "tagline") ?? ctx.site.description;
  const repo = settingText(ctx, "repo");
  return (
    <header class="snypd-masthead">
      <div class="snypd-brand">
        <a href="/" rel="home">
          {logo
            ? <img class="snypd-logo" src={logo} alt={ctx.site.name} decoding="async"
                width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} />
            : ctx.site.name}
        </a>
        {tagline ? <span class="snypd-tagline">{tagline}</span> : null}
      </div>
      {/* The repo link is last, and marked, because it is the one item in this menu that leaves the site. */}
      <SiteMenu ctx={ctx} route={route} extra={repo ? <li class="snypd-repo"><a href={repo} rel="external">src</a></li> : null} />
    </header>
  );
}
