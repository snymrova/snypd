import { featureOf, formatDate, nounOf, part, settingText, transitionName, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * A case (W3, docs/37 §7 — carved from studio's `work`, S29 · R3): a feature page as three bands, like the
 * front page and unlike a post. The hero on the scheme the `bands` setting starts with — the author's
 * cover, or one from frontmatter, the picture capped at a screen's height — and under it the facts strip on
 * the wide track: every field the type marks `role: fact`, in the order it declares them, then the year.
 * Then the body in the reading column, one scheme, its `##` numbered as the front page's bands are; then the
 * close band on the opposite scheme: the site's one call to action (three settings) and the next item of
 * the type as a card, from the neighbours the build hands every dated item.
 *
 * Nothing here knows a field by name: the kicker above the title is the type's `role: kicker` field (or the
 * cover's own eyebrow), and a type that marks no facts draws no strip.
 */
export default function Feature({ ctx, page, adjacent, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const p = page!;
  const bands = settingText(ctx, "bands") ?? "dark-first";
  const hero = bands === "off" ? undefined : bands === "dark-first" ? "dark" : "light";
  const close = hero === "dark" ? "light" : hero === "light" ? "dark" : undefined;
  const fm = p.frontmatter as { cover?: { image?: string; alt?: string; eyebrow?: string } };
  const size = fm.cover?.image ? ctx.media[fm.cover.image] : undefined;
  const f = featureOf(ctx, p);
  const cells: { term: string; body: Html }[] = f.facts.map((c) => ({ term: c.term, body: c.body }));
  if (p.date) cells.push({ term: "Year", body: <span><time datetime={p.date}>{p.date.slice(0, 4)}</time></span> });
  const next = adjacent?.older ?? adjacent?.newer;
  const ctaTitle = settingText(ctx, "caseCtaTitle");
  const ctaHref = settingText(ctx, "caseCtaHref");
  const ctaLabel = settingText(ctx, "caseCtaLabel") ?? "Get in touch";
  const dateFormat = settingText(ctx, "dateFormat");
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main class="snypd-feature">
        <article class="snypd-page">
          <section class="snypd-band snypd-hero snypd-feature-hero" data-tone={hero}>
            {p.cover ?? (
              <header class="snypd-cover">
                <p class="snypd-eyebrow">{fm.cover?.eyebrow ?? f.kicker ?? nounOf(ctx.config, p.type, 1)}{f.flags.map((b) => <> <span class="snypd-badge">{b}</span></>)}</p>
                <h1 style={`view-transition-name: ${transitionName(p)}; view-transition-class: snypd-title`}>{p.title}</h1>
                {p.description ? <p class="snypd-subtitle">{p.description}</p> : null}
                {fm.cover?.image ? <img src={fm.cover.image} alt={fm.cover.alt ?? ""} decoding="async" fetchpriority="high"
                  width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} /> : null}
              </header>
            )}
            {cells.length ? (
              <dl class="snypd-facts" data-count={String(cells.length)}>
                {cells.map((c) => <div><dt>{c.term}</dt><dd>{c.body}</dd></div>)}
              </dl>
            ) : null}
            <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
          </section>
          <section class="snypd-band snypd-feature-body">
            {p.body}
            <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
          </section>
        </article>
        <section class="snypd-band snypd-feature-close" data-tone={close} aria-labelledby="snypd-next">
          <div class="snypd-feature-end">
            {ctaTitle && ctaHref ? (
              <div class="snypd-cta snypd-feature-cta">
                <p>{ctaTitle}</p>
                <p><a class="snypd-button" href={ctaHref}>{ctaLabel}</a></p>
              </div>
            ) : null}
            {next ? (
              <div class="snypd-feature-next">
                <h2 id="snypd-next">Next</h2>
                <Entries ctx={ctx} entries={[next]} />
              </div>
            ) : <h2 id="snypd-next" hidden>End</h2>}
          </div>
          <p class="snypd-feature-meta">
            {p.author ? <>Led by {p.author.page ? <a href={`${p.author.route}/`} rel="author">{p.author.title}</a> : p.author.title}</> : null}
            {p.author && p.date ? " · " : null}
            {p.date ? <time datetime={p.date}>{formatDate(p.date, dateFormat)}</time> : null}
            {" · "}<a class="snypd-twin-link" href={p.markdownUrl} type="text/markdown">Markdown twin</a>
          </p>
        </section>
      </main>
    </Shell>
  );
}
