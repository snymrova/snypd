/**
 * `snypd build` (docs/04 "The renderer"): content → typed tree → theme TSX → dist/, incrementally.
 * Every route has a key = hash(content) + hash(theme graph) + hash(config subset) (+ the list it renders,
 * for index/term pages). Keys live in the SQLite index; a route whose key is unchanged and whose outputs
 * exist is skipped outright — not copied, not re-rendered. A cold build differs from a warm one only by
 * cache misses: same code path, no special case.
 * Output per content route: `index.html`, the `.md` twin (the source file, byte for byte) and its JSON
 * (`/api/<type>/<slug>.json`). Site artefacts (S7, emit.ts) — `llms.txt`, `feed.xml`, `sitemap.xml`,
 * `robots.txt`, `/api/site.json`, `/api/<type>.json`, `/api/<taxonomy>.json`, `assets/theme.css` — are
 * plan items too, keyed on the entry list (or the theme + tokens), so an unchanged site rewrites nothing.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { formatDiagnostics, loadConfig, MdastCache, settingValues, SiteIndex, sha1, RACY_MS, readFrontmatter, redirects, siteNav, routeLookup, termRoutes, listContent, pluginDirs, buildTree, builtBranch, DRAFTS_BRANCH, type LoadedConfig, type IndexedFile, type Block } from "@snypd/core";
import type { Root, Node } from "mdast";
import { toHtml, excerpt, type Sectioned } from "./html";
import { loadTheme, themeHash, type Theme, type SiteCtx, type Entry, type AuthorLink, type TermLink, type PrimitiveProps, type PageHeading } from "./theme";
import { Html } from "./jsx-runtime";
import { resolveTokens, styleSheet, minifyCss } from "./tokens";
import { readImageSize } from "./media";
import { loadHooks, applyFilter, applyTransforms, runEmits, type Hooks, type HookDiagnostic, type HookRun } from "./hooks";
import { assertClientBudget } from "./budget";
import { absolute, plural, titleCase, llmsTxt, rss, sitemap, robotsTxt, apiSite, apiType, apiTaxonomy, apiItem, pageSchema, blockSchemas, jsonLd, redirectsFile, redirectPage, type Redirect, type SurfaceEntry, type SurfaceSite } from "./emit";

export interface BuildOptions {
  out?: string; cfg?: LoadedConfig; index?: SiteIndex; cache?: MdastCache;
  /**
   * Render drafts too (everything but trashed). `snypd dev` builds this way, `snypd build --drafts` does,
   * and — S19d — so does a plain `snypd build` when the branch it is building *is* the drafts branch
   * (`builtBranch`: the host's environment first, then the checkout). Left unset, that is the rule; set
   * either way, the caller has decided.
   */
  drafts?: boolean;
  /**
   * This output is a *preview* that leaves the machine with drafts in it (S19d, decision 167): every page
   * is `noindex` and `robots.txt` disallows the site. On by default exactly when `drafts` was decided by
   * the branch; `snypd build --drafts` sets it; `snypd dev` does not — its pages are byte-identical to
   * `dist/`'s by decision 51, and a preview served from this machine is nothing a crawler reaches.
   */
  preview?: boolean;
  /** The plugins' hooks, already resolved — `snypd dev` bundles them; a one-shot build resolves its own. */
  hooks?: Hooks;
}
export interface BuildResult {
  routes: number; artefacts: number; media: number; rendered: number; cached: number; removed: number; ms: number;
  /** Routes an earlier build began writing and never finished (H3): re-rendered by this one, whatever their key says. */
  recovered: number;
  /** Files plugins' `emit` stages asked for and core wrote (P3) — counted in `artefacts` too. */
  emitted: number;
  phases: { config: number; theme: number; sync: number; plan: number; render: number };
  /**
   * Where `phases.render` went (F1, docs/11 §4). The five are disjoint and sum to the render phase less
   * the loop's own overhead: `parse` is the mdast cache — micromark on a miss, `JSON.parse` + the typed
   * tree on a store hit; `html` is everything else inside a plan item's thunk — the theme's TSX, `toHtml`,
   * the schemas; `write` is the files; `weigh` is H2's pass over the pages written; `index` is the three
   * transactions and the mdast prune; `stat` is the `todo` filter's existence checks. The split is what
   * decision 124 asked for before anyone reached for a worker pool: only `parse` and `html` are CPU a
   * second core could take, and the report says how much of a cold build that is at each size.
   */
  profile: { stat: number; parse: number; html: number; write: number; weigh: number; index: number };
  /** Drafts were rendered (see `BuildOptions.drafts`). */
  drafts: boolean;
  /** The output marked itself a preview — `noindex`, `Disallow: /` (see `BuildOptions.preview`). */
  preview: boolean;
  /** The branch this build was for and who said so, when the build had to find out (S19d); absent when the caller decided. */
  branch?: { name?: string; from: string };
  theme: { name: string; coverage: Theme["coverage"] };
  /** The plugins that decorated this build and what went wrong inside a hook (P2): a line each in `snypd build`, never a failed build. `record` is present only when the caller asked for one (P4, `content.explain`). */
  hooks: { plugins: string[]; diagnostics: HookDiagnostic[]; record?: HookRun[] };
}

/**
 * One unit of output: a route (html + twin + json), a site artefact (one file), or a media file copied
 * verbatim. `outputs` are dist-relative. A copy declares its source instead of its content, so a 2 MB
 * photograph never becomes a JavaScript string on the way to disk.
 */
type Output = string | Uint8Array | { copyFrom: string };
interface Planned { route: string; key: string; outputs: string[]; kind: "route" | "artefact" | "media"; render: () => Record<string, Output> }

/** Bump when the set or shape of files a route produces changes; a stale index is then reset, not pruned. */
const OUTPUT_FORMAT = "s8";   // s8: H2 — every page is weighed against the client budget before it is written, so an index written before the gate existed describes pages nothing has weighed

/**
 * The key a route row carries while its outputs are being written (H3, docs/11 finding 8). No planned key
 * can equal it, so a build that dies between writing a page and recording what it wrote leaves a row the
 * next build re-renders — rather than the previous key, which described bytes that were no longer on disk.
 */
const OPEN = "open:";

const routeDir = (route: string) => (route === "/" ? "" : route.replace(/^\//, ""));

export async function build(root: string, opts: BuildOptions = {}): Promise<BuildResult> {
  const t0 = performance.now();
  const out = opts.out ?? join(root, "dist");
  const cfg = opts.cfg ?? loadConfig(root);
  // A config that does not load is not a site to build. Before S18a this fell through and produced a
  // `dist/` from spec defaults and the base theme — a directory with no `snypd.yaml` built one route and
  // reported success, so `snypd build` in the wrong folder looked exactly like `snypd build` in the right
  // one. An installer, a CI job and a host's build command all read the exit code and nothing else.
  if (!cfg.ok) {
    const e = new Error(`cannot build ${root}: its configuration does not load`) as Error & { hint?: string };
    e.hint = formatDiagnostics(cfg.diagnostics);
    throw e;
  }
  const t1 = performance.now();
  const theme = await loadTheme(cfg);
  // The plugins' slots and filters (P2, hooks.ts): resolved once per build, free when no plugin declares
  // one. The diagnostics array is per build — what a hook did wrong on *this* run, carried out in the result.
  const hooks = opts.hooks ?? await loadHooks(cfg);
  hooks.diagnostics.length = 0;
  const t2 = performance.now();
  const index = opts.index ?? await SiteIndex.open(root);
  const sync = index.sync(cfg);
  const t3 = performance.now();
  const cache = opts.cache ?? new MdastCache(index.mdastStore());
  // The profile's accumulators. The cache is wrapped rather than timed inside `renderDoc`, so the number
  // is the build's and the preview's synthetic route pays nothing for it.
  const profile = { stat: 0, parse: 0, html: 0, write: 0, weigh: 0, index: 0 };
  const timed = (k: keyof typeof profile, fn: () => void) => { const t = performance.now(); fn(); profile[k] += performance.now() - t; };
  const parsed: Pick<MdastCache, "get"> = { get: (source) => { const t = performance.now(); try { return cache.get(source); } finally { profile.parse += performance.now() - t; } } };
  const c = cfg.config;
  // S19d: a host that builds every branch runs this same command on `snypd/drafts`, and until now got a
  // site without the drafts in it — a public URL for a preview of nothing. One git call, paid only when
  // nobody said and no host's environment names the branch; `snypd dev` and the bench both say.
  const branch = opts.drafts === undefined ? builtBranch(root) : undefined;
  const drafts = opts.drafts ?? branch?.name === DRAFTS_BRANCH;
  const preview = opts.preview ?? (branch !== undefined && drafts);
  const site = { name: c.site.name, url: c.site.url.replace(/\/$/, ""), description: c.site.description, icon: c.site.icon as string | undefined, image: c.site.image as string | undefined };
  const tokens = resolveTokens(c.theme.tokens as Parameters<typeof resolveTokens>[0]);
  // The theme's settings, resolved once (U3): the site's answers over the declared defaults. Empty for a
  // theme that declares none, and then every part renders exactly what it rendered before U3.
  const settings = settingValues(cfg);
  // The *source* sheet: what the artefact is keyed on, and what `minifyCss` runs over — but only inside
  // the artefact's thunk, so a no-op build does not pay ~3 ms to re-minify a sheet it is not writing.
  const css = styleSheet(tokens, theme.css, theme.font?.css);
  // media: `content/media/**` → `dist/media/**`, byte for byte (docs/02 "content/media/"). This is the
  // minimum that makes `figure` — a spec primitive with a required `src` — usable end to end; the manifest,
  // the derivatives and the licence lint that docs/02 describes are v0.2, and nothing here presumes them.
  // Scanned *before* the route keys are built, because the intrinsic sizes go into the markup: a replaced
  // image with new dimensions has to re-render the pages that place it, exactly as a theme edit does.
  const mediaDir = join(root, "content", "media");
  const walk = (dir: string, rel = ""): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name.startsWith(".") ? [] : e.isDirectory() ? walk(join(dir, e.name), join(rel, e.name)) : [join(rel, e.name)]);
  const mediaSizes: SiteCtx["media"] = {};
  const mediaFiles: Array<{ rel: string; src: string; url: string; key: string }> = [];
  if (existsSync(mediaDir)) for (const rel of walk(mediaDir)) {
    const src = join(mediaDir, rel);
    const st = statSync(src);
    const url = `/media/${rel.split(sep).join("/")}`;
    const size = await readImageSize(src);
    if (size) mediaSizes[url] = size;
    // Keyed on size + mtime rather than a content hash: hashing every image on every build would cost more
    // than the copy it is trying to avoid, and a touched file recopying is the same trade `build.noop` makes.
    // Except a file written inside the window the index distrusts (RACY_MS before this sync began): its
    // stat vouches for nothing, so it is copied again — not hashed, copied, which is cheaper than a hash
    // and is only ever paid for the file being replaced right now. Decision 150 left this to H4's
    // property, and the property found it: a same-size replacement in the same tick left `dist/` serving
    // the old image for as long as nothing else touched it (decision 158).
    const racy = st.mtimeMs >= sync.at - RACY_MS;
    mediaFiles.push({ rel, src, url, key: sha1(`${OUTPUT_FORMAT}:media:${rel}:${st.size}:${st.mtimeMs}${racy ? `:racy:${sync.at}` : ""}`) });
  }
  const isPublic = (f: IndexedFile) => c.statuses[f.status]?.public === true;
  const visible = (f: IndexedFile) => (drafts ? f.status !== "trashed" : isPublic(f));
  const newest = (a: IndexedFile, b: IndexedFile) => (b.date ?? "").localeCompare(a.date ?? "") || a.route.localeCompare(b.route);
  const rawEntry = (f: IndexedFile): Entry => ({ route: f.route, type: f.type, slug: f.slug, title: f.title, date: f.date, updated: f.updated, status: f.status, description: typeof f.frontmatter.description === "string" ? f.frontmatter.description : undefined, frontmatter: f.frontmatter });
  const fctx = (route: string, entry?: Entry) => ({ route, entry, site, config: c });
  // The `route` filter (P2) runs first and on the file, so every later reading of an item's route — its
  // output directory, the lists that link it, the surface, the menus — is the filtered one. The index
  // keeps the unfiltered route; a filter is a view, and a plugin removed puts the route back.
  const rerouted = new Map<string, string>();   // index route → filtered route, for the menus and the key
  const reroute = (f: IndexedFile): IndexedFile => {
    if (hooks.empty) return f;
    const r = applyFilter(hooks, "route", f.route, fctx(f.route, rawEntry(f)));
    if (r === f.route) return f;
    rerouted.set(f.route, r);
    return { ...f, route: r };
  };
  const published = sync.files.filter(visible).sort(newest).map(reroute);
  // The menus (U2): resolved here, once, against the content the index just synced — so a slug change
  // moves the item, and the hash of the *resolved* menus is in every route key, so it also re-renders
  // every page that shows it. A `ref` that resolves to nothing is left out; lint rule 5 names it.
  // A `ref` to a rerouted item follows the filter, because the menu must point where the page is.
  const nav = siteNav(root, cfg, routeLookup(root, cfg, listContent(root, cfg), termRoutes(cfg, sync.files), index.moves()));
  if (rerouted.size) for (const links of Object.values(nav.nav)) for (const l of links) if (l.route && rerouted.has(l.route)) { const r = rerouted.get(l.route)!; l.href = r === "/" ? "/" : `${r}/`; l.route = r; }
  const ctx: SiteCtx = { site, tokens, theme: { name: theme.name }, assets: { css: css ? "/assets/theme.css" : undefined, feed: "/feed.xml", llms: "/llms.txt", api: "/api/site.json", font: theme.font?.url }, config: c, media: mediaSizes, parts: theme.parts, nav: nav.nav, hooks, settings, preview };
  // The plugin graph (P1, decision 95): every loaded plugin's bytes, hashed the way the theme chain is,
  // and the site's options beside them in the config hash — a transform that changes output must
  // invalidate the cache, and P3's transforms are plugin files. Both are absent from the key when no
  // plugin is enabled, so a site with none keeps the keys it had.
  const pluginHash = pluginDirs(cfg.plugins).length ? `:${themeHash(pluginDirs(cfg.plugins))}` : "";
  const configHash = sha1(JSON.stringify({ site: c.site, theme: { use: c.theme.use, tokens, ...(Object.keys(settings).length ? { settings } : {}) }, types: c.types, taxonomies: c.taxonomies, statuses: c.statuses, ...(c.plugins.length ? { plugins: c.plugins } : {}) }));
  // H2: a script in `content/media/` is weighed through the page that loads it, and a cached page is not
  // re-weighed — so the size of every media file a browser would run is in every key, and a script that
  // grows re-renders the pages that could be loading it. Extension, not content-type: nothing here serves
  // headers, and a `.txt` a page loads as script is the one shape this does not see (`page.js.kb` does).
  const mediaScripts = mediaFiles.filter((m) => /\.(?:m?js|cjs)$/i.test(m.rel)).map((m) => [m.rel, statSync(m.src).size]);
  const mediaHash = sha1(JSON.stringify(mediaScripts.length ? [mediaSizes, mediaScripts] : mediaSizes));
  /**
   * The client budget (H2, gate E6). One number, three readers: `loadPlugin` checks a plugin's
   * declaration against it (P2), `page.js.kb` measures what the browser fetched (S13), and from here
   * the build weighs what it is about to write. It is in the key because lowering it has to re-render
   * every page — a budget a cached page was never held to is not a budget.
   */
  const jsBudgetKb = ((b) => (typeof b === "number" ? b : 0))(c.bench?.budgets?.jsKb);
  let base = `${OUTPUT_FORMAT}:${theme.hash}${pluginHash}:${configHash}:${mediaHash}:${nav.hash}${rerouted.size ? `:${sha1(JSON.stringify([...rerouted]))}` : ""}${drafts ? ":drafts" : ""}${preview ? ":preview" : ""}:js${jsBudgetKb}`;   // a draft build's outputs are not dist's, and a preview's are not a dev build's; the key says so
  // An index written by an older renderer describes outputs we no longer produce (S6 kept them route-relative):
  // forget its routes rather than trust or prune them. The index is disposable (docs/07 decision 13).
  if (index.meta("output.format") !== OUTPUT_FORMAT) { index.clearRoutes(); index.setMeta("output.format", OUTPUT_FORMAT); }
  const url = (route: string) => absolute(site.url, route);

  // ── plan ────────────────────────────────────────────────────────────────────
  // `title` and `description` are filtered here (P2), on the entry, so a page, the lists that show it,
  // the feed and the JSON all agree on what the item is called — one value, filtered once, read everywhere.
  const entryOf = (f: IndexedFile): Entry => {
    const e = rawEntry(f);
    if (hooks.empty) return e;
    const ctx = fctx(f.route, e);
    return { ...e, title: applyFilter(hooks, "title", e.title, ctx), description: applyFilter(hooks, "description", e.description, ctx) };
  };
  const listKey = (es: Entry[]) => sha1(es.map((e) => [e.route, e.title, e.date ?? "", e.description ?? ""].join("|")).join("\n"));
  const termFiles = new Map<string, Record<string, unknown>>();
  const termMeta = (taxonomy: string, term: string): TermLink => {
    const k = `${taxonomy}/${term}`;
    let fm = termFiles.get(k);
    if (!fm) { const f = join(root, "content", "taxonomies", taxonomy, `${term}.md`); fm = existsSync(f) ? readFrontmatter(readFileSync(f, "utf8")) : {}; termFiles.set(k, fm); }
    const pattern = c.taxonomies[taxonomy]?.urlPattern ?? `/${taxonomy}/{term}`;
    return { taxonomy, term, title: typeof fm.title === "string" ? fm.title : term, route: pattern.replace("{term}", term), description: typeof fm.description === "string" ? fm.description : undefined };
  };
  const termsOf = (f: IndexedFile): TermLink[] => {
    const type = c.types[f.type]!; const links: TermLink[] = [];
    for (const tax of type.taxonomies) {
      const field = Object.entries(type.fields as Record<string, { type: string; to?: string; of?: { to?: string } }>).find(([, s]) => (s.type === "ref" && s.to === tax) || (s.type === "list" && s.of?.to === tax))?.[0];
      const v = field ? f.frontmatter[field] : undefined;
      for (const t of Array.isArray(v) ? v : v !== undefined && v !== null ? [v] : []) links.push(termMeta(tax, String(t)));
    }
    return links;
  };
  // The front page (S25, docs/16 §2): the page that holds `/` renders with the theme's `home` layout — the
  // page layout's body with the latest posts under it — when the theme has one, and as a plain page when
  // it does not. An explicit `layout:` in the frontmatter still wins, as it does for every other item.
  const layoutOf = (f: IndexedFile): string | null => { const fm = f.frontmatter.layout; if (typeof fm === "string") return fm; if (f.route === "/" && f.frontmatter.home === true && theme.layouts.home) return "home"; return c.types[f.type]?.layout ?? null; };
  // `page` is whether the author's route is built: a type with no layout emits nothing, and a byline
  // that linked there anyway was the dead link S19b found on a default site (docs/07 §5, finding 1).
  const authorOf = (f: IndexedFile): AuthorLink | undefined => { const a = f.frontmatter.author; if (typeof a !== "string") return undefined; const af = sync.files.find((x) => x.type === "author" && x.slug === a); return af ? { ...entryOf(af), page: layoutOf(af) !== null } : undefined; };
  const surfaceOf = (f: IndexedFile, terms: TermLink[], author: AuthorLink | undefined): SurfaceEntry => {
    const e = entryOf(f);
    return { type: e.type, slug: e.slug, route: e.route, url: url(e.route), title: e.title, date: e.date, updated: e.updated, status: e.status, description: e.description,
      terms: terms.map((t) => ({ taxonomy: t.taxonomy, term: t.term, title: t.title, route: t.route, url: url(t.route) })),
      author: author ? { name: author.title, ...(author.page ? { route: author.route, url: url(author.route) } : {}) } : undefined,
      markdown: `${url(e.route)}index.md`, json: `${site.url}/api/${e.type}/${e.slug}.json` };
  };

  // Every used term of every taxonomy, once, before any page is planned (P3): the term pages need the
  // grouping below, and a `transform` stage is handed the list — `autolink` links a mention to its
  // archive — so the list is in every route key while a transform is on. A term added in one post then
  // re-renders the others, which is the incremental cache being right rather than fast.
  const byTerm = new Map<string, { link: TermLink; files: IndexedFile[] }>();
  for (const f of published) for (const t of termsOf(f)) { const k = `${t.taxonomy} ${t.term}`; (byTerm.get(k) ?? byTerm.set(k, { link: t, files: [] }).get(k)!).files.push(f); }
  const allTerms: TermLink[] = [...byTerm.values()].map((x) => x.link).sort((a, b) => a.taxonomy.localeCompare(b.taxonomy) || a.term.localeCompare(b.term));
  if (hooks.transforms.length) base += `:transform:${sha1(JSON.stringify(allTerms))}`;
  const renderBody = (source: string, page: Entry) => renderDoc(source, { theme, ctx, page, cache: parsed, transform: hooks.transforms.length ? (root, blocks) => applyTransforms(hooks, root, { route: page.route, entry: page, blocks, terms: allTerms, site, config: c }) : undefined });

  /**
   * The index and the feed list a type when it *has* a `date` field — a question the spec answers, not a
   * list of type names (S14). Both are newest-first and the feed needs a `pubDate`, so a type with no date
   * belongs in neither: `page` never had one, and once the theme fixture gave `author` a layout, an author
   * turned up in the site index and shipped in the RSS feed as a dateless item. `type !== "page"` was one
   * exception standing in for the rule, and it only covered the type someone had already noticed.
   */
  const dated = (t: string) => Boolean(c.types[t]?.fields?.date);
  const listed = published.filter((f) => layoutOf(f) && dated(f.type));
  const listEntries = listed.map(entryOf);
  /** What the front page lists under its body (S25): the newest few, and the `home` layout links the rest at `/posts/`. */
  const HOME_ENTRIES = 6;
  const webSite = () => ({ "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: `${site.url}/`, description: site.description });

  const plan: Planned[] = [];
  const contentRoutes = new Set<string>();
  const surface: SurfaceEntry[] = [];
  const lastmod = new Map<string, string | undefined>();
  for (const f of published) {
    const layout = layoutOf(f);
    if (!layout) continue;
    if (!theme.layouts[layout]) throw new Error(`theme ${theme.name} has no layout "${layout}" (needed by ${f.path})`);
    const terms = termsOf(f);
    const author = authorOf(f);
    const s = surfaceOf(f, terms, author);
    surface.push(s);
    lastmod.set(f.route, f.updated ?? f.date);
    // An author page is a list as much as a page (H1): what it shows is every published post by that
    // author, so those entries are in its key the way the index's are in the index's. Found by H4's first
    // property on its first run — trashing a post left its author's page listing it until the author's
    // own file changed, which is the stale page a cold build would never have written (decision 154).
    const byAuthor = layout === "author" ? published.filter((x) => x.frontmatter.author === f.slug && x.type !== "author").map(entryOf) : [];
    // The front page lists the latest posts under its body (S25), so the list is in its key as it is in the index's.
    const home = layout === "home";
    const listing = home ? listEntries.slice(0, HOME_ENTRIES) : byAuthor;
    const key = sha1(`${base}:${f.hash}:${JSON.stringify(terms)}:${author ? `${author.title}${author.page ? author.route : ""}` : ""}${layout === "author" || home ? `:${listKey(listing)}` : ""}`);
    contentRoutes.add(f.route);
    const dir = routeDir(f.route);
    plan.push({ route: f.route, key, kind: "route", outputs: [join(dir, "index.html"), join(dir, "index.md"), `api/${f.type}/${f.slug}.json`], render: () => {
      const source = readFileSync(join(root, f.path), "utf8");
      const entry = entryOf(f);
      const { body, cover, root: mdast, blocks, headings, sections } = renderBody(source, entry);
      const derived = blockSchemas(blocks);
      const fc = fctx(f.route, entry);
      const description = entry.description ?? applyFilter(hooks, "excerpt", excerpt(mdast), fc);
      // The front page keeps the `WebSite` schema `/` always had (S25), and its document title is the site's
      // name — the page's own title is its heading. Everything else about it is a page's.
      const schemas = applyFilter(hooks, "jsonLd", [home ? webSite() : pageSchema(s, entry.description ?? derived.description ?? description, ctx), ...derived.schemas], fc);
      const page = { ...entry, description, body, cover, terms, layout, markdownUrl: `${f.route === "/" ? "" : f.route}/index.md`, author, headings, sections };
      const entries = layout === "author" || home ? applyFilter(hooks, "entries", listing, fc) : [];
      const html = theme.layouts[layout]!({ ctx, kind: layout, route: f.route, title: home ? site.name : page.title, description: page.description, page, entries, jsonLd: jsonLd(schemas) });
      return { [join(dir, "index.html")]: html.html, [join(dir, "index.md")]: source, [`api/${f.type}/${f.slug}.json`]: apiItem(s, f.frontmatter, schemas) };
    } });
  }
  /**
   * The list (S25): at `/` under the index layout, as it always was — or at `/posts/` when a page holds `/`.
   * One list, one layout, two addresses; the front page's own entries are the same list (above), so the
   * `WebSite` schema stays on `/` and the list page is a `CollectionPage` like a term's.
   */
  if (theme.layouts.index) {
    const route = contentRoutes.has("/") ? "/posts" : "/";
    if (!contentRoutes.has(route)) {
      const fc = fctx(route);
      const dir = routeDir(route);
      lastmod.set(route, listEntries[0]?.updated ?? listEntries[0]?.date);
      const title = route === "/" ? site.name : "Posts";
      const schema = route === "/" ? webSite() : { "@context": "https://schema.org", "@type": "CollectionPage", name: title, url: url(route), description: site.description };
      plan.push({ route, key: sha1(`${base}:index:${route}:${listKey(listEntries)}`), kind: "route", outputs: [join(dir, "index.html")], render: () => ({ [join(dir, "index.html")]: theme.layouts.index!({ ctx, kind: "index", route, title: applyFilter(hooks, "title", title, fc), description: applyFilter(hooks, "description", site.description, fc), entries: applyFilter(hooks, "entries", listEntries, fc), jsonLd: jsonLd(applyFilter(hooks, "jsonLd", [schema], fc)) }).html }) });
    }
  }
  // terms: one page per used term of every taxonomy
  if (theme.layouts.term) {
    for (const { link, files } of byTerm.values()) {
      if (contentRoutes.has(link.route)) continue;
      const entries = files.map(entryOf);
      lastmod.set(link.route, entries[0]?.updated ?? entries[0]?.date);
      const dir = routeDir(link.route);
      const schema = { "@context": "https://schema.org", "@type": "CollectionPage", name: link.title, url: url(link.route), description: link.description };
      plan.push({ route: link.route, key: sha1(`${base}:term:${JSON.stringify(link)}:${listKey(entries)}`), kind: "route", outputs: [join(dir, "index.html")], render: () => { const fc = fctx(link.route); return { [join(dir, "index.html")]: theme.layouts.term!({ ctx, kind: "term", route: link.route, title: applyFilter(hooks, "title", link.title, fc), description: applyFilter(hooks, "description", link.description, fc), entries: applyFilter(hooks, "entries", entries, fc), term: link, jsonLd: jsonLd(applyFilter(hooks, "jsonLd", [schema], fc)) }).html }; } });
    }
  }
  // site artefacts (emit.ts): keyed on everything they show, so an unchanged list rewrites nothing
  const siteSurface: SurfaceSite = {
    name: site.name, url: site.url, description: site.description, locale: c.site.defaultLocale,
    types: Object.keys(c.types).filter((t) => c.types[t]!.layout).map((t) => ({ name: t, label: titleCase(plural(t)), entries: surface.filter((e) => e.type === t) })),
    taxonomies: Object.keys(c.taxonomies).map((t) => ({ name: t, label: titleCase(plural(t)), terms: [...byTerm.values()].filter((x) => x.link.taxonomy === t).map((x) => ({ term: x.link.term, title: x.link.title, route: x.link.route, url: url(x.link.route), count: x.files.length })).sort((a, b) => a.term.localeCompare(b.term)) })),
    routes: plan.filter((p) => p.kind === "route").map((p) => ({ route: p.route, url: url(p.route), lastmod: lastmod.get(p.route) })),
  };
  const surfaceKey = sha1(`${base}:${JSON.stringify(siteSurface)}`);
  const artefact = (file: string, render: () => string, key = surfaceKey) => plan.push({ route: `/${file}`, key: sha1(`${key}:${file}`), kind: "artefact", outputs: [file], render: () => ({ [file]: render() }) });
  artefact("llms.txt", () => llmsTxt(siteSurface));
  const listedRoutes = new Set(listed.map((f) => f.route));
  artefact("feed.xml", () => rss(siteSurface, surface.filter((e) => listedRoutes.has(e.route))));
  artefact("sitemap.xml", () => sitemap(siteSurface));
  artefact("robots.txt", () => robotsTxt(siteSurface, preview), base);
  artefact("api/site.json", () => apiSite(siteSurface));
  for (const t of siteSurface.types) artefact(`api/${t.name}.json`, () => apiType(siteSurface, t));
  for (const t of siteSurface.taxonomies) artefact(`api/${t.name}.json`, () => apiTaxonomy(siteSurface, t));
  if (css) artefact("assets/theme.css", () => minifyCss(css), sha1(css));
  /**
   * The theme's webfont (B1, decision 118), and the licence it is redistributed under. Keyed on the
   * theme hash, which already covers every byte in the theme dir — so replacing the .woff2 rewrites it
   * and nothing else, and a build that did not touch the theme never reads the bytes at all.
   */
  if (theme.font) {
    const f = theme.font;
    const into = `assets/fonts/${f.url.split("/").pop()}`;
    plan.push({ route: f.url, key: sha1(`${base}:font:${into}`), kind: "artefact", outputs: [into], render: () => ({ [into]: f.bytes }) });
    if (f.licence) artefact(`assets/fonts/${f.licence.name}`, () => f.licence!.text, base);
  }

  /**
   * Redirects last, so `routed` already holds every page the site really builds: a redirect whose old
   * route is now a live page is dropped rather than shadowing it. Each one is its own plan item keyed on
   * its pair, so adding a redirect rewrites that page and nothing else.
   */
  const routed = new Set(plan.filter((p) => p.kind === "route").map((p) => p.route));
  const redirs: Redirect[] = Object.entries(redirects(cfg)).map(([from, to]) => ({ from, to })).filter((r) => !routed.has(r.from));
  if (redirs.length) {
    artefact("_redirects", () => redirectsFile(redirs), sha1(JSON.stringify(redirs)));
    for (const r of redirs) {
      const file = join(routeDir(r.from), "index.html");
      plan.push({ route: r.from, key: sha1(`${base}:redirect:${r.from}>${r.to}`), kind: "artefact", outputs: [file], render: () => ({ [file]: redirectPage(siteSurface, r) }) });
    }
  }

  for (const m of mediaFiles) {
    const output = join("media", m.rel);
    plan.push({ route: m.url, key: m.key, kind: "media", outputs: [output], render: () => ({ [output]: { copyFrom: m.src } }) });
  }
  // Plugins' `emit` stages last (P3, decision 86), so `claimed` holds every file the site itself writes —
  // a page, an artefact, a media copy — and an emitted path that names one is refused, not written over.
  // Each accepted file is its own plan item keyed on its bytes: unchanged bytes rewrite nothing.
  let emitted = 0;
  if (hooks.emits.length) {
    const claimed = new Set(plan.flatMap((p) => p.outputs));
    const files = await runEmits(hooks, { site, config: c, root, routes: plan.filter((p) => p.kind === "route").map((p) => ({ route: p.route, url: url(p.route) })), entries: published.map(entryOf) }, claimed);
    for (const f of files) {
      plan.push({ route: `/${f.path}`, key: sha1(`${base}:emit:${f.plugin}:${f.path}:${sha1(typeof f.bytes === "string" ? f.bytes : Buffer.from(f.bytes))}`), kind: "artefact", outputs: [f.path], render: () => ({ [f.path]: f.bytes }) });
      emitted++;
    }
  }
  const t4 = performance.now();

  // ── render what changed, drop what vanished ────────────────────────────────
  /**
   * Build generations (H3, docs/11 finding 8). Until H3 the whole render ran inside one index transaction,
   * which bought two things and cost two. It bought atomicity for the *index*: a build that threw left the
   * route rows as they were. It never bought it for `dist/`, which is files, and that is the defect — a
   * build interrupted after writing a page rolled its row back to the previous key, a revert of the source
   * brought that key back, and the next build called the interrupted build's bytes current. H2 made this
   * reachable without a kill: a refused page is written before it is weighed. And it cost a write lock held
   * for the length of the render, which is the `SQLITE_BUSY` finding 7 is about.
   *
   * So a build is a generation, in three short transactions. Open: every route about to be written gets
   * the key `open:<generation>` and the union of its old and new outputs, committed before a byte is
   * written. Render: no transaction, no lock. Close: the real keys, and the vanished routes dropped. A build
   * that dies anywhere in between leaves open rows, and an open row is a miss.
   */
  let rendered = 0, cached = 0, removed = 0;
  const weigh: string[] = [];   // dist-relative pages written this run, for the client budget below
  const known = new Map(index.routes().map((r) => [r.route, r]));
  const recovered = [...known.values()].filter((r) => r.key.startsWith(OPEN)).length;
  const planned = new Set(plan.map((p) => p.route));
  const write = (rel: string, content: Output) => {
    const f = join(out, rel); mkdirSync(dirname(f), { recursive: true });
    if (typeof content === "string" || content instanceof Uint8Array) writeFileSync(f, content); else copyFileSync(content.copyFrom, f);
  };
  let todo: Planned[] = [];
  timed("stat", () => { todo = plan.filter((p) => { const prev = known.get(p.route); return !(prev && prev.key === p.key && p.outputs.every((o) => existsSync(join(out, o)))); }); });
  cached = plan.length - todo.length;
  if (todo.length) timed("index", () => index.transaction(() => {
    const generation = Number(index.meta("build.generation") ?? 0) + 1;
    index.setMeta("build.generation", String(generation));
    for (const p of todo) index.setRoute(p.route, `${OPEN}${generation}`, [...new Set([...(known.get(p.route)?.outputs ?? []), ...p.outputs])]);
  }));
  for (const p of todo) {
    const prev = known.get(p.route);
    const t = performance.now();
    const files = p.render();
    profile.html += performance.now() - t;   // less the parse inside it, subtracted once below
    timed("write", () => {
      for (const o of p.outputs) {
        const content = files[o];
        if (content === undefined) throw new Error(`internal: ${p.route} declared output ${o} but rendered ${Object.keys(files).join(", ") || "nothing"}`);
        write(o, content);
      }
      if (prev) for (const o of prev.outputs) if (!p.outputs.includes(o)) rmSync(join(out, o), { force: true });   // e.g. a type rename moved its json
    });
    for (const o of p.outputs) if (o.endsWith(".html")) weigh.push(o);
    rendered++;
  }
  profile.html -= profile.parse;
  // H2, gate E6: the pages this build wrote, weighed against what the site afforded — after the loop,
  // because a `<script src>` a plugin emitted is a plan item of its own and may not have existed yet
  // when the page naming it was written. A cached page is not re-weighed: its key covers the content,
  // the theme graph, every plugin's code, the size of every script in `content/media/` and the budget
  // itself. What it does not cover is a file a plugin's `emit` stage writes with different bytes from
  // unchanged code — script a plugin put there is that plugin's declaration to keep (P2), and
  // `page.js.kb` is where it is held to it. A refusal throws before the close, so every page this build
  // wrote stays open and the next build weighs it again (H3).
  timed("weigh", () => assertClientBudget(out, weigh, jsBudgetKb, { scripts: hooks.scripts, declaredKb: new Map(cfg.plugins.filter((pl) => pl.loaded).map((pl) => [pl.name, pl.clientKb])) }));
  timed("index", () => index.transaction(() => {
    for (const p of todo) index.setRoute(p.route, p.key, p.outputs);
    // A route that vanished takes its outputs with it — except one a planned route now writes. A `route`
    // filter (P2) that moves `/posts/a` to `/articles/a` leaves the JSON at `api/post/a.json` in both
    // the old row and the new plan; deleting it here would make every following build a miss.
    const claimed = new Set(plan.flatMap((p) => p.outputs));
    for (const [route, r] of known) {
      if (planned.has(route)) continue;
      for (const o of r.outputs) if (!claimed.has(o)) rmSync(join(out, o), { force: true });
      index.deleteRoute(route); removed++;
    }
  }));
  if (sync.changed.length || sync.removed.length) timed("index", () => index.pruneMdast());
  if (!opts.index) index.close();
  const t5 = performance.now();
  const routes = plan.filter((p) => p.kind === "route").length;
  const media = plan.filter((p) => p.kind === "media").length;
  return { routes, artefacts: plan.length - routes - media, media, emitted, rendered, cached, removed, recovered, ms: t5 - t0, phases: { config: t1 - t0, theme: t2 - t1, sync: t3 - t2, plan: t4 - t3, render: t5 - t4 }, profile, drafts, preview, ...(branch ? { branch } : {}), theme: { name: theme.name, coverage: theme.coverage }, hooks: { plugins: hooks.plugins, diagnostics: [...hooks.diagnostics], ...(hooks.record ? { record: [...hooks.record] } : {}) } };
}

/**
 * One markdown document through the theme — the block machinery lifted out of `build()` in S18f.
 *
 * It moved because it acquired a second caller and not because it wanted a home of its own: the preview
 * synthesises an index route while a site has zero items (`07` decision 52), and that page has to be
 * *the theme rendering the vocabulary* or it demonstrates nothing. A second implementation of directive
 * dispatch would have been a second answer to "what does this theme do with a `stat-row`", which is the
 * one question the empty state exists to answer honestly.
 */
export function renderDoc(source: string, o: { theme: Theme; ctx: SiteCtx; page: Entry; cache: Pick<MdastCache, "get">; /** the plugins' `transform` stages over a copy of the cached tree (P3); the typed blocks are rebuilt from what comes back */ transform?: (root: Root, blocks: Block[]) => Root }): { body: Html; cover?: Html; root: Root; blocks: Block[]; headings: PageHeading[]; sections: Sectioned } {
  let { doc, tree } = o.cache.get(source);
  if (o.transform) {
    const next = o.transform(doc.tree, tree.all);
    if (next !== doc.tree) { doc = { ...doc, tree: next }; tree = buildTree(doc, source); }
  }
  const blocks = new Map<Node, Block>(tree.all.map((b) => [b.node, b]));
  // A block rendered on its own (a `stat` inside its row, the lifted cover) goes through the same door as
  // one met in the document: a root holding the block, so `onBlock` gets the same `body` and `sections`.
  const renderBlock = (b: Block): Html => toHtml({ type: "root", children: [b.node as Node] } as Root, { blocks: blocks.has(b.node) ? blocks : new Map([...blocks, [b.node, b]]), onBlock, headingIds: false });
  const onBlock = (b: Block, body: () => Html, sections: () => Sectioned): Html => {
    const comp = o.theme.primitives[b.name];
    if (!comp) return new Html("");
    const p: PrimitiveProps = { name: b.name, props: b.props, body: body(), data: b.data, children: b.children, block: b, render: renderBlock, ctx: o.ctx, page: o.page, sections };
    return comp(p);
  };
  // A leading `cover` is the page's header, not its first paragraph (spec: "at most one, first in the
  // body"), so it is rendered on its own and lifted out of the body. Without this a post that declares
  // one gets two title blocks: the layout's, built from frontmatter, and then the author's. Only a
  // *leading* cover is lifted — one further down is the author's mistake, and lint says so, but moving
  // it to the top of the page would silently rewrite what they wrote.
  // "First in the body" is the first node of the document, not the first *directive* in it: `tree.blocks`
  // skips the prose, so a post that opens with a paragraph and puts its cover three screens down would
  // otherwise have it hoisted into the header — silently moving what the author wrote.
  const first = doc.tree.children.find((n) => n.type !== "yaml");   // only yaml frontmatter is enabled (parse.ts)
  const lead = first ? blocks.get(first) : undefined;
  const coverBlock = lead?.name === "cover" ? lead : undefined;
  const cover = coverBlock ? renderBlock(coverBlock) : undefined;
  const root = coverBlock ? { ...doc.tree, children: doc.tree.children.filter((n) => n !== coverBlock.node) } as Root : doc.tree;
  // The heading tree, collected by the render that gave the ids out rather than by a second walk (U6b):
  // a toc whose anchors came from anywhere else is a toc whose links can be wrong, and the ids are
  // de-duplicated as they are issued, so only the renderer knows that the second "Notes" is `notes-1`.
  const headings: PageHeading[] = [];
  // The same body, split at its `##` headings (S29): what a layout that bands its sections reads.
  let sections: Sectioned = { lead: new Html(""), sections: [] };
  const body = toHtml(root, { blocks, onBlock, headings, sectioned: (s) => { sections = s; } });
  return { body, cover, root: doc.tree, blocks: tree.all, headings, sections };
}
