import { featureOf, formatDate, nounOf, part, settingFlag, settingText, transitionName, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * A dated entry (W3, docs/37 §7 — carved from folio's `log`, docs/25 §4.2): a reading page with the type's
 * `role: kicker` field above the title, and a status line under it — the date, then every `role: fact`
 * field in the order the type declares them — as one ruled strip on the breakout track. A `role: flag` that
 * is true is a badge beside the kicker. Under the body, the entry after (or before) as one row of the list.
 *
 * Nothing here knows a field by name: folio's `session`, `pr` and `decisions`, or a release's `version` and
 * `breaking`, reach the page through the roles the site's `types:` gives them.
 */
export default function Feature({ ctx, page, adjacent, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries"), Toc = part(ctx, "toc");
  const p = page!;
  const f = featureOf(ctx, p);
  const cells: { term: string; body: Html }[] = [];
  if (p.date && settingFlag(ctx, "showDates", true)) cells.push({ term: "Date", body: <time datetime={p.date}>{formatDate(p.date, settingText(ctx, "dateFormat"))}</time> });
  for (const c of f.facts) cells.push({ term: c.term, body: c.body });
  const next = adjacent?.newer ?? adjacent?.older;
  const noun = nounOf(ctx.config, p.type, 1);
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main>
        <article class="snypd-post snypd-feature">
          {p.cover ?? (
            <header class="snypd-cover">
              <p class="snypd-eyebrow">{f.kicker ?? noun}{f.flags.map((b) => <> <span class="snypd-badge">{b}</span></>)}</p>
              <h1 style={`view-transition-name: ${transitionName(p)}; view-transition-class: snypd-title`}>{p.title}</h1>
              {p.description ? <p class="snypd-subtitle">{p.description}</p> : null}
            </header>
          )}
          {cells.length ? (
            <dl class="snypd-facts" data-count={String(cells.length)}>
              {cells.map((c) => <div><dt>{c.term}</dt><dd>{c.body}</dd></div>)}
            </dl>
          ) : null}
          <Toc ctx={ctx} route={route} title={title} page={p} />
          <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
          {p.body}
          <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
          <footer class="snypd-post-footer">
            <p class="snypd-twin"><a href={p.markdownUrl} type="text/markdown">Markdown twin</a></p>
          </footer>
          {next ? (
            <nav class="snypd-around" aria-labelledby="snypd-next">
              <h2 id="snypd-next">{adjacent?.newer ? `The ${noun} after` : `The ${noun} before`}</h2>
              <Entries ctx={ctx} entries={[next]} />
            </nav>
          ) : null}
        </article>
      </main>
    </Shell>
  );
}
