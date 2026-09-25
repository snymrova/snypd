/**
 * The header of `masthead/bar`, carved from studio (docs/36 §2). The masthead: the site's name — or its
 * logo (U3) — and the `header` menu (U2), on one line. Sticky; the stylesheet gives it a translucent bar in
 * the scheme of the band it starts on and blurs what passes under it (docs/17 §3; the blend-mode flip was
 * tried and refused by axe — see piece.css). No tagline here — on a banded site the line under the name is
 * the front page's own subtitle, set at display size, not a line in the chrome.
 *
 * No motion control here (`base`'s `parts/motion.tsx`, decision 190): Sunny cut it from this masthead on
 * review — a pill in the chrome for a clip the reader may never notice. The reel and the marquee still
 * stand still under the reader's reduced-motion setting, which `base`'s sheet honours.
 */
import { menu, settingText, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const items = menu(ctx, "header", route);
  const logo = settingText(ctx, "logo");
  const size = logo ? ctx.media[logo] : undefined;
  return (
    <header class="snypd-masthead">
      <a class="snypd-brand" href="/" rel="home">
        {logo
          ? <img class="snypd-logo" src={logo} alt={ctx.site.name} decoding="async"
              width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} />
          : ctx.site.name}
      </a>
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
