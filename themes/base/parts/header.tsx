/**
 * The site header: the name, linked home, and the `header` menu when the site has one (U2). A child
 * theme overrides this one file to change it; the menu itself is `content/nav/header.yaml`, not markup.
 *
 * The menu is a `popover` with a button that opens it (U7, docs/14 §4.6): on a phone `base`'s sheet
 * hides the list until the button is pressed and the platform does the rest — light dismiss, Escape,
 * focus — and on anything wider the same sheet puts the list back in flow and hides the button, so a
 * theme styles one `<ul>` and never sees the popover unless it wants to. The button is a button and
 * not a link or a label because `popovertarget` is what makes it work without a script. The markup is
 * `SiteMenu`'s, shared with the masthead pieces that draw their own header; a masthead whose
 * `menu-button` switch is off gets a short menu as a sideways row on a phone instead (docs/37 §18).
 *
 * Last in the header, the motion control (`parts/motion.tsx`) — on the pages that need one, and on no other.
 *
 * The masthead classes are the contract's (docs/36 §3·1, decision 273): `.snypd-masthead` on the header,
 * `.snypd-brand` around the name, `.snypd-logo` on the picture that stands in for it, `.snypd-tagline` on
 * the line beside it. Every theme that drew its own masthead wrote these four, so a masthead *piece* can
 * style this one header instead of every theme keeping a file of its own. The logo is the `logo` setting,
 * sized from `ctx.media` — the lookup a `figure` uses — so the header does not reflow while it loads; an
 * off-site logo has no entry and gets no size. The tagline is shown only when the site sets one.
 */
import { part, settingText, SiteMenu, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route, title, page }: PartProps): Html {
  const Motion = part(ctx, "motion");
  const logo = settingText(ctx, "logo");
  const size = logo ? ctx.media[logo] : undefined;
  const tagline = settingText(ctx, "tagline");
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
      <Motion ctx={ctx} route={route} title={title} page={page} />
    </header>
  );
}
