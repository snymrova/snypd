/**
 * The site header: the name, linked home, and the `header` menu when the site has one (U2). A child
 * theme overrides this one file to change it; the menu itself is `content/nav/header.yaml`, not markup.
 */
import { menu, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const items = menu(ctx, "header", route);
  return (
    <header>
      <a href="/" rel="home">{ctx.site.name}</a>
      {items.length ? (
        <nav aria-label="Site">
          <ul>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
        </nav>
      ) : null}
    </header>
  );
}
