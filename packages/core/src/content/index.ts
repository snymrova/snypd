/** @snypd/core content pipeline, S5: parse → validate (typed primitive tree + lint). */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { loadConfig, redirects, type LoadedConfig } from "../config";
import { MdastCache } from "./cache";
import { lint, type LintOptions, type LintResult } from "./lint";
import type { Diagnostic } from "./tree";
import { frontmatterKeyLine } from "./parse";
import { taxonomyFields, type Move } from "../store";

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

export interface ContentFile { type: string; slug: string; file: string; route: string }

/** Every content file the merged config's types declare, with its route from the type's urlPattern. */
export function listContent(root: string, cfg: LoadedConfig = loadConfig(root)): ContentFile[] {
  const out: ContentFile[] = [];
  for (const [type, def] of Object.entries(cfg.config.types)) {
    const dir = join(root, def.dir);
    if (!existsSync(dir)) continue;
    const walk = (d: string, prefix: string) => {
      for (const f of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (f.isDirectory()) { if (!f.name.startsWith(".")) walk(join(d, f.name), `${prefix}${f.name}/`); continue; }
        if (!f.name.endsWith(".md")) continue;
        const slug = f.name.slice(0, -3);
        const path = `${prefix}${slug}`;
        const route = def.urlPattern.replace("{slug}", slug).replace("{path}", path).replace(/\/+$/, "") || "/";
        out.push({ type, slug, file: join(d, f.name), route });
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
 */
export function lintSite(root: string, opts: { cache?: MdastCache; cfg?: LoadedConfig; moves?: Move[] } = {}): SiteLint {
  const t0 = performance.now();
  const cfg = opts.cfg ?? loadConfig(root);
  const cache = opts.cache ?? new MdastCache();
  const content = listContent(root, cfg);
  const routes = new Set<string>(["/", ...content.map((c) => c.route)]);
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
    if (mv && !redirected[mv.from]) r.diagnostics.push(D("slug-change", 10, `Route changed from ${mv.from} to ${mv.to}; nothing redirects the old URL`, `Run \`site\` › set_redirect ${mv.from} → ${mv.to} so links to the old URL keep working, or restore \`slug:\` (or the filename)`, frontmatterKeyLine(cached.doc, "slug")));
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
  return { files, errors: files.reduce((n, f) => n + f.errors, 0), warnings: files.reduce((n, f) => n + f.warnings, 0), ms: performance.now() - t0, cache: { hits: cache.hits, misses: cache.misses } };
}

export function formatSiteLint(s: SiteLint): string {
  const lines = s.files.filter((f) => f.diagnostics.length).map((f) => f.diagnostics.map((d: Diagnostic) => `${f.file}:${d.line}${d.column ? `:${d.column}` : ""} ${d.severity} [${d.rule}] ${d.message}\n    ↳ ${d.hint}`).join("\n"));
  return `${lines.join("\n")}${lines.length ? "\n" : ""}${s.files.length} files · ${s.errors} errors · ${s.warnings} warnings · ${s.ms.toFixed(0)} ms`;
}
