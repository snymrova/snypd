/**
 * Site-level writes and health (docs/03 `site.*`), S16. The content tools edit one file; these edit the
 * *shape* of the site — `snypd.yaml`, its redirects, and the report that says whether any of it is sound.
 *
 * Two rules this file exists to keep:
 *  - **a config write is never left invalid.** `snypd.yaml` is patched through the `yaml` Document API so a
 *    human's comments and key order survive, then the whole config is re-loaded and validated; a patch that
 *    does not load is rolled back on disk before the error is returned. An agent cannot leave the site broken
 *    by setting one key wrong, which is the only reason it is safe to let it set keys at all.
 *  - **a redirect is a real artefact.** Lint rule 10 has warned since S6 that a moved post has nothing
 *    redirecting its old URL while telling the author the fix "lands in v0.2". `setRedirect` is that fix:
 *    it writes `site.redirects`, the build emits it (`_redirects` plus one meta-refresh page per entry, so
 *    it works on a host that reads neither), and rule 10 goes quiet for a route that is covered.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { loadConfig, formatDiagnostics, normalizeRoute, redirects, type LoadedConfig } from "./config";
import { parsePath, parseYaml, pathKey } from "./yaml";
import { WriteError } from "./write";
import { isRepoRoot } from "./git";

export const CONFIG_FILE = "snypd.yaml";
export { normalizeRoute, redirects } from "./config";

export interface ConfigWrite { path: string; from: unknown; to: unknown; file: string; paths: string[] }

/**
 * Set (or, with `null`, delete) one dotted path in `snypd.yaml`. Validates by re-loading the merged config
 * and rolls the file back if that fails — the error carries the diagnostics, so the agent sees what it broke
 * rather than a site that no longer loads.
 */
export function setConfig(root: string, path: string, value: unknown): ConfigWrite {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) throw new WriteError(`no ${CONFIG_FILE} at ${root}`, "Run the `get-started` prompt — it writes the file this patches.");
  const before = readFileSync(file, "utf8");
  const doc = parseDocument(before);
  const keys = parsePath(path);
  if (!keys.length) throw new WriteError("path required", "A dotted path into the config, e.g. `site.name` or `theme.tokens.accent`.");
  const from = doc.getIn(keys, true) === undefined ? undefined : doc.getIn(keys);
  // Judged on the value, not the bytes: re-serialising through the Document API normalises a human's
  // comment spacing, and an agent asking for a value the file already holds should not rewrite the file
  // — or commit — over that.
  const same = value === null ? from === undefined : JSON.stringify(from) === JSON.stringify(value);
  if (same) return { path, from, to: value, file: CONFIG_FILE, paths: [] };
  if (value === null) doc.deleteIn(keys); else doc.setIn(keys, value);
  const after = `${doc.toString({ lineWidth: 0 }).replace(/\n+$/, "")}\n`;
  if (after === before) return { path, from, to: value, file: CONFIG_FILE, paths: [] };
  writeFileSync(file, after);
  const cfg = loadConfig(root);
  if (!cfg.ok) {
    writeFileSync(file, before);
    throw new WriteError(`${path} = ${JSON.stringify(value)} does not validate; ${CONFIG_FILE} was left unchanged`, formatDiagnostics(cfg.diagnostics));
  }
  return { path, from, to: value, file: CONFIG_FILE, paths: [CONFIG_FILE] };
}

/** Add or remove one redirect. `to: null` removes it. A redirect to itself is a loop and is refused. */
export function setRedirect(root: string, from: string, to: string | null): ConfigWrite & { from_: string; to_: string | null } {
  const a = normalizeRoute(from);
  if (to === null) {
    const w = setConfig(root, pathKey(["site", "redirects", a]), null);
    return { ...w, from_: a, to_: null };
  }
  const b = normalizeRoute(to);
  if (a === b) throw new WriteError(`${a} redirects to itself`, "The old route and the new one have to differ.");
  const existing = redirects(loadConfig(root));
  let hop = b; const seen = new Set([a]);
  while (existing[hop] && !seen.has(hop)) { seen.add(hop); hop = existing[hop]!; }
  if (hop === a) throw new WriteError(`${a} → ${b} closes a redirect loop`, `${b} already redirects back to ${a}. Remove that one first.`);
  const w = setConfig(root, pathKey(["site", "redirects", a]), b);
  return { ...w, from_: a, to_: b };
}

// ── themes ────────────────────────────────────────────────────────────────────

export interface TokenInfo {
  name: string; value: string | number;
  /** The declared default, before any `snypd.yaml` override. */
  default: string | number;
  kind?: string; description?: string;
  /** Only a token the theme marks `customisable` may be set from `snypd.yaml`. */
  customisable: boolean;
  /** The theme in the chain that declared it. */
  declaredBy?: string;
  /** True when `snypd.yaml` (or an env layer) has moved it off its default. */
  overridden: boolean;
}

const isDecl = (v: unknown): v is { default: string | number; customisable?: boolean; kind?: string; description?: string } =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "default" in (v as Record<string, unknown>);

/**
 * Every token the active theme chain declares, with its default, whether it may be set, and whether it has
 * been. Walks the chain parent-first so a child's redeclaration wins, then reads the merged config for the
 * effective value — which is where a `snypd.yaml` scalar has already replaced the declaration.
 */
export function themeTokens(cfg: LoadedConfig): TokenInfo[] {
  const chain = cfg.layers.find((l) => l.name === "theme")?.chain ?? [];
  const decls = new Map<string, { decl: unknown; by: string }>();
  for (const link of [...chain].reverse()) {
    if (!link.yamlFile) continue;
    let raw: unknown;
    try { raw = parseYaml(readFileSync(link.yamlFile, "utf8"), link.yamlFile).value; } catch { continue; }
    const t = (raw as Record<string, unknown> | undefined)?.tokens;
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    for (const [k, v] of Object.entries(t as Record<string, unknown>)) decls.set(k, { decl: v, by: link.name });
  }
  const merged = cfg.config.theme.tokens as Record<string, unknown>;
  const names = [...new Set([...decls.keys(), ...Object.keys(merged)])].sort();
  return names.map((name) => {
    const d = decls.get(name)?.decl;
    const dec = isDecl(d) ? d : undefined;
    const eff = merged[name];
    const value = (isDecl(eff) ? eff.default : (eff as string | number)) ?? dec?.default ?? "";
    return {
      name, value, default: dec?.default ?? value,
      kind: dec?.kind, description: dec?.description,
      customisable: dec?.customisable ?? false,
      declaredBy: decls.get(name)?.by,
      // Overridden = snypd.yaml has moved it. A token the chain never declared counts too: that is a
      // stranded override left behind by a theme switch, which is exactly what `doctor` should surface.
      overridden: !decls.has(name) ? true : dec ? !isDecl(eff) : String(d) !== String(eff),
    };
  });
}

/** Theme directories this root can resolve, active one first. Used by `snypd://theme` and `theme` › set. */
export function installedThemes(root: string, activeName?: string): { name: string; dir: string; active: boolean; description?: string }[] {
  // `activeName` is passed by every caller that already holds a config. Without it this re-loads, and a
  // caller working from a non-default env layer (the benchmark's editorial lane) would be told the wrong
  // theme is active — which is how S16 first reported base's personality under editorial.
  const active = activeName ?? loadConfig(root).config.theme.use;
  const out = new Map<string, { name: string; dir: string; active: boolean; description?: string }>();
  for (const base of [join(root, "themes"), join(root, "node_modules", "@snypd"), join(import.meta.dir, "..", "..", "..", "themes")]) {
    let names: string[] = [];
    try { names = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
    for (const n of names) {
      const dir = join(base, n);
      if (!existsSync(join(dir, "theme.yaml"))) continue;
      const name = n.replace(/^theme-/, "");
      if (out.has(name)) continue;
      let description: string | undefined;
      try {
        const y = parseYaml(readFileSync(join(dir, "theme.yaml"), "utf8"), dir).value as Record<string, unknown> | undefined;
        const p = y?.personality;
        if (typeof p === "string") description = p.replace(/\s+/g, " ").trim();
      } catch { /* a theme that will not parse is still installed */ }
      out.set(name, { name, dir, active: name === active, description });
    }
  }
  return [...out.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

// ── bootstrap ─────────────────────────────────────────────────────────────────

export interface InitInput { name: string; url: string; description?: string; theme?: string }
export interface InitResult { file: string; paths: string[]; created: string[]; git: boolean }

/**
 * Write the smallest `snypd.yaml` that loads, plus the directories content lives in (S16). This is what the
 * `get-started` prompt calls first: `setConfig` patches a config, and something has to have written one.
 * Deliberately tiny — every key it leaves out is a key `snypd://config` already answers from the spec, and a
 * starter file full of restated defaults is a file nobody dares delete a line from.
 */
export function initSite(root: string, input: InitInput): InitResult {
  const file = join(root, CONFIG_FILE);
  if (existsSync(file)) throw new WriteError(`${CONFIG_FILE} already exists`, "This site is already initialised — `site` › set_config changes one key, `site` › doctor says whether it is sound.");
  if (!input.name?.trim()) throw new WriteError("name required", "The site's name, as a reader would see it.");
  try { new URL(input.url); } catch { throw new WriteError(`"${input.url}" is not a URL`, "An absolute origin the site will be served from, e.g. https://example.com — the feed, sitemap and JSON-LD all need it."); }
  const url = input.url.replace(/\/+$/, "");
  const yaml = `# ${input.name} — the whole site config. Every key not named here comes from @snypd/spec;
# \`snypd://config\` is the merged result with a comment saying where each value came from.
snypd: 1

site:
  name: ${JSON.stringify(input.name)}
  url: ${JSON.stringify(url)}${input.description ? `\n  description: ${JSON.stringify(input.description)}` : ""}

theme:
  use: ${input.theme ?? "editorial"}
`;
  const created: string[] = [];
  writeFileSync(file, yaml);
  created.push(CONFIG_FILE);
  for (const d of ["content/post", "content/page", "content/media"]) {
    const dir = join(root, d);
    if (existsSync(dir)) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitkeep"), "");
    created.push(`${d}/`);
  }
  const ignore = join(root, ".gitignore");
  if (!existsSync(ignore)) { writeFileSync(ignore, "dist/\n.snypd/\nnode_modules/\n"); created.push(".gitignore"); }
  const cfg = loadConfig(root);
  if (!cfg.ok) throw new WriteError(`the config just written does not load`, formatDiagnostics(cfg.diagnostics));
  return { file: CONFIG_FILE, paths: created.filter((p) => !p.endsWith("/")).concat(created.filter((p) => p.endsWith("/")).map((p) => `${p}.gitkeep`)), created, git: isRepoRoot(root) };
}

/**
 * `snypd://theme` as text (S16). Lives here rather than in the MCP resource handler because the benchmark
 * counts it too — docs/05 scopes "learning the site" to config + spec/primitives + theme, and a resource
 * the agent reads at session start has to be the same bytes the budget is measured against.
 * Deliberately short: the palette (`snypd://theme/tokens`) and the coverage list are separate reads,
 * paid by an agent that is actually restyling.
 */
export function renderThemeSummary(root: string, cfg: LoadedConfig): string {
  const installed = installedThemes(root, cfg.config.theme.use);
  const chain = cfg.layers.find((l) => l.name === "theme")?.chain ?? [];
  const rows = themeTokens(cfg);
  const active = installed.find((t) => t.active);
  return [
    "# A theme is `theme.yaml` plus one stylesheet; anything it does not declare resolves up `extends:`.",
    "# snypd://theme/tokens is the palette, snypd://theme/coverage what it implements, `theme` › scaffold a new one.",
    `active: ${cfg.config.theme.use}`,
    `extends: [${chain.slice(1).map((l) => l.name).join(", ")}]`,
    `tokens: ${rows.length} declared, ${rows.filter((t) => t.customisable).length} settable, ${rows.filter((t) => t.overridden).length} overridden here`,
    ...(active?.description ? ["reads as: >-", `  ${active.description}`] : []),
    // Names only. Another theme's personality is one `theme` › set away, and charging every session for
    // every installed theme's prose is how a resource that is read once a session turns into a tax.
    `installed: [${installed.map((t) => t.name).join(", ")}]`,
  ].join("\n") + "\n";
}
