/**
 * The footer: a band of its own, on the page's grid, that ends on the name (docs/17 §3; the reference's
 * footer is nav, social, offices, legal, then the wordmark set huge). Four rows, in reading order:
 *
 *   1. the site's description — the one line snypd.yaml already has, set in the display face, and the
 *      lists beside it: the `footer` menu (U2), the `social` and `offices` settings (U3), each a column —
 *      on a phone two fit side by side and the third goes under;
 *   2. the name, as the wordmark the page ends on — type, not the logo, even on a site that has one:
 *      the masthead carries the mark, the footer says the name;
 *   3. under a hairline, the `footerNote` (a licence, a colophon) and the `footer-end` slot (P2).
 *
 * Every row is optional but the name. The markup order is the reading order; the stylesheet sets the
 * columns and never reorders (WCAG 1.3.2). The classes `base`'s footer uses — `snypd-social`,
 * `snypd-footer-note` — are kept, so a site's own CSS written against `base` still lands.
 */
import { inline, menu, settingLinks, settingText, Slot, type Html, type PartProps } from "@snypd/render";

export default function Footer({ ctx, route, title, page }: PartProps): Html {
  const items = menu(ctx, "footer", route);
  const offices = settingLinks(ctx, "offices");
  const social = settingLinks(ctx, "social");
  // Markdown, rendered here and not stored as HTML: a value in snypd.yaml is content a person wrote.
  const note = settingText(ctx, "footerNote");
  const lists = items.length + offices.length + social.length > 0;
  return (
    <footer class="snypd-colophon">
      {ctx.site.description || lists ? (
        <div class="snypd-footer-top">
          {ctx.site.description ? <p class="snypd-footer-lede">{ctx.site.description}</p> : null}
          {lists ? (
            <div class="snypd-footer-lists">
              {items.length ? (
                <nav aria-label="Footer">
                  <ul>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
                </nav>
              ) : null}
              {social.length ? (
                <ul class="snypd-social">{social.map((l) => <li><a href={l.url} rel={l.rel ?? "me"}>{l.label}</a></li>)}</ul>
              ) : null}
              {offices.length ? (
                <ul class="snypd-offices">{offices.map((l) => <li><a href={l.url} rel={l.rel}>{l.label}</a></li>)}</ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <p class="snypd-wordmark">{ctx.site.name}</p>
      <div class="snypd-footer-end">
        {note ? <p class="snypd-footer-note">{inline(note)}</p> : null}
        <Slot name="footer-end" ctx={ctx} route={route} title={title} page={page} />
      </div>
    </footer>
  );
}
