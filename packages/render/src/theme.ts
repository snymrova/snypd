/**
 * The theme contract (docs/04 "theme.yaml"): a directory with `theme.yaml`, `layouts/<name>.tsx` for each
 * declared layout and one `.tsx` per primitive it implements. Components are plain functions returning
 * `Html` (the JSX runtime in ./jsx-runtime) and get props from the spec plus a small ctx — nothing else.
 * `themeHash()` is the "theme module graph" part of every route key: any byte of the theme changes → every
 * route re-renders.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { primitiveNames } from "@snypd/spec";
import { resolveThemeChain, sha1, INDEX_DIR, isBundledDir, themeBytes, themeFile, themeFiles, themeHas, themeModule, themeSignature, type Block, type Config, type LoadedConfig, type NavLink, type ThemeLink, type ThemeYaml } from "@snypd/core";
import { Html, raw } from "./jsx-runtime";

export interface SiteCtx {
  site: { name: string; url: string; description?: string; icon?: string; image?: string };
  /** Resolved design tokens (theme.yaml defaults ← snypd.yaml overrides), also emitted as CSS vars (tokens.ts). */
  tokens: Record<string, string>;
  theme: { name: string };
  /** Site-relative urls of emitted assets: `css` when the theme has tokens or a stylesheet; feeds always. */
  assets: { css?: string; feed: string; llms: string; api: string };
  /**
   * Intrinsic size of every file under `content/media/`, keyed by its site-relative url (S13).
   * A primitive that places an image looks its `src` up here and emits `width`/`height`; a miss means
   * an unrecognised format or an external url, and the attributes are omitted rather than guessed.
   */
  media: Record<string, { width: number; height: number }>;
  config: Config;
  /**
   * The theme's parts, resolved up the `extends:` chain like primitives (U1, decision 72). A layout takes
   * `ctx.parts.shell` instead of importing `./shell`, because a relative import resolves against the
   * theme that *wrote* the line — which is exactly what stopped a child theme from changing the header.
   */
  parts: Parts;
  /**
   * The menus, by location, resolved (U2, decision 75): every location the theme declares is a key, and
   * a location with no `content/nav/<location>.yaml` is an empty list. A part reads its menu with
   * `menu(ctx, "header", route)`, which also marks the current item.
   */
  nav: Record<string, NavLink[]>;
}
export interface Entry {
  route: string; type: string; slug: string; title: string;
  date?: string; updated?: string; description?: string; status: string;
  frontmatter: Record<string, unknown>;
}
export interface TermLink { taxonomy: string; term: string; title: string; route: string; description?: string }
/**
 * `cover` is the rendered `::cover` block when the body opens with one, and `body` is then everything
 * after it (S14). The spec calls `cover` "the post header … omit it and the theme renders a cover from
 * frontmatter", so it is the layout's title block and not body flow: handing it to the layout separately
 * is what lets a layout use one or the other, instead of drawing its own header above the author's.
 */
export interface Page extends Entry { body: Html; cover?: Html; terms: TermLink[]; layout: string; markdownUrl: string; author?: Entry }
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

// ── Parts (docs/09 §4.1) ────────────────────────────────────────────────────
/** What the shell is handed: the document's own metadata, plus the item when the route is one. */
export interface ShellProps { ctx: SiteCtx; title: string; description?: string; route: string; markdownUrl?: string; jsonLd?: string; page?: Page; children: Html }
/** `header` and `footer`: where in the site the document is, so a menu can mark the current item (U2). */
export interface PartProps { ctx: SiteCtx; route: string; title: string; page?: Page }
export interface EntriesProps { ctx: SiteCtx; entries: Entry[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PartComponent = (p: any) => Html;
/**
 * The four parts every theme is expected to have, typed; anything else a theme declares is reachable by
 * name. `shell` is the document, `header` and `footer` are what every layout shows around its content,
 * `entries` is the list index, term and author layouts share.
 */
export interface Parts {
  shell: (p: ShellProps) => Html;
  header: (p: PartProps) => Html;
  footer: (p: PartProps) => Html;
  entries: (p: EntriesProps) => Html;
  [name: string]: PartComponent;
}
export const PART_NAMES = ["shell", "header", "footer", "entries"] as const;
/**
 * A part by name, with the failure named: a layout that asks for a part no theme in the chain declares
 * gets the theme and the part in the error, not `undefined is not a function` from inside a render.
 */
export function part<K extends keyof Parts & string>(ctx: SiteCtx, name: K): Parts[K] {
  const c = ctx.parts[name];
  if (!c) throw new Error(`theme ${ctx.theme.name}: part "${name}" is not declared by this theme or any it extends (theme.yaml › parts)`);
  return c as Parts[K];
}
/** One rendered menu item: the link, plus whether this page is the one it points at. */
export interface MenuItem extends NavLink { current: boolean }
/**
 * The menu for a location, with the item that points at `route` marked `current` — so a part writes
 * `aria-current="page"` from one boolean instead of comparing routes. A `url` item is never current, and
 * an undeclared location is an empty menu, not an error: a part that renders `menu(ctx, "footer", …)` in
 * a theme that declares only `header` renders nothing there.
 */
export function menu(ctx: SiteCtx, location: string, route: string): MenuItem[] {
  return (ctx.nav[location] ?? []).map((l) => ({ ...l, current: l.route !== undefined && l.route === route }));
}
/** `<Part name="header" ctx={ctx} … />` — the wrapper form, so a part can nest another without threading props. */
export function Part({ name, ctx, ...props }: { name: string; ctx: SiteCtx } & Record<string, unknown>): Html {
  return part(ctx, name)({ ctx, ...props });
}

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
  /** Per primitive, all 13. */
  coverage: Coverage[];
  parts: Parts;
  /** Per part: the four in `PART_NAMES` first, then anything else the chain declares. `missing` here has no generic — a layout that asks for it throws (see `part`). */
  partCoverage: Coverage[];
}


/**
 * sha1 over every file in the theme dir (path + bytes) — the theme half of the route key. Pass the whole
 * `extends:` chain: a child that inherits a primitive from its parent must re-render when the *parent*
 * changes, so the parent's bytes belong in the key too.
 */
export function themeHash(dir: string | string[]): string {
  const parts: string[] = [];
  for (const d of typeof dir === "string" ? [dir] : dir) {
    // A bundled theme with no directory hashes to the sha1 taken when the barrel was generated: its
    // bytes are in the binary and cannot move, so there is nothing to re-read (decision 46).
    if (isBundledDir(d)) { parts.push(themeSignature(d)); continue; }
    for (const r of themeFiles(d)) parts.push(`${r}:${sha1(themeBytes(d, r)!)}`);
  }
  return sha1(parts.join("\n"));
}

/** Cheap change signal (mtime + size of every file) so a rebuild skips re-hashing an untouched theme. */
export function themeStamp(dir: string | string[]): string {
  return (typeof dir === "string" ? [dir] : dir).map(themeSignature).join("|");
}

/** What the renderer does for a primitive the theme does not implement: a labelled wrapper around the body. */
export const genericPrimitive: PrimitiveComponent = ({ name, body }) => raw(`<div class="snypd-block" data-block="${name}">${body.html}</div>\n`);

const loaded = new Map<string, Theme & { stamp: string }>();

/**
 * What a bundled theme must *not* carry a second copy of. `Html` is a class, and a layout that returns an
 * instance of a differently-bundled `Html` is not the `Html` the renderer will accept — so every `@snypd/*`
 * import, the JSX runtime above all, resolves to the running process's copy.
 */
const THEME_EXTERNAL = ["@snypd/*"];

/**
 * Point a bundle's `@snypd/*` imports at the copy *this process* is running.
 *
 * `external` keeps the specifier bare, and a bare specifier resolves by walking up from the file that
 * wrote it — which is the site's `.snypd/`, not the snypd installation. Inside this monorepo that walk
 * happens to reach `node_modules/@snypd`; in any site a user actually has, it reaches nothing, and the
 * preview server fails with `Cannot find package '@snypd/render'`. The bundle was correct and unloadable.
 *
 * So the specifiers are rewritten to what `import.meta.resolve` gives *here*, which is the definition of
 * "the running process's copy" the comment above has always claimed. Same path in, same module out of
 * Bun's cache, so the `Html` identity that paragraph is about is preserved by construction rather than by
 * the site's position on disk. It also survives `bun build --compile` (S18): inside a binary the resolved
 * path is the embedded module, which is still the right answer and still the only one.
 */
function pinExternals(code: string): string {
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*)(["'])(@snypd\/[^"']+)\2/g, (m, kw: string, _q, spec: string) => {
    let resolved: string;
    try { resolved = import.meta.resolve(spec); } catch { return m; }   // unresolvable: leave it, fail loudly at import
    return `${kw}${JSON.stringify(resolved.startsWith("file://") ? fileURLToPath(resolved) : resolved)}`;
  });
}

/**
 * Rebuild the theme's entry files into one-file bundles so an in-process reload actually reloads (S11 debt,
 * scheduled for S13). Busting the import URL re-imports the entry, but a file the entry imports *statically*
 * — `./shell`, `./entries` — is still served from Bun's module cache, so a theme edit could re-render every
 * route with the old component and say nothing. A bundle has no static imports left to cache: `Bun.build`
 * inlines the theme's own graph and leaves `@snypd/*` external, and the output path carries the theme hash,
 * so a changed theme is a different module URL all the way down.
 * Only the preview server (`snypd dev`) asks for this. `snypd build` is one process per run and never needs it.
 */
async function bundleTheme(files: string[], outRoot: string): Promise<Map<string, string>> {
  mkdirSync(outRoot, { recursive: true });
  const out = new Map<string, string>();
  await Promise.all(files.map(async (f) => {
    // One build per entry into its own directory: two themes in a chain can both declare `cover.tsx`, and
    // a shared outdir would have them overwrite each other under the same `[name]`.
    const dir = join(outRoot, sha1(f).slice(0, 12));
    const r = await Bun.build({ entrypoints: [f], outdir: dir, target: "bun", external: THEME_EXTERNAL, naming: "[name].[ext]", throw: false });
    if (!r.success) throw new Error(`theme bundle failed for ${f}:\n${r.logs.map(String).join("\n")}`);
    const path = r.outputs[0]!.path;
    writeFileSync(path, pinExternals(await r.outputs[0]!.text()));
    out.set(f, path);
  }));
  return out;
}

export interface LoadThemeOptions {
  /**
   * Bundle the theme's entry files before importing them, so an edit to a file the entries import
   * statically is picked up without restarting the process. `snypd dev` sets it; a one-shot
   * `snypd build` does not, and pays nothing.
   */
  bundle?: boolean;
}

export async function loadTheme(cfg: LoadedConfig, opts: LoadThemeOptions = {}): Promise<Theme> {
  const layer = cfg.layers.find((l) => l.name === "theme");
  const name = layer?.from ?? cfg.config.theme.use;
  // The chain is resolved once in loadConfig; re-resolve only for a config that predates it.
  const chain = layer?.chain ?? resolveThemeChain(name, [cfg.root, join(import.meta.dir, "..", "..", "..")]).chain;
  const self = chain[0];
  // `themeHas` rather than `existsSync`: a bundled theme in a compiled binary has no directory to stat,
  // and `existsSync` on its marker dir reports a theme that is present as missing (decision 46).
  if (!self || !themeHas(self.dir, "theme.yaml")) throw new Error(`theme "${name}" not found (theme.use in snypd.yaml; looked in themes/, node_modules/, and the themes bundled in this build)`);
  const dir = self.dir;
  const dirs = chain.map((c) => c.dir);
  const stamp = themeStamp(dirs);
  const hit = loaded.get(dir);
  if (hit && hit.stamp === stamp) return hit;

  const hash = themeHash(dirs);
  // The module cache is by URL, so a changed theme re-imports its entry files under a new query. Static
  // imports *inside* the theme (`./shell`) still resolve to the cached module: within one process a theme
  // edit is only fully picked up by a fresh process (`snypd build` always is). In-process hot reload of the
  // whole theme graph is part of `snypd dev` (S11) — bundle the theme dir with Bun.build then.
  const bust = `?v=${hash.slice(0, 8)}`;
  let bundled: Map<string, string> | undefined;
  // `p` is theme-relative and carries the link it came from, because a chain resolves each slot against
  // *that* theme's dir. On disk this is `import(abs + bust)` as it always was; for a bundled theme with
  // no directory it is the barrel's lazy thunk (decision 46).
  const mod = async (link: ThemeLink, rel: string) => {
    if (isBundledDir(link.dir)) return themeModule(link.dir, rel);
    const abs = resolve(join(link.dir, rel));
    return (await import((bundled?.get(abs) ?? abs) + bust)).default as unknown;   // absolute: import() is relative to this module, not cwd
  };

  // One parsed theme.yaml per link, child first. Slots are looked up along this list rather than merged,
  // because `./primitives/callout.tsx` means "relative to the theme that wrote that line" (docs/04).
  const links = chain.map((link) => {
    const f = link.yamlFile ?? join(link.dir, "theme.yaml");
    let y: ThemeYaml = {};
    // js-yaml's own message is the only thing that says *where* in the file; the theme name says which
    // file, which a chain of themes makes ambiguous. Both, or a bare YAMLException reaches the console.
    const src = themeFile(link.dir, "theme.yaml");
    if (src !== undefined) try { y = (parseYaml(src) ?? {}) as ThemeYaml; }
      catch (e) { throw new Error(`theme ${link.name}: ${f} is not valid YAML — ${(e as Error).message}`); }
    return { link, yaml: y, map: y.primitives ?? {}, parts: y.parts ?? {} };
  });
  const own = links[0]!;

  // The declared shape of the theme, ancestors first so the child wins; arrays replace, maps merge —
  // the same rule the config layer applies to the same file.
  const yaml: ThemeYaml = {};
  for (const { yaml: y } of [...links].reverse()) {
    Object.assign(yaml, y);
    if (y.primitives || yaml.primitives) yaml.primitives = { ...yaml.primitives, ...y.primitives };
    if (y.parts || yaml.parts) yaml.parts = { ...yaml.parts, ...y.parts };
    if (y.tokens || yaml.tokens) yaml.tokens = { ...yaml.tokens, ...y.tokens };
  }
  yaml.theme = own.yaml.theme ?? name;
  delete yaml.extends;

  if (opts.bundle) {
    // Everything the chain could import as an entry. Bundling the whole set once is cheaper than working
    // out which of them the declarations below will reach, and a theme dir is a handful of files.
    // Bundled themes with no directory are skipped: their modules are already single units inside the
    // binary, and there is no file for `Bun.build` to read or for an edit to arrive in.
    const entries: string[] = [];
    for (const d of dirs) if (!isBundledDir(d)) for (const r of themeFiles(d)) if (r.endsWith(".tsx") || r.endsWith(".ts")) entries.push(resolve(join(d, r)));
    const outRoot = join(cfg.root, INDEX_DIR, "theme", hash.slice(0, 8));
    const parent = join(cfg.root, INDEX_DIR, "theme");
    if (existsSync(parent)) for (const old of readdirSync(parent)) if (old !== hash.slice(0, 8)) rmSync(join(parent, old), { recursive: true, force: true });
    bundled = await bundleTheme(entries, outRoot);
  }

  const layouts: Record<string, LayoutComponent> = {};
  for (const l of yaml.layouts ?? []) {
    const found = links.find((x) => themeHas(x.link.dir, `layouts/${l}.tsx`));
    if (!found) throw new Error(`theme ${name}: layout "${l}" is declared in theme.yaml but layouts/${l}.tsx is missing${chain.length > 1 ? ` in ${chain.map((c) => c.name).join(" or ")}` : ""}`);
    layouts[l] = await mod(found.link, `layouts/${l}.tsx`) as LayoutComponent;
  }

  // Nearest declarer wins: the first theme in the chain whose map names a file for `n`. A `{ fallback }`
  // entry is followed within that same theme's map first, then on up the chain.
  // `file` is relative to `link.dir` — the theme that wrote the line — and stays relative, because a
  // bundled theme has no directory to join it onto (decision 46).
  // The same walk serves primitives and parts (decision 72): a part is a slot with a name, resolved
  // against the dir of the theme that declared it, and `coverage` says the same four words about it.
  const declarer = (map: "map" | "parts", n: string, seen: string[] = []): { link: ThemeLink; file: string; via?: string } | undefined => {
    if (seen.includes(n)) return undefined;
    for (const x of links) {
      const e = x[map][n];
      if (typeof e === "string") return { link: x.link, file: e.replace(/^\.\//, "") };
      if (e && typeof e.fallback === "string") { const f = declarer(map, e.fallback, [...seen, n]); return f && { ...f, via: e.fallback }; }
    }
    return undefined;
  };
  const cover = (n: string, d: NonNullable<ReturnType<typeof declarer>>): Coverage =>
    d.via ? { name: n, status: "fallback", via: d.via } : d.link.dir !== dir ? { name: n, status: "inherited", via: d.link.name } : { name: n, status: "own" };
  const primitives: Record<string, PrimitiveComponent> = {};
  const coverage: Coverage[] = [];
  for (const n of primitiveNames()) {
    const d = declarer("map", n);
    if (!d) { primitives[n] = genericPrimitive; coverage.push({ name: n, status: "missing" }); continue; }
    primitives[n] = await mod(d.link, d.file) as PrimitiveComponent;
    coverage.push(cover(n, d));
  }
  const parts = {} as Parts;
  const partCoverage: Coverage[] = [];
  const declaredParts = [...new Set<string>([...PART_NAMES, ...links.flatMap((x) => Object.keys(x.parts))])];
  for (const n of declaredParts) {
    const d = declarer("parts", n);
    if (!d) { partCoverage.push({ name: n, status: "missing" }); continue; }
    if (!themeHas(d.link.dir, d.file)) throw new Error(`theme ${d.link.name}: part "${n}" is declared in theme.yaml but ${d.file} is missing`);
    parts[n] = await mod(d.link, d.file) as PartComponent;
    partCoverage.push(cover(n, d));
  }

  // Ancestors' stylesheets first, so a child's rules cascade over what it inherits.
  const sheets: string[] = [];
  for (const { link, yaml: y } of [...links].reverse()) {
    if (!y.css) continue;
    const src = themeFile(link.dir, y.css);
    if (src === undefined) throw new Error(`theme ${link.name}: css "${y.css}" is declared in theme.yaml but ${y.css} is missing`);
    sheets.push(links.length > 1 ? `/* ${link.name} */\n${src}` : src);
  }
  const css = sheets.length ? sheets.join("\n") : undefined;

  const theme = { name, dir, chain, hash, yaml, css, layouts, primitives, coverage, parts, partCoverage, stamp };
  loaded.set(dir, theme);
  return theme;
}

export { Html };
