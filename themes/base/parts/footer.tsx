/** The site footer: the `footer` menu when the site has one (U2), then the name, then the `footer-end` slot (P2). A child theme overrides this one file to change it. */
import { menu, Slot, type Html, type PartProps } from "@snypd/render";

export default function Footer({ ctx, route, title, page }: PartProps): Html {
  const items = menu(ctx, "footer", route);
  return (
    <footer>
      {items.length ? (
        <nav aria-label="Footer">
          <ul>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
        </nav>
      ) : null}
      <p>{ctx.site.name}</p>
      <Slot name="footer-end" ctx={ctx} route={route} title={title} page={page} />
    </footer>
  );
}
