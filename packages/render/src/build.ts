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
import { loadConfig, MdastCache, SiteIndex, sha1, readFrontmatter, type LoadedConfig, type IndexedFile, type Block } from "@snypd/core";
import type { Root, Node } from "mdast";
import { toHtml, excerpt } from "./html";
import { loadTheme, type Theme, type SiteCtx, type Entry, type TermLink, type PrimitiveProps } from "./theme";
import { Html } from "./jsx-runtime";
import { resolveTokens, tokensCss } from "./tokens";
import { readImageSize } from "./media";
import { absolute, plural, titleCase, llmsTxt, rss, sitemap, robotsTxt, apiSite, apiType, apiTaxonomy, apiItem, pageSchema, blockSchemas, jsonLd, type SurfaceEntry, type SurfaceSite } from "./emit";

export interface BuildOptions {
  out?: string; cfg?: LoadedConfig; index?: SiteIndex; cache?: MdastCache;
  /** Render drafts too (everything but trashed). `snypd serve --preview` builds this way; `dist/` never does. */
  drafts?: boolean;
}
export interface BuildResult {
  routes: number; artefacts: number; media: number; rendered: number; cached: number; removed: number; ms: number;
  phases: { config: number; theme: number; sync: number; plan: number; render: number };
  theme: { name: string; coverage: Theme["coverage"] };
}

/**
 * One unit of output: a route (html + twin + json), a site artefact (one file), or a media file copied
 * verbatim. `outputs` are dist-relative. A copy declares its source instead of its content, so a 2 MB
 * photograph never becomes a JavaScript string on the way to disk.
 */
type Output = string | { copyFrom: string };
interface Planned { route: string; key: string; outputs: string[]; kind: "route" | "artefact" | "media"; render: () => Record<string, Output> }

/** Bump when the set or shape of files a route produces changes; a stale index is then reset, not pruned. */
const OUTPUT_FORMAT = "s7";

const routeDir = (route: string) => (route === "/" ? "" : route.replace(/^\//, ""));

export async function build(root: string, opts: BuildOptions = {}): Promise<BuildResult> {
  const t0 = performance.now();
  const out = opts.out ?? join(root, "dist");
  const cfg = opts.cfg ?? loadConfig(root);
  const t1 = performance.now();
  const theme = await loadTheme(cfg);
  const t2 = performance.now();
  const index = opts.index ?? await SiteIndex.open(root);
  const sync = index.sync(cfg);
  const t3 = performance.now();
  const cache = opts.cache ?? new MdastCache(index.mdastStore());
  const c = cfg.config;
  const site = { name: c.site.name, url: c.site.url.replace(/\/$/, ""), description: c.site.description };
  const tokens = resolveTokens(c.theme.tokens as Parameters<typeof resolveTokens>[0]);
  const css = tokensCss(tokens) + (theme.css ?? "");
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
    mediaFiles.push({ rel, src, url, key: sha1(`${OUTPUT_FORMAT}:media:${rel}:${st.size}:${st.mtimeMs}`) });
  }
  const ctx: SiteCtx = { site, tokens, theme: { name: theme.name }, assets: { css: css ? "/assets/theme.css" : undefined, feed: "/feed.xml", llms: "/llms.txt", api: "/api/site.json" }, config: c, media: mediaSizes };
  const configHash = sha1(JSON.stringify({ site: c.site, theme: { use: c.theme.use, tokens }, types: c.types, taxonomies: c.taxonomies, statuses: c.statuses }));
  const mediaHash = sha1(JSON.stringify(mediaSizes));
  const base = `${OUTPUT_FORMAT}:${theme.hash}:${configHash}:${mediaHash}${opts.drafts ? ":drafts" : ""}`;   // a draft build's outputs are not dist's; the key says so
  // An index written by an older renderer describes outputs we no longer produce (S6 kept them route-relative):
  // forget its routes rather than trust or prune them. The index is disposable (docs/07 decision 13).
  if (index.meta("output.format") !== OUTPUT_FORMAT) { index.clearRoutes(); index.setMeta("output.format", OUTPUT_FORMAT); }
  const isPublic = (f: IndexedFile) => c.statuses[f.status]?.public === true;
  const visible = (f: IndexedFile) => (opts.drafts ? f.status !== "trashed" : isPublic(f));
  const url = (route: string) => absolute(site.url, route);

  // ── plan ────────────────────────────────────────────────────────────────────
  const entryOf = (f: IndexedFile): Entry => ({ route: f.route, type: f.type, slug: f.slug, title: f.title, date: f.date, updated: f.updated, status: f.status, description: typeof f.frontmatter.description === "string" ? f.frontmatter.description : undefined, frontmatter: f.frontmatter });
  const listKey = (es: Entry[]) => sha1(es.map((e) => [e.route, e.title, e.date ?? "", e.description ?? ""].join("|")).join("\n"));
  const newest = (a: IndexedFile, b: IndexedFile) => (b.date ?? "").localeCompare(a.date ?? "") || a.route.localeCompare(b.route);
  const published = sync.files.filter(visible).sort(newest);
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
  const authorOf = (f: IndexedFile): Entry | undefined => { const a = f.frontmatter.author; if (typeof a !== "string") return undefined; const af = sync.files.find((x) => x.type === "author" && x.slug === a); return af ? entryOf(af) : undefined; };
  const layoutOf = (f: IndexedFile): string | null => { const fm = f.frontmatter.layout; if (typeof fm === "string") return fm; return c.types[f.type]?.layout ?? null; };
  const surfaceOf = (f: IndexedFile, terms: TermLink[], author: Entry | undefined): SurfaceEntry => {
    const e = entryOf(f);
    return { type: e.type, slug: e.slug, route: e.route, url: url(e.route), title: e.title, date: e.date, updated: e.updated, status: e.status, description: e.description,
      terms: terms.map((t) => ({ taxonomy: t.taxonomy, term: t.term, title: t.title, route: t.route, url: url(t.route) })),
      author: author ? { name: author.title, route: author.route, url: url(author.route) } : undefined,
      markdown: `${url(e.route)}index.md`, json: `${site.url}/api/${e.type}/${e.slug}.json` };
  };

  const renderBody = (source: string, page: Entry): { body: Html; root: Root; blocks: Block[] } => {
    const { doc, tree } = cache.get(source);
    const blocks = new Map<Node, Block>(tree.all.map((b) => [b.node, b]));
    const renderBlock = (b: Block): Html => onBlock(b, () => toHtml({ type: "root", children: (b.node as { children?: Node[] }).children ?? [] } as Root, { blocks, onBlock, headingIds: false }));
    const onBlock = (b: Block, body: () => Html): Html => {
      const comp = theme.primitives[b.name];
      if (!comp) return new Html("");
      const p: PrimitiveProps = { name: b.name, props: b.props, body: body(), data: b.data, children: b.children, block: b, render: renderBlock, ctx, page };
      return comp(p);
    };
    return { body: toHtml(doc.tree, { blocks, onBlock }), root: doc.tree, blocks: tree.all };
  };

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
    const key = sha1(`${base}:${f.hash}:${JSON.stringify(terms)}:${author ? `${author.title}${author.route}` : ""}`);
    contentRoutes.add(f.route);
    const dir = routeDir(f.route);
    plan.push({ route: f.route, key, kind: "route", outputs: [join(dir, "index.html"), join(dir, "index.md"), `api/${f.type}/${f.slug}.json`], render: () => {
      const source = readFileSync(join(root, f.path), "utf8");
      const entry = entryOf(f);
      const { body, root: mdast, blocks } = renderBody(source, entry);
      const derived = blockSchemas(blocks);
      const description = entry.description ?? excerpt(mdast);
      const schemas = [pageSchema(s, entry.description ?? derived.description ?? description, ctx), ...derived.schemas];
      const page = { ...entry, description, body, terms, layout, markdownUrl: `${f.route === "/" ? "" : f.route}/index.md`, author };
      const entries = layout === "author" ? published.filter((x) => x.frontmatter.author === f.slug && x.type !== "author").map(entryOf) : [];
      const html = theme.layouts[layout]!({ ctx, kind: layout, route: f.route, title: page.title, description: page.description, page, entries, jsonLd: jsonLd(schemas) });
      return { [join(dir, "index.html")]: html.html, [join(dir, "index.md")]: source, [`api/${f.type}/${f.slug}.json`]: apiItem(s, f.frontmatter, schemas) };
    } });
  }
  // index: every published item of a type with a layout, except pages; newest first
  const listed = published.filter((f) => layoutOf(f) && f.type !== "page");
  if (theme.layouts.index && !contentRoutes.has("/")) {
    const entries = listed.map(entryOf);
    lastmod.set("/", entries[0]?.updated ?? entries[0]?.date);
    const schema = { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: `${site.url}/`, description: site.description };
    plan.push({ route: "/", key: sha1(`${base}:index:${listKey(entries)}`), kind: "route", outputs: ["index.html"], render: () => ({ "index.html": theme.layouts.index!({ ctx, kind: "index", route: "/", title: site.name, description: site.description, entries, jsonLd: jsonLd([schema]) }).html }) });
  }
  // terms: one page per used term of every taxonomy
  const byTerm = new Map<string, { link: TermLink; files: IndexedFile[] }>();
  for (const f of published) for (const t of termsOf(f)) { const k = `${t.taxonomy} ${t.term}`; (byTerm.get(k) ?? byTerm.set(k, { link: t, files: [] }).get(k)!).files.push(f); }
  if (theme.layouts.term) {
    for (const { link, files } of byTerm.values()) {
      if (contentRoutes.has(link.route)) continue;
      const entries = files.map(entryOf);
      lastmod.set(link.route, entries[0]?.updated ?? entries[0]?.date);
      const dir = routeDir(link.route);
      const schema = { "@context": "https://schema.org", "@type": "CollectionPage", name: link.title, url: url(link.route), description: link.description };
      plan.push({ route: link.route, key: sha1(`${base}:term:${JSON.stringify(link)}:${listKey(entries)}`), kind: "route", outputs: [join(dir, "index.html")], render: () => ({ [join(dir, "index.html")]: theme.layouts.term!({ ctx, kind: "term", route: link.route, title: link.title, description: link.description, entries, term: link, jsonLd: jsonLd([schema]) }).html }) });
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
  artefact("robots.txt", () => robotsTxt(siteSurface), base);
  artefact("api/site.json", () => apiSite(siteSurface));
  for (const t of siteSurface.types) artefact(`api/${t.name}.json`, () => apiType(siteSurface, t));
  for (const t of siteSurface.taxonomies) artefact(`api/${t.name}.json`, () => apiTaxonomy(siteSurface, t));
  if (css) artefact("assets/theme.css", () => css, sha1(css));

  for (const m of mediaFiles) {
    const output = join("media", m.rel);
    plan.push({ route: m.url, key: m.key, kind: "media", outputs: [output], render: () => ({ [output]: { copyFrom: m.src } }) });
  }
  const t4 = performance.now();

  // ── render what changed, drop what vanished ────────────────────────────────
  let rendered = 0, cached = 0, removed = 0;
  const known = new Map(index.routes().map((r) => [r.route, r]));
  const planned = new Set(plan.map((p) => p.route));
  const write = (rel: string, content: Output) => {
    const f = join(out, rel); mkdirSync(dirname(f), { recursive: true });
    if (typeof content === "string") writeFileSync(f, content); else copyFileSync(content.copyFrom, f);
  };
  index.transaction(() => {
    for (const p of plan) {
      const prev = known.get(p.route);
      if (prev && prev.key === p.key && p.outputs.every((o) => existsSync(join(out, o)))) { cached++; continue; }
      const files = p.render();
      for (const o of p.outputs) {
        const content = files[o];
        if (content === undefined) throw new Error(`internal: ${p.route} declared output ${o} but rendered ${Object.keys(files).join(", ") || "nothing"}`);
        write(o, content);
      }
      if (prev) for (const o of prev.outputs) if (!p.outputs.includes(o)) rmSync(join(out, o), { force: true });   // e.g. a type rename moved its json
      index.setRoute(p.route, p.key, p.outputs);
      rendered++;
    }
    for (const [route, r] of known) {
      if (planned.has(route)) continue;
      for (const o of r.outputs) rmSync(join(out, o), { force: true });
      index.deleteRoute(route); removed++;
    }
  });
  if (sync.changed.length || sync.removed.length) index.pruneMdast();
  if (!opts.index) index.close();
  const t5 = performance.now();
  const routes = plan.filter((p) => p.kind === "route").length;
  const media = plan.filter((p) => p.kind === "media").length;
  return { routes, artefacts: plan.length - routes - media, media, rendered, cached, removed, ms: t5 - t0, phases: { config: t1 - t0, theme: t2 - t1, sync: t3 - t2, plan: t4 - t3, render: t5 - t4 }, theme: { name: theme.name, coverage: theme.coverage } };
}
