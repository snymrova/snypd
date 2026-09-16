/**
 * The site header: the name, linked home, and the `header` menu when the site has one (U2). A child
 * theme overrides this one file to change it; the menu itself is `content/nav/header.yaml`, not markup.
 *
 * The menu is a `popover` with a button that opens it (U7, docs/14 §4.6): on a phone `base`'s sheet
 * hides the list until the button is pressed and the platform does the rest — light dismiss, Escape,
 * focus — and on anything wider the same sheet puts the list back in flow and hides the button, so a
 * theme styles one `<ul>` and never sees the popover unless it wants to. The button is a button and
 * not a link or a label because `popovertarget` is what makes it work without a script.
 */
import { menu, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const items = menu(ctx, "header", route);
  return (
    <header>
      <a href="/" rel="home">{ctx.site.name}</a>
      {items.length ? (
        <nav aria-label="Site">
          <button type="button" class="snypd-menu-button" popovertarget="snypd-menu">Menu</button>
          <ul id="snypd-menu" popover>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
        </nav>
      ) : null}
    </header>
  );
}
