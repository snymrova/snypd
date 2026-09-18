/** @snypd/core content pipeline, S5: parse → validate (typed primitive tree + lint). */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { loadConfig, redirects, type LoadedConfig } from "../config";
import { MdastCache } from "./cache";
import { lint, type LintOptions, type LintResult } from "./lint";
import type { Diagnostic } from "./tree";
import { frontmatterKeyLine } from "./parse";
import { readFrontmatter, taxonomyFields, type Move } from "../store";
import type { TypeDef } from "../schema";
import { lintNav, routeLookup, termRoutes } from "../nav";

export { parseMarkdown, frontmatterKeyLine, type ParsedDoc } from "./parse";
export { buildTree, checkProp, countNodes, type Block, type PrimitiveTree, type Diagnostic, type Severity } from "./tree";
export { lint, formatLint, SLOP, type LintOptions, type LintResult, type TypeShape } from "./lint";
export { MdastCache, hashSource, type CachedDoc, type MdastStore } from "./cache";
export { suggestBlocks, applySuggestions, formatSuggestions, candidates, score, toNumber, REWRITERS, NEED, type Suggestion, type SuggestOptions, type ApplyResult, type Need, type Candidate } from "./suggest";

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
  // ── nav files: rules 5 and 12 ────────────────────────────────────────────
  for (const n of lintNav(root, cfg, lookup)) {
    if (!n.diagnostics.length) { files.push({ file: n.file, diagnostics: [], errors: 0, warnings: 0, words: 0, skipped: [] }); continue; }
    files.push({ file: n.file, diagnostics: n.diagnostics, errors: n.diagnostics.filter((d) => d.severity === "error").length, warnings: n.diagnostics.filter((d) => d.severity === "warning").length, words: 0, skipped: [] });
  }
  return { files, errors: files.reduce((n, f) => n + f.errors, 0), warnings: files.reduce((n, f) => n + f.warnings, 0), ms: performance.now() - t0, cache: { hits: cache.hits, misses: cache.misses } };
}

export function formatSiteLint(s: SiteLint): string {
  const lines = s.files.filter((f) => f.diagnostics.length).map((f) => f.diagnostics.map((d: Diagnostic) => `${f.file}:${d.line}${d.column ? `:${d.column}` : ""} ${d.severity} [${d.rule}] ${d.message}\n    ↳ ${d.hint}`).join("\n"));
  return `${lines.join("\n")}${lines.length ? "\n" : ""}${s.files.length} files · ${s.errors} errors · ${s.warnings} warnings · ${s.ms.toFixed(0)} ms`;
}
