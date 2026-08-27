/** @snypd/core content pipeline, S5: parse → validate (typed primitive tree + lint). */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { loadConfig, type LoadedConfig } from "../config";
import { MdastCache } from "./cache";
import { lint, type LintOptions, type LintResult } from "./lint";
import type { Diagnostic } from "./tree";

export { parseMarkdown, frontmatterKeyLine, type ParsedDoc } from "./parse";
export { buildTree, checkProp, countNodes, type Block, type PrimitiveTree, type Diagnostic, type Severity } from "./tree";
export { lint, formatLint, SLOP, type LintOptions, type LintResult, type TypeShape } from "./lint";
export { MdastCache, hashSource, type CachedDoc } from "./cache";

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

/** Lint a whole site: routes feed rule 5, the merged type schema feeds rule 0. */
export function lintSite(root: string, opts: { cache?: MdastCache; cfg?: LoadedConfig } = {}): SiteLint {
  const t0 = performance.now();
  const cfg = opts.cfg ?? loadConfig(root);
  const cache = opts.cache ?? new MdastCache();
  const content = listContent(root, cfg);
  const routes = new Set<string>(["/", ...content.map((c) => c.route)]);
  const statuses = Object.keys(cfg.config.statuses);
  const files: LintResult[] = [];
  for (const c of content) {
    const type = cfg.config.types[c.type]!;
    const src = readFileSync(c.file, "utf8");
    const r = lintMarkdown(src, { type: { fields: type.fields as never, taxonomies: type.taxonomies }, statuses, routes, file: relative(root, c.file) }, cache);
    files.push(r);
  }
  return { files, errors: files.reduce((n, f) => n + f.errors, 0), warnings: files.reduce((n, f) => n + f.warnings, 0), ms: performance.now() - t0, cache: { hits: cache.hits, misses: cache.misses } };
}

export function formatSiteLint(s: SiteLint): string {
  const lines = s.files.filter((f) => f.diagnostics.length).map((f) => f.diagnostics.map((d: Diagnostic) => `${f.file}:${d.line}${d.column ? `:${d.column}` : ""} ${d.severity} [${d.rule}] ${d.message}\n    ↳ ${d.hint}`).join("\n"));
  return `${lines.join("\n")}${lines.length ? "\n" : ""}${s.files.length} files · ${s.errors} errors · ${s.warnings} warnings · ${s.ms.toFixed(0)} ms`;
}
