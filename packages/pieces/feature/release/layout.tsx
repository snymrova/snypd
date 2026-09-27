import { featureOf, formatDate, nounOf, part, settingFlag, settingText, transitionName, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * A release (W3, docs/37 §7 — carved from folio's `release`, docs/25 §4.2): a reading page with the type's
 * `role: kicker` field above the title (a version, written through its `show:`), a true `role: flag` as a
 * badge beside it, and one byline under the title — the date, then every `role: fact` field's value, run
 * together with no terms. Under the body, the entries either side of it, as the list's rows.
 */
export default function Feature({ ctx, page, adjacent, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries"), Toc = part(ctx, "toc");
  const p = page!;
  const f = featureOf(ctx, p);
  const date = p.date && settingFlag(ctx, "showDates", true) ? <time datetime={p.date}>{formatDate(p.date, settingText(ctx, "dateFormat"))}</time> : null;
  const around = [adjacent?.newer, adjacent?.older].filter((e): e is NonNullable<typeof e> => !!e);
  const noun = nounOf(ctx.config, p.type, 1);
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main>
        <article class="snypd-post snypd-feature">
          {p.cover ?? (
            <header class="snypd-cover">
              <p class="snypd-eyebrow">{f.kicker !== undefined ? <span>{f.kicker}</span> : noun}{f.flags.map((b) => <> <span class="snypd-badge">{b}</span></>)}</p>
              <h1 style={`view-transition-name: ${transitionName(p)}; view-transition-class: snypd-title`}>{p.title}</h1>
              {p.description ? <p class="snypd-subtitle">{p.description}</p> : null}
            </header>
          )}
          <p class="snypd-byline">
            {date}
            {f.facts.map((c, i) => <>{date || i ? " · " : ""}{c.body}</>)}
          </p>
          <Toc ctx={ctx} route={route} title={title} page={p} />
          <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
          {p.body}
          <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
          <footer class="snypd-post-footer">
            <p class="snypd-twin"><a href={p.markdownUrl} type="text/markdown">Markdown twin</a></p>
          </footer>
          {around.length ? (
            <nav class="snypd-around" aria-labelledby="snypd-around">
              <h2 id="snypd-around">Other {nounOf(ctx.config, p.type, 2)}</h2>
              <Entries ctx={ctx} entries={around} />
            </nav>
          ) : null}
        </article>
      </main>
    </Shell>
  );
}
