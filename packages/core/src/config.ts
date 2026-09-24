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
import { BUNDLED } from "./bundled";
import { bundledDir, themeFile, themeHas } from "./themefs";
import { parsePath, parseYaml, pathKey, type Origin, type Path } from "./yaml";
import { ConfigSchema, SettingDeclSchema, settingValue, ThemeYamlSchema, THEME_UNBUILT_KEYS, VariationSchema, type Config, type SettingDecl, type VariationDecl } from "./schema";
import { cssValue } from "./values";
import { loadPlugin, type LoadedPlugin } from "./plugins";
import { pieceSettings, pieceTokens, resolvePieces, type ResolvedPiece } from "./pieces";

export interface Diagnostic { level: "error" | "warning"; path: string; message: string; source?: Source; where?: string;
  /** Set when the diagnostic is about one plugin (P1). An error here refuses that plugin and nothing else: the site still loads, `ok` stays true, and doctor carries it as a problem. */ plugin?: string }
export interface ThemeLink { name: string; dir: string; yamlFile?: string }
export interface LayerInfo { name: Layer["name"]; from?: string; file?: string; found: boolean; note?: string; /** absolute directory (theme layer): where layouts/ and primitives/ live */ dir?: string;
  /** theme layer only: the theme and its `extends:` ancestors, child first. `loadTheme` walks this per slot. */ chain?: ThemeLink[] }
export interface LoadedConfig {
  root: string; env: string; ok: boolean;
  config: Config; raw: Record<string, unknown>;
  provenance: Provenance; layers: LayerInfo[]; diagnostics: Diagnostic[];
  /** Every plugin `plugins:` names, in order, found or not, loaded or refused (docs/10 §4.1; `plugins.ts`). */
  plugins: LoadedPlugin[];
  /**
   * What the theme chain declares a site may set (U3, docs/09 §4.2), parent first, a child's
   * redeclaration in its parent's place. Read off the `theme.yaml` docs the chain walk already parsed,
   * so it costs nothing extra; the *values* are `config.theme.settings` and `themeSettings()` puts the
   * two together.
   */
  settingDecls: SettingDecl[];
  /**
   * The named looks the theme chain ships (U6a, docs/10 §5.2), in declaration order, parent first with a
   * child's redeclaration in its parent's place — the same walk `settingDecls` makes, over the same
   * already-parsed docs. The *chosen* one is `config.theme.variation`, and its tokens are already merged
   * into `config.theme.tokens` by the time anyone reads this: the list is for `snypd://theme`, `theme` ›
   * set, and the gallery, not for the renderer, which never learns a variation was involved.
   */
  variations: VariationDecl[];
  /**
   * The pieces the theme is built from (docs/36 §4.1), one per slot in canonical order, with every switch
   * resolved. Empty for a theme that declares no `pieces:` — which is every theme written before P2.
   * The renderer reads this to concatenate `snypd.pieces` and to find a piece's part or layout per link.
   */
  pieces: ResolvedPiece[];
  explain(path: string | Path): string;
  source(path: string | Path): Source | undefined;
  render(): string;
}
/**
 * The variations a resolved theme chain ships, parent first so a child's redeclaration lands where its
 * parent's was — `settingDecls`' walk exactly, over the docs the chain walk already parsed (U6a).
 *
 * Separate from `loadConfig` because it has two callers with different questions. `loadConfig` asks about
 * the theme the site is *on*, to apply the chosen one; `theme` › set asks about the theme it is switching
 * *to*, so that `{ name, variation }` can be refused whole rather than leaving a theme switched and a
 * variation unset. `origins` is what the first caller needs and the second ignores: applying a variation
 * means re-attributing its tokens to the line in *its* theme.yaml that wrote them.
 */
export function collectVariations(chain: ThemeLink[], parsed: Map<string, Parsed>, relTo: (f: string) => string = (f) => f):
  { variations: VariationDecl[]; origins: Map<string, { file: string; from: string; parsed: Parsed }> } {
  const variations: VariationDecl[] = [];
  const origins = new Map<string, { file: string; from: string; parsed: Parsed }>();
  for (const link of [...chain].reverse()) {
    const v = link.yamlFile ? parsed.get(link.yamlFile)?.value : undefined;
    if (!isObj(v) || !isObj(v.variations)) continue;
    for (const [name, raw] of Object.entries(v.variations)) {
      const r = VariationSchema.safeParse(raw);
      if (!r.success) continue;                       // the strict theme.yaml pass has the diagnostic already
      const decl: VariationDecl = { name, ...r.data, declaredBy: link.name };
      const at = variations.findIndex((x) => x.name === name);
      if (at >= 0) variations[at] = decl; else variations.push(decl);
      origins.set(name, { file: relTo(link.yamlFile!), from: link.name, parsed: parsed.get(link.yamlFile!)! });
    }
  }
  return { variations, origins };
}

export interface LoadOptions {
  env?: string;
  /** extra dirs searched for `themes/<name>` and `plugins/<name>` (the monorepo adds its own) */
  searchPaths?: string[];
  /**
   * Load a theme the site has not chosen (X1). `snypd check theme <name>` judges a theme *through the
   * loader a site uses* — the same chain walk, the same strict schema pass, the same token validation —
   * and the only thing it needs that a site does not is to say which theme, out of band from `theme.use`.
   *
   * It sits here rather than anywhere downstream because the name has to be known before the theme layer
   * merges, which is the same reason `theme.variation` is read where it is, two lines below. Passing it
   * changes nothing else: the site's own `theme.tokens` still merge on top and still strand where they
   * name a token the other theme does not declare, which is exactly what a site would see if it switched.
   */
  theme?: string;
  /** The variation to resolve, out of band from `theme.variation` — for checking a look that is not the active one. */
  variation?: string;
}

const REPO = join(import.meta.dir, "..", "..", "..");

/**
 * The variations a theme ships, resolved from this root the way `loadConfig` resolves one — same search
 * paths, `REPO` included, so a theme that only exists in a checkout's `themes/` is found here too.
 *
 * `theme` › set needs this for the theme it is switching *to*, which is not the one the loaded config is
 * on: checking the pair before writing either is what stops `{ name, variation }` from leaving a site
 * switched to a theme and asking for a look it does not have.
 */
export function variationsOf(root: string, themeName: string, opts: LoadOptions = {}): VariationDecl[] {
  const { chain, parsed } = resolveThemeChain(themeName, [root, ...(opts.searchPaths ?? []), REPO], root);
  return collectVariations(chain, parsed).variations;
}
/**
 * A provenance path an agent reads, and a *stable* one (S18d′).
 *
 * A file inside the site is written relative to it. A file outside — which is every theme, since themes
 * live beside the site rather than in it, and every bundled theme, which lives in `/$bunfs` — used to be
 * written absolute, and that made `snypd://config` different bytes on every machine: this repo's own CI
 * measured `tokens.learn.editorial` at 4,807 against a checkout at `/home/runner/work/snypd/snypd` where
 * the author's box read 4,777, breaching a budget by seven tokens for a reason that had nothing to do
 * with the surface. A budget that moves with a directory name is not a budget. It also put the author's
 * home directory into a resource a model reads.
 *
 * The last two segments instead — `editorial/theme.yaml` — which is stable, shorter (absolute paths are
 * expensive in tokens), and the part a reader can act on: the theme's own name and the file in it.
 */
const rel = (root: string, f: string) => {
  const r = relative(root, f);
  if (!r.startsWith("..")) return r;
  const parts = f.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/");
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

type Parsed = ReturnType<typeof parseYaml>;
function readLayer(root: string, name: Layer["name"], file: string, diags: Diagnostic[], from?: string, wrap?: (v: unknown) => unknown, pre?: Parsed): Layer {
  const p = pre ?? parseYaml(readFileSync(file, "utf8"), rel(root, file));
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

const themeCandidates = (name: string) => [`themes/${name}`, `node_modules/${name}`, `node_modules/snypd-theme-${name}`];
const MAX_THEME_DEPTH = 8;

/**
 * A theme plus its `extends:` ancestors, child first. Every slot (layout, primitive, css) is looked up
 * along this chain by the nearest theme that declares it, and each path resolves against *that* theme's
 * dir — which is why the chain is carried whole rather than merged into one map (`loadTheme`, docs/04).
 * Never throws: an unknown parent or a cycle truncates the chain and reports.
 */
export function resolveThemeChain(themeName: string, search: string[], relTo?: string): { chain: ThemeLink[]; errors: string[]; parsed: Map<string, Parsed> } {
  const chain: ThemeLink[] = [], errors: string[] = [], seen: string[] = [];
  // Walking the chain means reading every theme.yaml to find its `extends:`. The `yaml` package costs
  // ~1.2 ms a call (docs/07 decision 12) and `mcp.coldStart` has 50 ms in total, so the parse is handed
  // back for the caller to merge from rather than thrown away and repeated.
  const parsed = new Map<string, Parsed>();
  let name: string | undefined = themeName;
  while (name) {
    if (seen.includes(name)) { errors.push(`extends cycle: ${[...seen, name].join(" \u2192 ")}`); break; }
    seen.push(name);
    // Disk first: a checkout, an npm install and a user's own theme all have a directory, and that is
    // the path everything downstream expects. Only a `--compile` binary has no `themes/` to find, and
    // there the two shipped themes answer from the barrel instead (decision 46).
    const dir: string | undefined = findIn(search, themeCandidates(name)) ?? (BUNDLED[name] ? bundledDir(name) : undefined);
    if (!dir) { errors.push(`theme "${name}" not found (looked for ${themeCandidates(name).join(", ")})`); break; }
    const yamlFile = themeHas(dir, "theme.yaml") ? join(dir, "theme.yaml") : undefined;
    chain.push({ name, dir, yamlFile });
    if (chain.length >= MAX_THEME_DEPTH) { errors.push(`extends chain deeper than ${MAX_THEME_DEPTH}: ${seen.join(" \u2192 ")}`); break; }
    let parent: string | undefined;
    if (yamlFile) {
      const p = parseYaml(themeFile(dir, "theme.yaml")!, relTo ? rel(relTo, yamlFile) : yamlFile);
      parsed.set(yamlFile, p);
      if (isObj(p.value) && typeof p.value.extends === "string" && p.value.extends) parent = p.value.extends;
    }
    name = parent;
  }
  return { chain, errors, parsed };
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
    // The base's name stays on the resolved type (R1, decision 196): a build that follows `extends` —
    // the schema a `work` emits, the layout it falls back to — reads it here, not from the provenance.
    out.extends = base;
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
  const themeName = opts.theme ?? themeOf(envView) ?? themeOf(siteView) ?? "base";
  // The variation is read from the site the same way the theme's name is, and for the same reason: both
  // decide what the *theme* layer contributes, so both have to be known before that layer merges. Env
  // over site, as everywhere — which is what lets the benchmark's editorial lane pin a variation.
  const variationOf = (v: Record<string, unknown>) => (isObj(v.theme) && typeof v.theme.variation === "string" ? v.theme.variation : undefined);
  const variationName = opts.variation ?? variationOf(envView) ?? variationOf(siteView);
  const variationFrom = opts.variation !== undefined ? undefined : variationOf(envView) !== undefined ? envLayer : variationOf(siteView) !== undefined ? site : undefined;
  /**
   * The keys a *theme* declares and a site may not (U6a decision 128, B1 decision 131). `theme.*` is
   * `passthrough` because every root key of a theme.yaml merges under it, which means a site writing one
   * of these in `snypd.yaml` is accepted and then ignored — configuration that reads like configuration
   * and does nothing, which is the shape decision 128 refused to ship and this is where it is refused.
   * A warning and not an error: an inert key has never stopped a site from building, and it should not
   * start now (the stranded-token rule, since S4).
   */
  for (const layer of [site, envLayer]) {
    if (!layer || !isObj(layer.value) || !isObj(layer.value.theme)) continue;
    const t = layer.value.theme;
    for (const [key, why] of [["variations", "a theme's looks are declared in its theme.yaml; `theme.variation` is the one word a site writes"],
                              ["font", "a webfont is a file in a theme's own directory, declared in its theme.yaml (decision 118)"]] as const) {
      if (!(key in t)) continue;
      const src: Source = { layer: layer.name, file: layer.file, line: layer.origins?.get(pathKey(["theme", key]))?.line };
      diags.push({ level: "warning", path: `theme.${key}`, message: `theme.${key} does nothing here — ${why}`, source: src, where: describeSource(src) });
    }
  }

  // Each entry remembers the line that wrote it: an options error is attributed to the site's line, which
  // is where the fix goes, not to the plugin's schema.
  const pluginEntries: { entry: unknown; origin: Source }[] = [];
  for (const layer of [site, envLayer]) if (layer && isObj(layer.value) && Array.isArray(layer.value.plugins))
    layer.value.plugins.forEach((entry, i) => pluginEntries.push({ entry, origin: { layer: layer.name, file: layer.file, line: layer.origins?.get(pathKey(["plugins", i]))?.line } }));

  // 2. theme.yaml → under `theme`, ancestors first so the child overrides (`extends:`, docs/04)
  const { chain: themeChain, errors: themeErrors, parsed: themeParsed } = resolveThemeChain(themeName, search, root);
  for (const e of themeErrors) diags.push({ level: "warning", path: "theme.use", message: e, source: prov.get("theme.use") });
  // Every root key of a theme.yaml merges into `theme.*` — except `settings:`, which is a declaration
  // and not a value (U3). `theme.settings` is the map a site answers with, and a declaration list
  // merged onto the same key would be an array where every reader expects a map. The plugin manifest's
  // rule, one file earlier: root keys merge, the block about itself does not (docs/10 §4.1).
  // `variations:` joins `settings:` in being read rather than merged, and for the same reason one step
  // further on: it is a declaration, and the value that answers it is `theme.variation`. Merging it would
  // also let a site invent a variation in `snypd.yaml` that nothing could ever apply — the site layer
  // merges at step 4 and the chosen variation's tokens land at step 2.5, below — which is a key that
  // reads as configuration and is inert. U6a left that at "better to not have the key than to warn about
  // it"; B1 warns about it after all, a few lines above, because adding a second such key made the silence
  // a pattern rather than an omission.
  // `font:` is the third of them (B1, decision 131). It is a declaration about a *file* — a .woff2 in the
  // theme's own directory, at a size the theme claims — and there is nothing about it for a site to
  // answer, so `snypd.yaml` has no key for it and `snypd://config` should not carry a block that reads
  // like one. It cost 14 tokens of `tokens.learn.editorial` on the way in, which is how it was found.
  // `pieces:` is the fourth (docs/36 §4.1): a declaration of which bricks the theme is built from, read
  // by `resolvePieces` below and by the renderer, and nothing a site answers — so it does not cost
  // `snypd://config` a line either.
  const withoutDecls = (v: unknown) => { const o = { ...(isObj(v) ? v : {}) }; delete o.settings; delete o.variations; delete o.font; delete o.pieces; return { theme: o }; };
  for (const link of [...themeChain].reverse()) if (link.yamlFile) merged = mergeLayer(merged, readLayer(root, "theme", link.yamlFile, diags, link.name, withoutDecls, themeParsed.get(link.yamlFile)), prov);
  // Every theme.yaml in the chain is validated, strictly, with file:line (decision 73). A key docs/04
  // documents and nothing reads is a warning that says so; any other unknown key, or a wrong shape, is an
  // error — the treatment snypd.yaml has had since S4, and the reason a mistyped `layout:` stopped
  // being silently discarded.
  for (const link of themeChain) {
    const p = link.yamlFile ? themeParsed.get(link.yamlFile) : undefined;
    if (!p || !isObj(p.value)) continue;
    const r = ThemeYamlSchema.safeParse(p.value);
    if (r.success) continue;
    const file = rel(root, link.yamlFile!);
    const at = (path: Path): Source => ({ layer: "theme", from: link.name, file, line: p.origins.get(pathKey(path))?.line });
    for (const i of r.error.issues) {
      const path = i.path as Path;
      if (i.code === "unrecognized_keys") {
        for (const k of (i as { keys: string[] }).keys) {
          const src = at([...path, k]);
          const unbuilt = THEME_UNBUILT_KEYS[k];
          diags.push(unbuilt
            ? { level: "warning", path: pathKey(["theme", ...path, k]), message: `\`${k}\` is documented but not built yet (${unbuilt}); ignored`, source: src, where: describeSource(src) }
            : { level: "error", path: pathKey(["theme", ...path, k]), message: `unknown key "${k}" in theme.yaml`, source: src, where: describeSource(src) });
        }
      } else {
        const src = at(path);
        diags.push({ level: "error", path: pathKey(["theme", ...path]), message: `${i.message} in theme.yaml`, source: src, where: describeSource(src) });
      }
    }
  }
  // The declarations, parent first so a child's `id` lands where its parent's was — the same "nearest
  // declarer wins" the chain gives a part, with the list's order kept. Anything that does not parse has
  // already been reported by the strict pass above, so it is left out rather than reported twice.
  // The pieces first (docs/36 §4.1): their settings are laid down beneath the chain's, so a theme that
  // redeclares a piece's `id` replaces it where it stands, the rule a child already has over its parent.
  const { pieces, diagnostics: pieceDiags } = resolvePieces(themeChain, themeParsed, (f) => rel(root, f));
  diags.push(...pieceDiags);
  const settingDecls: SettingDecl[] = pieceSettings(pieces);
  for (const link of [...themeChain].reverse()) {
    const v = link.yamlFile ? themeParsed.get(link.yamlFile)?.value : undefined;
    if (!isObj(v) || !Array.isArray(v.settings)) continue;
    for (const raw of v.settings) {
      const r = SettingDeclSchema.safeParse(raw);
      if (!r.success) continue;
      const at = settingDecls.findIndex((d) => d.id === r.data.id);
      if (at >= 0) settingDecls[at] = r.data; else settingDecls.push(r.data);
    }
  }

  const { variations, origins: variationOrigins } = collectVariations(themeChain, themeParsed, (f) => rel(root, f));

  // 2.5 the chosen variation → `theme.tokens`, between the theme's defaults and this site's overrides
  // (decision 91). It is its own layer rather than a mutation of the merged map so that provenance keeps
  // working: each token is re-attributed to the `variations.<name>.tokens.<key>` line that wrote it, so
  // `snypd://config` and `site` › explain_config say `editorial/theme.yaml:104` and not "theme default".
  // A site's own `theme.tokens` merges at step 4 and still wins, which is the whole precedence rule.
  if (variationName !== undefined) {
    const chosen = variations.find((v) => v.name === variationName);
    const vSource: Source | undefined = variationFrom
      ? { layer: variationFrom.name, file: variationFrom.file, line: variationFrom.origins?.get(pathKey(["theme", "variation"]))?.line }
      : undefined;
    if (!chosen) {
      // A warning, not an error: a theme switch strands a variation name the way it strands a token
      // override, and a site whose look reverts to the theme's defaults is still a site that builds.
      diags.push({ level: "warning", path: "theme.variation", message: `theme \`${themeName}\` declares no variation "${variationName}"${variations.length ? ` — it ships ${variations.map((v) => v.name).join(", ")}` : " (it ships none)"}; rendering its own tokens`, source: vSource, where: describeSource(vSource) });
    } else if (chosen.tokens) {
      const o = variationOrigins.get(chosen.name)!;
      const soFar = getPath(merged, ["theme", "tokens"]);
      const declared = new Set(isObj(soFar) ? Object.keys(soFar) : []);
      const origins = new Map<string, Origin>();
      for (const k of Object.keys(chosen.tokens)) {
        const at = o.parsed.origins.get(pathKey(["variations", chosen.name, "tokens", k]));
        if (at) origins.set(pathKey(["theme", "tokens", k]), at);
        // A variation may retune a token; it may not invent one, because an invented one has no `kind`,
        // no description and no declaration for `theme` › set_tokens to check against — it would be a
        // custom property the theme's own stylesheet never reads. Warned here with the line; X1's
        // `theme check` is where the same finding stops a theme from reaching the shelf.
        if (!declared.has(k)) {
          const src: Source = { layer: "theme", from: o.from, file: o.file, line: at?.line };
          diags.push({ level: "warning", path: pathKey(["theme", "variations", chosen.name, "tokens", k]), message: `variation \`${chosen.name}\` sets \`${k}\`, which theme \`${o.from}\` does not declare — a variation retunes the palette, it cannot add to it`, source: src, where: describeSource(src) });
        }
      }
      merged = mergeLayer(merged, { name: "theme", from: `${o.from} › ${chosen.name}`, file: o.file, value: { theme: { tokens: chosen.tokens } }, origins }, prov);
    }
  }

  // 2.6 the tokens the pieces read and the theme does not declare (docs/36 §3): a piece's `needs:` default,
  // or an optional contract token's derived value. After the variation, so a variation that retunes a
  // token the theme declares is not undone; before the site, so a site's override still wins; and before
  // the `cssValue` gate and `check theme`'s contrast pairs, which see them like any other token.
  if (pieces.length) {
    const soFar = getPath(merged, ["theme", "tokens"]);
    const { tokens: added, from } = pieceTokens(pieces, new Set(isObj(soFar) ? Object.keys(soFar) : []));
    for (const [id, keys] of Object.entries(Object.groupBy(Object.keys(added), (k) => from[k]!)))
      merged = mergeLayer(merged, { name: "theme", from: `piece ${id}`, file: `pieces/${id}/piece.yaml`, value: { theme: { tokens: Object.fromEntries(keys!.map((k) => [k, added[k]!])) } } }, prov);
  }

  const self = themeChain[0];
  const inherited = themeChain.slice(1).map((l) => l.name);
  layers.push({ name: "theme", from: themeName, file: self?.yamlFile ? rel(root, self.yamlFile) : undefined, found: !!self, dir: self?.dir, chain: themeChain,
    note: [self && !self.yamlFile ? "no theme.yaml yet" : "", inherited.length ? `extends ${inherited.join(" \u2192 ")}` : ""].filter(Boolean).join("; ") || undefined });

  // 3. plugins' snypd.yaml, declared order — the manifest read and checked, the root keys merged (plugins.ts, docs/10 §4.1)
  // The client-JS budget the plugins are summed against (P2, decision 84) is the *site's*: env over site
  // over the spec default, read before any plugin merges — a plugin's own `bench:` keys merge like any
  // root key, but they cannot raise the budget its own script is measured against.
  const jsKbOf = (v: Record<string, unknown>) => { const b = isObj(v.bench) && isObj(v.bench.budgets) ? v.bench.budgets.jsKb : undefined; return typeof b === "number" ? b : undefined; };
  const specJsKb = isObj(d.budgets) && typeof d.budgets.jsKb === "number" ? d.budgets.jsKb : 0;
  const jsKbFrom = jsKbOf(envView) !== undefined ? envLayer : jsKbOf(siteView) !== undefined ? site : undefined;
  const budgetKb = jsKbOf(envView) ?? jsKbOf(siteView) ?? specJsKb;
  const budgetOrigin: Source | undefined = jsKbFrom ? { layer: jsKbFrom.name, file: jsKbFrom.file, line: jsKbFrom.origins?.get(pathKey(["bench", "budgets", "jsKb"]))?.line } : undefined;
  let spentKb = 0;
  const plugins: LoadedPlugin[] = [];
  for (const { entry, origin } of pluginEntries) {
    let name: string | undefined, options: Record<string, unknown> | undefined;
    if (typeof entry === "string") name = entry;
    else if (isObj(entry) && Object.keys(entry).length === 1) {
      name = Object.keys(entry)[0]!;
      const v = entry[name];
      if (v != null && !isObj(v)) { diags.push({ level: "error", path: `plugins[${name}]`, message: `options must be a mapping, got ${JSON.stringify(v)} — not loaded`, source: origin, where: describeSource(origin), plugin: name }); continue; }
      options = isObj(v) ? v : undefined;
    }
    if (!name) { diags.push({ level: "error", path: "plugins", message: `invalid plugin entry ${JSON.stringify(entry)} — a name, or one \`{ name: { options } }\` per entry`, source: origin, where: describeSource(origin) }); continue; }
    const { plugin, layer } = loadPlugin({ entry: name, options, origin, search, rel: (f) => rel(root, f), client: { budgetKb, spentKb, origin: budgetOrigin ?? origin } });
    diags.push(...plugin.diagnostics);
    plugins.push(plugin);
    if (plugin.loaded) spentKb += plugin.clientKb;
    if (layer) merged = mergeLayer(merged, layer, prov);
    layers.push({ name: "plugin", from: plugin.name, file: plugin.file, found: plugin.found, dir: plugin.dir,
      note: !plugin.found ? undefined : !plugin.loaded ? `refused: ${plugin.why}` : plugin.manifest ? `${plugin.manifest.version}, ${plugin.where}${plugin.tiers.length ? `, ${plugin.tiers.join(" + ")}` : ""}` : `${plugin.where}, no plugin: block` });
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
    // Theme settings (U3): the value against the declaration. An id the chain does not declare is a
    // warning — a theme switch leaves values behind exactly as it leaves token overrides behind, and
    // neither should stop a site from building. A value of the *wrong shape* is an error, because the
    // theme said what shape it is: `setConfig` re-loads and rolls back, so `theme.settings.showDates:
    // "yes"` is refused at the write rather than quietly read as true at the render.
    // Token values (decision 120). Every token in the merged map, whatever declared it: a theme's own
    // default and a site's override land on the same key, and `where()` names whichever file wrote the
    // one that is refused. This is the only gate — `tokensCss` interpolates straight into `:root { … }`
    // and a build stops on `!cfg.ok`, so a value that would close that block never reaches a sheet.
    for (const [name, decl] of Object.entries(config.theme.tokens)) {
      const key = pathKey(["theme", "tokens", name]);
      const v = isObj(decl) ? decl.default : decl;
      const r = cssValue(v);
      if (!r.ok) err(key, `token \`${name}\`: ${r.why}`);
    }
    for (const [id, v] of Object.entries(config.theme.settings)) {
      const decl = settingDecls.find((d) => d.id === id);
      if (!decl) { warn(`theme.settings.${id}`, `theme \`${themeName}\` declares no setting "${id}"${settingDecls.length ? ` — it declares ${settingDecls.map((d) => d.id).join(", ")}` : " (it declares none)"}`); continue; }
      const r = settingValue(decl, v);
      if (!r.ok) err(`theme.settings.${id}`, `${r.why} (${decl.type}${decl.options ? `: ${decl.options.join(" | ")}` : ""})`);
    }
  }

  // A plugin's error refuses the plugin, not the site (docs/10 §4.1: "a plugin with bad options is not
  // loaded and the rest of the site is"). It is still an error — doctor prints it as a problem and the
  // resource header carries it — but a build goes on without the plugin rather than without a site.
  const ok = !diags.some((x) => x.level === "error" && !x.plugin);
  const source = (p: string | Path) => prov.get(typeof p === "string" ? p : pathKey(p));
  const explain = (p: string | Path) => {
    const key = typeof p === "string" ? p : pathKey(p);
    const v = getPath(raw, parsePath(key));
    if (v === undefined && !prov.has(key)) return `\`${key}\` is not set`;
    const s = prov.get(key) ?? nearest(prov, key);
    // A type's own key over one its base has (R4, docs/20 §2.4 · 2): `types.work.layout` is the site's
    // line *and* the value it hid, the way a site's line over the spec's already says what it overrides.
    // The resolved type keeps `extends` (decision 196), which is how the base is known here.
    const path = parsePath(key);
    const base = path[0] === "types" && path.length > 2 ? (raw.types as Record<string, { extends?: string } | undefined>)[String(path[1])]?.extends : undefined;
    const basePath: Path | undefined = base ? ["types", base, ...path.slice(2)] : undefined;
    const bv = basePath ? getPath(raw, basePath) : undefined;
    const over = basePath && bv !== undefined && s?.layer !== "inherited" && JSON.stringify(bv) !== JSON.stringify(v)
      ? `, overrides inherited ${JSON.stringify(bv)} (${pathKey(basePath)}, ${describeSource(prov.get(pathKey(basePath)))})` : "";
    return `\`${key}\` = ${JSON.stringify(v)} ← ${describeSource(s)}${over}`;
  };
  return { root, env, ok, config, raw, provenance: prov, layers, diagnostics: diags, plugins, settingDecls, variations, pieces, explain, source, render: () => renderConfig(raw, prov, layers, diags, env) };
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
  /**
   * What one untouched entry would collapse to, or nothing when the site (or a plugin) wrote into it.
   * `family` is the line without its position, so siblings that would say the same thing can be counted
   * together; `line` is the position, for the range that counted line prints.
   */
  const untouched = (p: Path, v: unknown): { family: string; line?: number } | undefined => {
    if (allFrom(prov, p, v, "spec")) return { family: `<@snypd/spec default — ${pointer(p)}>` };
    const s = prov.get(pathKey(p));
    if (p[0] === "theme" && s?.layer === "theme" && allFrom(prov, p, v, "theme")) return { family: `<theme ${s.from} default — ${s.file}>`, line: s.line };
    if (s?.layer === "inherited" && allFrom(prov, p, v, "inherited")) return { family: `<inherited from types.${s.from}>` };
    return undefined;
  };
  const annotate = (node: Node | null, path: Path) => {
    if (isMap(node)) {
      // A subtree the site touched (S21, decision 169). Before, one override expanded the whole map:
      // two retuned tokens listed every token the theme declares, one budget listed every budget, and a
      // type that extends `post` listed every field it inherited — and D4 went over budget with four
      // plugins on. The keys the site wrote are the lines that carry information; the untouched
      // siblings are counted on one line instead of each getting their own. Only below the second
      // level: the top two are the map an agent navigates by (`types.post`, `taxonomies.tag`), and a
      // name there is worth its line.
      const pairs = node.items as Pair<Node, Node>[];
      const keyOf = (pair: Pair<Node, Node>) => String((pair.key as { value?: unknown }).value ?? pair.key);
      const kept: Pair<Node, Node>[] = [];
      const folded = new Map<string, { n: number; lines: number[] }>();
      const fold = path.length >= 2 && pairs.some((pair) => !untouched([...path, keyOf(pair)], getPath(raw, [...path, keyOf(pair)])));
      for (const pair of pairs) {
        const k = keyOf(pair);
        const p = [...path, k];
        const v = getPath(raw, p);
        const u = untouched(p, v);
        if (fold && u) {
          const f = folded.get(u.family) ?? { n: 0, lines: [] };
          f.n++; if (u.line) f.lines.push(u.line);
          folded.set(u.family, f);
          continue;
        }
        kept.push(pair);
        if ((isObj(v) || Array.isArray(v)) && u) { pair.value = doc.createNode(u.family.replace(/>$/, `${u.line ? `:${u.line}` : ""}>`)) as Node; continue; }
        const s = prov.get(pathKey(p));
        if (s && s.layer !== "spec" && pair.value && !isMap(pair.value) && !isSeq(pair.value)) (pair.value as Node).comment = ` ← ${describeSource(s)}`;
        else if (s && s.layer !== "spec" && (isMap(pair.value) || isSeq(pair.value)) && s.file) (pair.key as Node).comment = ` ← ${s.file}${s.line ? `:${s.line}` : ""}`;
        annotate(pair.value, p);
      }
      if (folded.size) {
        // A folded key that was the only one of its family stays a line of its own — a count of one says less than the key.
        for (const [family, f] of [...folded]) if (f.n < 2) { folded.delete(family); kept.push(...pairs.filter((pair) => { const p = [...path, keyOf(pair)]; const u = untouched(p, getPath(raw, p)); return u?.family === family; }).map((pair) => { const p = [...path, keyOf(pair)]; const v = getPath(raw, p); if (isObj(v) || Array.isArray(v)) { const u = untouched(p, v)!; pair.value = doc.createNode(u.family.replace(/>$/, `${u.line ? `:${u.line}` : ""}>`)) as Node; } return pair; })); }
        node.items = pairs.filter((pair) => kept.includes(pair));
        const lines = [...folded].map(([family, f]) => {
          const range = f.lines.length ? `:${Math.min(...f.lines)}${f.lines.length > 1 ? `–${Math.max(...f.lines)}` : ""}` : "";
          return ` ${f.n} more untouched: ${family.replace(/>$/, `${range}>`)}`;
        });
        if (lines.length) node.comment = lines.join("\n");
      }
    } else if (isSeq(node)) (node.items as Node[]).forEach((it, i) => annotate(it, [...path, i]));
  };
  annotate(doc.contents as Node, []);
  const head = [
    `# snypd://config — merged (env: ${env}). Layers, later wins:`,
    ...layers.map((l, i) => `#   ${i + 1}. ${l.name}${l.from ? ` ${l.from}` : ""}${l.file ? ` (${l.file})` : ""}${l.note ? ` — ${l.note}` : l.found ? "" : " — not found"}`),
    `# Lines without "← file:line" are @snypd/spec defaults; untouched subtrees are collapsed to their snypd://spec/* resource (theme.yaml subtrees to their file:line), and inside a subtree the site wrote into, the keys it did not touch are counted on one line.`,
    ...(diags.length ? ["# Diagnostics:", ...diags.map((x) => `#   ${x.level}: ${x.path ? `${x.path}: ` : ""}${x.message}${x.where ? ` (${x.where})` : ""}`)] : []),
  ];
  return `${head.join("\n")}\n${String(doc)}`;
}

/**
 * A type and the types it extends, nearest first: `work` → `["work", "post"]`. Only a base the resolver
 * accepted is on the resolved type, so the walk cannot cycle; the bound is belt and braces.
 */
export function typeLineage(types: Record<string, { extends?: string }>, name: string): string[] {
  const out = [name];
  for (let t = types[name]?.extends; t && !out.includes(t) && out.length < 10; t = types[t]?.extends) out.push(t);
  return out;
}

/** The directory of a url pattern: `/work/{slug}` → `/work`, `/posts/{year}/{slug}` → `/posts`, `/{path}` → `/`. */
export const patternDir = (pattern: string) => normalizeRoute(pattern.replace(/\{[\s\S]*$/, ""));

/**
 * The archive each dated type has (R1, decision 194): every type with a layout and a `date` field lists
 * at the directory of its url pattern, rendered through the theme's `index` layout — `/posts/` for `post`,
 * `/work/` for a `work` — unless a page holds that route. When nothing holds `/` and there is one such
 * type, its archive *is* `/`, the list a blog always had, and this returns none: a default site keeps
 * every route it had before types could be more than one. `nav.ts` resolves a `ref` against these and
 * `build.ts` plans them, from the one rule.
 */
export function typeArchives(config: Pick<Config, "types">, homeHeld: boolean): { type: string; route: string }[] {
  const seen = new Set<string>();
  const all: { type: string; route: string }[] = [];
  for (const [type, t] of Object.entries(config.types)) {
    if (!t.layout || !t.fields.date) continue;
    const route = patternDir(t.urlPattern);
    if (seen.has(route)) continue;   // two dated types under one directory: the first declared lists there
    seen.add(route); all.push({ type, route });
  }
  return !homeHeld && all.length <= 1 ? [] : all;
}

export function formatDiagnostics(d: Diagnostic[]): string {
  return d.map((x) => `${x.level}: ${x.path ? `${x.path}: ` : ""}${x.message}${x.where ? ` (${x.where})` : ""}`).join("\n");
}

/** Routes are stored leading-slashed and un-trailing-slashed (`/posts/x`); `/` is itself. */
/**
 * The origin `init` writes when nobody has said where the site will live (S18d, docs/08 decision 63).
 *
 * The feed, the sitemap and the JSON-LD are all absolute, so a real origin is genuinely required — and
 * it is required *at publish*, not at `init`. Asking a person for a production domain before they have
 * seen one pixel is the single most reliable way to lose them, and an agent that hits a required flag it
 * cannot infer has nowhere to go but back to the human. So `init` writes this, `site` › doctor says it is
 * still unfinished, `site` › push refuses over it with the one line that fixes it — and since L2
 * (docs/31 §4) `site` › deploy *answers* it: the host names the URL on the first upload, and the site
 * is rebuilt against it and uploaded again. `publishCheck` asked from S18d to L1 and no longer does.
 *
 * It is the preview's own origin rather than a fake domain, so it is also *true* for as long as it is
 * there: everything a placeholder site renders locally points at the server that rendered it.
 */
export const PLACEHOLDER_URL = "http://localhost:4321";

/**
 * Whether `site.url` still names somewhere only this machine can reach.
 *
 * Deliberately every loopback host rather than an exact match on `PLACEHOLDER_URL`: a site configured
 * for `http://localhost:3000` has not been left unfinished by us, but its feed and sitemap are just as
 * unreachable, and this predicate is asked at exactly the two moments where that is what matters.
 */
export function isPlaceholderUrl(url: string): boolean {
  let host: string;
  try { host = new URL(url).hostname; } catch { return false; }
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

export function normalizeRoute(route: string): string {
  const r = `/${String(route).trim().replace(/^\/+/, "").replace(/\/+$/, "")}`;
  return r === "/" ? "/" : r;
}

/**
 * The site's redirects, old route → new route, both normalized (S16). Lives here rather than in site.ts
 * so the lint (which must know whether a moved route is covered) can read it without importing the write
 * half of the package.
 */
export function redirects(cfg: LoadedConfig): Record<string, string> {
  const raw = (cfg.config.site as Record<string, unknown>).redirects;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[normalizeRoute(k)] = normalizeRoute(v);
  return out;
}
