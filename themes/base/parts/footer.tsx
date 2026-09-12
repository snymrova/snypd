/** The site footer: the `footer` menu when the site has one (U2), the theme's footer note and social links when it offers them (U3), then the name, then the `footer-end` slot (P2). A child theme overrides this one file to change it. */
import { inline, menu, settingLinks, settingText, Slot, type Html, type PartProps } from "@snypd/render";

export default function Footer({ ctx, route, title, page }: PartProps): Html {
  const items = menu(ctx, "footer", route);
  // `footerNote` is a richtext setting, which is markdown — rendered here rather than stored as HTML,
  // because a value in snypd.yaml is content a person wrote and not markup the theme trusts.
  const note = settingText(ctx, "footerNote");
  const social = settingLinks(ctx, "social");
  return (
    <footer>
      {items.length ? (
        <nav aria-label="Footer">
          <ul>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
        </nav>
      ) : null}
      {social.length ? (
        <ul class="snypd-social">{social.map((l) => <li><a href={l.url} rel={l.rel ?? "me"}>{l.label}</a></li>)}</ul>
      ) : null}
      {note ? <p class="snypd-footer-note">{inline(note)}</p> : null}
      <p>{ctx.site.name}</p>
      <Slot name="footer-end" ctx={ctx} route={route} title={title} page={page} />
    </footer>
  );
}
