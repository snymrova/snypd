/**
 * footer/close, carved from folio (docs/25 §2): one line on the dark ground that closes every page — the `footerNote` setting
 * at the left, the `footer` menu in the middle, the `statusNote` setting (this piece's) at the right. Nothing here is
 * computed at build: both notes are the site's own words, so a number in them is the site's claim and
 * the bench page is where it is proven. The classes `base`'s footer uses — `snypd-social`,
 * `snypd-footer-note` — are kept.
 */
import { inline, menu, settingLinks, settingText, Slot, type Html, type PartProps } from "@snypd/render";

export default function Footer({ ctx, route, title, page }: PartProps): Html {
  const items = menu(ctx, "footer", route);
  const social = settingLinks(ctx, "social");
  // Markdown, rendered here and not stored as HTML: a value in snypd.yaml is content a person wrote.
  const note = settingText(ctx, "footerNote");
  const status = settingText(ctx, "statusNote");
  return (
    <footer class="snypd-footer-close">
      <p class="snypd-footer-note">{note ? inline(note) : ctx.site.name}</p>
      {items.length ? (
        <nav aria-label="Footer">
          <ul>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
        </nav>
      ) : null}
      {social.length ? (
        <ul class="snypd-social">{social.map((l) => <li><a href={l.url} rel={l.rel ?? "me"}>{l.label}</a></li>)}</ul>
      ) : null}
      {status ? <p class="snypd-footer-status">{inline(status)}</p> : null}
      <Slot name="footer-end" ctx={ctx} route={route} title={title} page={page} />
    </footer>
  );
}
