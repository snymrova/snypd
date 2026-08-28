/**
 * The deferred half of the tool surface (docs/07 decision 38), S16.
 *
 * `tools/list` costs tokens on every single turn, whether or not the agent themes anything. Measured in
 * S15: 203 tokens per tool. The full v0.1 surface written flat — docs/03's `theme.* site.* bench.*` and the
 * namespaces after them — is ~8,600 tokens an agent pays before it writes a word, on top of the 4,450 it
 * pays to learn the vocabulary. So the surface is split in two:
 *
 *  - **always listed:** `content.*`, the hot path, plus `find_tools`;
 *  - **listed on demand:** this file. `find_tools` returns these schemas in full and unlocks them for the
 *    session, which is announced with `notifications/tools/list_changed`. A client that ignores the
 *    notification loses nothing: `callTool` accepts a catalogue tool whether or not it was ever listed,
 *    so the schema `find_tools` printed is enough to call it.
 *
 * Each namespace is *one* tool with an `action`, not one tool per verb, for the same reason: nine `theme.*`
 * tools is nine descriptions, and eight of them repeat what a theme is. Reads are not here at all — they are
 * resources (`snypd://theme`, `snypd://theme/coverage`, `snypd://bench/latest`), which cost nothing until
 * something reads them.
 *
 * This module is imported only when `find_tools` runs or one of its tools is called, so nothing here is on
 * the path `mcp.coldStart` measures.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Tool, ToolResult } from "./protocol";

type Core = typeof import("@snypd/core");
let core: Core | undefined;
const loadCore = async () => (core ??= await import("@snypd/core"));

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const S = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

/** Words `find_tools` matches on beyond the name and description — what an agent would actually type. */
export const KEYWORDS: Record<string, string[]> = {
  theme: ["theme", "design", "look", "style", "css", "colour", "color", "token", "font", "dark mode", "palette", "skin", "brand", "typography", "scaffold", "appearance"],
  site: ["config", "configuration", "settings", "snypd.yaml", "redirect", "moved", "url", "doctor", "health", "diagnose", "build", "deploy", "publish site", "name", "domain"],
  bench: ["bench", "benchmark", "speed", "performance", "budget", "fast", "slow", "measure", "timing", "regression", "lighthouse", "accessibility", "a11y"],
};

export const CATALOG: Tool[] = [
  { name: "theme",
    description: "Change how the site looks: switch theme, retune its tokens, or scaffold a new one. A theme in snypd is `theme.yaml` plus one stylesheet — no components are required, because every primitive and layout resolves up the `extends:` chain — so `scaffold` gives you a working theme you only have to restyle. Read snypd://theme for what is installed, snypd://theme/tokens for every knob and its default, and snypd://theme/coverage for which primitives the active theme actually implements. Nothing here rebuilds the site: call content.render_preview to look at the result.",
    inputSchema: S({
      action: str("`set` a different theme · `set_tokens` to retune the active one · `scaffold` a new theme that extends an existing one", { enum: ["set", "set_tokens", "scaffold"] }),
      name: str("`set`: the theme to use. `scaffold`: the name of the new theme (also its directory under themes/)"),
      tokens: { type: "object", description: "`set_tokens`: token name → value, e.g. {\"color.accent\": \"#8a3324\"}. A token set to null goes back to the theme's default. Only tokens declared `customisable` can be set — snypd://theme/tokens lists them" },
      extends: str("`scaffold`: the theme the new one inherits every layout, primitive and token from. Default `base`"),
    }, ["action"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },

  { name: "site",
    description: "Change the site itself rather than a post: one config key, a redirect for a URL that moved, a health report, or a build. Config writes are validated before they stick — a patch that would not load is rolled back and the diagnostics come back instead, so a wrong key cannot leave the site broken. Read snypd://config first: it is the merged result with provenance, so it already says where every value came from.",
    inputSchema: S({
      action: str("`init` a new site here · `set_config` one key · `explain_config` where a value came from · `set_redirect` for a moved URL · `doctor` for a health report · `build` the site to dist/", { enum: ["init", "set_config", "explain_config", "set_redirect", "doctor", "build"] }),
      path: str("`set_config`/`explain_config`: a dotted path into the config, e.g. `site.name`, `theme.use`, `types.post.urlPattern`. Bracket a key that contains dots"),
      value: { description: "`set_config`: the new value — any JSON. `null` deletes the key and restores whatever it was overriding" },
      from: str("`set_redirect`: the old route, e.g. `/posts/old-slug`"),
      to: str("`set_redirect`: the route it moved to. `null` removes the redirect instead"),
      name: str("`init`: the site's name, as a reader sees it"),
      url: str("`init`: the absolute origin it will be served from, e.g. https://example.com — the feed, sitemap and JSON-LD all need it"),
      description: str("`init`: one sentence about the site"),
      theme: str("`init`: the theme to start on. Default `editorial`"),
    }, ["action"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },

  { name: "bench",
    description: "Run snypd's own benchmark suite and read the result. Every speed claim in this project is a number from here with a budget next to it, so this is how you check that a change — a theme, a token, a hundred new posts — did not cost something. `run` takes minutes at full size; `quick` is the same metrics at fewer repetitions. snypd://bench/latest is the last full report and costs nothing to read.",
    inputSchema: S({
      action: str("`run` the suite · `compare` two saved reports", { enum: ["run", "compare"] }),
      suite: str("`run`: `full` (default) · `quick` · `page` (a real browser: 0 KB JS, axe, CLS) · `visual` (per-primitive render cost) · `suggest` (suggest_blocks precision)", { enum: ["full", "quick", "page", "visual", "suggest"] }),
      a: str("`compare`: path to the baseline report JSON"),
      b: str("`compare`: path to the new report JSON"),
    }, ["action"]),
    annotations: { readOnlyHint: true, idempotentHint: false } },
];

export const CATALOG_NAMES = new Set(CATALOG.map((t) => t.name));

/** Words that carry no intent. Without this "change the accent colour" matches every tool that says "the". */
const STOP = new Set(["the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "is", "it", "my", "me", "this", "that", "how", "do", "can", "i", "want", "need", "with", "site", "post", "page"]);

/**
 * Rank the catalogue against a free-text query. Empty query = everything, in declaration order.
 * A result has to *earn* its place: one incidental substring hit is not a match, and anything scoring far
 * below the best match is dropped. Returning the whole catalogue for a vague query would quietly undo the
 * split — the agent would pay for all of it anyway, just one call later.
 */
export function search(query: string): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATALOG;
  const words = q.split(/[^a-z0-9.]+/).filter((w) => w && !STOP.has(w) && (w.length > 2 || CATALOG_NAMES.has(w)));
  if (!words.length) return CATALOG;
  const scored = CATALOG.map((t) => {
    const hay = `${t.name} ${t.description ?? ""}`.toLowerCase();
    const keys = KEYWORDS[t.name] ?? [];
    let score = 0;
    for (const w of words) {
      if (t.name === w) score += 10;
      else if (t.name.startsWith(w) || w.startsWith(t.name)) score += 6;
      if (keys.some((k) => k === w)) score += 4;
      else if (keys.some((k) => k.includes(w) || w.includes(k))) score += 2;
      else if (hay.includes(w)) score += 1;
    }
    return { t, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  const floor = Math.max(2, best / 3);
  return scored.filter((x) => x.score >= floor).map((x) => x.t);
}

const text = (s: string, structured?: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text: s }], ...(structured ? { structuredContent: structured } : {}) });
const fail = (message: string, hint?: string): ToolResult => ({ content: [{ type: "text", text: hint ? `${message}\n↳ ${hint}` : message }], structuredContent: { ok: false, error: message, ...(hint ? { hint } : {}) }, isError: true });
const need = (args: Record<string, unknown>, key: string): string => {
  const v = args[key];
  if (typeof v !== "string" || !v) throw new Error(`${key} required`);
  return v;
};

/** The starter stylesheet a scaffolded theme gets: every token it can reach, as the vars it will use. */
function starterCss(name: string, parent: string, tokens: { name: string; kind?: string }[]): string {
  const varOf = (t: string) => `--${t.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  const colour = tokens.filter((t) => t.kind === "color").slice(0, 8);
  return `/* ${name} — one stylesheet over \`${parent}\`'s markup. The build emits every token above this file
   as a CSS custom property, so a value here is always a var(): recolour in snypd.yaml, never in here.
   \`snypd://theme/tokens\` lists all ${tokens.length}; the ones this file starts with are below. */

*, *::before, *::after { box-sizing: border-box; }

:root {
  color-scheme: light dark;
  --content: min(100% - 2rem, var(--measure, 34rem));
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font: var(--size-body) / var(--leading-body) var(--font-body);
}

main { width: var(--content); margin-inline: auto; }

a { color: var(--color-accent); }

/* Available to you, straight from \`${parent}\`:
${colour.map((t) => ` *   var(${varOf(t.name)})`).join("\n")}
 * …and the rest in snypd://theme/tokens. Style the primitives by their \`snypd-<name>\` class. */
`;
}

export async function call(root: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const c = await loadCore();
  const cfgOf = () => {
    const cfg = c.loadConfig(root);
    if (!cfg.ok) throw new Error(`snypd.yaml is invalid: ${c.formatDiagnostics(cfg.diagnostics)}`);
    return cfg;
  };
  /** Commit a site-level write on the branch that is checked out — these are not per-item drafts. */
  const commit = async (paths: string[], subject: string) => {
    if (!paths.length) return "nothing to commit";
    const repo = c.Repo.open(root);
    if (!repo) return "not a git repo: written, not committed";
    const r = repo.commit(paths, subject);
    return r.committed ? `committed ${r.sha!.slice(0, 8)}` : `no commit: ${r.reason}`;
  };

  try {
    switch (name) {
      case "theme": {
        const action = need(args, "action");
        if (action === "set") {
          const want = need(args, "name");
          const before = cfgOf().config.theme.use;
          const installed = c.installedThemes(root, before);
          const found = installed.find((t) => t.name === want);
          if (!found) return fail(`no theme "${want}"`, `Installed: ${installed.map((t) => t.name).join(", ")}. \`theme\` › scaffold makes a new one.`);
          if (before === want) return text(`${want} is already the active theme`, { ok: true, theme: want, changed: false });
          const w = c.setConfig(root, "theme.use", want);
          const cfg = cfgOf();
          const stranded = c.themeTokens(cfg).filter((t) => t.overridden && !t.customisable);
          const git = await commit(w.paths, `theme: use ${want}`);
          const lines = [`theme ${before} → ${want}`, git];
          if (stranded.length) lines.push(`⚠ ${stranded.length} token override${stranded.length === 1 ? "" : "s"} in snypd.yaml that ${want} does not declare: ${stranded.map((t) => t.name).join(", ")}`);
          lines.push("Look at it with content.render_preview; snypd://theme/coverage says which primitives this theme implements itself.");
          return text(lines.join("\n"), { ok: true, theme: want, from: before, changed: true, strandedTokens: stranded.map((t) => t.name) });
        }
        if (action === "set_tokens") {
          const patch = args.tokens;
          if (!patch || typeof patch !== "object" || Array.isArray(patch)) return fail("tokens required", "An object of token → value, e.g. {\"color.accent\": \"#8a3324\"}.");
          const table = new Map(c.themeTokens(cfgOf()).map((t) => [t.name, t]));
          const entries = Object.entries(patch as Record<string, unknown>);
          const unknown = entries.filter(([k]) => !table.has(k)).map(([k]) => k);
          if (unknown.length) return fail(`unknown token${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`, `snypd://theme/tokens lists every token this theme declares. Closest: ${[...table.keys()].filter((k) => unknown.some((u) => k.includes(u.split(".")[0] ?? ""))).slice(0, 6).join(", ") || "none"}`);
          const locked = entries.filter(([k, v]) => v !== null && !table.get(k)!.customisable).map(([k]) => k);
          if (locked.length) return fail(`${locked.join(", ")} ${locked.length === 1 ? "is" : "are"} not customisable`, "The theme declares these as fixed — they are structure, not taste. Scaffold a theme that extends this one to change them.");
          const paths: string[] = [], done: string[] = [];
          for (const [k, v] of entries) {
            const w = c.setConfig(root, c.pathKey(["theme", "tokens", k]), v);
            paths.push(...w.paths);
            done.push(`${k}: ${table.get(k)!.value} → ${v === null ? `${table.get(k)!.default} (default)` : String(v)}`);
          }
          const git = await commit([...new Set(paths)], `theme: tokens (${entries.map(([k]) => k).join(", ")})`);
          return text([`${entries.length} token${entries.length === 1 ? "" : "s"} set`, ...done.map((d) => `  ${d}`), git].join("\n"), { ok: true, tokens: Object.fromEntries(entries) });
        }
        if (action === "scaffold") {
          const newName = need(args, "name");
          if (!/^[a-z][a-z0-9-]*$/.test(newName)) return fail(`"${newName}" is not a theme name`, "Lowercase letters, digits and hyphens — it is also the directory name.");
          const parent = typeof args.extends === "string" && args.extends ? args.extends : "base";
          const installed = c.installedThemes(root, cfgOf().config.theme.use);
          if (installed.some((t) => t.name === newName)) return fail(`theme "${newName}" already exists`, `At ${installed.find((t) => t.name === newName)!.dir}.`);
          if (!installed.some((t) => t.name === parent)) return fail(`no theme "${parent}" to extend`, `Installed: ${installed.map((t) => t.name).join(", ")}.`);
          const dir = join(root, "themes", newName);
          mkdirSync(dir, { recursive: true });
          const tokens = c.themeTokens(cfgOf());
          const yaml = `# ${newName} — extends \`${parent}\`, which brings every layout and all 13 primitives with it.
# Nothing below is required: a theme that declares only \`extends:\` and \`css:\` already renders the whole
# vocabulary. Redeclare a token here to change its default; set \`customisable: true\` to let snypd.yaml
# move it. \`snypd://theme/tokens\` lists what you inherited.
theme: ${newName}
version: 0.1.0
spec: ^1
extends: ${parent}
css: ./theme.css
personality: >-
  Describe how this theme reads, in one or two sentences. The renderer never uses this — an agent choosing
  a theme does, and so does anyone deciding whether a change belongs in it.

tokens: {}
`;
          writeFileSync(join(dir, "theme.yaml"), yaml);
          writeFileSync(join(dir, "theme.css"), starterCss(newName, parent, tokens));
          writeFileSync(join(dir, "package.json"), `{ "name": "@snypd/theme-${newName}", "version": "0.1.0", "type": "module", "license": "MIT" }\n`);
          const paths = ["theme.yaml", "theme.css", "package.json"].map((f) => `themes/${newName}/${f}`);
          const git = await commit(paths, `theme: scaffold ${newName} extends ${parent}`);
          return text([
            `scaffolded themes/${newName}/ extending ${parent}`,
            `  theme.yaml   tokens and metadata; ${tokens.length} tokens inherited, none redeclared yet`,
            `  theme.css    one stylesheet — the only file you have to write`,
            git,
            `\`theme\` › set ${newName} makes it active; content.render_preview shows it.`,
          ].join("\n"), { ok: true, theme: newName, extends: parent, dir: `themes/${newName}`, files: paths, inheritedTokens: tokens.length });
        }
        return fail(`unknown action "${action}"`, "theme takes: set, set_tokens, scaffold.");
      }

      case "site": {
        const action = need(args, "action");
        if (action === "init") {
          const r = c.initSite(root, { name: need(args, "name"), url: need(args, "url"), description: typeof args.description === "string" ? args.description : undefined, theme: typeof args.theme === "string" ? args.theme : undefined });
          const git = r.git ? await commit(r.paths, "site: init") : "not a git repo yet — `git init` here so writes can be versioned and published";
          return text([`initialised ${r.created.join(", ")}`, git, "Next: content.create a post, then content.render_preview to look at it."].join("\n"), { ok: true, ...r });
        }
        if (action === "explain_config") return text(cfgOf().explain(need(args, "path")), { ok: true });
        if (action === "set_config") {
          const path = need(args, "path");
          if (!("value" in args)) return fail("value required", "Pass `value: null` to delete the key instead.");
          const w = c.setConfig(root, path, args.value);
          if (!w.paths.length) return text(`${path} is already ${JSON.stringify(args.value)}`, { ok: true, changed: false });
          const git = await commit(w.paths, `site: ${path}`);
          return text([`${path}: ${JSON.stringify(w.from) ?? "unset"} → ${JSON.stringify(w.to)}`, git].join("\n"), { ok: true, changed: true, path, from: w.from, to: w.to });
        }
        if (action === "set_redirect") {
          const from = need(args, "from");
          const to = args.to === null || args.to === undefined ? null : String(args.to);
          const w = c.setRedirect(root, from, to);
          const git = await commit(w.paths, to === null ? `site: drop redirect ${w.from_}` : `site: redirect ${w.from_} → ${w.to_}`);
          return text([
            to === null ? `removed the redirect from ${w.from_}` : `${w.from_} → ${w.to_} (301)`,
            git,
            to === null ? "" : "The next build writes `_redirects` and a meta-refresh page at the old route, so it works on any static host.",
          ].filter(Boolean).join("\n"), { ok: true, from: w.from_, to: w.to_ });
        }
        if (action === "build") {
          const { build } = await import("@snypd/render");
          const r = await build(root);
          return text([
            `built ${r.routes} route${r.routes === 1 ? "" : "s"} in ${r.ms.toFixed(0)} ms`,
            `  ${r.rendered} rendered, ${r.cached} from cache, ${r.artefacts} artefacts, ${r.media} media${r.removed ? `, ${r.removed} removed` : ""}`,
          ].join("\n"), { ok: true, ...r });
        }
        if (action === "doctor") return await doctor(root);
        return fail(`unknown action "${action}"`, "site takes: init, set_config, explain_config, set_redirect, doctor, build.");
      }

      case "bench": {
        const action = need(args, "action");
        // `@snypd/bench` depends on `@snypd/mcp/tools` for `tokens.tools`, so this edge closes a cycle in
        // package metadata. Both directions are dynamic imports made inside a call, so nothing cyclic ever
        // happens at load — and declaring it beats relying on workspace hoisting, which `--compile` will not.
        const bench = await import("@snypd/bench");
        if (action === "compare") {
          const rows = bench.compare(bench.load(need(args, "a")), bench.load(need(args, "b")));
          const body = rows.map((r) => `${r.regressed ? "❌" : "✅"} ${r.name}: ${r.a} → ${r.b} (${(r.delta * 100).toFixed(1)} %)`).join("\n");
          const bad = rows.filter((r) => r.regressed);
          return text(`${rows.length} metric${rows.length === 1 ? "" : "s"}, ${bad.length} regressed\n${body}`, { ok: true, regressed: bad.map((r) => r.name), rows });
        }
        if (action === "run") {
          const suite = typeof args.suite === "string" ? args.suite : "full";
          const report = suite === "page" ? await bench.page({ root })
            : suite === "visual" ? await bench.visual({})
            : suite === "suggest" ? await bench.suggest({ root })
            : await bench.run({ quick: suite === "quick" });
          const over = bench.breaches(report);
          return text(`${bench.toMarkdown(report)}\n${over.length ? `❌ ${over.length} budget breach: ${over.join(", ")}` : "✅ every budget met"}`,
            { ok: true, suite, breaches: over, metrics: report.metrics });
        }
        return fail(`unknown action "${action}"`, "bench takes: run, compare.");
      }
    }
    return fail(`unknown tool "${name}"`);
  } catch (e) {
    const err = e as Error & { hint?: string };
    return fail(err.message, err.hint);
  }
}

/** `site` › doctor: everything that decides whether this repo is a working site, in one read. */
async function doctor(root: string): Promise<ToolResult> {
  const c = await loadCore();
  const cfg = c.loadConfig(root);
  const lines: string[] = [], problems: string[] = [];
  const ok = (s: string) => lines.push(`✅ ${s}`);
  const bad = (s: string, why: string) => { lines.push(`❌ ${s}`); problems.push(why); };
  const warn = (s: string) => lines.push(`⚠  ${s}`);

  if (cfg.ok) ok(`config loads — ${cfg.layers.filter((l) => l.found).length} layers, theme \`${cfg.config.theme.use}\``);
  else bad(`config does not load`, c.formatDiagnostics(cfg.diagnostics));
  if (!cfg.ok) return text(lines.join("\n"), { ok: false, problems });

  const themes = c.installedThemes(root, cfg.config.theme.use);
  const active = themes.find((t) => t.active);
  if (active) ok(`theme \`${active.name}\` resolves (${themes.length} installed)`);
  else bad(`theme \`${cfg.config.theme.use}\` is not installed`, `Installed: ${themes.map((t) => t.name).join(", ")}`);

  const stranded = c.themeTokens(cfg).filter((t) => t.overridden && !t.customisable);
  if (stranded.length) warn(`${stranded.length} token override${stranded.length === 1 ? "" : "s"} the theme does not declare: ${stranded.map((t) => t.name).join(", ")}`);

  const index = await c.SiteIndex.open(root);
  let lint: Awaited<ReturnType<Core["lintSite"]>>;
  try {
    index.sync(cfg);
    lint = c.lintSite(root, { cfg, moves: index.moves(), cache: new c.MdastCache(index.mdastStore()) });
  } finally { index.close(); }
  if (lint.errors) bad(`${lint.errors} lint error${lint.errors === 1 ? "" : "s"}`, lint.files.flatMap((f) => f.diagnostics.map((d) => `${f.file}:${d.line} ${d.message}`)).slice(0, 5).join("\n"));
  else if (lint.warnings) warn(`${lint.warnings} lint warning${lint.warnings === 1 ? "" : "s"} — content.lint lists them`);
  else ok("content lints clean");

  const redir = c.redirects(cfg);
  const n = Object.keys(redir).length;
  if (n) ok(`${n} redirect${n === 1 ? "" : "s"} declared`);

  const repo = c.Repo.open(root);
  if (!repo) warn("not a git repo — writes are not versioned and nothing can be published");
  else ok("git repo");

  return text([...lines, problems.length ? `\n${problems.length} problem${problems.length === 1 ? "" : "s"} to fix:\n${problems.join("\n")}` : "\nnothing to fix"].join("\n"),
    { ok: !problems.length, problems, lint: { errors: lint.errors, warnings: lint.warnings } });
}
