import { menu, part, settingText, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * The layout of `home/split`, carved from folio: the front page as a product page (docs/25 §5). The hero is the page's cover — the one big sentence —
 * and under it the button, which is two theme settings and not a cover attribute (decision 208):
 * `heroLabel` and `heroHref`, drawn when both are set, nothing when either is empty. Then the lead — the
 * two paragraphs, the four lines, the still — which the sheet sets in the right-hand column.
 *
 * Every `##` section is a band, `<section class="snypd-band"><h2>`: the same seam the studio and the
 * console looks stood on, and the sheet puts the heading beside its content. Then every list the build
 * hands the page (`LayoutProps.lists`, decision 200), newest six, in the order the header menu links
 * them — the log, the changelog, the posts — as the entries piece's rows with the way to the archive under
 * them. The last `##` section is drawn after the lists, as the dark close, so the page ends on the ask.
 */
const SHOWN = 6;

export default function Home({ ctx, page, lists = [], route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const p = page!;
  const { lead, sections } = p.sections;
  const label = settingText(ctx, "heroLabel"), href = settingText(ctx, "heroHref");
  const order = menu(ctx, "header", route).map((i) => i.href.replace(/\/$/, ""));
  const rank = (r: string) => { const i = order.indexOf(r); return i < 0 ? order.length : i; };
  // A list with nothing in it is not a band: "Nothing published yet" is an archive's line, not a front page's.
  const bandsOfLists = lists.filter((l) => l.entries.length > 0).sort((a, b) => rank(a.route) - rank(b.route));
  const closing = sections.length > 1 ? sections[sections.length - 1] : undefined;
  const body = closing ? sections.slice(0, -1) : sections;
  const band = (s: typeof sections[number], close = false) => (
    <section class={`snypd-band${close ? " snypd-close" : ""}`} aria-labelledby={s.id}>
      <h2 id={s.id}>{s.title}</h2>
      {s.body}
    </section>
  );
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main class="snypd-home">
        <article class="snypd-page">
          <section class="snypd-band snypd-hero">
            {p.cover ?? <header class="snypd-cover"><h1>{p.title}</h1></header>}
            {label && href ? <p class="snypd-hero-action"><a class="snypd-button" href={href}>{label}</a></p> : null}
            <div class="snypd-lead">
              <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
              {lead}
            </div>
          </section>
          {body.map((s) => band(s))}
        </article>
        <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
        {bandsOfLists.map((l) => (
          <section class="snypd-band snypd-home-list" data-type={l.type} aria-labelledby={`snypd-list-${l.type}`}>
            <h2 id={`snypd-list-${l.type}`}><a href={`${l.route}/`}>{l.title}</a></h2>
            <Entries ctx={ctx} entries={l.entries.slice(0, SHOWN)} />
            <p class="snypd-home-more"><a href={`${l.route}/`}>{l.type === "post" ? "Every post" : `The whole ${l.title.toLowerCase()}`}</a></p>
          </section>
        ))}
        {closing ? <article class="snypd-page">{band(closing, true)}</article> : null}
      </main>
    </Shell>
  );
}
