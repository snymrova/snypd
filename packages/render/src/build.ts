/**
 * `snypd build` (docs/04 "The renderer"): content → typed tree → theme TSX → dist/, incrementally.
 * Every route has a key = hash(content) + hash(theme graph) + hash(config subset) (+ the list it renders,
 * for index/term pages). Keys live in the SQLite index; a route whose key is unchanged and whose outputs
 * exist is skipped outright — not copied, not re-rendered. A cold build differs from a warm one only by
 * cache misses: same code path, no special case.
 * Output per content route: `index.html` + the `.md` twin (the source file, byte for byte).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig, MdastCache, SiteIndex, sha1, readFrontmatter, type LoadedConfig, type IndexedFile, type Block } from "@snypd/core";
import type { Root, Node } from "mdast";
import { toHtml, excerpt } from "./html";
import { loadTheme, type Theme, type SiteCtx, type Entry, type TermLink, type PrimitiveProps } from "./theme";
import { Html } from "./jsx-runtime";

export interface BuildOptions { out?: string; cfg?: LoadedConfig; index?: SiteIndex; cache?: MdastCache }
export interface BuildResult {
  routes: number; rendered: number; cached: number; removed: number; ms: number;
  phases: { config: number; theme: number; sync: number; plan: number; render: number };
  theme: { name: string; coverage: Theme["coverage"] };
}

interface Planned { route: string; key: string; outputs: string[]; render: () => { html: string; md?: string } }

const outPath = (out: string, route: string, file: string) => join(out, route === "/" ? "" : route, file);

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
  const ctx: SiteCtx = { site: { name: c.site.name, url: c.site.url }, tokens: c.theme.tokens, theme: { name: theme.name }, config: c };
  const configHash = sha1(JSON.stringify({ site: c.site, theme: { use: c.theme.use, tokens: c.theme.tokens }, types: c.types, taxonomies: c.taxonomies, statuses: c.statuses }));
  const base = `${theme.hash}:${configHash}`;
  const isPublic = (f: IndexedFile) => c.statuses[f.status]?.public === true;

  // ── plan ────────────────────────────────────────────────────────────────────
  const entryOf = (f: IndexedFile): Entry => ({ route: f.route, type: f.type, slug: f.slug, title: f.title, date: f.date, updated: f.updated, status: f.status, description: typeof f.frontmatter.description === "string" ? f.frontmatter.description : undefined, frontmatter: f.frontmatter });
  const listKey = (es: Entry[]) => sha1(es.map((e) => [e.route, e.title, e.date ?? "", e.description ?? ""].join("|")).join("\n"));
  const newest = (a: IndexedFile, b: IndexedFile) => (b.date ?? "").localeCompare(a.date ?? "") || a.route.localeCompare(b.route);
  const published = sync.files.filter(isPublic).sort(newest);
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

  const renderBody = (source: string, page: Entry): { body: Html; root: Root } => {
    const { doc, tree } = cache.get(source);
    const blocks = new Map<Node, Block>(tree.all.map((b) => [b.node, b]));
    const renderBlock = (b: Block): Html => onBlock(b, () => toHtml({ type: "root", children: (b.node as { children?: Node[] }).children ?? [] } as Root, { blocks, onBlock, headingIds: false }));
    const onBlock = (b: Block, body: () => Html): Html => {
      const comp = theme.primitives[b.name];
      if (!comp) return new Html("");
      const p: PrimitiveProps = { name: b.name, props: b.props, body: body(), data: b.data, children: b.children, block: b, render: renderBlock, ctx, page };
      return comp(p);
    };
    return { body: toHtml(doc.tree, { blocks, onBlock }), root: doc.tree };
  };

  const plan: Planned[] = [];
  const contentRoutes = new Set<string>();
  for (const f of published) {
    const layout = layoutOf(f);
    if (!layout) continue;
    if (!theme.layouts[layout]) throw new Error(`theme ${theme.name} has no layout "${layout}" (needed by ${f.path})`);
    const terms = termsOf(f);
    const author = authorOf(f);
    const key = sha1(`${base}:${f.hash}:${JSON.stringify(terms)}:${author ? `${author.title}${author.route}` : ""}`);
    contentRoutes.add(f.route);
    plan.push({ route: f.route, key, outputs: ["index.html", "index.md"], render: () => {
      const source = readFileSync(join(root, f.path), "utf8");
      const entry = entryOf(f);
      const { body, root: mdast } = renderBody(source, entry);
      const page = { ...entry, description: entry.description ?? excerpt(mdast), body, terms, layout, markdownUrl: `${f.route === "/" ? "" : f.route}/index.md`, author };
      const entries = layout === "author" ? published.filter((x) => x.frontmatter.author === f.slug && x.type !== "author").map(entryOf) : [];
      const html = theme.layouts[layout]!({ ctx, kind: layout, route: f.route, title: page.title, description: page.description, page, entries });
      return { html: html.html, md: source };
    } });
  }
  // index: every published item of a type with a layout, except pages; newest first
  if (theme.layouts.index && !contentRoutes.has("/")) {
    const entries = published.filter((f) => layoutOf(f) && f.type !== "page").map(entryOf);
    plan.push({ route: "/", key: sha1(`${base}:index:${listKey(entries)}`), outputs: ["index.html"], render: () => ({ html: theme.layouts.index!({ ctx, kind: "index", route: "/", title: c.site.name, entries }).html }) });
  }
  // terms: one page per used term of every taxonomy
  if (theme.layouts.term) {
    const byTerm = new Map<string, IndexedFile[]>();
    for (const f of published) for (const t of termsOf(f)) { const k = `${t.taxonomy} ${t.term}`; (byTerm.get(k) ?? byTerm.set(k, []).get(k)!).push(f); }
    for (const [k, files] of byTerm) {
      const [taxonomy, term] = k.split(" ") as [string, string];
      const link = termMeta(taxonomy, term);
      if (contentRoutes.has(link.route)) continue;
      const entries = files.map(entryOf);
      plan.push({ route: link.route, key: sha1(`${base}:term:${JSON.stringify(link)}:${listKey(entries)}`), outputs: ["index.html"], render: () => ({ html: theme.layouts.term!({ ctx, kind: "term", route: link.route, title: link.title, description: link.description, entries, term: link }).html }) });
    }
  }
  const t4 = performance.now();

  // ── render what changed, drop what vanished ────────────────────────────────
  let rendered = 0, cached = 0, removed = 0;
  const known = new Map(index.routes().map((r) => [r.route, r]));
  const planned = new Set(plan.map((p) => p.route));
  index.transaction(() => {
    for (const p of plan) {
      const prev = known.get(p.route);
      if (prev && prev.key === p.key && p.outputs.every((o) => existsSync(outPath(out, p.route, o)))) { cached++; continue; }
      const r = p.render();
      const html = outPath(out, p.route, "index.html");
      mkdirSync(dirname(html), { recursive: true });
      writeFileSync(html, r.html);
      if (r.md !== undefined) writeFileSync(outPath(out, p.route, "index.md"), r.md);
      index.setRoute(p.route, p.key, p.outputs);
      rendered++;
    }
    for (const [route, r] of known) {
      if (planned.has(route)) continue;
      for (const o of r.outputs) rmSync(outPath(out, route, o), { force: true });
      index.deleteRoute(route); removed++;
    }
  });
  if (sync.changed.length || sync.removed.length) index.pruneMdast();
  if (!opts.index) index.close();
  const t5 = performance.now();
  return { routes: plan.length, rendered, cached, removed, ms: t5 - t0, phases: { config: t1 - t0, theme: t2 - t1, sync: t3 - t2, plan: t4 - t3, render: t5 - t4 }, theme: { name: theme.name, coverage: theme.coverage } };
}
