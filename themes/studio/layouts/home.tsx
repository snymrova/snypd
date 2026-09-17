import { part, settingText, Slot, type LayoutProps, type Html } from "@snypd/render";

/**
 * The front page as bands (S29, docs/17 §3): the page's cover and everything before its first `##` is
 * the hero, then every `##` section is one full-bleed band, then the newest posts are the last. The
 * bands alternate — dark, light, dark — by `data-tone`, which the stylesheet turns into one declaration
 * per band (`color-scheme`) over the same tokens the rest of the page uses; the `bands` setting picks
 * which scheme the hero takes, or turns the alternation off and leaves every band in the reader's.
 *
 * `page.sections` is `page.body` split at its headings by the renderer, not by this file (theme.ts):
 * the heading ids are the ones the renderer issued, so a link into a band still lands. The other five
 * layouts are `base`'s and render `body` whole — a post on this theme is a reading page, not a stack of
 * bands. `title` is the site's name (the build sets it for `/`); the page's own title is the headline.
 */
export default function Home({ ctx, page, entries, route, title, description, jsonLd }: LayoutProps): Html {
  const Shell = part(ctx, "shell"), Entries = part(ctx, "entries");
  const p = page!;
  const bands = settingText(ctx, "bands") ?? "dark-first";
  const tone = (i: number): string | undefined => bands === "off" ? undefined : (i % 2 === 0) === (bands === "dark-first") ? "dark" : "light";
  const { lead, sections } = p.sections;
  return (
    <Shell ctx={ctx} title={title} description={description} markdownUrl={p.markdownUrl} route={route} jsonLd={jsonLd} page={p}>
      <main class="snypd-home">
        <article class="snypd-page">
          <section class="snypd-band snypd-hero" data-tone={tone(0)}>
            {p.cover ?? <h1>{p.title}</h1>}
            <Slot name="before-content" ctx={ctx} route={route} title={title} page={p} />
            {lead}
          </section>
          {sections.map((s, i) => (
            <section class="snypd-band" data-tone={tone(i + 1)} aria-labelledby={s.id}>
              <h2 id={s.id}>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
        <section class="snypd-band snypd-home-entries" data-tone={tone(sections.length + 1)} aria-labelledby="snypd-latest">
          <Slot name="after-content" ctx={ctx} route={route} title={title} page={p} />
          <h2 id="snypd-latest"><a href="/posts/">Latest posts</a></h2>
          <Entries ctx={ctx} entries={entries} />
        </section>
      </main>
    </Shell>
  );
}
