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
import { sha1, type Block, type Config, type LoadedConfig } from "@snypd/core";
import { Html, raw } from "./jsx-runtime";

export interface SiteCtx {
  site: { name: string; url: string };
  tokens: Record<string, string | number>;
  theme: { name: string };
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
}
export type LayoutComponent = (p: LayoutProps) => Html;

export interface ThemeYaml { theme?: string; version?: string; spec?: string; extends?: string; layouts?: string[]; primitives?: Record<string, string | { fallback: string }>; personality?: string; tokens?: Record<string, unknown> }
export interface Coverage { name: string; status: "own" | "fallback" | "missing"; via?: string }
export interface Theme {
  name: string; dir: string; hash: string; yaml: ThemeYaml;
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

/** sha1 over every file in the theme dir (path + bytes) — the theme half of the route key. */
export function themeHash(dir: string): string {
  const parts: string[] = [];
  walkFiles(dir, (p) => parts.push(`${relative(dir, p)}:${sha1(readFileSync(p))}`));
  return sha1(parts.join("\n"));
}

/** Cheap change signal (mtime + size of every file) so a rebuild skips re-hashing an untouched theme. */
export function themeStamp(dir: string): string {
  const parts: string[] = [];
  walkFiles(dir, (p) => { const s = statSync(p); parts.push(`${p}:${s.mtimeMs}:${s.size}`); });
  return parts.join("|");
}

/** What the renderer does for a primitive the theme does not implement: a labelled wrapper around the body. */
export const genericPrimitive: PrimitiveComponent = ({ name, body }) => raw(`<div class="snypd-block" data-block="${name}">${body.html}</div>\n`);

const loaded = new Map<string, Theme & { stamp: string }>();

export async function loadTheme(cfg: LoadedConfig): Promise<Theme> {
  const layer = cfg.layers.find((l) => l.name === "theme");
  const dir = layer?.dir;
  const name = layer?.from ?? cfg.config.theme.use;
  if (!dir || !existsSync(dir)) throw new Error(`theme "${name}" not found (theme.use in snypd.yaml; looked in themes/, node_modules/)`);
  const stamp = themeStamp(dir);
  const hit = loaded.get(dir);
  if (hit && hit.stamp === stamp) return hit;

  const yamlFile = join(dir, "theme.yaml");
  const yaml = (existsSync(yamlFile) ? parseYaml(readFileSync(yamlFile, "utf8")) : {}) as ThemeYaml;
  const hash = themeHash(dir);
  // The module cache is by URL, so a changed theme re-imports its entry files under a new query. Static
  // imports *inside* the theme (`./shell`) still resolve to the cached module: within one process a theme
  // edit is only fully picked up by a fresh process (`snypd build` always is). In-process hot reload of the
  // whole theme graph is part of `snypd serve --preview` (S11) — bundle the theme dir with Bun.build then.
  const bust = `?v=${hash.slice(0, 8)}`;
  const mod = async (p: string) => (await import(resolve(p) + bust)).default as unknown;   // absolute: import() is relative to this module, not cwd
  const layouts: Record<string, LayoutComponent> = {};
  for (const l of yaml.layouts ?? []) {
    const f = join(dir, "layouts", `${l}.tsx`);
    if (!existsSync(f)) throw new Error(`theme ${name}: layout "${l}" is declared in theme.yaml but ${relative(dir, f)} is missing`);
    layouts[l] = await mod(f) as LayoutComponent;
  }
  const primitives: Record<string, PrimitiveComponent> = {};
  const coverage: Coverage[] = [];
  const map = yaml.primitives ?? {};
  for (const n of primitiveNames()) {
    const entry = map[n];
    if (typeof entry === "string") { primitives[n] = await mod(join(dir, entry)) as PrimitiveComponent; coverage.push({ name: n, status: "own" }); }
    else if (entry && typeof map[entry.fallback] === "string") { primitives[n] = await mod(join(dir, map[entry.fallback] as string)) as PrimitiveComponent; coverage.push({ name: n, status: "fallback", via: entry.fallback }); }
    else { primitives[n] = genericPrimitive; coverage.push({ name: n, status: "missing" }); }
  }
  const theme = { name, dir, hash, yaml, layouts, primitives, coverage, stamp };
  loaded.set(dir, theme);
  return theme;
}

export { Html };
