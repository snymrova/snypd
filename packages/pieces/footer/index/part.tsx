/**
 * The footer of `footer/index`, drawn (docs/37 §16): the site as a map, in columns. The name and the site's
 * description first; then *Index* — every archive, then the `footer` menu; then a column per taxonomy the
 * site keeps small, its terms by title; then *Elsewhere*, the social links. Under them, on the same
 * lines, the footer note and the `footer-end` slot.
 *
 * Nothing here is written for the footer: the columns come from `ctx.sections`, which the build draws from
 * the site's own types and terms, so a studio that adds a service finds it in the footer on every page.
 * A taxonomy of more than eight terms is left out — that is a tag cloud, not a section of the site.
 */
import { inline, menu, settingLinks, settingText, Slot, termTitle, type Html, type PartProps } from "@snypd/render";

/** More terms than this and a taxonomy is a cloud of tags, not a part of the site a reader goes to. */
const SECTION_TERMS = 8;

export default function Footer({ ctx, route, title, page }: PartProps): Html {
  const sections = ctx.sections ?? { archives: [], taxonomies: [] };
  const here = (r: string) => (r === route ? "page" : undefined);
  const href = (r: string) => (r === "/" ? "/" : `${r}/`);
  // The archives, then whatever the footer menu adds that is not one of them.
  const index = [
    ...sections.archives.map((a) => ({ label: a.title, href: href(a.route), rel: undefined as string | undefined, current: here(a.route) })),
    ...menu(ctx, "footer", route).filter((i) => !sections.archives.some((a) => a.route === i.route))
      .map((i) => ({ label: i.label, href: i.href, rel: i.rel, current: i.current ? ("page" as const) : undefined })),
  ];
  // A term with no page of its own is titled by its slug; `termTitle` sets that in title case, as the list pieces do.
  const groups = sections.taxonomies.filter((t) => t.terms.length > 0 && t.terms.length <= SECTION_TERMS);
  const social = settingLinks(ctx, "social");
  const note = settingText(ctx, "footerNote");
  const column = (heading: string, list: Html) => <section><h2>{heading}</h2>{list}</section>;
  // A site with nothing to map writes no `<nav>` at all, not an empty landmark.
  const columns = [
    ...(index.length ? [column("Index", <ul>{index.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current}>{i.label}</a></li>)}</ul>)] : []),
    ...groups.map((t) => column(t.label, <ul>{t.terms.map((x) => <li><a href={href(x.route)} aria-current={here(x.route)}>{termTitle(x)}</a></li>)}</ul>)),
    ...(social.length ? [column("Elsewhere", <ul class="snypd-social">{social.map((l) => <li><a href={l.url} rel={l.rel ?? "me"}>{l.label}</a></li>)}</ul>)] : []),
  ];
  return (
    <footer class="snypd-footer-index">
      <div class="snypd-footer-index-brand">
        <p class="snypd-footer-index-name"><a href="/" rel="home">{ctx.site.name}</a></p>
        {ctx.site.description ? <p>{ctx.site.description}</p> : null}
      </div>
      {columns.length ? <nav aria-label="Footer" class="snypd-footer-index-map">{columns}</nav> : null}
      <div class="snypd-footer-index-end">
        {note ? <p class="snypd-footer-note">{inline(note)}</p> : null}
        <Slot name="footer-end" ctx={ctx} route={route} title={title} page={page} />
      </div>
    </footer>
  );
}
