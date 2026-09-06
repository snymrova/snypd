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
 * What runs is Tier 0 — declare. The manifest keys of tiers 1–4 parse today and warn that they are not
 * built, naming the session that builds each, so a manifest written for P2 is not an unknown-key error.
 */
import { join, sep } from "node:path";
import { z } from "zod";
import type { Diagnostic } from "./config";
import { describeSource, type Layer, type Source } from "./merge";
import { PLUGIN_API, PLUGIN_UNBUILT_KEYS, PluginManifestSchema, type PluginManifest } from "./schema";
import { bundledPluginDir, bundledPluginNames, themeFile, themeHas } from "./themefs";
import { parseYaml, pathKey, type Origin, type Path } from "./yaml";

/** Where a plugin was found. `site` is the unpublished local plugin (WordPress's mu-plugins without the folklore). */
export type PluginSource = "site" | "node_modules" | "workspace" | "bundled";
/** The five kinds of thing a plugin can be (docs/10 §4.2), in tier order. */
export const PLUGIN_TIERS = ["declares", "decorates", "transforms", "reacts", "speaks"] as const;
export type PluginTier = (typeof PLUGIN_TIERS)[number];

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
  const plugin: LoadedPlugin = { name, entry: input.entry, found: false, loaded: false, options: input.options ?? {}, contributes: {}, tiers: [], diagnostics };
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

/** Directories whose bytes are the plugin half of every route key (decision 95): the loaded plugins, in order. */
export const pluginDirs = (plugins: LoadedPlugin[]): string[] => plugins.filter((p) => p.loaded && p.dir).map((p) => p.dir!);

/**
 * `snypd://plugins` as text. Short on purpose, like `snypd://theme`: the manifest, where it was found, what
 * it declares, and the bundled set an agent can enable with one line. Diagnostics are here too, because
 * a refused plugin is the thing an agent reading this most needs to see.
 */
export function renderPlugins(plugins: LoadedPlugin[]): string {
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
    if (m?.capabilities) lines.push(`    capabilities: ${JSON.stringify(m.capabilities)}   # declared, printed, and — for network and client — enforced from P2/P3 (docs/10 §4.7)`);
    lines.push(`    status: ${p.loaded ? "loaded" : `refused — ${p.why}`}`);
  }
  const bundled = bundledPluginNames();
  lines.push(`bundled: ${list(bundled)}   # ship in this snypd; a plugin on disk with the same name wins`);
  const diags = plugins.flatMap((p) => p.diagnostics);
  if (diags.length) lines.push("# Diagnostics:", ...diags.map((x) => `#   ${x.level}: ${x.path ? `${x.path}: ` : ""}${x.message}${x.where ? ` (${x.where})` : ""}`));
  return lines.join("\n") + "\n";
}
