/**
 * The theme contract (docs/04 "theme.yaml"): a directory with `theme.yaml`, `layouts/<name>.tsx` for each
 * declared layout and one `.tsx` per primitive it implements. Components are plain functions returning
 * `Html` (the JSX runtime in ./jsx-runtime) and get props from the spec plus a small ctx — nothing else.
 * `themeHash()` is the "theme module graph" part of every route key: any byte of the theme changes → every
 * route re-renders.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { load as parseYaml } from "js-yaml";
import { primitiveNames } from "@snypd/spec";
import { resolveThemeChain, sha1, type Block, type Config, type LoadedConfig, type ThemeLink } from "@snypd/core";
import { Html, raw } from "./jsx-runtime";

export interface SiteCtx {
  site: { name: string; url: string; description?: string };
  /** Resolved design tokens (theme.yaml defaults ← snypd.yaml overrides), also emitted as CSS vars (tokens.ts). */
  tokens: Record<string, string>;
  theme: { name: string };
  /** Site-relative urls of emitted assets: `css` when the theme has tokens or a stylesheet; feeds always. */
  assets: { css?: string; feed: string; llms: string; api: string };
  config: Config;
}
export interface Entry {
  route: string; type: string; slug: string; title: string;
  date?: string; updated?: string; description?: string; status: string;
  frontmatter: Record<string, unknown>;
}
export interface TermLink { taxonomy: string; term: string; title: string; route: string; description?: string }
export interface Page extends Entry { body: Html; terms: TermLink[]; layout: string; markdownUrl: string; author?: Entry }
export interface PrimitiveProps {
  name: string;
  /** Coerced props from the spec (tree.ts). */
  props: Record<string, unknown>;
  /** The container's markdown children, rendered (nested primitives included). */
  body: Html;
  /** Parsed YAML body for chart / diagram / flow. */
  data?: unknown;
  children: Block[];
  block: Block;
  /** Render one child block on its own. */
  render: (b: Block) => Html;
  ctx: SiteCtx;
  page?: Entry;
}
export type PrimitiveComponent = (p: PrimitiveProps) => Html;
export type LayoutKind = "post" | "page" | "index" | "term" | "author" | (string & {});
export interface LayoutProps {
  ctx: SiteCtx; kind: LayoutKind; route: string; title: string; description?: string;
  /** The content item, for content layouts. */
  page?: Page;
  /** Listed items (index, term, author). */
  entries: Entry[];
  term?: TermLink;
  /** JSON-LD for the page (emit.ts): one or more objects, newline-separated, ready for one <script>. */
  jsonLd?: string;
}
export type LayoutComponent = (p: LayoutProps) => Html;

export interface ThemeYaml { theme?: string; version?: string; spec?: string; extends?: string; layouts?: string[]; primitives?: Record<string, string | { fallback: string }>; personality?: string; tokens?: Record<string, unknown>; /** one stylesheet, relative to the theme dir; emitted as assets/theme.css after the token vars (docs/04) */ css?: string }
/** `own` = this theme's file · `inherited` = an ancestor's (`via` names it) · `fallback` = another primitive's component (`via` names it) · `missing` = the generic wrapper. */
export interface Coverage { name: string; status: "own" | "inherited" | "fallback" | "missing"; via?: string }
export interface Theme {
  name: string; dir: string; hash: string; yaml: ThemeYaml;
  /** This theme and its `extends:` ancestors, child first. `chain[0].dir === dir`. */
  chain: ThemeLink[];
  /** The theme's stylesheet source, if `css:` is declared. */
  css?: string;
  layouts: Record<string, LayoutComponent>;
  primitives: Record<string, PrimitiveComponent>;
  coverage: Coverage[];
}

const walkFiles = (dir: string, fn: (path: string) => void) => {
  for (const f of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (f.name === "node_modules" || f.name.startsWith(".")) continue;
    const p = join(dir, f.name);
    if (f.isDirectory()) walkFiles(p, fn); else fn(p);
  }
};

/**
 * sha1 over every file in the theme dir (path + bytes) — the theme half of the route key. Pass the whole
 * `extends:` chain: a child that inherits a primitive from its parent must re-render when the *parent*
 * changes, so the parent's bytes belong in the key too.
 */
export function themeHash(dir: string | string[]): string {
  const parts: string[] = [];
  for (const d of typeof dir === "string" ? [dir] : dir) walkFiles(d, (p) => parts.push(`${relative(d, p)}:${sha1(readFileSync(p))}`));
  return sha1(parts.join("\n"));
}

/** Cheap change signal (mtime + size of every file) so a rebuild skips re-hashing an untouched theme. */
export function themeStamp(dir: string | string[]): string {
  const parts: string[] = [];
  for (const d of typeof dir === "string" ? [dir] : dir) walkFiles(d, (p) => { const s = statSync(p); parts.push(`${p}:${s.mtimeMs}:${s.size}`); });
  return parts.join("|");
}

/** What the renderer does for a primitive the theme does not implement: a labelled wrapper around the body. */
export const genericPrimitive: PrimitiveComponent = ({ name, body }) => raw(`<div class="snypd-block" data-block="${name}">${body.html}</div>\n`);

const loaded = new Map<string, Theme & { stamp: string }>();

export async function loadTheme(cfg: LoadedConfig): Promise<Theme> {
  const layer = cfg.layers.find((l) => l.name === "theme");
  const name = layer?.from ?? cfg.config.theme.use;
  // The chain is resolved once in loadConfig; re-resolve only for a config that predates it.
  const chain = layer?.chain ?? resolveThemeChain(name, [cfg.root, join(import.meta.dir, "..", "..", "..")]).chain;
  const self = chain[0];
  if (!self || !existsSync(self.dir)) throw new Error(`theme "${name}" not found (theme.use in snypd.yaml; looked in themes/, node_modules/)`);
  const dir = self.dir;
  const dirs = chain.map((c) => c.dir);
  const stamp = themeStamp(dirs);
  const hit = loaded.get(dir);
  if (hit && hit.stamp === stamp) return hit;

  const hash = themeHash(dirs);
  // The module cache is by URL, so a changed theme re-imports its entry files under a new query. Static
  // imports *inside* the theme (`./shell`) still resolve to the cached module: within one process a theme
  // edit is only fully picked up by a fresh process (`snypd build` always is). In-process hot reload of the
  // whole theme graph is part of `snypd serve --preview` (S11) — bundle the theme dir with Bun.build then.
  const bust = `?v=${hash.slice(0, 8)}`;
  const mod = async (p: string) => (await import(resolve(p) + bust)).default as unknown;   // absolute: import() is relative to this module, not cwd

  // One parsed theme.yaml per link, child first. Slots are looked up along this list rather than merged,
  // because `./primitives/callout.tsx` means "relative to the theme that wrote that line" (docs/04).
  const links = chain.map((link) => {
    const f = link.yamlFile ?? join(link.dir, "theme.yaml");
    let y: ThemeYaml = {};
    // js-yaml's own message is the only thing that says *where* in the file; the theme name says which
    // file, which a chain of themes makes ambiguous. Both, or a bare YAMLException reaches the console.
    if (existsSync(f)) try { y = (parseYaml(readFileSync(f, "utf8")) ?? {}) as ThemeYaml; }
      catch (e) { throw new Error(`theme ${link.name}: ${f} is not valid YAML — ${(e as Error).message}`); }
    return { link, yaml: y, map: y.primitives ?? {} };
  });
  const own = links[0]!;

  // The declared shape of the theme, ancestors first so the child wins; arrays replace, maps merge —
  // the same rule the config layer applies to the same file.
  const yaml: ThemeYaml = {};
  for (const { yaml: y } of [...links].reverse()) {
    Object.assign(yaml, y);
    if (y.primitives || yaml.primitives) yaml.primitives = { ...yaml.primitives, ...y.primitives };
    if (y.tokens || yaml.tokens) yaml.tokens = { ...yaml.tokens, ...y.tokens };
  }
  yaml.theme = own.yaml.theme ?? name;
  delete yaml.extends;

  const layouts: Record<string, LayoutComponent> = {};
  for (const l of yaml.layouts ?? []) {
    const found = links.find((x) => existsSync(join(x.link.dir, "layouts", `${l}.tsx`)));
    if (!found) throw new Error(`theme ${name}: layout "${l}" is declared in theme.yaml but layouts/${l}.tsx is missing${chain.length > 1 ? ` in ${chain.map((c) => c.name).join(" or ")}` : ""}`);
    layouts[l] = await mod(join(found.link.dir, "layouts", `${l}.tsx`)) as LayoutComponent;
  }

  // Nearest declarer wins: the first theme in the chain whose map names a file for `n`. A `{ fallback }`
  // entry is followed within that same theme's map first, then on up the chain.
  const declarer = (n: string, seen: string[] = []): { link: ThemeLink; file: string; via?: string } | undefined => {
    if (seen.includes(n)) return undefined;
    for (const x of links) {
      const e = x.map[n];
      if (typeof e === "string") return { link: x.link, file: join(x.link.dir, e) };
      if (e && typeof e.fallback === "string") { const f = declarer(e.fallback, [...seen, n]); return f && { ...f, via: e.fallback }; }
    }
    return undefined;
  };
  const primitives: Record<string, PrimitiveComponent> = {};
  const coverage: Coverage[] = [];
  for (const n of primitiveNames()) {
    const d = declarer(n);
    if (!d) { primitives[n] = genericPrimitive; coverage.push({ name: n, status: "missing" }); continue; }
    primitives[n] = await mod(d.file) as PrimitiveComponent;
    if (d.via) coverage.push({ name: n, status: "fallback", via: d.via });
    else if (d.link.dir !== dir) coverage.push({ name: n, status: "inherited", via: d.link.name });
    else coverage.push({ name: n, status: "own" });
  }

  // Ancestors' stylesheets first, so a child's rules cascade over what it inherits.
  const sheets: string[] = [];
  for (const { link, yaml: y } of [...links].reverse()) {
    if (!y.css) continue;
    const f = join(link.dir, y.css);
    if (!existsSync(f)) throw new Error(`theme ${link.name}: css "${y.css}" is declared in theme.yaml but ${relative(link.dir, f)} is missing`);
    sheets.push(links.length > 1 ? `/* ${link.name} */\n${readFileSync(f, "utf8")}` : readFileSync(f, "utf8"));
  }
  const css = sheets.length ? sheets.join("\n") : undefined;

  const theme = { name, dir, chain, hash, yaml, css, layouts, primitives, coverage, stamp };
  loaded.set(dir, theme);
  return theme;
}

export { Html };
