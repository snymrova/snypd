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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadConfig, formatDiagnostics, isPlaceholderUrl, normalizeRoute, redirects, PLACEHOLDER_URL, type LoadedConfig } from "./config";
import { bundledDir, bundledNames, themeFile } from "./themefs";
import { writeDeploy, type DeployTarget } from "./deploy";
import { parsePath, parseYaml, pathKey } from "./yaml";
import { WriteError } from "./write";
import { git, initRepo, isRepoRoot } from "./git";

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
    // Through the `themefs` seam, not `fs` (S18d). A bundled theme's `yamlFile` is `snypd:theme/<name>/…`,
    // which is a name and not a path — so inside a `--compile` binary this read threw, the `catch` below
    // swallowed it, and every declaration was lost. Nothing crashed: `overridden` treats an undeclared
    // token as a stranded override, so `site` › doctor told every new site it had 38 problems it did not
    // have. This is S18a's bug in its quietest form — one path on disk and another in `$bunfs` — and the
    // reason decision 46 says there is one seam. `config.ts:79` already reads this file through it.
    const text = themeFile(link.dir, "theme.yaml");
    if (text === undefined) continue;
    let raw: unknown;
    try { raw = parseYaml(text, link.yamlFile).value; } catch { continue; }   // malformed: config.ts already has the diagnostic
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
  // Disk roots first, then the themes that ship in the binary. A binary has no `themes/` beside it, so
  // without the last source `theme` › list would report nothing installed on the product users install
  // (decision 46). A theme found on disk wins: that is the one that would actually load.
  const roots = [join(root, "themes"), join(root, "node_modules", "@snypd"), join(import.meta.dir, "..", "..", "..", "themes")];
  const found: { name: string; dir: string }[] = [];
  for (const base of roots) {
    let names: string[] = [];
    try { names = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
    for (const n of names) if (existsSync(join(base, n, "theme.yaml"))) found.push({ name: n.replace(/^theme-/, ""), dir: join(base, n) });
  }
  for (const n of bundledNames()) found.push({ name: n, dir: bundledDir(n) });
  for (const { name, dir } of found) {
    if (out.has(name)) continue;
    let description: string | undefined;
    try {
      const y = parseYaml(themeFile(dir, "theme.yaml") ?? "", dir).value as Record<string, unknown> | undefined;
      const p = y?.personality;
      if (typeof p === "string") description = p.replace(/\s+/g, " ").trim();
    } catch { /* a theme that will not parse is still installed */ }
    out.set(name, { name, dir, active: name === active, description });
  }
  return [...out.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

// ── bootstrap ─────────────────────────────────────────────────────────────────
export const MCP_FILE = ".mcp.json";

/**
 * Register `snypd serve` with the harness, in the repo, beside `snypd.yaml` (S18a).
 *
 * This is the one step between an installed binary and a usable product, and until S18a nothing owned it:
 * an agent that has not loaded the server cannot be told to load it by the server's own `get-started`
 * prompt, so the instruction has to exist before any of the MCP surface does. `.mcp.json` is the
 * project-scoped form Claude Code, Cursor and Codex all read, and it is committed with the scaffold, so a
 * clone of the repo is registered too — the second person on a site does not repeat this.
 *
 * `command` names the most portable thing that is *demonstrably here* (S18d′, docs/08 §12.8). The order
 * matters, because this file is committed and has two readers who want different bytes: the person who
 * just ran `init`, for whom any working command will do, and the clone on another machine, for whom an
 * absolute path is a guaranteed failure — and a failure that arrives as §10's undiagnosable case, a
 * server that was spawned and crashed, rendered identically to one nobody restarted.
 *
 *   1. `snypd` on `PATH` → `snypd serve`. Portable, committed safely, and verified on this machine
 *      rather than assumed: S18a was right that naming a command the harness cannot spawn fails in a log
 *      nobody reads, and the fix for that is to look before naming it, not to give up on the name.
 *   2. run through `bunx`/`npx`, i.e. `process.execPath` sits in a package-manager cache that may be
 *      collected → name the launcher the same way they reached it. `bunx snypd init` is docs/08 §2 step
 *      4, so this is the majority path's registration, and writing the cache path there would produce a
 *      file that stops working on this machine, not merely on somebody else's.
 *   3. otherwise the running binary (`process.execPath`) — the S18a behaviour, now the fallback: an
 *      installer that dropped it in `~/.local/bin` without a shell restart still gets a working harness.
 *
 * A `bun`-run checkout is the exception and gets `bun <entry>`, because `process.execPath` there is Bun
 * itself. `site` › doctor reports which of these the file names and whether it resolves here.
 *
 * Never overwrites: an existing `.mcp.json` may hold other servers, and one of them may be a snypd the
 * operator pointed somewhere on purpose.
 */
export function registerMcp(root: string, opts: { command?: string; args?: string[] } = {}): boolean {
  const file = join(root, MCP_FILE);
  if (existsSync(file)) {
    // Only add ourselves if the file does not already name a `snypd` server.
    try {
      const cur = JSON.parse(readFileSync(file, "utf8")) as { mcpServers?: Record<string, unknown> };
      if (cur.mcpServers?.snypd) return false;
      cur.mcpServers = { ...cur.mcpServers, snypd: mcpEntry(root, opts) };
      writeFileSync(file, JSON.stringify(cur, null, 2) + "\n");
      return false;   // the file already existed; it is not something `init` created
    } catch { return false; }   // not ours to repair
  }
  writeFileSync(file, JSON.stringify({ mcpServers: { snypd: mcpEntry(root, opts) } }, null, 2) + "\n");
  return true;
}

function mcpEntry(root: string, opts: { command?: string; args?: string[] }) {
  if (opts.command) return { command: opts.command, args: opts.args ?? ["serve"] };
  return mcpCommand(process.execPath, process.argv[1]);
}

/**
 * The four-branch decision above, as a function of its inputs rather than of this process.
 *
 * Every branch but one is unreachable from `bun test`, which runs under Bun and takes the first: the
 * cases that matter in distribution are exactly the cases a test cannot arrive in by accident. So the
 * decision takes `exec`, `argv1` and `env` as arguments and the test drives all four (S18d′).
 */
export function mcpCommand(exec: string, argv1?: string, env: Record<string, string | undefined> = process.env): { command: string; args: string[] } {
  // A compiled binary is its own command; a checkout is `bun <entry>` — argv[1] is the script Bun ran.
  if (/(^|[\\/])bun(\.exe)?$/.test(exec)) return { command: exec, args: [argv1 ?? "packages/cli/src/index.ts", "serve"] };
  if (onPath("snypd", env)) return { command: "snypd", args: ["serve"] };
  const runner = ephemeralRunner(exec);
  if (runner === "bunx") return { command: "bunx", args: ["snypd", "serve"] };
  if (runner === "npx") return { command: "npx", args: ["-y", "snypd", "serve"] };
  return { command: exec, args: ["serve"] };
}

/**
 * `which`, without shelling out or reaching for a `Bun.*` the runtime seam does not carry (docs/04).
 * Exported because `site` › doctor answers "does the command in `.mcp.json` exist here?" with it.
 */
export function onPath(cmd: string, env = process.env): string | null {
  const parts = (env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  const names = process.platform === "win32" ? [`${cmd}.exe`, `${cmd}.cmd`, `${cmd}.bat`, cmd] : [cmd];
  for (const dir of parts) for (const n of names) {
    const p = join(dir, n);
    try { if (statSync(p).isFile()) return p; } catch { /* not here */ }
  }
  return null;
}

/**
 * Whether this binary is living in a package-manager cache that is not ours to name.
 *
 * `bunx` unpacks into `/tmp/bunx-<uid>-<pkg>@<version>/`, `npx` into `~/.npm/_npx/<hash>/`. Both are
 * collected — writing either path into a committed file produces a registration with an expiry date.
 */
function ephemeralRunner(exec: string): "bunx" | "npx" | null {
  if (/[\\/]bunx-[^\\/]*[\\/]/.test(exec) || /[\\/]\.bun[\\/]install[\\/]cache[\\/]/.test(exec)) return "bunx";
  if (/[\\/]_npx[\\/]/.test(exec)) return "npx";
  return null;
}


/**
 * Both fields are optional (S18d, docs/08 decision 63), and that is the whole of the change.
 *
 * `snypd init` exited 2 without `--name` and `--url`, and `site` › init called `need(args, "url")` — so a
 * person who had just met a CMS was asked for a production origin before seeing one pixel, and the agent
 * trying to help them could not route around it either. Name falls back to the directory, which is what
 * the person called it; URL falls back to `PLACEHOLDER_URL`, which comes due at publish (`publishCheck`).
 *
 * A URL that is *passed* and is not a URL still throws: a typo is a different thing from an omission.
 */
export interface InitInput { name?: string; url?: string; description?: string; theme?: string; deploy?: DeployTarget }
export interface InitResult { file: string; paths: string[]; created: string[]; git: boolean; gitInit: boolean; name: string; url: string; placeholderUrl: boolean; deploy?: DeployTarget }

/**
 * Whether `init` should create the repository itself (S18d, docs/08 §7 · 1 → 2).
 *
 * Nothing in this product works without git: writes land on a drafts branch, publishing lands one path
 * onto the base, and `content.create` refuses outright without a repo to commit into. An `init` that
 * writes a scaffold and then tells a first-timer to go and run `git init` themselves leaves the scaffold
 * uncommitted, which makes their *first write* refuse — the whole of the empty-directory first run,
 * failing on the step after the one that could have prevented it.
 *
 * Two conditions, and the second is the one that matters. **Empty**, because creating a repo around
 * files somebody else put here is not ours to assume — that case is reported and left alone. And **not
 * already inside a work tree**: `git init` in a subdirectory of an existing repo silently creates a
 * nested one, and a nested repo is invisible until it has swallowed a directory of somebody's work.
 * `isRepoRoot` alone cannot tell those apart — it is false both for a virgin directory and for a
 * subdirectory of a repo — so the enclosing-tree question is asked separately.
 */
function shouldInitRepo(root: string): boolean {
  if (isRepoRoot(root)) return false;
  if (git(root, "rev-parse", "--show-toplevel").ok) return false;   // inside somebody else's repo
  try { return readdirSync(root).length === 0; } catch { return false; }
}

/**
 * Write the smallest `snypd.yaml` that loads, plus the directories content lives in (S16). This is what the
 * `get-started` prompt calls first: `setConfig` patches a config, and something has to have written one.
 * Deliberately tiny — every key it leaves out is a key `snypd://config` already answers from the spec, and a
 * starter file full of restated defaults is a file nobody dares delete a line from.
 */
export function initSite(root: string, input: InitInput): InitResult {
  const file = join(root, CONFIG_FILE);
  if (existsSync(file)) throw new WriteError(`${CONFIG_FILE} already exists`, "This site is already initialised — `site` › set_config changes one key, `site` › doctor says whether it is sound.");
  // Named after the directory when nobody said otherwise — which is what the person called it, and is
  // one `site` › set_config away from whatever they meant. `resolve` first, so `.` is not a site called ".".
  const name = input.name?.trim() || basename(resolve(root)) || "site";
  if (input.url !== undefined) { try { new URL(input.url); } catch { throw new WriteError(`"${input.url}" is not a URL`, "An absolute origin the site will be served from, e.g. https://example.com — the feed, sitemap and JSON-LD all need it."); } }
  const url = (input.url ?? PLACEHOLDER_URL).replace(/\/+$/, "");
  const placeholderUrl = isPlaceholderUrl(url);
  const yaml = `# ${name} — the whole site config. Every key not named here comes from @snypd/spec;
# \`snypd://config\` is the merged result with a comment saying where each value came from.
snypd: 1

site:
  name: ${JSON.stringify(name)}
  url: ${JSON.stringify(url)}${placeholderUrl ? "   # placeholder — the feed, sitemap and JSON-LD are absolute, so publishing needs the real one" : ""}${input.description ? `\n  description: ${JSON.stringify(input.description)}` : ""}

theme:
  use: ${input.theme ?? "editorial"}
`;
  // Asked before a byte is written, because the answer is "is this directory empty" and one line from now
  // it will not be. `initRepo` uses `-b main`, which is `DEFAULT_BASE` — so the branch a publish lands on
  // is the branch the site was born on, rather than whatever `init.defaultBranch` happens to be set to.
  const gitInit = shouldInitRepo(root);
  if (gitInit) initRepo(root);
  const created: string[] = [];
  writeFileSync(file, yaml);
  created.push(CONFIG_FILE);
  // The dirs the *config* says content lives in, not a hardcoded guess: the spec's `post` type is
  // `content/posts`, so a scaffold that wrote `content/post/` left every new site with two decoy folders
  // and made the real one appear only on the first write.
  const scaffold = loadConfig(root);
  const dirs = scaffold.ok ? [...new Set(Object.values(scaffold.config.types).map((t) => t.dir))] : ["content/posts", "content/pages"];
  for (const d of [...dirs, "content/media"]) {
    const dir = join(root, d);
    if (existsSync(dir)) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitkeep"), "");
    created.push(`${d}/`);
  }
  const ignore = join(root, ".gitignore");
  if (!existsSync(ignore)) { writeFileSync(ignore, "dist/\n.snypd/\nnode_modules/\n"); created.push(".gitignore"); }
  if (registerMcp(root)) created.push(MCP_FILE);
  // The host's half of the contract (S18d′, `07` §3b): a build command and an output directory, written
  // into the repo rather than typed into a dashboard. Validated before anything else is, so an unknown
  // target fails on an empty directory instead of half a site.
  if (input.deploy) created.push(...writeDeploy(root, input.deploy, { name }));
  const cfg = loadConfig(root);
  if (!cfg.ok) throw new WriteError(`the config just written does not load`, formatDiagnostics(cfg.diagnostics));
  return { deploy: input.deploy, file: CONFIG_FILE, paths: created.filter((p) => !p.endsWith("/")).concat(created.filter((p) => p.endsWith("/")).map((p) => `${p}.gitkeep`)), created, git: isRepoRoot(root), gitInit, name, url, placeholderUrl };
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
