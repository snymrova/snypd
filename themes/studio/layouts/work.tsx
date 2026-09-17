import { formatDate, part, settingText, transitionName, Slot, type LayoutProps, type Html, type TermLink } from "@snypd/render";

/**
 * A case (S29 · R3, docs/20 §2.3): the studio's second owned layout, for a type that declares
 * `layout: work`. Three bands, like the front page and unlike a post: the hero on the scheme the `bands`
 * setting starts with — the author's cover, or one from frontmatter, the picture capped at a screen's
 * height — with the facts strip under it on the wide track: *Client · Services · Industry · Year*, every
 * cell a field or a term link; then the body in the reading column, one scheme, its `##` numbered as the
 * front page's bands are; then the close band on the opposite scheme: the studio's one call to action
 * (two settings) and the next case as a card, drawn from the neighbours the build hands every dated item.
 *
 * Nothing here is Ferrule's: `client` and `year` are read by name because docs/20 §2.1 declares them,
 * and a `work` that lacks them shows the cells it has. The terms are grouped by taxonomy, so the strip
 * has one cell per taxonomy the type declares and a second type with other taxonomies draws its own.
 */
export default function Work({ ctx, page, adjacent, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const p = page!;
  const bands = settingText(ctx, "bands") ?? "dark-first";
  const hero = bands === "off" ? undefined : bands === "dark-first" ? "dark" : "light";
  const close = hero === "dark" ? "light" : hero === "light" ? "dark" : undefined;
  const fm = p.frontmatter as { cover?: { image?: string; alt?: string; eyebrow?: string }; client?: unknown; year?: unknown };
  const size = fm.cover?.image ? ctx.media[fm.cover.image] : undefined;
  const client = typeof fm.client === "string" ? fm.client : undefined;
  const year = fm.year !== undefined && fm.year !== null ? String(fm.year) : p.date?.slice(0, 4);
  const byTaxonomy = new Map<string, TermLink[]>();
  for (const t of p.terms) (byTaxonomy.get(t.taxonomy) ?? byTaxonomy.set(t.taxonomy, []).get(t.taxonomy)!).push(t);
  const label = (taxonomy: string) => (ctx.config.taxonomies as Record<string, { hierarchical?: boolean }>)[taxonomy]?.hierarchical ? plural(taxonomy) : taxonomy;
  const cells: { term: string; body: Html }[] = [];
  if (client) cells.push({ term: "Client", body: <span>{client}</span> });
  for (const [taxonomy, terms] of byTaxonomy) cells.push({ term: titleCase(label(taxonomy)), body: <span>{terms.map((t, i) => <>{i ? ", " : ""}<a href={`${t.route}/`} rel="tag">{t.title}</a></>)}</span> });
  if (year) cells.push({ term: "Year", body: <span>{p.date ? <time datetime={p.date}>{year}</time> : year}</span> });
  const next = adjacent?.older ?? adjacent?.newer;
  const ctaTitle = settingText(ctx, "caseCtaTitle");
  const ctaHref = settingText(ctx, "caseCtaHref");
  const ctaLabel = settingText(ctx, "caseCtaLabel") ?? "Talk to the studio";
  const dateFormat = settingText(ctx, "dateFormat");
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main class="snypd-work">
        <article class="snypd-page">
          <section class="snypd-band snypd-hero snypd-work-hero" data-tone={hero}>
            {p.cover ?? (
              <header class="snypd-cover">
                <p class="snypd-eyebrow">{fm.cover?.eyebrow ?? client ?? p.type}</p>
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
          <section class="snypd-band snypd-work-body">
            {p.body}
            <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
          </section>
        </article>
        <section class="snypd-band snypd-work-close" data-tone={close} aria-labelledby="snypd-next">
          <div class="snypd-work-end">
            {ctaTitle && ctaHref ? (
              <div class="snypd-cta snypd-work-cta">
                <p>{ctaTitle}</p>
                <p><a class="snypd-button" href={ctaHref}>{ctaLabel}</a></p>
              </div>
            ) : null}
            {next ? (
              <div class="snypd-work-next">
                <h2 id="snypd-next">Next</h2>
                <Entries ctx={ctx} entries={[next]} />
              </div>
            ) : <h2 id="snypd-next" hidden>End</h2>}
          </div>
          <p class="snypd-work-meta">
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

const titleCase = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const plural = (s: string) => (/[^aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(s) ? `${s}es` : `${s}s`);
