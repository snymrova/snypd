/**
 * Slots and filters — the hook model (docs/09 §4.4, docs/10 §4.3; P2, decisions 82 and 84).
 *
 * A **slot** is a named place in the output where declared plugins render: `head`, `body-start`,
 * `before-content`, `after-content`, `footer-end`, `body-end`. The theme decides *where* a slot is — its
 * parts and layouts call `slot(ctx, name, …)` — and the plugin decides *what* goes in it. A **filter** is
 * a value on its way past: `title`, `description`, `excerpt`, `entries`, `jsonLd`, `route`, each
 * `(value, ctx) => value`, applied by the build where the value is computed.
 *
 * Four rules, which are the whole of the difference from WordPress:
 *   1. Declared, not registered — a hook exists because a plugin's `snypd.yaml` names a module. There is
 *      no `addFilter()`, no registry, and nothing here can be added at runtime by anything.
 *   2. Ordered by the `plugins:` array. No priorities; to reorder, edit one list.
 *   3. Inspectable — `hooksOf` in `@snypd/core` is the table doctor and `snypd://plugins` print.
 *   4. Free when unused — a site whose plugins decorate nothing gets `EMPTY_HOOKS`: no import, no
 *      bundle, and `slot()` / `applyFilter()` return in one array-length check.
 *
 * A plugin that throws inside a hook, or returns the wrong kind of value from a filter, becomes a
 * diagnostic naming the plugin, the hook and the route — never a crash and never a page missing. The
 * slot renders the other contributors; the filter leaves the value as it was. The build carries the
 * diagnostics out (`BuildResult.hooks`), `snypd build` and `site › build` print them.
 *
 * Modules load through the same seam themes use (decision 83): a plugin on disk is `import()`ed under
 * a hash-busting query, a bundled one comes from the barrel, and `snypd dev` bundles the entries so an
 * edit to a file a hook imports is picked up without a restart — the S11/S13 fix, applied to plugins.
 *
 * P3 (docs/10 §4.4) opens two **stages** the same way, declared under `stages:` in the manifest:
 *   - `transform(root, ctx) → root` runs per document, on the parsed markdown tree after the cache and
 *     before render, with the typed blocks beside it for reading. The tree it is handed is a **copy** — the
 *     mdast cache is shared across routes and builds and a transform that mutated it would run twice on
 *     the next build — and the typed blocks are rebuilt from what it returns, so a directive it touched
 *     is coerced again. Its inputs are in the route key: the plugin's bytes, the site's options and the
 *     site-wide list of terms (`ctx.terms`), so `autolink` re-renders every post when a term is added.
 *   - `emit(ctx) → { path, bytes }[]` runs once per build. **The plugin returns files; core writes them**
 *     (decision 86): a path outside the plugin's declared prefixes (`capabilities.emit`, default
 *     `<name>/`), one a route or artefact already produces, or one another plugin already emitted is a
 *     diagnostic and is not written. Nothing a plugin emits can overwrite a page.
 */
import { resolve, join } from "node:path";
import type { Root } from "mdast";
import { INDEX_DIR, isBundledDir, themeModule, hooksOf, FILTER_NAMES, SLOT_NAMES, type LoadedConfig, type LoadedPlugin, type SlotName, type FilterName, type Config, type Block } from "@snypd/core";
import { Html, raw } from "./jsx-runtime";
import { bundleTheme, themeHash, themeStamp, type SiteCtx, type Entry, type Page, type TermLink } from "./theme";

export type { SlotName, FilterName };

/** What a slot component is handed: the document's place in the site, the item when the route is one, and the plugin's own options. */
export interface SlotProps { ctx: SiteCtx; route: string; title: string; page?: Page; /** the site's validated options for this plugin (`plugins: [{ name: {…} }]`) */ options: Record<string, unknown>; /** the plugin's name, for a `data-` attribute or a comment */ plugin: string }
/**
 * A slot module's default export. `Html` from `@snypd/render`, or a **string, which is markup** — a slot
 * is a place in the document, so a string is not escaped; the author owns it. A string return means a
 * plugin needs neither JSX nor an `@snypd/render` import to fill a slot, which is what keeps a site-local
 * plugin one `.ts` file. `null`/`undefined` renders nothing.
 */
export type SlotComponent = (p: SlotProps) => Html | string | null | undefined;
/** What a filter is handed beside the value: where it is being applied and to what. */
export interface FilterCtx { name: FilterName; route: string; /** the content item, when the value belongs to one (absent for the index and term pages) */ entry?: Entry; options: Record<string, unknown>; plugin: string; site: SiteCtx["site"]; config: Config }
export type FilterFn<T = unknown> = (value: T, ctx: FilterCtx) => T;

/** What a `transform` stage is handed beside the tree (P3): the document's place, its typed blocks (read-only — they are rebuilt from the returned tree), and every term the site uses. */
export interface TransformCtx { route: string; entry: Entry; blocks: Block[]; /** every used term of every taxonomy, sorted, with its route — what `autolink` links to */ terms: TermLink[]; site: SiteCtx["site"]; config: Config; options: Record<string, unknown>; plugin: string }
/** A transform returns the tree (the same object, mutated, or a new one) or nothing, which means "mutated in place". */
export type TransformFn = (root: Root, ctx: TransformCtx) => Root | void | undefined;
/** One file an `emit` stage asks core to write: `dist/`-relative, under one of the plugin's prefixes. */
export interface EmitFile { path: string; bytes: string | Uint8Array }
/** What an `emit` stage is handed (P3): the site, the pages this build produces, and the prefixes it may write under. */
export interface EmitCtx { site: SiteCtx["site"]; config: Config; root: string; /** every route this build renders, with its absolute url */ routes: { route: string; url: string }[]; entries: Entry[]; /** the `dist/`-relative prefixes this plugin declared (or `<name>/`) — anything else is refused */ prefixes: string[]; options: Record<string, unknown>; plugin: string }
export type EmitFn = (ctx: EmitCtx) => EmitFile[] | Promise<EmitFile[]>;

export interface HookDiagnostic { plugin: string; hook: string; route?: string; message: string }
interface Contributor<F> { plugin: string; options: Record<string, unknown>; fn: F; file: string; /** emit only: the prefixes it may write under */ prefixes?: string[] }
export interface Hooks {
  /** Contributors per slot, in `plugins:` order. */
  slots: Record<SlotName, Contributor<SlotComponent>[]>;
  filters: Record<FilterName, Contributor<FilterFn>[]>;
  /** `transform` stages in `plugins:` order (P3); `[]` is free — one length check per document. */
  transforms: Contributor<TransformFn>[];
  /** `emit` stages in `plugins:` order (P3). */
  emits: Contributor<EmitFn>[];
  /** Plugins that fill at least one hook, in order. */
  plugins: string[];
  /** What went wrong in a hook during the last build; the build empties it at the start and carries it out at the end. */
  diagnostics: HookDiagnostic[];
  /** True when nothing is hooked — `slot()` and `applyFilter()` short-circuit on it. */
  empty: boolean;
}

const emptyMap = <K extends string, V>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, [] as V[]])) as Record<K, V[]>;
/** What a site with no decorating plugin gets: nothing to run, nothing to cache, nothing to diagnose. */
export const EMPTY_HOOKS: Hooks = Object.freeze({ slots: emptyMap<SlotName, Contributor<SlotComponent>>(SLOT_NAMES), filters: emptyMap<FilterName, Contributor<FilterFn>>(FILTER_NAMES), transforms: [], emits: [], plugins: [], diagnostics: [], empty: true }) as Hooks;

/** A filter's value kinds — the check that turns a wrong return into a diagnostic instead of a broken page. */
const FILTER_KIND: Record<FilterName, (v: unknown) => boolean> = {
  title: (v) => typeof v === "string",
  description: (v) => typeof v === "string" || v === undefined,
  excerpt: (v) => typeof v === "string",
  entries: (v) => Array.isArray(v),
  jsonLd: (v) => Array.isArray(v),
  route: (v) => typeof v === "string" && v.startsWith("/"),
};

const loaded = new Map<string, Hooks & { stamp: string }>();

export interface LoadHooksOptions {
  /** Bundle the hook modules before importing them, so an edit to a file they import is picked up in-process (`snypd dev`). */
  bundle?: boolean;
}

/**
 * Resolve every declared slot and filter of the loaded plugins into functions, in `plugins:` order.
 * Cached per site root on the plugins' change signal, the way `loadTheme` is; a site with nothing hooked
 * returns `EMPTY_HOOKS` without touching the cache or the disk.
 */
export async function loadHooks(cfg: LoadedConfig, opts: LoadHooksOptions = {}): Promise<Hooks> {
  const plugins = cfg.plugins.filter((p) => p.loaded && p.dir && (Object.keys(p.slots).length || Object.keys(p.filters).length || Object.keys(p.stages).length));
  if (!plugins.length) return EMPTY_HOOKS;
  const dirs = plugins.map((p) => p.dir!);
  const stamp = `${themeStamp(dirs)}|${plugins.map((p) => `${p.name}:${JSON.stringify(p.options)}:${JSON.stringify(p.slots)}:${JSON.stringify(p.filters)}:${JSON.stringify(p.stages)}:${p.emitPrefixes.join()}`).join("|")}`;
  const hit = loaded.get(cfg.root);
  if (hit && hit.stamp === stamp) return hit;

  const hash = themeHash(dirs);
  const bust = `?v=${hash.slice(0, 8)}`;
  let bundled: Map<string, string> | undefined;
  if (opts.bundle) {
    const entries: string[] = [];
    for (const p of plugins) if (!isBundledDir(p.dir!)) for (const f of [...Object.values(p.slots), ...Object.values(p.filters), ...Object.values(p.stages)]) if (f) entries.push(resolve(join(p.dir!, f)));
    if (entries.length) bundled = await bundleTheme(entries, join(cfg.root, INDEX_DIR, "plugins", hash.slice(0, 8)));
  }
  const mod = async (p: LoadedPlugin, rel: string): Promise<unknown> => {
    if (isBundledDir(p.dir!)) return themeModule(p.dir!, rel);
    const abs = resolve(join(p.dir!, rel));
    return (await import((bundled?.get(abs) ?? abs) + bust)).default as unknown;
  };

  const hooks: Hooks & { stamp: string } = { slots: emptyMap(SLOT_NAMES), filters: emptyMap(FILTER_NAMES), transforms: [], emits: [], plugins: plugins.map((p) => p.name), diagnostics: [], empty: false, stamp };
  for (const p of plugins) {
    if (p.stages.transform) {
      const fn = await mod(p, p.stages.transform);
      if (typeof fn !== "function") throw new Error(`plugin ${p.name}: ${p.stages.transform} (stages.transform) does not export a default function`);
      hooks.transforms.push({ plugin: p.name, options: p.options, fn: fn as TransformFn, file: p.stages.transform });
    }
    if (p.stages.emit) {
      const fn = await mod(p, p.stages.emit);
      if (typeof fn !== "function") throw new Error(`plugin ${p.name}: ${p.stages.emit} (stages.emit) does not export a default function`);
      hooks.emits.push({ plugin: p.name, options: p.options, fn: fn as EmitFn, file: p.stages.emit, prefixes: p.emitPrefixes });
    }
    for (const [name, file] of Object.entries(p.slots) as [SlotName, string][]) {
      const fn = await mod(p, file);
      if (typeof fn !== "function") throw new Error(`plugin ${p.name}: ${file} (slots.${name}) does not export a default function`);
      hooks.slots[name].push({ plugin: p.name, options: p.options, fn: fn as SlotComponent, file });
    }
    for (const [name, file] of Object.entries(p.filters) as [FilterName, string][]) {
      const fn = await mod(p, file);
      if (typeof fn !== "function") throw new Error(`plugin ${p.name}: ${file} (filters.${name}) does not export a default function`);
      hooks.filters[name].push({ plugin: p.name, options: p.options, fn: fn as FilterFn, file });
    }
  }
  // The table core prints and the table the renderer runs are the same declaration read twice; this
  // asserts they agree, so `snypd://plugins` can never describe a hook the page does not run.
  const table = hooksOf(cfg.plugins);
  for (const n of SLOT_NAMES) if (hooks.slots[n].map((c) => c.plugin).join() !== table.slots[n].join()) throw new Error(`internal: slot ${n} resolved ${hooks.slots[n].map((c) => c.plugin).join(",")} but the manifest table says ${table.slots[n].join(",")}`);
  loaded.set(cfg.root, hooks);
  return hooks;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0]!;
/**
 * One line per distinct failure. A filter runs wherever its value is read — a title is read by the page,
 * every list that shows it and the surface — so the same broken filter would otherwise say the same thing
 * thirty times a build. It also runs at plan time, so a build that renders nothing still reports a
 * plugin that is still broken: the diagnostic is about the plugin, not about this build's work.
 */
const report = (hooks: Hooks, d: HookDiagnostic) => { if (!hooks.diagnostics.some((x) => x.plugin === d.plugin && x.hook === d.hook && x.route === d.route && x.message === d.message)) hooks.diagnostics.push(d); };

/**
 * Render a slot: every contributor in order, concatenated. A contributor that throws is a diagnostic on
 * `ctx.hooks.diagnostics` naming the plugin, the slot and the route, and the others still render — a
 * broken analytics plugin costs the beacon, not the page.
 */
export function slot(ctx: SiteCtx, name: SlotName, props: Omit<SlotProps, "ctx" | "options" | "plugin">): Html {
  const hooks = ctx.hooks ?? EMPTY_HOOKS;
  const list = hooks.slots[name];
  if (!list || !list.length) return new Html("");
  let out = "";
  for (const c of list) {
    try {
      const v = c.fn({ ctx, ...props, options: c.options, plugin: c.plugin });
      if (v === null || v === undefined) continue;
      out += typeof v === "string" ? v : typeof (v as Html).html === "string" ? (v as Html).html : String(v);
    } catch (e) {
      report(hooks, { plugin: c.plugin, hook: `slots.${name}`, route: props.route, message: message(e) });
    }
  }
  return raw(out);
}
/** `<Slot name="head" ctx={ctx} route={route} title={title} page={page} />` — the JSX form of `slot()`, for a part or a layout. */
export function Slot({ name, ctx, ...props }: { name: SlotName; ctx: SiteCtx } & Omit<SlotProps, "ctx" | "options" | "plugin">): Html {
  return slot(ctx, name, props);
}

/**
 * Run a value through every contributor to a filter, in order. A filter that throws, or returns a value
 * of the wrong kind (a `title` that is not a string, `entries` that is not an array), is a diagnostic
 * naming it, and the value continues as it was — the page is right without the plugin rather than wrong
 * with it. Cheap when nothing is hooked: one lookup and a length check.
 */
export function applyFilter<T>(hooks: Hooks, name: FilterName, value: T, ctx: Omit<FilterCtx, "name" | "options" | "plugin">): T {
  const list = hooks.filters[name];
  if (!list || !list.length) return value;
  let v: unknown = value;
  for (const c of list) {
    try {
      const next = (c.fn as FilterFn<unknown>)(v, { name, ...ctx, options: c.options, plugin: c.plugin });
      if (!FILTER_KIND[name](next)) { report(hooks, { plugin: c.plugin, hook: `filters.${name}`, route: ctx.route, message: `returned ${next === undefined ? "undefined" : Array.isArray(next) ? "an array" : `a ${typeof next}`} where ${name} expects ${name === "entries" || name === "jsonLd" ? "an array" : name === "route" ? "a route starting with /" : "a string"}; value left as it was` }); continue; }
      v = next;
    } catch (e) {
      report(hooks, { plugin: c.plugin, hook: `filters.${name}`, route: ctx.route, message: message(e) });
    }
  }
  return v as T;
}

const isRoot = (v: unknown): v is Root => typeof v === "object" && v !== null && (v as Root).type === "root" && Array.isArray((v as Root).children);

/**
 * Run a document through every `transform` stage, in order (P3, docs/10 §4.4). Each contributor gets its
 * own copy of the tree — the cache's tree is never handed out, and a contributor that throws halfway
 * through mutating leaves no half-transformed tree behind: the copy is dropped and the next contributor
 * starts from the last good one. A return that is not a root is a diagnostic and the tree stands.
 * Free when nothing is declared: one length check, and the cache's own tree comes straight back.
 */
export function applyTransforms(hooks: Hooks, root: Root, ctx: Omit<TransformCtx, "options" | "plugin">): Root {
  if (!hooks.transforms.length) return root;
  let tree = root;
  for (const c of hooks.transforms) {
    const work = structuredClone(tree);
    try {
      const next = c.fn(work, { ...ctx, options: c.options, plugin: c.plugin });
      if (next === undefined || next === null) { tree = work; continue; }
      if (!isRoot(next)) { report(hooks, { plugin: c.plugin, hook: "stages.transform", route: ctx.route, message: `returned ${Array.isArray(next) ? "an array" : `a ${typeof next}`} where transform returns the root (or nothing, having changed it in place); tree left as it was` }); continue; }
      tree = next;
    } catch (e) {
      report(hooks, { plugin: c.plugin, hook: "stages.transform", route: ctx.route, message: message(e) });
    }
  }
  return tree;
}

export interface EmittedFile extends EmitFile { plugin: string }
/**
 * Run every `emit` stage once and hand back the files core may write (P3, decision 86). `claimed` is
 * every `dist/`-relative output the plan already produces — routes, artefacts, media — and grows with
 * each accepted file, so the second plugin to name a path loses it. Every refusal is a diagnostic naming
 * the plugin, the path and the rule; a stage that throws or returns something other than a list emits
 * nothing and says so. Paths are normalised (`./a//b` is `a/b`) and must stay inside `dist/`.
 */
export async function runEmits(hooks: Hooks, ctx: Omit<EmitCtx, "options" | "plugin" | "prefixes">, claimed: Set<string>): Promise<EmittedFile[]> {
  const out: EmittedFile[] = [];
  for (const c of hooks.emits) {
    const prefixes = c.prefixes ?? [`${c.plugin}/`];
    let files: unknown;
    try { files = await c.fn({ ...ctx, options: c.options, plugin: c.plugin, prefixes }); }
    catch (e) { report(hooks, { plugin: c.plugin, hook: "stages.emit", message: message(e) }); continue; }
    if (!Array.isArray(files)) { report(hooks, { plugin: c.plugin, hook: "stages.emit", message: `returned ${files === undefined ? "undefined" : `a ${typeof files}`} where emit returns a list of { path, bytes }; nothing written` }); continue; }
    for (const f of files as unknown[]) {
      const refuse = (why: string, path?: string) => report(hooks, { plugin: c.plugin, hook: "stages.emit", route: path ? `/${path}` : undefined, message: `${path ? `${path}: ` : ""}${why}; not written` });
      if (typeof f !== "object" || f === null || typeof (f as EmitFile).path !== "string") { refuse("an emitted file is { path, bytes }"); continue; }
      const raw = (f as EmitFile).path;
      const bytes = (f as EmitFile).bytes;
      if (typeof bytes !== "string" && !(bytes instanceof Uint8Array)) { refuse("bytes must be a string or a Uint8Array", raw); continue; }
      const path = raw.split("\\").join("/").replace(/^\.?\/+/, "").replace(/\/{2,}/g, "/");
      if (!path || path.endsWith("/") || path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) { refuse("not a file path inside dist/", raw); continue; }
      if (!prefixes.some((p) => path.startsWith(p))) { refuse(`outside the plugin's emit prefix${prefixes.length === 1 ? "" : "es"} ${prefixes.join(", ")} (capabilities.emit in its snypd.yaml)`, path); continue; }
      if (claimed.has(path)) { refuse(out.some((o) => o.path === path) ? "already emitted by an earlier plugin" : "a route or site artefact already produces this file", path); continue; }
      claimed.add(path);
      out.push({ plugin: c.plugin, path, bytes });
    }
  }
  return out;
}
