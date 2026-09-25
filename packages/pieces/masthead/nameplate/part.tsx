/**
 * The header of `masthead/nameplate`, carved from editorial (docs/36 §2): the site's name — or its logo
 * (U3) — and under it a tagline that falls back to the site's description; beside them the `header` menu
 * when the site has one (U2).
 *
 * A part of its own rather than base's header: base shows a tagline only when the site sets one, and a
 * nameplate always carries a line under the name.
 */
import { menu, settingText, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const items = menu(ctx, "header", route);
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
      {items.length ? (
        <nav aria-label="Site">
          {/* The same button and popover `base`'s header carries (U7): on a phone the list waits behind it. */}
          <button type="button" class="snypd-menu-button" popovertarget="snypd-menu">Menu</button>
          <ul id="snypd-menu" popover>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
        </nav>
      ) : null}
    </header>
  );
}
