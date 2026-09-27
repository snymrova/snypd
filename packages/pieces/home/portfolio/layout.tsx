import { nounOf, part, settingFlag, Slot, titleCase, transitionName, type LayoutProps, type Html } from "@snypd/render";

/**
 * The layout of `home/portfolio`, drawn (W4, docs/37 §7): the front page is the work. Above the grid is a
 * line of intro — the page's title and everything before its first `##` — and the page's `::cover` is not
 * drawn: here the work is the picture, and a front page that wants one film over everything is
 * `home/bands`.
 *
 * The grid is the type the build hands the front page (`entries`, decision 195 — the one the header menu
 * names first, *Work* on a studio), newest first, as many as the `homeEntries` setting this piece declares.
 * Each work is its cover, whole — never cropped — inside a frame every work shares, standing on the
 * frame's floor so the pictures of a row stand on one line. The frame is the shape of the grid's typical
 * cover (the median of their proportions, held between 3:4 and 16:9), so a grid of landscape covers fills
 * its frames and a tall one among them stands in its frame with room either side. Under each, a wall
 * label: the title, then the year and the work's first term. A work with no cover is its name, set in the frame in the display face,
 * so a grid that is half pictures still has one rhythm. The way to the archive, and to any other list the
 * site keeps, is one line under the grid; the page's own `##` sections come after it, as an afterword.
 */
type Entry = LayoutProps["entries"][number];

export default function Home({ ctx, page, entries, archive, lists = [], route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell");
  const p = page!;
  const { lead, sections } = p.sections;
  const dates = settingFlag(ctx, "showDates", true);
  // The grid's own archive first, then every other list the site keeps — *Every work · Every note*.
  const archives = [...(archive ? [archive] : []), ...lists.filter((l) => l.route !== archive?.route)];
  const wayTo = (a: { type: string }) => `Every ${nounOf(ctx.config, a.type, 1)}`;
  const coverOf = (e: Entry) => (e.frontmatter.cover as { image?: string } | undefined)?.image;
  const shapes = entries.map((e) => ctx.media[coverOf(e) ?? ""]).filter((m) => m?.width && m.height).map((m) => m!.width / m!.height).sort((a, b) => a - b);
  const frame = shapes.length ? Math.min(16 / 9, Math.max(3 / 4, shapes[Math.floor(shapes.length / 2)]!)) : 1;
  // The label's fact is the work's first term, a bare slug title-cased as `list/ruled` sets it — *Product*, not *product*.
  const termOf = (e: Entry) => { const t = e.terms?.[0]; return t ? (t.title === t.term ? titleCase(t.term) : t.title) : undefined; };
  const label = (e: Entry) => [dates ? e.date?.slice(0, 4) : undefined, termOf(e)].filter(Boolean).join(" · ");
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main class="snypd-home snypd-portfolio">
        <header class="snypd-portfolio-intro">
          <h1>{p.title}</h1>
          {lead}
          <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
        </header>
        {entries.length ? (
          <ol class="snypd-portfolio-works" reversed aria-label={archive?.title} style={`--portfolio-frame: ${Number(frame.toFixed(3))}`}>
            {entries.map((e, i) => {
              const src = coverOf(e);
              const size = src ? ctx.media[src] : undefined;
              const text = label(e);
              return (
                <li class="snypd-portfolio-work">
                  <a href={`${e.route}/`}>
                    {/* Decorative: the label under it is the work's name, so the picture says nothing a reader loses. */}
                    <span class="snypd-portfolio-frame" data-empty={src ? undefined : ""}>
                      {src ? <img src={src} alt="" loading={i < 3 ? undefined : "lazy"} decoding="async"
                        width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} /> : <span aria-hidden="true">{e.title}</span>}
                    </span>
                    <span class="snypd-portfolio-name" style={i < 6 ? `view-transition-name: ${transitionName(e)}; view-transition-class: snypd-title` : undefined}>{e.title}</span>
                    {text ? <span class="snypd-portfolio-label">{text}</span> : null}
                  </a>
                </li>
              );
            })}
          </ol>
        ) : <p>Nothing published yet.</p>}
        {archives.length ? (
          <p class="snypd-portfolio-more">
            {archives.map((a, i) => <>{i ? " · " : ""}<a href={`${a.route}/`}>{wayTo(a)}</a></>)}
          </p>
        ) : null}
        {sections.map((s) => (
          <section class="snypd-portfolio-after" aria-labelledby={s.id}>
            <h2 id={s.id}>{s.title}</h2>
            {s.body}
          </section>
        ))}
        <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
      </main>
    </Shell>
  );
}
