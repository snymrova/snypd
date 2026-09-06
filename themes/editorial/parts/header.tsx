/**
 * The masthead: the site's name and, under it, its description as a tagline; beside them the `header`
 * menu when the site has one (U2). One file, no layouts — this is the override docs/09 U1 exists to make
 * possible. The menu is `content/nav/header.yaml`; `menu()` resolves it and marks the current page.
 */
import { menu, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const items = menu(ctx, "header", route);
  return (
    <header class="snypd-masthead">
      <div class="snypd-brand">
        <a href="/" rel="home">{ctx.site.name}</a>
        {ctx.site.description ? <p class="snypd-tagline">{ctx.site.description}</p> : null}
      </div>
      {items.length ? (
        <nav aria-label="Site">
          <ul>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
        </nav>
      ) : null}
    </header>
  );
}
