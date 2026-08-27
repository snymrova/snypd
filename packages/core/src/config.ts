/**
 * `loadConfig(root)` — the five YAML layers of docs/02 §1 → one validated Config with provenance.
 * Never throws: returns diagnostics (with file:line) instead. `explain(path)` answers
 * `site.explain_config`; `renderConfig()` is the text of `snypd://config`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { Document, isMap, isSeq, type Node, type Pair } from "yaml";
import { z } from "zod";
import { defaults as specDefaults, primitiveNames } from "@snypd/spec";
import { describeSource, getPath, mergeLayer, type Layer, type LayerName, type Provenance, type Source } from "./merge";
import { parsePath, parseYaml, pathKey, type Path } from "./yaml";
import { ConfigSchema, type Config } from "./schema";

export interface Diagnostic { level: "error" | "warning"; path: string; message: string; source?: Source; where?: string }
export interface LayerInfo { name: Layer["name"]; from?: string; file?: string; found: boolean; note?: string }
export interface LoadedConfig {
  root: string; env: string; ok: boolean;
  config: Config; raw: Record<string, unknown>;
  provenance: Provenance; layers: LayerInfo[]; diagnostics: Diagnostic[];
  explain(path: string | Path): string;
  source(path: string | Path): Source | undefined;
  render(): string;
}
export interface LoadOptions { env?: string; /** extra dirs searched for `themes/<name>` and `plugins/<name>` (the monorepo adds its own) */ searchPaths?: string[] }

const REPO = join(import.meta.dir, "..", "..", "..");
const rel = (root: string, f: string) => { const r = relative(root, f); return r.startsWith("..") ? f : r; };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function readLayer(root: string, name: Layer["name"], file: string, diags: Diagnostic[], from?: string, wrap?: (v: unknown) => unknown): Layer {
  const p = parseYaml(readFileSync(file, "utf8"), rel(root, file));
  for (const w of p.warnings) diags.push({ level: "warning", path: "", message: w });
  let value = p.value, origins = p.origins;
  if (!isObj(value)) { diags.push({ level: "error", path: "", message: `${rel(root, file)}: expected a mapping at top level` }); value = {}; }
  if (wrap) { value = wrap(value); origins = new Map([...origins].map(([k, v]) => [pathKey(["theme", ...parsePath(k)]), v])); }
  return { name, from, file: rel(root, file), value, origins };
}

function findIn(dirs: string[], candidates: string[]): string | undefined {
  for (const d of dirs) for (const c of candidates) { const f = join(d, c); if (existsSync(f)) return f; }
  return undefined;
}

/** Resolve `extends` (inherit-then-override; arrays replace) with cycle detection. */
function resolveExtends(types: Record<string, unknown>, prov: Provenance, diags: Diagnostic[]) {
  const done = new Map<string, Record<string, unknown>>();
  const visit = (name: string, chain: string[]): Record<string, unknown> => {
    if (done.has(name)) return done.get(name)!;
    const t = isObj(types[name]) ? { ...(types[name] as Record<string, unknown>) } : {};
    const base = typeof t.extends === "string" ? t.extends : undefined;
    delete t.extends;
    if (!base || base === name) { done.set(name, t); return t; }
    if (chain.includes(base)) { diags.push({ level: "error", path: `types.${name}.extends`, message: `cycle: ${[...chain, name, base].join(" → ")}`, source: prov.get(`types.${name}.extends`) }); done.set(name, t); return t; }
    if (!isObj(types[base])) { diags.push({ level: "error", path: `types.${name}.extends`, message: `unknown base type "${base}"`, source: prov.get(`types.${name}.extends`) }); done.set(name, t); return t; }
    const b = visit(base, [...chain, name]);
    const out: Record<string, unknown> = { ...b };
    const inherit = (p: Path, bp: Path) => {
      const s = prov.get(pathKey(bp)); if (s && !prov.has(pathKey(p))) prov.set(pathKey(p), { layer: "inherited", from: base, overrides: s });
      const v = getPath(b, bp.slice(2));
      if (isObj(v)) for (const k of Object.keys(v)) inherit([...p, k], [...bp, k]);
    };
    for (const k of Object.keys(b)) if (!(k in t)) inherit(["types", name, k], ["types", base, k]);
    for (const [k, v] of Object.entries(t)) out[k] = isObj(v) && isObj(b[k]) ? { ...(b[k] as object), ...v } : v;
    // one level of object merge (fields, mcp) is what extends means; nested field specs replace whole
    if (isObj(t.fields) && isObj(b.fields)) for (const k of Object.keys(b.fields)) if (!(k in (t.fields as object))) inherit(["types", name, "fields", k], ["types", base, "fields", k]);
    done.set(name, out); return out;
  };
  for (const n of Object.keys(types)) types[n] = visit(n, []);
}

export function loadConfig(root = ".", opts: LoadOptions = {}): LoadedConfig {
  const env = opts.env ?? process.env.SNYPD_ENV ?? "dev";
  const diags: Diagnostic[] = [];
  const layers: LayerInfo[] = [];
  const prov: Provenance = new Map();
  const search = [root, ...(opts.searchPaths ?? []), REPO];

  // 1. spec defaults
  const d = specDefaults() as unknown as Record<string, unknown>;
  const specLayer: Layer = { name: "spec", value: { types: d.types, taxonomies: d.taxonomies, statuses: d.statuses, initialStatus: d.initialStatus, bench: { budgets: d.budgets }, fieldTypes: d.fieldTypes } };
  let merged = mergeLayer({}, specLayer, prov);
  layers.push({ name: "spec", found: true });

  // 4 + 5 are read first so we know the theme and the plugins, then merged in order.
  const siteFile = join(root, "snypd.yaml");
  const site = existsSync(siteFile) ? readLayer(root, "site", siteFile, diags) : undefined;
  if (!site) diags.push({ level: "error", path: "", message: `no snypd.yaml in ${root} — run the get-started prompt` });
  const envFile = join(root, `snypd.${env}.yaml`);
  const envLayer = existsSync(envFile) ? readLayer(root, "env", envFile, diags) : undefined;
  const siteView = isObj(site?.value) ? site!.value : {};
  const envView = isObj(envLayer?.value) ? envLayer!.value : {};
  const themeOf = (v: Record<string, unknown>) => (isObj(v.theme) && typeof v.theme.use === "string" ? v.theme.use : undefined);
  const themeName = themeOf(envView) ?? themeOf(siteView) ?? "base";
  const pluginList = ([] as unknown[]).concat(Array.isArray(siteView.plugins) ? siteView.plugins : [], Array.isArray(envView.plugins) ? envView.plugins : []);

  // 2. theme.yaml → under `theme`
  const themeDir = findIn(search, [`themes/${themeName}`, `node_modules/${themeName}`, `node_modules/snypd-theme-${themeName}`]);
  const themeYaml = themeDir && existsSync(join(themeDir, "theme.yaml")) ? join(themeDir, "theme.yaml") : undefined;
  if (themeYaml) merged = mergeLayer(merged, readLayer(root, "theme", themeYaml, diags, themeName, (v) => ({ theme: v })), prov);
  else if (!themeDir) diags.push({ level: "warning", path: "theme.use", message: `theme "${themeName}" not found (looked for themes/${themeName}, node_modules/${themeName}, node_modules/snypd-theme-${themeName})`, source: prov.get("theme.use") });
  layers.push({ name: "theme", from: themeName, file: themeYaml ? rel(root, themeYaml) : undefined, found: !!themeDir, note: themeDir && !themeYaml ? "no theme.yaml yet" : undefined });

  // 3. plugins' snypd.yaml, declared order
  for (const entry of pluginList) {
    const name = typeof entry === "string" ? entry : isObj(entry) ? Object.keys(entry)[0] : undefined;
    if (!name) { diags.push({ level: "error", path: "plugins", message: `invalid plugin entry ${JSON.stringify(entry)}` }); continue; }
    const f = findIn(search, [`node_modules/${name}/snypd.yaml`, `plugins/${name}/snypd.yaml`, `node_modules/snypd-plugin-${name}/snypd.yaml`, `plugins/${name.replace(/^snypd-plugin-/, "")}/snypd.yaml`]);
    if (f) merged = mergeLayer(merged, readLayer(root, "plugin", f, diags, name), prov);
    else diags.push({ level: "warning", path: "plugins", message: `plugin "${name}" has no snypd.yaml (not installed?)` });
    layers.push({ name: "plugin", from: name, file: f ? rel(root, f) : undefined, found: !!f });
  }

  // 4. site, 5. env
  if (site) merged = mergeLayer(merged, site, prov);
  layers.push({ name: "site", file: "snypd.yaml", found: !!site });
  if (envLayer) merged = mergeLayer(merged, envLayer, prov);
  layers.push({ name: "env", from: env, file: `snypd.${env}.yaml`, found: !!envLayer });

  const raw = merged as Record<string, unknown>;
  if (isObj(raw.types)) resolveExtends(raw.types, prov, diags);

  // validate
  const parsed = ConfigSchema.safeParse(raw);
  const where = (p: string) => { const s = prov.get(p); return s ? describeSource(s) : undefined; };
  if (!parsed.success) for (const i of parsed.error.issues) {
    const p = pathKey(i.path as Path);
    const unknownKeys = i.code === "unrecognized_keys" ? (i as { keys: string[] }).keys : undefined;
    const pp = unknownKeys ? pathKey([...(i.path as Path), unknownKeys[0]!]) : p;
    diags.push({ level: "error", path: pp, message: unknownKeys ? `unknown key "${unknownKeys.join('", "')}"` : i.message, source: prov.get(pp), where: where(pp) });
  }
  // on failure fall back to the spec layer alone (always valid) so callers still get a usable Config
  const config = (parsed.success ? parsed.data : ConfigSchema.parse({ snypd: 1, site: { name: "?", url: "https://invalid.invalid" }, ...(specLayer.value as object) })) as Config;

  // cross references (only when the shape validated, so messages are about semantics, not syntax)
  if (parsed.success) {
    const err = (path: string, message: string) => diags.push({ level: "error", path, message, source: prov.get(path), where: where(path) });
    const warn = (path: string, message: string) => diags.push({ level: "warning", path, message, source: prov.get(path), where: where(path) });
    const prims = new Set(primitiveNames());
    for (const [n, t] of Object.entries(config.types)) {
      t.taxonomies.forEach((x, i) => { if (!config.taxonomies[x]) err(`types.${n}.taxonomies[${i}]`, `unknown taxonomy "${x}"`); });
      if (t.vocabulary !== "all") t.vocabulary.forEach((x, i) => { if (!prims.has(x)) err(`types.${n}.vocabulary[${i}]`, `unknown primitive "${x}"`); });
      for (const [f, spec] of Object.entries(t.fields)) if (!config.fieldTypes[String(spec.type)]) err(`types.${n}.fields.${f}.type`, `unknown field type "${spec.type}"`);
    }
    for (const [n, t] of Object.entries(config.taxonomies)) t.attaches.forEach((x, i) => { if (!config.types[x]) err(`taxonomies.${n}.attaches[${i}]`, `unknown type "${x}"`); });
    for (const [n, s] of Object.entries(config.statuses)) s.transitions.forEach((x, i) => { if (!config.statuses[x]) err(`statuses.${n}.transitions[${i}]`, `unknown status "${x}"`); });
    if (!config.statuses[config.initialStatus]) err("initialStatus", `unknown status "${config.initialStatus}"`);
    if (!config.site.locales.includes(config.site.defaultLocale)) err("site.defaultLocale", `"${config.site.defaultLocale}" is not in site.locales`);
    for (const [n, t] of Object.entries(config.taxonomies)) if (!Object.values(config.types).some((x) => x.taxonomies.includes(n)) && t.attaches.length === 0) warn(`taxonomies.${n}`, "attached to no type");
  }

  const ok = !diags.some((x) => x.level === "error");
  const source = (p: string | Path) => prov.get(typeof p === "string" ? p : pathKey(p));
  const explain = (p: string | Path) => {
    const key = typeof p === "string" ? p : pathKey(p);
    const v = getPath(raw, parsePath(key));
    if (v === undefined && !prov.has(key)) return `\`${key}\` is not set`;
    const s = prov.get(key) ?? nearest(prov, key);
    return `\`${key}\` = ${JSON.stringify(v)} ← ${describeSource(s)}`;
  };
  return { root, env, ok, config, raw, provenance: prov, layers, diagnostics: diags, explain, source, render: () => renderConfig(raw, prov, layers, diags, env) };
}

function nearest(prov: Provenance, key: string): Source | undefined {
  const path = parsePath(key);
  for (let i = path.length - 1; i > 0; i--) { const s = prov.get(pathKey(path.slice(0, i))); if (s) return s; }
  return undefined;
}

/** Every leaf under `path` comes from `layer` → the subtree collapses to one line in the resource. */
function allFrom(prov: Provenance, path: Path, v: unknown, layer: LayerName): boolean {
  const s = prov.get(pathKey(path));
  if (!isObj(v) && !Array.isArray(v)) return layer === "spec" ? !s || s.layer === "spec" : s?.layer === layer;
  if (s && s.layer !== layer && !(layer === "spec" && !s)) return false;
  const entries = Array.isArray(v) ? v.map((x, i) => [i, x] as const) : Object.entries(v);
  if (entries.length === 0) return layer === "spec" ? !s || s.layer === "spec" : s?.layer === layer;
  return entries.every(([k, x]) => allFrom(prov, [...path, k], x, layer));
}
const ORDER = ["snypd", "site", "theme", "types", "taxonomies", "statuses", "initialStatus", "roles", "plugins", "jobs", "bench", "fieldTypes"];

/**
 * `snypd://config`: merged YAML, every non-default line annotated `# ← file:line`; subtrees that
 * are untouched spec defaults collapse to one line pointing at the `snypd://spec/*` resource, so
 * the resource stays site-sized (tokens-to-learn, docs/05).
 */
export function renderConfig(raw: Record<string, unknown>, prov: Provenance, layers: LayerInfo[], diags: Diagnostic[], env: string): string {
  const pointer = (path: Path) => {
    const [a, b] = path;
    if (path.length >= 2 && (a === "types" || a === "taxonomies")) return `snypd://spec/${a}/${b}`;
    if (a === "bench") return "snypd://spec/budgets";
    return "snypd://spec.json";
  };
  const ordered = Object.fromEntries([...ORDER.filter((k) => k in raw), ...Object.keys(raw).filter((k) => !ORDER.includes(k))].map((k) => [k, raw[k]]));
  const doc = new Document(ordered, { aliasDuplicateObjects: false });
  const annotate = (node: Node | null, path: Path) => {
    if (isMap(node)) {
      for (const pair of node.items as Pair<Node, Node>[]) {
        const k = String((pair.key as { value?: unknown }).value ?? pair.key);
        const p = [...path, k];
        const v = getPath(raw, p);
        if (isObj(v) || Array.isArray(v)) {
          if (allFrom(prov, p, v, "spec")) { pair.value = doc.createNode(`<@snypd/spec default — ${pointer(p)}>`) as Node; continue; }
          const inh = prov.get(pathKey(p));
          if (inh?.layer === "inherited" && allFrom(prov, p, v, "inherited")) { pair.value = doc.createNode(`<inherited from types.${inh.from}>`) as Node; continue; }
        }
        const s = prov.get(pathKey(p));
        if (s && s.layer !== "spec" && pair.value && !isMap(pair.value) && !isSeq(pair.value)) (pair.value as Node).comment = ` ← ${describeSource(s)}`;
        else if (s && s.layer !== "spec" && (isMap(pair.value) || isSeq(pair.value)) && s.file) (pair.key as Node).comment = ` ← ${s.file}${s.line ? `:${s.line}` : ""}`;
        annotate(pair.value, p);
      }
    } else if (isSeq(node)) (node.items as Node[]).forEach((it, i) => annotate(it, [...path, i]));
  };
  annotate(doc.contents as Node, []);
  const head = [
    `# snypd://config — merged (env: ${env}). Layers, later wins:`,
    ...layers.map((l, i) => `#   ${i + 1}. ${l.name}${l.from ? ` ${l.from}` : ""}${l.file ? ` (${l.file})` : ""}${l.note ? ` — ${l.note}` : l.found ? "" : " — not found"}`),
    `# Lines without "← file:line" are @snypd/spec defaults; untouched subtrees are collapsed to their snypd://spec/* resource.`,
    ...(diags.length ? ["# Diagnostics:", ...diags.map((x) => `#   ${x.level}: ${x.path ? `${x.path}: ` : ""}${x.message}${x.where ? ` (${x.where})` : ""}`)] : []),
  ];
  return `${head.join("\n")}\n${String(doc)}`;
}

export function formatDiagnostics(d: Diagnostic[]): string {
  return d.map((x) => `${x.level}: ${x.path ? `${x.path}: ` : ""}${x.message}${x.where ? ` (${x.where})` : ""}`).join("\n");
}
