/**
 * Menus are files (docs/09 §4.3, decision 75). `content/nav/<location>.yaml` is a YAML list, one file per
 * location the theme declares in `theme.yaml › locations`, and it is *content* the way WordPress's menus
 * never were: in git, portable between themes, written by `site` › set_nav and by nobody else.
 *
 *   - { label: Posts,  ref: /posts }            # a route, checked against the site
 *   - { label: About,  ref: page/about }        # type/slug, resolved through the content list
 *   - { label: GitHub, url: https://…, rel: external }   # verbatim, never checked
 *
 * `ref` resolves to a route at build time, so a slug change moves the menu with it; a `ref` that resolves
 * to nothing is lint rule 5 (`dead-internal-link`) with a new source — the vocabulary of failures stays
 * small. There is no `nav` content type: a list needs no frontmatter, no status machine and no route.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig, normalizeRoute, redirects, type LoadedConfig } from "./config";
import { listContent, type ContentFile } from "./content";
import type { Diagnostic } from "./content/tree";
import { readFrontmatter, sha1, taxonomyFields, type Move } from "./store";
import { WriteError } from "./write";
import { parseYaml, pathKey } from "./yaml";

export const NAV_DIR = "content/nav";

/** One menu item as written. Exactly one of `ref` (resolved) or `url` (verbatim). */
export const NavItemSchema = z.object({
  label: z.string().min(1),
  ref: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  rel: z.string().min(1).optional(),
}).strict().refine((i) => (i.ref ? 1 : 0) + (i.url ? 1 : 0) === 1, { message: "an item has exactly one of `ref` (a route or type/slug) or `url` (verbatim)" });
export const NavFileSchema = z.array(NavItemSchema);
export type NavItem = z.infer<typeof NavItemSchema>;

/** What a part renders: `href` is the route with the trailing slash every emitted link carries, or the url as written. */
export interface NavLink { label: string; href: string; rel?: string; /** the resolved route, for a `ref` item; absent for `url` */ route?: string }

export interface NavFile {
  location: string;
  /** root-relative, `content/nav/<location>.yaml` */
  file: string;
  /** the file is on disk */
  exists: boolean;
  /** the active theme declares this location */
  declared: boolean;
  items: NavItem[];
  /** shape and location problems; dead refs come from `lintNav`, which has the routes */
  diagnostics: Diagnostic[];
  /** line of item `i` (`ref` key where there is one), for diagnostics */
  lines: number[];
}

/** The locations the active theme chain declares (`theme.yaml › locations`). Arrays append up the chain (merge.ts), so a child inherits its parent's and adds its own; restating one is harmless. */
export function navLocations(cfg: LoadedConfig): string[] {
  const v = (cfg.config.theme as Record<string, unknown>).locations;
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
}

/** Locations that have a file on disk, declared or not. */
export function navFiles(root: string): string[] {
  const dir = join(root, NAV_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".yaml") && !f.startsWith(".")).map((f) => f.slice(0, -5)).sort();
}

const D = (rule: string, n: number, severity: Diagnostic["severity"], message: string, hint: string, line: number): Diagnostic => ({ rule, n, severity, message, hint, line });

/** Read and validate one location's file. A missing file is an empty menu, not an error: a declared location with nothing in it renders nothing. */
export function loadNav(root: string, location: string, cfg: LoadedConfig = loadConfig(root)): NavFile {
  const file = `${NAV_DIR}/${location}.yaml`;
  const declared = navLocations(cfg).includes(location);
  const abs = join(root, file);
  const out: NavFile = { location, file, exists: existsSync(abs), declared, items: [], diagnostics: [], lines: [] };
  if (!declared) out.diagnostics.push(D("nav-location", 12, "warning", `\`${location}\` is not a nav location theme \`${cfg.config.theme.use}\` declares`, `Declared: ${navLocations(cfg).map((l) => `\`${l}\``).join(", ") || "none"} (theme.yaml › locations). The file is ignored until a theme declares it`, 1));
  if (!out.exists) return out;
  const p = parseYaml(readFileSync(abs, "utf8"), file);
  for (const w of p.warnings) out.diagnostics.push(D("nav-location", 12, "error", w.replace(/^[^:]+:\d+: /, ""), "Fix the YAML; the file is a list of `{ label, ref | url, rel? }` items", Number(/:(\d+):/.exec(w)?.[1] ?? 1)));
  const value = p.value === null || p.value === undefined ? [] : p.value;
  const r = NavFileSchema.safeParse(value);
  const lineOf = (i: number) => p.origins.get(pathKey([i, "ref"]))?.line ?? p.origins.get(pathKey([i]))?.line ?? 1;
  if (!r.success) {
    if (!Array.isArray(value)) out.diagnostics.push(D("nav-location", 12, "error", `${file} is not a list`, "A nav file is a YAML list of `{ label, ref | url, rel? }` items", 1));
    else for (const i of r.error.issues) {
      const idx = typeof i.path[0] === "number" ? i.path[0] : 0;
      const at = i.path.slice(1).map(String).join(".");
      out.diagnostics.push(D("nav-location", 12, "error", `item ${idx + 1}${at ? ` \`${at}\`` : ""}: ${i.message}`, "Each item is `{ label, ref | url, rel? }` — `ref` is a route (`/about`) or `type/slug` (`page/about`); `url` is used verbatim", lineOf(idx)));
    }
    return out;
  }
  out.items = r.data;
  out.lines = r.data.map((_, i) => lineOf(i));
  return out;
}

/**
 * The term pages a site has: every term any item's frontmatter names, through the taxonomy's url pattern
 * — which is how `build()` decides them, so a menu can link a category the way a post's footer does.
 */
export function termRoutes(cfg: LoadedConfig, entries: { type: string; frontmatter: Record<string, unknown> }[]): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    const type = cfg.config.types[e.type];
    if (!type) continue;
    for (const [taxonomy, field] of Object.entries(taxonomyFields(type))) {
      const pattern = cfg.config.taxonomies[taxonomy]?.urlPattern ?? `/${taxonomy}/{term}`;
      const v = e.frontmatter[field];
      for (const t of Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]) out.add(pattern.replace("{term}", String(t)));
    }
  }
  return [...out];
}

/**
 * Where a `ref` can land: every route — items, term pages, the index — and every item by `type/slug`
 * (hierarchical pages by `type/path`). `aliases` are the routes that moved: `site.redirects` from the
 * config and, when the caller has the index, its move log — so a menu written as `ref: /about` keeps
 * working after the page becomes `/about-us` and a redirect covers it, which is the same rule 10 applies
 * to a body link. The filename is the slug in this product (write.ts), so a `type/slug` ref names the
 * file: it follows a url-pattern change, and a renamed file is a dead ref that lint names.
 */
export interface RouteLookup { routes: Set<string>; byPath: Map<string, string>; aliases: Map<string, string> }
export function routeLookup(root: string, cfg: LoadedConfig, content: ContentFile[] = listContent(root, cfg),
  // Callers that already parsed every file (lint, build) pass the term routes; the write path reads the frontmatter itself.
  terms: Iterable<string> = termRoutes(cfg, content.map((c) => ({ type: c.type, frontmatter: readFrontmatter(readFileSync(c.file, "utf8")) }))),
  moves: Move[] = [],
): RouteLookup {
  const routes = new Set<string>(["/", ...content.map((c) => c.route), ...terms]);
  const byPath = new Map<string, string>();
  for (const c of content) { byPath.set(`${c.type}/${c.path}`, c.route); if (c.path !== c.slug) byPath.set(`${c.type}/${c.slug}`, c.route); }
  const aliases = new Map<string, string>(Object.entries(redirects(cfg)));
  for (const m of moves) if (!aliases.has(m.from)) aliases.set(m.from, m.to);
  return { routes, byPath, aliases };
}

/** `/about` → the route if the site has it, or the route it moved to; `page/about` → that item's route; otherwise undefined. */
export function resolveRef(ref: string, lookup: RouteLookup): string | undefined {
  if (!ref.startsWith("/")) return lookup.byPath.get(ref.replace(/^\/+|\/+$/g, ""));
  let r = normalizeRoute(ref);
  for (let hop = 0; hop < 10; hop++) {
    if (lookup.routes.has(r)) return r;
    const next = lookup.aliases.get(r);
    if (next === undefined) return undefined;
    r = normalizeRoute(next);
  }
  return undefined;
}

export const hrefOf = (route: string) => (route === "/" ? "/" : `${route}/`);

/** One item as a one-line flow map — `{ label: "Posts", ref: "/posts" }` — which is how the file reads best and what docs/09 §4.3 shows. JSON strings are valid YAML double-quoted scalars. */
const flow = (item: NavItem) => `{ ${(["label", "ref", "url", "rel"] as const).filter((k) => item[k] !== undefined).map((k) => `${k}: ${JSON.stringify(item[k])}`).join(", ")} }`;

/** Items → links. A dead `ref` is left out (lint names it); a `url` is passed through untouched. */
export function resolveNav(items: NavItem[], lookup: RouteLookup): { links: NavLink[]; dead: { index: number; item: NavItem }[] } {
  const links: NavLink[] = [], dead: { index: number; item: NavItem }[] = [];
  items.forEach((item, index) => {
    if (item.url) { links.push({ label: item.label, href: item.url, rel: item.rel }); return; }
    const route = resolveRef(item.ref!, lookup);
    if (route === undefined) { dead.push({ index, item }); return; }
    links.push({ label: item.label, href: hrefOf(route), rel: item.rel, route });
  });
  return { links, dead };
}

export interface SiteNav {
  /** location → links, for every declared location (empty where there is no file) */
  nav: Record<string, NavLink[]>;
  files: NavFile[];
  /** sha1 over the resolved menus: part of the route key, so a menu edit — or a slug change that moves an item — re-renders every page (docs/09 U2 exit) */
  hash: string;
}

/** Every declared location, loaded and resolved — what `build()` puts on `ctx.nav`. */
export function siteNav(root: string, cfg: LoadedConfig, lookup: RouteLookup = routeLookup(root, cfg)): SiteNav {
  const nav: Record<string, NavLink[]> = {};
  const files: NavFile[] = [];
  for (const location of navLocations(cfg)) {
    const f = loadNav(root, location, cfg);
    files.push(f);
    nav[location] = resolveNav(f.items, lookup).links;
  }
  return { nav, files, hash: sha1(JSON.stringify(nav)) };
}

/**
 * Lint every nav file on disk — declared or not — as `lintSite` does content: one result per file, rule 5
 * for a `ref` that resolves to nothing, rule 12 for a location the theme does not declare or an item that
 * is not `{ label, ref | url }`.
 */
export function lintNav(root: string, cfg: LoadedConfig, lookup: RouteLookup): { file: string; diagnostics: Diagnostic[] }[] {
  return navFiles(root).map((location) => {
    const f = loadNav(root, location, cfg);
    const diagnostics = [...f.diagnostics];
    for (const { index, item } of resolveNav(f.items, lookup).dead)
      diagnostics.push(D("dead-internal-link", 5, "error", `Menu item \`${item.label}\` → \`${item.ref}\` resolves to no route`, "A `ref` is a route the site has (`/about`) or `type/slug` (`page/about`); check the slug, or use `url:` for a page that is not on this site", f.lines[index] ?? 1));
    diagnostics.sort((a, b) => a.line - b.line || a.n - b.n);
    for (const d of diagnostics) d.file = f.file;
    return { file: f.file, diagnostics };
  });
}

export interface NavWrite { location: string; file: string; paths: string[]; items: NavItem[]; links: NavLink[] }

/**
 * Write one location's menu, or remove it with `null`. Refused before anything touches disk when the
 * theme does not declare the location, an item is not `{ label, ref | url }`, or a `ref` resolves to no
 * route — a menu with a dead link is exactly what the write path exists to stop, and the agent that asked
 * can fix the slug in the same turn. Writing the value the file already holds is a no-op with no paths.
 */
export function setNav(root: string, location: string, items: unknown[] | null): NavWrite {
  const cfg = loadConfig(root);
  if (!cfg.ok) throw new WriteError("the site's configuration does not load", "Run `site` › doctor; a nav file cannot be checked against a site that does not load.");
  if (!/^[a-z][a-z0-9-]*$/i.test(location)) throw new WriteError(`"${location}" is not a location name`, "Letters, digits and dashes — the names theme.yaml › locations declares.");
  const declared = navLocations(cfg);
  if (!declared.includes(location)) throw new WriteError(`theme \`${cfg.config.theme.use}\` declares no nav location \`${location}\``, declared.length ? `It declares ${declared.map((l) => `\`${l}\``).join(" and ")}. A theme adds one with \`locations:\` in theme.yaml and a part that renders it.` : "It declares none: add `locations: [header, footer]` to theme.yaml and render `menu(ctx, \"header\", route)` in a part.");
  const file = `${NAV_DIR}/${location}.yaml`;
  const abs = join(root, file);
  if (items === null) {
    if (!existsSync(abs)) return { location, file, paths: [], items: [], links: [] };
    unlinkSync(abs);
    return { location, file, paths: [file], items: [], links: [] };
  }
  const r = NavFileSchema.safeParse(items);
  if (!r.success) throw new WriteError(`the ${location} menu does not validate — ${r.error.issues.map((i) => `item ${typeof i.path[0] === "number" ? i.path[0] + 1 : "?"}${i.path.length > 1 ? ` \`${i.path.slice(1).join(".")}\`` : ""}: ${i.message}`).join("; ")}`, "Each item is `{ label, ref | url, rel? }` — `ref` is a route (`/about`) or type/slug (`page/about`); `url` is used verbatim.");
  const lookup = routeLookup(root, cfg);
  const { links, dead } = resolveNav(r.data, lookup);
  if (dead.length) throw new WriteError(`${dead.length} menu item${dead.length === 1 ? "" : "s"} point${dead.length === 1 ? "s" : ""} at no route: ${dead.map(({ item }) => `\`${item.label}\` → \`${item.ref}\``).join(", ")}`, "A `ref` is a route the site has (`/about`) or `type/slug` (`page/about`); content.query lists what exists. Use `url:` for a link off this site.");
  const before = existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
  const after = `# The ${location} menu (docs/09 §4.3). \`ref\` is a route or type/slug, resolved at build; \`url\` is verbatim.\n${r.data.map((i) => `- ${flow(i)}\n`).join("")}`;
  if (before === after) return { location, file, paths: [], items: r.data, links };
  mkdirSync(join(root, NAV_DIR), { recursive: true });
  writeFileSync(abs, after);
  return { location, file, paths: [file], items: r.data, links };
}

/** The text of `snypd://nav`: what is declared, what each file holds, and what each `ref` resolved to. */
export function renderNav(root: string, cfg: LoadedConfig): string {
  const declared = navLocations(cfg);
  const lookup = routeLookup(root, cfg);
  const lines: string[] = [];
  lines.push(`# Menus of theme \`${cfg.config.theme.use}\` — one file per location under ${NAV_DIR}/, written with \`site\` › set_nav.`);
  lines.push(`# A \`ref\` is a route (\`/about\`) or type/slug (\`page/about\`) and resolves at build, so a slug change moves the menu; a \`url\` is verbatim.`);
  lines.push(`locations: [${declared.join(", ")}]${declared.length ? "" : "   # the theme declares none; nothing here is rendered"}`);
  const onDisk = navFiles(root);
  for (const location of [...declared, ...onDisk.filter((l) => !declared.includes(l))]) {
    const f = loadNav(root, location, cfg);
    if (!f.declared) { lines.push(`${location}:   # ${f.file} exists but the theme does not declare this location — ignored`); continue; }
    if (!f.exists) { lines.push(`${location}: []   # no ${f.file} yet`); continue; }
    if (f.diagnostics.some((d) => d.severity === "error")) { lines.push(`${location}:   # ${f.file} does not validate — snypd://lint or \`site\` › doctor says where`); continue; }
    if (!f.items.length) { lines.push(`${location}: []   # ${f.file} is empty`); continue; }
    lines.push(`${location}:`);
    f.items.forEach((item) => {
      const route = item.ref ? resolveRef(item.ref, lookup) : undefined;
      const note = item.url ? "" : route === undefined ? "   # dead: resolves to no route" : `   # → ${hrefOf(route)}`;
      lines.push(`  - ${flow(item)}${note}`);
    });
  }
  return `${lines.join("\n")}\n`;
}
