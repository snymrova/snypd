/**
 * The plugin loader (docs/10 §4.1, decisions 81–83, 95).
 *
 * A plugin is a directory with a `snypd.yaml`. Everything at the root of that file merges into the site's
 * config exactly as it has since S4 (types, taxonomies, fieldTypes, jobs, bench — `# ← plugin:<name>` in
 * `snypd://config`). Everything the plugin says *about itself* lives under one key, `plugin:`, which this
 * file reads and never merges. One rule, no exceptions: an author can tell at a glance which half of the
 * file changes the site and which half is about them.
 *
 * What is enforced here, each one a test in core.test.ts:
 *   - `api:` is checked before anything else is read; a manifest for a contract this binary does not
 *     speak is refused with the version it wanted, and its root keys are not merged either.
 *   - the manifest is strict Zod with file:line, the treatment snypd.yaml and theme.yaml have.
 *   - the site's options are validated against the plugin's own JSON Schema, and a failure is attributed
 *     to the site's line and the plugin's key: `plugins[analytics].provider: …`. A plugin with bad options
 *     is not loaded; the rest of the site is.
 *   - resolution mirrors themes: `plugins/<name>` in the site first, then `node_modules/snypd-plugin-<name>`,
 *     `node_modules/<name>`, then the set bundled in the binary — one loader, so a third-party plugin
 *     is never second-class.
 *
 * Since P2 (docs/10 §4.3, §4.6) two more things are enforced here:
 *   - every `slots` and `filters` module the manifest names must exist in the plugin's directory, or the
 *     plugin is refused — a missing hook file is found at load, not at the first render.
 *   - `capabilities.client` is summed, in `plugins:` order, against the site's `bench.budgets.jsKb`; the
 *     plugin that takes the sum over the budget is refused with the remedy in the diagnostic (decision 84).
 *     The budget is the *site's* number — a plugin's own root `bench:` keys cannot raise it for itself.
 * Since P3 (docs/10 §4.4, §4.5, §4.7) the same existence check covers `stages` and `events` modules, and
 * the loader reads what the two enforced capabilities say: `network` (the hosts an event handler's
 * `ctx.fetch` may reach) and `emit` (the `dist/` prefixes an `emit` stage may write under — the plugin's
 * own name when it says nothing). Tiers 1 and 2 run in `@snypd/render` (hooks.ts), tier 3 in `events.ts`
 * here. The keys of tier 4 (`tools`, `prompts`) parse and warn that they are not built, naming P4.
 */
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import type { Diagnostic } from "./config";
import { describeSource, type Layer, type Source } from "./merge";
import { clientKbOf, FILTER_NAMES, PLUGIN_API, PLUGIN_UNBUILT_KEYS, PluginManifestSchema, SLOT_NAMES, type PluginManifest } from "./schema";
import { bundledPluginDir, bundledPluginNames, isBundledDir, themeFile, themeHas, themeModule, themeSignature } from "./themefs";
import { parseYaml, pathKey, type Origin, type Path } from "./yaml";

/** Where a plugin was found. `site` is the unpublished local plugin (WordPress's mu-plugins without the folklore). */
export type PluginSource = "site" | "node_modules" | "workspace" | "bundled";
/** The five kinds of thing a plugin can be (docs/10 §4.2), in tier order. */
export const PLUGIN_TIERS = ["declares", "decorates", "transforms", "reacts", "speaks"] as const;
export type PluginTier = (typeof PLUGIN_TIERS)[number];
export type SlotName = (typeof SLOT_NAMES)[number];
export type FilterName = (typeof FILTER_NAMES)[number];
/** The two stages a plugin may declare (docs/10 §4.4) and the two events (§4.5), in the order doctor prints them. */
export const STAGE_NAMES = ["transform", "emit"] as const;
export const EVENT_NAMES = ["publish", "push"] as const;
export type StageName = (typeof STAGE_NAMES)[number];
export type EventName = (typeof EVENT_NAMES)[number];

export interface LoadedPlugin {
  /** The name the site used, without a `snypd-plugin-` prefix — what `plugins[name]` diagnostics say. */
  name: string;
  /** The entry as written in `plugins:`. */
  entry: string;
  found: boolean;
  /** Manifest and options valid, root keys merged. `false` with `found` means refused; `why` says so. */
  loaded: boolean;
  why?: string;
  /** Absolute directory, or `snypd:plugin/<name>` for a bundled one. Never passed to `fs`; the themefs seam reads it. */
  dir?: string;
  /** Provenance-relative `snypd.yaml` path, the form `snypd://config` prints. */
  file?: string;
  source?: PluginSource;
  /** `plugins/x`, `node_modules/snypd-plugin-x`, `bundled` — the human form of `source` + `dir`. */
  where?: string;
  manifest?: PluginManifest;
  /** The site's options, as validated. `{}` when the entry was a bare name. */
  options: Record<string, unknown>;
  /** Root keys the plugin contributes to the config, by key: `{ types: [release], taxonomies: [product] }`. */
  contributes: Record<string, string[]>;
  tiers: PluginTier[];
  /** Kilobytes of client JS the manifest declares (`capabilities.client`), 0 when none — what the budget sums (P2). */
  clientKb: number;
  /** Slot → plugin-relative module, as declared; `{}` when the plugin decorates nothing. Every file exists when `loaded`. */
  slots: Partial<Record<SlotName, string>>;
  filters: Partial<Record<FilterName, string>>;
  /** Stage → plugin-relative module (P3): `transform` runs per document at build, `emit` once per build. */
  stages: Partial<Record<StageName, string>>;
  /** Event → plugin-relative module (P3): `publish` after an item lands, `push` after the branch is sent. */
  events: Partial<Record<EventName, string>>;
  /** The plugin-relative module of MCP tools (P4, tier 4), when it declares one — one catalogue tool named after the plugin. */
  tools?: string;
  /** The plugin-relative module of MCP prompts (P4, tier 4), when it declares one. */
  prompts?: string;
  /** Hosts the plugin's `ctx.fetch` may reach (`capabilities.network`); `[]` refuses every fetch. */
  network: string[];
  /** `dist/`-relative prefixes its `emit` stage may write under (`capabilities.emit`, default `<name>/`), each ending in `/`. */
  emitPrefixes: string[];
  diagnostics: Diagnostic[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const shortName = (entry: string) => entry.replace(/^snypd-plugin-/, "");

/** The candidate directories for one plugin, in resolution order (docs/10 §4.1). */
export const pluginCandidates = (entry: string): string[] => {
  const short = shortName(entry);
  return [...new Set([`plugins/${short}`, `plugins/${entry}`, `node_modules/snypd-plugin-${short}`, `node_modules/${entry}`])];
};

export interface ResolvedPlugin { dir: string; source: PluginSource }
/** Disk first — the site, the monorepo's `plugins/` workspace, `node_modules/` — then the barrel (decision 83). */
export function resolvePlugin(entry: string, search: string[]): ResolvedPlugin | undefined {
  const [root] = search;
  for (const d of search) for (const c of pluginCandidates(entry)) {
    const dir = join(d, c);
    if (!themeHas(dir, "snypd.yaml")) continue;
    return { dir, source: c.startsWith("node_modules/") ? "node_modules" : d === root ? "site" : "workspace" };
  }
  const short = shortName(entry);
  if (bundledPluginNames().includes(short)) return { dir: bundledPluginDir(short), source: "bundled" };
  return undefined;
}

export interface PluginLoadInput {
  entry: string;
  options: Record<string, unknown> | undefined;
  /** Where the site wrote this entry, for attributing an options error to the line that set it. */
  origin?: Source;
  search: string[];
  /** Turns an absolute file into the provenance form (`config.ts`'s `rel`). */
  rel: (file: string) => string;
  /**
   * The site's client-JS budget and what the plugins before this one already declared (P2, decision 84).
   * Absent means "do not check" — a caller that loads one plugin in isolation.
   */
  client?: { budgetKb: number; spentKb: number; /** where the budget was set, or would be: the site's file, for the remedy's attribution */ origin?: Source };
}

/**
 * Read, validate and describe one plugin. Never throws. Returns the layer to merge when the plugin loads;
 * a refused plugin has diagnostics and no layer, and the site goes on without it.
 */
export function loadPlugin(input: PluginLoadInput): { plugin: LoadedPlugin; layer?: Layer } {
  const r = loadPluginInner(input);
  stamp(r.plugin.name, r.plugin.diagnostics);
  return r;
}
function loadPluginInner(input: PluginLoadInput): { plugin: LoadedPlugin; layer?: Layer } {
  const name = shortName(input.entry);
  const diagnostics: Diagnostic[] = [];
  const plugin: LoadedPlugin = { name, entry: input.entry, found: false, loaded: false, options: input.options ?? {}, contributes: {}, tiers: [], clientKb: 0, slots: {}, filters: {}, stages: {}, events: {}, network: [], emitPrefixes: [], diagnostics };
  // `plugins[analytics].provider` — the site's entry, then the key inside it (docs/10 §4.1).
  const path = (p: Path = []) => { const tail = pathKey(p); return tail ? `plugins[${name}]${tail.startsWith("[") ? "" : "."}${tail}` : `plugins[${name}]`; };
  const refuse = (why: string, p: Path = [], source?: Source) => {
    plugin.why = why;
    diagnostics.push({ level: "error", path: path(p), message: `${why} — not loaded`, source, where: source ? describeSource(source) : undefined });
  };

  const found = resolvePlugin(input.entry, input.search);
  if (!found) {
    diagnostics.push({ level: "warning", path: "plugins", message: `plugin "${input.entry}" has no snypd.yaml (looked for ${pluginCandidates(input.entry).join(", ")}, and the bundled set: ${bundledPluginNames().join(", ") || "none"}) — not installed?`, source: input.origin, where: input.origin ? describeSource(input.origin) : undefined });
    plugin.why = "not found";
    return { plugin };
  }
  plugin.found = true;
  plugin.dir = found.dir;
  plugin.source = found.source;
  const yamlFile = found.source === "bundled" ? `${name}/snypd.yaml` : input.rel(join(found.dir, "snypd.yaml"));
  plugin.file = yamlFile;
  plugin.where = found.source === "bundled" ? "bundled" : input.rel(found.dir).split(sep).join("/");

  const parsed = parseYaml(themeFile(found.dir, "snypd.yaml") ?? "", yamlFile);
  for (const w of parsed.warnings) diagnostics.push({ level: "warning", path: path(), message: w });
  if (!isObj(parsed.value)) { refuse(`${yamlFile}: expected a mapping at top level`); return { plugin }; }
  const at = (p: Path): Source => { const o: Origin | undefined = parsed.origins.get(pathKey(p)); return { layer: "plugin", from: name, file: yamlFile, ...(o ? { line: o.line } : {}) }; };
  const { plugin: raw, ...rest } = parsed.value;
  const contributes = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isObj(x) ? Object.keys(x) : []]));

  if (raw === undefined) {
    // The floor docs/10 §2.1 builds on: a YAML-only plugin with no manifest still declares. It is Tier 0
    // with nothing to print beside it, and the warning is the one line that fixes that.
    diagnostics.push({ level: "warning", path: path(), message: `${yamlFile} has no \`plugin:\` block — loaded as a plugin that only declares; add \`plugin: { name: ${name}, version: 0.1.0, api: ${PLUGIN_API} }\` so doctor can describe it`, source: at([]), where: yamlFile });
  } else {
    if (!isObj(raw)) { refuse("`plugin:` must be a mapping", ["plugin"], at(["plugin"])); return { plugin }; }
    // `api:` first, before anything else in the manifest is read (docs/10 §4.1): the contract will change
    // through 0.x, and a plugin written for a version this binary does not speak is refused with the
    // version it wanted rather than loaded and broken.
    if (raw.api !== PLUGIN_API) {
      refuse(raw.api === undefined ? `manifest declares no \`api:\`; this snypd speaks plugin api ${PLUGIN_API}` : `manifest speaks plugin api ${JSON.stringify(raw.api)}; this snypd speaks ${PLUGIN_API}`, ["plugin", "api"], at(raw.api === undefined ? ["plugin"] : ["plugin", "api"]));
      return { plugin };
    }
    const r = PluginManifestSchema.safeParse(raw);
    if (!r.success) {
      for (const i of r.error.issues) {
        const p = i.path as Path;
        if (i.code === "unrecognized_keys") for (const k of (i as { keys: string[] }).keys) {
          const src = at(["plugin", ...p, k]);
          diagnostics.push({ level: "error", path: path(["plugin", ...p, k]), message: `unknown key "${k}" in \`plugin:\``, source: src, where: describeSource(src) });
        } else {
          const src = at(["plugin", ...p]);
          diagnostics.push({ level: "error", path: path(["plugin", ...p]), message: `${i.message} in \`plugin:\``, source: src, where: describeSource(src) });
        }
      }
      plugin.why = "manifest does not validate";
      diagnostics.push({ level: "error", path: path(["plugin"]), message: `manifest does not validate — not loaded`, source: at(["plugin"]), where: yamlFile });
      return { plugin };
    }
    plugin.manifest = r.data;
    if (r.data.name !== name) diagnostics.push({ level: "warning", path: path(["plugin", "name"]), message: `manifest calls itself "${r.data.name}"; the site lists it as "${input.entry}" — the site's name is used`, source: at(["plugin", "name"]), where: describeSource(at(["plugin", "name"])) });
    for (const k of Object.keys(PLUGIN_UNBUILT_KEYS)) if (k in r.data && (r.data as Record<string, unknown>)[k] != null) {
      const src = at(["plugin", k]);
      diagnostics.push({ level: "warning", path: path(["plugin", k]), message: `\`${k}\` is declared but not built yet (${PLUGIN_UNBUILT_KEYS[k]}); ignored`, source: src, where: describeSource(src) });
    }

    // The site's options against the plugin's own schema (docs/10 §4.1). The failure names the site's
    // line — that is where the fix is — and the plugin's key.
    if (r.data.options) {
      let schema: z.ZodType;
      try { schema = z.fromJSONSchema(r.data.options as never); }
      catch (e) { refuse(`\`options\` is not a JSON Schema this snypd can read (${(e as Error).message.split("\n")[0]})`, ["plugin", "options"], at(["plugin", "options"])); return { plugin }; }
      const o = schema.safeParse(plugin.options);
      if (!o.success) {
        for (const i of o.error.issues) diagnostics.push({ level: "error", path: path(i.path as Path), message: i.message, source: input.origin, where: input.origin ? describeSource(input.origin) : undefined });
        plugin.why = "options do not validate";
        diagnostics.push({ level: "error", path: path(), message: `options do not validate against the plugin's schema — not loaded`, source: input.origin, where: input.origin ? describeSource(input.origin) : undefined });
        return { plugin };
      }
      plugin.options = (isObj(o.data) ? o.data : plugin.options) as Record<string, unknown>;
    } else if (Object.keys(plugin.options).length) {
      diagnostics.push({ level: "warning", path: path(), message: `takes no options (its manifest declares no \`options\` schema); ${Object.keys(plugin.options).map((k) => `\`${k}\``).join(", ")} ignored`, source: input.origin, where: input.origin ? describeSource(input.origin) : undefined });
    }

    // Tiers 1–3 (P2, P3; docs/10 §4.3–4.5): a hook is a YAML line naming a module, so the module has to be
    // there. Checked here, at load, because a missing file found at the first render is a broken page —
    // and a missing event handler found at the first publish is a publish with a hole in its report — while
    // a missing file found here is a diagnostic naming the plugin and the line.
    const missing: string[] = [];
    const noun: Record<string, string> = { slots: "slot", filters: "filter", stages: "stage", events: "event" };
    for (const [kind, map] of [["slots", r.data.slots], ["filters", r.data.filters], ["stages", r.data.stages], ["events", r.data.events]] as const) for (const [hook, file] of Object.entries(map ?? {})) {
      if (typeof file !== "string") continue;
      if (themeHas(found.dir, file)) continue;
      const src = at(["plugin", kind, hook]);
      diagnostics.push({ level: "error", path: path(["plugin", kind, hook]), message: `${file} is missing from ${plugin.where === "bundled" ? "the bundled plugin" : plugin.where} — ${kind === "events" ? "an" : "a"} ${noun[kind]} names a module relative to the plugin's own directory`, source: src, where: describeSource(src) });
      missing.push(`${kind}.${hook}`);
    }
    // Tier 4 (P4, §4.2): `tools` and `prompts` are one module each rather than a map, so they are checked
    // beside the hook maps and not inside them — same rule, same moment. A plugin that says it speaks and
    // has no module to speak from is refused here, not at the agent's first `find_tools`.
    for (const kind of ["tools", "prompts"] as const) {
      const file = r.data[kind];
      if (typeof file !== "string") continue;
      if (themeHas(found.dir, file)) continue;
      const src = at(["plugin", kind]);
      diagnostics.push({ level: "error", path: path(["plugin", kind]), message: `${file} is missing from ${plugin.where === "bundled" ? "the bundled plugin" : plugin.where} — \`${kind}\` names one module relative to the plugin's own directory`, source: src, where: describeSource(src) });
      missing.push(kind);
    }
    if (missing.length) { refuse(`${missing.length === 1 ? "a hook module is" : `${missing.length} hook modules are`} missing (${missing.join(", ")})`, ["plugin"], at(["plugin"])); return { plugin }; }
    plugin.slots = { ...(r.data.slots ?? {}) } as LoadedPlugin["slots"];
    plugin.filters = { ...(r.data.filters ?? {}) } as LoadedPlugin["filters"];
    plugin.stages = { ...(r.data.stages ?? {}) } as LoadedPlugin["stages"];
    plugin.events = { ...(r.data.events ?? {}) } as LoadedPlugin["events"];
    if (typeof r.data.tools === "string") plugin.tools = r.data.tools;
    if (typeof r.data.prompts === "string") plugin.prompts = r.data.prompts;
    plugin.network = [...(r.data.capabilities?.network ?? [])];
    // The emit prefixes (P3, decision 86): declared, or the plugin's own directory in dist/. Normalised to
    // `a/b/` so the write-time check is one `startsWith`; a prefix of `/` or `.` would be "anywhere", which
    // is the one thing a prefix exists to refuse, so those are diagnostics and the default stands.
    const prefixes = (r.data.capabilities?.emit ?? []).map((x) => x.replace(/^\.?\/+/, "").replace(/\/*$/, "/"));
    for (const [i, x] of prefixes.entries()) if (x === "/" || x.startsWith("../") || x.includes("/../")) {
      const src = at(["plugin", "capabilities", "emit", i]);
      diagnostics.push({ level: "warning", path: path(["plugin", "capabilities", "emit", i]), message: `emit prefix ${JSON.stringify(r.data.capabilities!.emit![i])} would allow writing anywhere in dist/ — ignored; a prefix is a directory the plugin owns, like \`${name}/\``, source: src, where: describeSource(src) });
    }
    plugin.emitPrefixes = prefixes.filter((x) => x !== "/" && !x.startsWith("../") && !x.includes("/../"));
    if (!plugin.emitPrefixes.length) plugin.emitPrefixes = [`${name}/`];

    // The client budget (P2, docs/10 §4.6, decision 84): declared kilobytes, summed in `plugins:` order
    // against the site's `bench.budgets.jsKb`. The plugin that takes the sum over is the one refused, and
    // the remedy is in the message — the site's line is where the number lives, so that is what it names.
    plugin.clientKb = clientKbOf(r.data.capabilities?.client);
    if (plugin.clientKb > 0 && input.client) {
      const { budgetKb, spentKb } = input.client;
      if (spentKb + plugin.clientKb > budgetKb) {
        const need = Math.ceil((spentKb + plugin.clientKb) * 100) / 100;
        const fmt = (n: number) => `${+n.toFixed(2)} KB`;
        const remedy = `Set bench.budgets.jsKb: ${Math.ceil(need)} to afford it, or remove the plugin`;
        const src = input.client.origin ?? input.origin;
        diagnostics.push({ level: "error", path: path(["plugin", "capabilities", "client"]), message: `asks for ${fmt(plugin.clientKb)} of client JS; this site's jsKb budget is ${fmt(budgetKb)}${spentKb ? ` and ${fmt(spentKb)} of it is already declared by the plugins before it` : ""}. ${remedy}`, source: src, where: src ? describeSource(src) : undefined });
        plugin.why = `over the client JS budget (${fmt(plugin.clientKb)} asked, ${fmt(budgetKb - spentKb)} left)`;
        diagnostics.push({ level: "error", path: path(), message: `${plugin.why} — not loaded`, source: src, where: src ? describeSource(src) : undefined });
        return { plugin };
      }
    }
  }

  plugin.loaded = true;
  plugin.contributes = contributes(rest);
  plugin.tiers = tiersOf(plugin);
  const layer: Layer = { name: "plugin", from: name, file: yamlFile, value: rest, origins: parsed.origins };
  return { plugin, layer };
}
/** Every diagnostic a plugin produces names it, so an error refuses the plugin and not the site (config.ts `ok`). */
const stamp = (name: string, d: Diagnostic[]) => { for (const x of d) x.plugin = name; return d; };

/** Which of the five tiers a plugin declares (docs/10 §4.2) — from what its manifest and root keys say, not from what it does. */
export function tiersOf(p: Pick<LoadedPlugin, "manifest" | "contributes">): PluginTier[] {
  const m = p.manifest;
  const out: PluginTier[] = [];
  if (Object.keys(p.contributes).length) out.push("declares");
  if (m?.slots && Object.keys(m.slots).length || m?.filters && Object.keys(m.filters).length) out.push("decorates");
  if (m?.stages && (m.stages.transform || m.stages.emit)) out.push("transforms");
  if (m?.events && (m.events.publish || m.events.push)) out.push("reacts");
  if (m?.tools || m?.prompts) out.push("speaks");
  return out;
}

/**
 * Every slot and filter, with the plugins that fill it in `plugins:` order (docs/09 §4.4 rule 3: inspectable).
 * Doctor and `snypd://plugins` print this; the renderer resolves the same map into modules (hooks.ts).
 */
export function hooksOf(plugins: LoadedPlugin[]): { slots: Record<SlotName, string[]>; filters: Record<FilterName, string[]>; stages: Record<StageName, string[]>; events: Record<EventName, string[]>; any: boolean } {
  const table = <K extends string>(names: readonly K[]) => Object.fromEntries(names.map((n) => [n, [] as string[]])) as Record<K, string[]>;
  const slots = table(SLOT_NAMES), filters = table(FILTER_NAMES), stages = table(STAGE_NAMES), events = table(EVENT_NAMES);
  for (const p of plugins) {
    if (!p.loaded) continue;
    for (const n of Object.keys(p.slots) as SlotName[]) slots[n].push(p.name);
    for (const n of Object.keys(p.filters) as FilterName[]) filters[n].push(p.name);
    for (const n of Object.keys(p.stages) as StageName[]) stages[n].push(p.name);
    for (const n of Object.keys(p.events) as EventName[]) events[n].push(p.name);
  }
  const any = [slots, filters, stages, events].some((t) => Object.values(t).some((x) => x.length));
  return { slots, filters, stages, events, any };
}
/** Kilobytes of client JS the loaded plugins declare between them — the number `page.js.kb` is measured against (D11). */
export const clientKbDeclared = (plugins: LoadedPlugin[]): number => +plugins.filter((p) => p.loaded).reduce((n, p) => n + p.clientKb, 0).toFixed(2);

/** Directories whose bytes are the plugin half of every route key (decision 95): the loaded plugins, in order. */
export const pluginDirs = (plugins: LoadedPlugin[]): string[] => plugins.filter((p) => p.loaded && p.dir).map((p) => p.dir!);

const modules = new Map<string, Promise<unknown>>();
/**
 * A plugin's module through the same seam themes use (decision 83) — the one loader every tier that runs
 * plugin code shares: `events.ts` for its handlers, `speak.ts` for tier 4's tools and prompts.
 *
 * A bundled plugin resolves through the barrel; one on disk is imported by absolute path and hash-busted
 * on the plugin directory's change signal, so an edit is picked up without restarting the server — which
 * is what makes `plugins/<name>/` the place a site's own plugin is written rather than installed.
 */
export async function pluginModule(p: Pick<LoadedPlugin, "dir">, rel: string): Promise<unknown> {
  if (isBundledDir(p.dir!)) return themeModule(p.dir!, rel);
  const abs = resolve(join(p.dir!, rel));
  const bust = `?v=${createHash("sha1").update(themeSignature(p.dir!)).digest("hex").slice(0, 8)}`;
  const key = abs + bust;
  let m = modules.get(key);
  if (!m) { m = import(key).then((x) => (x as { default: unknown }).default); modules.set(key, m); }
  return m;
}

/**
 * `snypd://plugins` as text. Short on purpose, like `snypd://theme`: the manifest, where it was found, what
 * it declares, and the bundled set an agent can enable with one line. Diagnostics are here too, because
 * a refused plugin is the thing an agent reading this most needs to see.
 */
export function renderPlugins(plugins: LoadedPlugin[], opts: { /** the site's `bench.budgets.jsKb`, for the client line */ jsKb?: number } = {}): string {
  const q = (s: string) => JSON.stringify(s);
  const list = (xs: string[]) => `[${xs.join(", ")}]`;
  const lines = [
    "# Plugins of this site, in the order `plugins:` lists them — which is the order their slots and filters will run (docs/10 §4.3).",
    "# A plugin is a directory with a snypd.yaml: its root keys merge into snypd://config (`# ← plugin:<name>`); `plugin:` is the",
    "# manifest and never merges. Found in plugins/<name> here, then node_modules/snypd-plugin-<name>, node_modules/<name>, then bundled.",
    `api: ${PLUGIN_API}   # the contract this snypd speaks; a manifest that names another is refused`,
    `plugins:${plugins.length ? "" : " {}   # none — `plugins: [changelog]` in snypd.yaml enables a bundled one, no install"}`,
  ];
  for (const p of plugins) {
    const m = p.manifest;
    lines.push(`  ${p.name}:`);
    if (!p.found) { lines.push(`    status: not found   # ${p.why ?? ""}`.trimEnd()); continue; }
    lines.push(`    version: ${m ? q(m.version) : "unknown   # no plugin: block"}`);
    lines.push(`    from: ${p.where}`);
    lines.push(`    does: ${list(p.tiers)}   # ${PLUGIN_TIERS.join(" · ")} — docs/10 §4.2`);
    if (m?.description) lines.push(`    description: ${q(m.description)}`);
    const c = Object.entries(p.contributes);
    if (c.length) lines.push(`    contributes: { ${c.map(([k, v]) => `${k}: ${list(v)}`).join(", ")} }`);
    if (m?.options) lines.push(`    options: ${JSON.stringify(p.options)}`);
    if (m?.capabilities) lines.push(`    capabilities: ${JSON.stringify(m.capabilities)}   # client is summed against bench.budgets.jsKb at load; network is the hosts its ctx.fetch reaches; emit the dist/ prefixes it may write (docs/10 §4.7)`);
    const map = (o: Record<string, string | undefined>) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(", ")} }`;
    if (Object.keys(p.slots).length) lines.push(`    slots: ${map(p.slots)}`);
    if (Object.keys(p.filters).length) lines.push(`    filters: ${map(p.filters)}`);
    if (Object.keys(p.stages).length) lines.push(`    stages: ${map(p.stages)}${p.stages.emit ? `   # writes under ${p.emitPrefixes.join(", ")}` : ""}`);
    if (Object.keys(p.events).length) lines.push(`    events: ${map(p.events)}${p.network.length ? `   # may fetch ${p.network.join(", ")}` : "   # no network: its ctx.fetch refuses every host"}`);
    if (p.tools) lines.push(`    tools: ${p.tools}   # one catalogue tool named \`${p.name}\`, found with find_tools — never in the always-listed set (D11)`);
    if (p.prompts) lines.push(`    prompts: ${p.prompts}   # prompts/list carries them beside snypd's own`);
    lines.push(`    status: ${p.loaded ? "loaded" : `refused — ${p.why}`}`);
  }
  const bundled = bundledPluginNames();
  lines.push(`bundled: ${list(bundled)}   # ship in this snypd; a plugin on disk with the same name wins`);
  // What runs where (P2, docs/10 §4.3): every slot and filter with its contributors in order — the whole
  // hook table of the site on six + six lines, which is the inspectability WordPress never had.
  const h = hooksOf(plugins);
  if (h.any) {
    lines.push("hooks:   # in the order they run; the theme decides where a slot is, the plugin what goes in it");
    lines.push(`  slots: { ${SLOT_NAMES.map((n) => `${n}: ${list(h.slots[n])}`).join(", ")} }`);
    lines.push(`  filters: { ${FILTER_NAMES.map((n) => `${n}: ${list(h.filters[n])}`).join(", ")} }`);
    if (Object.values(h.stages).some((x) => x.length)) lines.push(`  stages: { ${STAGE_NAMES.map((n) => `${n}: ${list(h.stages[n])}`).join(", ")} }   # transform runs per document before render; emit once per build, files written by core`);
    if (Object.values(h.events).some((x) => x.length)) lines.push(`  events: { ${EVENT_NAMES.map((n) => `${n}: ${list(h.events[n])}`).join(", ")} }   # fire after the act; a handler that fails is a line, never a failed publish (decision 87)`);
  }
  // Tier 4 (P4): what the MCP gained, listed apart from the hook table because these run in a session and
  // not in a build — and because the whole point of them is that `tools/list` does not grow until asked.
  const speaks = plugins.filter((p) => p.loaded && (p.tools || p.prompts));
  if (speaks.length) {
    lines.push("speaks:   # the MCP surface these plugins add (docs/10 §4.2 tier 4)");
    lines.push(`  tools: ${list(speaks.filter((p) => p.tools).map((p) => p.name))}   # one tool each, behind find_tools; \`${speaks.find((p) => p.tools)?.name ?? "name"}\` is the tool and its actions are the verbs`);
    lines.push(`  prompts: ${list(speaks.filter((p) => p.prompts).map((p) => p.name))}`);
  }
  const declared = clientKbDeclared(plugins);
  if (declared || opts.jsKb) lines.push(`client: { declared: ${declared}, budget: ${opts.jsKb ?? 0} }   # KB of client JS; declared by plugins, afforded by bench.budgets.jsKb, measured by page.js.kb (decision 84)`);
  const diags = plugins.flatMap((p) => p.diagnostics);
  if (diags.length) lines.push("# Diagnostics:", ...diags.map((x) => `#   ${x.level}: ${x.path ? `${x.path}: ` : ""}${x.message}${x.where ? ` (${x.where})` : ""}`));
  return lines.join("\n") + "\n";
}
