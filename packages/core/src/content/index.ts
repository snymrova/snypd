/** @snypd/core content pipeline, S5: parse → validate (typed primitive tree + lint). */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadConfig, redirects, type LoadedConfig } from "../config";
import { MdastCache } from "./cache";
import { lint, yamlFailure, type LintOptions, type LintResult } from "./lint";
import type { Diagnostic } from "./tree";
import { frontmatterKeyLine, parseMarkdown } from "./parse";
import { readFrontmatter, taxonomyFields, type Move } from "../store";
import type { TypeDef } from "../schema";
import { lintNav, routeLookup, termRoutes } from "../nav";
import { mediaRefs, mediaPathOf, stringsIn, type MediaRef } from "./media";

export { parseMarkdown, frontmatterKeyLine, type ParsedDoc } from "./parse";
export { buildTree, checkProp, countNodes, type Block, type PrimitiveTree, type Diagnostic, type Severity } from "./tree";
export { lint, formatLint, yamlFailure, SLOP, type LintOptions, type LintResult, type TypeShape } from "./lint";
export { MdastCache, hashSource, type CachedDoc, type MdastStore } from "./cache";
export { mediaRefs, mediaPathOf, stringsIn, MEDIA_URL_PREFIX, type MediaRef } from "./media";
export { suggestBlocks, applySuggestions, formatSuggestions, candidates, score, toNumber, REWRITERS, NEED, type Suggestion, type SuggestOptions, type ApplyResult, type Need, type Candidate } from "./suggest";

/** The `/media/…` files one stored document names — what a publish lands beside the item (S31 · H5). */
export function documentMedia(source: string, cache?: MdastCache): MediaRef[] {
  const { doc, tree } = (cache ?? new MdastCache()).get(source);
  return mediaRefs(doc, tree);
}

/** Lint one markdown string (parse + tree + rules). */
export function lintMarkdown(source: string, opts: LintOptions = {}, cache?: MdastCache): LintResult {
  const { doc, tree } = (cache ?? new MdastCache()).get(source);
  return lint(doc, tree, source, opts);
}

export interface ContentFile { type: string; slug: string; file: string; route: string; /** `slug`, or `parent/slug` for a nested item — what a nav `ref` names after the type */ path: string; /** `home: true` in the frontmatter (S25): this item asked to be the front page. */ home?: boolean }

/**
 * The front page is a page (S25, docs/16 §2): a type that declares a boolean `home` field — `page` does by
 * default — can have one item carry `home: true`, and that item's route is `/` instead of the one its
 * urlPattern gives it. The list that was at `/` moves to `/posts/` (build.ts). Nothing but the route
 * changes here: the same file, the same slug, the same `type/slug` a nav `ref` names. Two items that
 * both ask are a lint error (rule 14), and the first by path keeps `/` so a build never has two pages
 * writing one file. Only a type with the field pays the read: a site's posts are never opened here.
 */
export const hasHomeField = (def: Pick<TypeDef, "fields">): boolean => (def.fields as Record<string, { type?: string } | undefined>).home?.type === "boolean";
export const isHome = (def: Pick<TypeDef, "fields">, frontmatter: Record<string, unknown> | undefined): boolean => hasHomeField(def) && frontmatter?.home === true;
/** One item's route: the type's urlPattern over its slug (or nested path), or `/` for the front page. */
export function routeOf(def: Pick<TypeDef, "urlPattern" | "fields">, slug: string, path: string, frontmatter?: Record<string, unknown>): string {
  if (isHome(def, frontmatter)) return "/";
  return def.urlPattern.replace("{slug}", slug).replace("{path}", path).replace(/\/+$/, "") || "/";
}

/** Every content file the merged config's types declare, with its route from the type's urlPattern. */
export function listContent(root: string, cfg: LoadedConfig = loadConfig(root)): ContentFile[] {
  const out: ContentFile[] = [];
  let home = false;   // the first item that asks, by type order then path, is the one that gets `/`
  for (const [type, def] of Object.entries(cfg.config.types)) {
    const dir = join(root, def.dir);
    if (!existsSync(dir)) continue;
    const readsHome = hasHomeField(def);
    const walk = (d: string, prefix: string) => {
      for (const f of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (f.isDirectory()) { if (!f.name.startsWith(".")) walk(join(d, f.name), `${prefix}${f.name}/`); continue; }
        if (!f.name.endsWith(".md")) continue;
        const slug = f.name.slice(0, -3);
        const path = `${prefix}${slug}`;
        const file = join(d, f.name);
        const asks = readsHome && readFrontmatter(readFileSync(file, "utf8")).home === true;
        const route = asks && !home ? "/" : routeOf(def, slug, path);
        if (asks && !home) home = true;
        out.push({ type, slug, file, route, path, ...(asks ? { home: true } : {}) });
      }
    };
    walk(dir, "");
  }
  return out;
}

export interface SiteLint { files: LintResult[]; errors: number; warnings: number; ms: number; cache: { hits: number; misses: number } }

/**
 * Lint a whole site: routes feed rule 5, the merged type schema feeds rule 0, the whole set feeds rule 11
 * (a tag used once) and the index's move log feeds rule 10 (`SiteIndex.moves()`, passed as `moves`).
 * Nav files (U2) are linted here too, after the content: rule 5 for a `ref` that resolves to nothing,
 * rule 12 for a location the theme does not declare — so `site` › doctor and `content` › lint see a
 * broken menu without anyone asking.
 */
export function lintSite(root: string, opts: { cache?: MdastCache; cfg?: LoadedConfig; moves?: Move[] } = {}): SiteLint {
  const t0 = performance.now();
  const cfg = opts.cfg ?? loadConfig(root);
  const cache = opts.cache ?? new MdastCache();
  const content = listContent(root, cfg);
  const statuses = Object.keys(cfg.config.statuses);
  const files: LintResult[] = [];
  const D = (rule: string, n: number, message: string, hint: string, line: number): Diagnostic => ({ rule, n, severity: "warning", message, hint, line });
  // one cache lookup per file; rule 11 needs every file's terms before any file is reported
  const flat = new Set(Object.entries(cfg.config.taxonomies).filter(([, t]) => !t.hierarchical).map(([n]) => n));
  const termUse = new Map<string, Set<string>>();   // "taxonomy:term" → files
  const docs = content.map((c) => {
    const src = readFileSync(c.file, "utf8");
    const cached = cache.get(src);
    const terms: { taxonomy: string; field: string; terms: string[] }[] = [];
    for (const [taxonomy, field] of Object.entries(taxonomyFields(cfg.config.types[c.type]!))) {
      if (!flat.has(taxonomy)) continue;
      const v = cached.doc.frontmatter[field];
      const list = [...new Set((Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(String))];
      terms.push({ taxonomy, field, terms: list });
      for (const t of list) (termUse.get(`${taxonomy}:${t}`) ?? termUse.set(`${taxonomy}:${t}`, new Set()).get(`${taxonomy}:${t}`)!).add(c.file);
    }
    return { c, src, cached, terms };
  });
  // Rule 5's routes: the index, every item, and every term page any frontmatter names — the set a nav `ref` resolves against too.
  const lookup = routeLookup(root, cfg, content, termRoutes(cfg, docs.map((d) => ({ type: d.c.type, frontmatter: d.cached.doc.frontmatter }))), opts.moves);
  const routes = lookup.routes;
  const moves = new Map((opts.moves ?? []).map((m) => [m.path, m]));
  const redirected = redirects(cfg);
  for (const { c, src, cached, terms } of docs) {
    const type = cfg.config.types[c.type]!;
    const rel = relative(root, c.file);
    const r = lint(cached.doc, cached.tree, src, { type: { fields: type.fields as never, taxonomies: type.taxonomies }, statuses, routes, file: rel });
    // ── 10 slug change without a redirect ──────────────────────────────────
    const mv = moves.get(rel.split("\\").join("/"));
    // S16: a redirect covering the old route is the fix, so a covered move is not a warning. Before S16
    // this rule named a remedy the product did not have — `site.set_redirect` is now that remedy.
    // A page that stops being the front page (S25) moved away from `/` — which is never a dead URL: the list is there.
    if (mv && mv.from !== "/" && !redirected[mv.from]) r.diagnostics.push(D("slug-change", 10, `Route changed from ${mv.from} to ${mv.to}; nothing redirects the old URL`, `Run \`site\` › set_redirect ${mv.from} → ${mv.to} so links to the old URL keep working, or restore \`slug:\` (or the filename)`, frontmatterKeyLine(cached.doc, "slug")));
    // ── 14 a second front page (S25) ───────────────────────────────────────
    // `listContent` gave `/` to the first item that asked; this one asked too and kept its own route.
    if (c.home && c.route !== "/") {
      const first = content.find((x) => x.home && x.route === "/")!;
      r.diagnostics.push({ ...D("second-home", 14, `\`home: true\` is already set on ${first.type}/${first.path}; this page stays at ${c.route}`, `One page is the front page. Set \`home: false\` here, or on ${first.type}/${first.path}`, frontmatterKeyLine(cached.doc, "home")), severity: "error" });
      r.errors = r.diagnostics.filter((d) => d.severity === "error").length;
    }
    // ── 11 tag used once ───────────────────────────────────────────────────
    for (const { taxonomy, field, terms: list } of terms) {
      for (const t of list) {
        if ((termUse.get(`${taxonomy}:${t}`)?.size ?? 0) > 1) continue;
        const others = [...termUse.keys()].filter((k) => k.startsWith(`${taxonomy}:`) && termUse.get(k)!.size > 1).map((k) => k.slice(taxonomy.length + 1)).slice(0, 5);
        r.diagnostics.push(D("tag-once", 11, `${taxonomy} \`${t}\` is used only here`, `A ${taxonomy} used once connects nothing — ${others.length ? `reuse one of ${others.map((o) => `\`${o}\``).join(", ")}` : "add it to a second post"} or drop it`, frontmatterKeyLine(cached.doc, field)));
      }
    }
    r.diagnostics.sort((a, b) => a.line - b.line || a.n - b.n);
    r.warnings = r.diagnostics.filter((d) => d.severity === "warning").length;
    files.push(r);
  }
  // ── 19 the files no type walks: taxonomy terms and authors ───────────────
  files.push(...lintSideFiles(root, cfg));
  // ── 20 media-size: every file under content/media/, weighed and traced to who names it ──
  files.push(...lintMedia(root, cfg, docs.map((d) => ({ file: relative(root, d.c.file).split("\\").join("/"), refs: mediaRefs(d.cached.doc, d.cached.tree) }))));
  // ── nav files: rules 5 and 12 ────────────────────────────────────────────
  for (const n of lintNav(root, cfg, lookup)) {
    if (!n.diagnostics.length) { files.push({ file: n.file, diagnostics: [], errors: 0, warnings: 0, words: 0, skipped: [] }); continue; }
    files.push({ file: n.file, diagnostics: n.diagnostics, errors: n.diagnostics.filter((d) => d.severity === "error").length, warnings: n.diagnostics.filter((d) => d.severity === "warning").length, words: 0, skipped: [] });
  }
  return { files, errors: files.reduce((n, f) => n + f.errors, 0), warnings: files.reduce((n, f) => n + f.warnings, 0), ms: performance.now() - t0, cache: { hits: cache.hits, misses: cache.misses } };
}

/**
 * Rule 19, `frontmatter-unparsed` (S29 · U10, docs/19 §2 · 5). `listContent` walks the directories the
 * types declare — `author` is a default type, so an author's file has always had rule 0 — but a taxonomy
 * term's file (`content/taxonomies/<taxonomy>/<term>.md`) belongs to no type, and the build reads it
 * through `readFrontmatter`, which returns `{}` when the YAML does not parse. (`content/authors` is
 * walked here only on a site whose config removed the type, so the walk is the same either way.) So a colon in a term's description dropped the file, the
 * term fell back to its slug on every post and on its own page, and `snypd lint` said *0 errors*
 * because it had never opened the file. Here every one of them is opened once, and a frontmatter that
 * does not parse is an error naming the line — the sentence is "quote the value on line 4", not "look
 * at the rendered site". Nothing else is judged: a term file has no schema of its own, and a file that
 * parses is reported clean so the walk is visible in the count.
 */
function lintSideFiles(root: string, cfg: LoadedConfig): LintResult[] {
  const dirs = Object.keys(cfg.config.taxonomies).map((t) => join(root, "content", "taxonomies", t));
  const typed = new Set(Object.values(cfg.config.types).map((t) => join(root, t.dir)));
  const authors = join(root, "content", "authors");
  if (!typed.has(authors)) dirs.push(authors);
  const out: LintResult[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!f.isFile() || !f.name.endsWith(".md")) continue;
      const file = join(dir, f.name);
      const doc = parseMarkdown(readFileSync(file, "utf8"));
      const diagnostics: Diagnostic[] = [];
      if (doc.frontmatterError) {
        const { line, hint } = yamlFailure(doc);
        diagnostics.push({ rule: "frontmatter-unparsed", n: 19, severity: "error", message: `Frontmatter is not valid YAML: ${doc.frontmatterError} — the file is dropped and the ${dir === authors ? "author" : "term"} falls back to its slug`, hint, line });
      }
      out.push({ file: relative(root, file), diagnostics, errors: diagnostics.length, warnings: 0, words: 0, skipped: [] });
    }
  }
  return out;
}

/** Rule 20's threshold: a picture over this is a warning naming its size and the page that shows it. */
export const MEDIA_SIZE_KB = 300;

const kb = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/**
 * Rule 20, `media-size` (S31 · H5, docs/23 §6.1) — report-only, the way `page.bytes.kb` and `page.media.kb`
 * were before they had a budget: one measurement first, a number after. Two findings, one rule. A file
 * over 300 KB warns with its size and who names it, because the reader downloads every byte and the
 * author who put it there saw a filename. A file nothing names warns *unreferenced*, because the build
 * copies all of `content/media/` into `dist/` and an 8 MB orphan ships with every deploy. "Names" is any
 * value: a post's or page's frontmatter, directive attribute or `![]()`; a term's or author's frontmatter;
 * `snypd.yaml` itself (the favicon, a theme setting of type `image`). No manifest and no derivatives —
 * the rule reads the directory and the documents, which the build already has.
 */
function lintMedia(root: string, cfg: LoadedConfig, docs: { file: string; refs: MediaRef[] }[]): LintResult[] {
  const dir = join(root, "content", "media");
  if (!existsSync(dir)) return [];
  const named = new Map<string, Set<string>>();
  const name = (path: string, by: string) => (named.get(path) ?? named.set(path, new Set()).get(path)!).add(by);
  for (const d of docs) for (const r of d.refs) name(r.path, d.file);
  for (const s of stringsIn(cfg.config)) { const p = mediaPathOf(s.value); if (p) name(p, "snypd.yaml"); }
  const side = Object.keys(cfg.config.taxonomies).map((t) => join(root, "content", "taxonomies", t));
  const typed = new Set(Object.values(cfg.config.types).map((t) => join(root, t.dir)));
  if (!typed.has(join(root, "content", "authors"))) side.push(join(root, "content", "authors"));
  for (const d of side) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".md")) continue;
      for (const s of stringsIn(readFrontmatter(readFileSync(join(d, f), "utf8")))) { const p = mediaPathOf(s.value); if (p) name(p, relative(root, join(d, f)).split("\\").join("/")); }
    }
  }
  const out: LintResult[] = [];
  const walk = (at: string) => {
    for (const f of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (f.name.startsWith(".")) continue;
      const file = join(at, f.name);
      if (f.isDirectory()) { walk(file); continue; }
      if (!f.isFile()) continue;
      const rel = relative(root, file).split("\\").join("/");
      const size = statSync(file).size;
      // Share cards and icons (S36) are named by the build itself — the shell finds a page's card by its
      // route, and the icons are served from `/` — so a file there is never an orphan for being unnamed.
      const drawn = /^content\/media\/(?:cards|icons)\//.test(rel);
      const by = [...(named.get(rel) ?? []), ...(drawn ? ["the build (`snypd cards`)"] : [])].sort();
      const big = size > MEDIA_SIZE_KB * 1024;
      if (!big && by.length) continue;
      const clip = /\.(?:mp4|webm)$/i.test(f.name);
      const who = by.length ? `named by ${by.slice(0, 3).join(", ")}${by.length > 3 ? ` and ${by.length - 3} more` : ""}` : "named by no page, term, author or setting";
      const message = big ? `\`${f.name}\` is ${kb(size)}, ${who}` : `\`${f.name}\` (${kb(size)}) is ${who}`;
      const hint = big
        ? clip ? "A clip this size belongs on object storage, named by its absolute url (docs/23 §6.2); the poster stays here" : `Resize or re-encode it — a 1600 px WebP is under ${MEDIA_SIZE_KB} KB — or accept that every reader downloads ${kb(size)}${by.length ? "" : "; nothing shows it, so it can also go"}`
        : "The build copies every file here into dist/media/ whether a page shows it or not: name it in a page, or delete it";
      out.push({ file: rel, diagnostics: [{ rule: "media-size", n: 20, severity: "warning", message, hint, line: 0 }], errors: 0, warnings: 1, words: 0, skipped: [] });
    }
  };
  walk(dir);
  return out;
}

export function formatSiteLint(s: SiteLint): string {
  const lines = s.files.filter((f) => f.diagnostics.length).map((f) => f.diagnostics.map((d: Diagnostic) => `${f.file}:${d.line}${d.column ? `:${d.column}` : ""} ${d.severity} [${d.rule}] ${d.message}\n    ↳ ${d.hint}`).join("\n"));
  return `${lines.join("\n")}${lines.length ? "\n" : ""}${s.files.length} files · ${s.errors} errors · ${s.warnings} warnings · ${s.ms.toFixed(0)} ms`;
}
