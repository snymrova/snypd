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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { activitySnapshot, type Tool, type ToolResult } from "./protocol";

type Core = typeof import("@snypd/core");
let core: Core | undefined;
const loadCore = async () => (core ??= await import("@snypd/core"));

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const S = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

/** Words `find_tools` matches on beyond the name and description — what an agent would actually type. */
export const KEYWORDS: Record<string, string[]> = {
  theme: ["theme", "design", "look", "style", "css", "colour", "color", "token", "font", "dark mode", "palette", "skin", "brand", "typography", "scaffold", "appearance"],
  site: ["config", "configuration", "settings", "snypd.yaml", "redirect", "moved", "url", "doctor", "health", "diagnose", "build", "deploy", "publish site", "push", "live", "go live", "ship", "name", "domain", "host", "cloudflare", "vercel"],
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
    description: "Change the site itself rather than a post: one config key, a redirect for a URL that moved, a health report, a build, or a request to put the site live. Config writes are validated before they stick — a patch that would not load is rolled back and the diagnostics come back instead, so a wrong key cannot leave the site broken. Read snypd://config first: it is the merged result with provenance, so it already says where every value came from.",
    inputSchema: S({
      action: str("`init` a new site here · `set_config` one key · `explain_config` where a value came from · `set_redirect` for a moved URL · `set_deploy` to add a host's config to a site that has none · `doctor` for a health report · `build` the site to dist/ · `push` to ask a human to put it live", { enum: ["init", "set_config", "explain_config", "set_redirect", "set_deploy", "doctor", "build", "push"] }),
      path: str("`set_config`/`explain_config`: a dotted path into the config, e.g. `site.name`, `theme.use`, `types.post.urlPattern`. Bracket a key that contains dots"),
      value: { description: "`set_config`: the new value — any JSON. `null` deletes the key and restores whatever it was overriding" },
      from: str("`set_redirect`: the old route, e.g. `/posts/old-slug`"),
      to: str("`set_redirect`: the route it moved to. `null` removes the redirect instead"),
      name: str("`init`: the site's name, as a reader sees it. Optional — defaults to the directory's name"),
      url: str("`init`: the absolute origin it will be served from, e.g. https://example.com. Optional — defaults to a localhost placeholder, because the feed, sitemap and JSON-LD need a real one at publish and not before"),
      description: str("`init`: one sentence about the site"),
      theme: str("`init`: the theme to start on. Default `editorial`"),
      deploy: str("`init`/`set_deploy`: the host's half — a build command and `dist/` as the output dir, plus a PR workflow. Optional on `init`, required on `set_deploy`. snypd never talks to a host, so anything that can run a binary and serve a folder needs none of this", { enum: ["cloudflare", "vercel"] }),
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
  /**
   * Commit a site-level write on the drafts branch and land it on the branch the site deploys from.
   *
   * Configuration is not content, and the approval gate is about content: it exists so an agent cannot
   * publish *words* a human has not read. A theme swap or a retuned token is the operator's own
   * instruction, given through the harness — and a theme that changes everywhere except on the site is
   * the kind of quiet lie the review page exists to prevent. So these land immediately, and say so.
   *
   * Before S17b this committed "on the branch that is checked out", which was whichever post happened to
   * have been written last: a theme swap could end up parked on `snypd/draft-post-about` and reach `main`
   * only when that post published. One drafts branch removes the ambiguity; landing removes the surprise.
   */
  const commit = async (paths: string[], subject: string) => {
    if (!paths.length) return "nothing to commit";
    const repo = c.Repo.open(root);
    if (!repo) return "not a git repo: written, not committed";
    repo.useDrafts(paths);
    const r = repo.commit(paths, subject);
    // The hint is the whole value of this branch for a first-timer: git with no author identity is a
    // state a fresh machine starts in, and "no commit: …" alone sends the agent looking at snypd (S18d′).
    if (!r.committed) return `no commit: ${r.reason}${r.hint ? `\n${r.hint}` : ""}`;
    const landed = repo.land(paths, subject);
    return landed.ok
      ? `committed ${r.sha!.slice(0, 8)}${landed.changed ? ` → ${landed.base} ${landed.sha!.slice(0, 8)}` : ""}`
      : `committed ${r.sha!.slice(0, 8)} on ${repo.branch()}, not landed on ${landed.base}: ${landed.reason}`;
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
          // Neither `name` nor `url` is required (S18d, docs/08 decision 63). `need(args, "url")` stood
          // here until this session, which meant the *clone* path demanded a production origin from an
          // agent that had no way to know one — the same defect as the CLI's exit-2, and fixing one and
          // not the other would leave decision 52's placeholder fact reachable from one caller only.
          const r = c.initSite(root, { name: typeof args.name === "string" ? args.name : undefined, url: typeof args.url === "string" ? args.url : undefined, description: typeof args.description === "string" ? args.description : undefined, theme: typeof args.theme === "string" ? args.theme : undefined, deploy: args.deploy as "cloudflare" | "vercel" | undefined });
          // An empty directory gets its repo from `initSite` itself (S18d): the scaffold has to be
          // committed, or the agent's very next `content.create` refuses on a tree carrying it.
          const git = r.git
            ? `${r.gitInit ? "git init — new repository. " : ""}${await commit(r.paths, `site: init ${r.name}`)}`
            : "not a git repo, and this directory already has files in it — run `git init` here yourself, then retry; writes cannot be versioned or published without one";
          // Written for the agent that called it (decision 60). This is the clone case's equivalent of
          // `snypd init`'s stdout: the tools are already loaded here, so there is no restart to relay —
          // what has to be said instead is what is still unknown, and when it stops being optional.
          return text([`initialised \`${r.name}\` — ${r.created.join(", ")}`, git,
            ...(r.deploy ? [`${r.deploy}: the host builds with \`${c.buildCommand(c.VERSION)}\` and serves dist/. Nothing here holds a credential or calls a deploy API — a push is what triggers it.`] : []),
            ...(r.placeholderUrl ? [`site.url is ${r.url}, a placeholder. The feed, sitemap and JSON-LD are absolute, so the real origin is needed before anything publishes — content.publish refuses until then, and says so. Do not ask for it yet.`] : []),
            "Next: read snypd://spec/primitives, then content.create a post and content.render_preview to look at it."].join("\n"), { ok: true, ...r });
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
        /**
         * **`set_deploy` exists because `init` refuses** (S19a′), and the refusal is right.
         *
         * `initSite` throws on a directory that already has a `snypd.yaml` — "this site is already
         * initialised" — which is correct and, until this action, meant the host's half was reachable
         * from exactly one moment in a site's life. The default first run is `bunx @snypd/cli init` with
         * no flags (docs/08 §2), so the majority path produced sites that could never be given a deploy
         * target through any snypd surface at all. Found by walking it: snypd.rocks was scaffolded that
         * way and there was nothing to call.
         *
         * It writes and never overwrites, which is `writeDeploy`'s own rule: a `wrangler.toml` in a repo
         * is somebody's, and a site already deployed somewhere is exactly the one whose config must not
         * be clobbered. So a second call reports that there was nothing to do rather than resetting a
         * hand-tuned file, and this is safe to suggest to an agent that is not sure.
         */
        if (action === "set_deploy") {
          const targetName = need(args, "deploy");
          const cfg = cfgOf();
          const created = c.writeDeploy(root, targetName as "cloudflare" | "vercel", { name: cfg.config.site.name });
          if (!created.length)
            return text(`${targetName} is already configured here — ${targetName === "cloudflare" ? "wrangler.toml" : "vercel.json"} and the PR workflow are both present and were not touched. Nothing to do.`,
              { ok: true, deploy: targetName, created: [], changed: false });
          const git = await commit(created, `site: deploy ${targetName}`);
          return text([
            `${targetName}: wrote ${created.join(", ")}`,
            `The host builds with \`${c.buildCommand(c.VERSION)}\` and serves dist/. Nothing here holds a credential or calls a deploy API — a push is what triggers it.`,
            git,
            `Connect the repo to ${targetName === "cloudflare" ? "Cloudflare Pages" : "Vercel"} once, in their dashboard; after that every push builds. \`site\` › push says what would go and where a person presses it.`,
          ].join("\n"), { ok: true, deploy: targetName, created, changed: true });
        }
        /**
         * **`push` asks; it does not push** (S19a, decision 44).
         *
         * Every other action here is a write this tool performs. This one is the single act reserved for
         * a person: sending the base branch to the host is when a site becomes visible to everybody, and
         * a human clicking a button in a local browser is a stronger gate than a `destructiveHint` on a
         * tool an agent can call. So what comes back is the state a push is in, what would go with it,
         * and the URL of the button — phrased to be relayed, the same way `init`'s restart line is.
         *
         * The name is the request, not a promise: an agent that asked for a push and got back "here is
         * where a person does that" has been answered, and `snypd://config` is not a better place for
         * this because none of it is config. The escape hatch is `git push` in a terminal, which is
         * nobody's to take away and is the right answer for CI.
         */
        if (action === "push") {
          const cfgPush = cfgOf();
          // **Counted, not defaulted** (found by running this against snypd.rocks, which had three drafts
          // and was told it had none). `pushState`'s `drafts` is an input because the Desk already has the
          // index open and the number is free there; here it is not, so this opens one. A push tool that
          // says "0 drafts stay local" while three sit in the tree is wrong in the reassuring direction,
          // which is the only direction that matters for a sentence about what does *not* go public.
          const statuses = cfgPush.config.statuses as Record<string, { public?: boolean }> | undefined;
          const index = await c.SiteIndex.open(root);
          let drafts = 0;
          try {
            index.sync(cfgPush);
            drafts = index.files({}).filter((f) => f.status !== "trashed" && statuses?.[f.status]?.public !== true).length;
          } finally { index.close(); }
          const st = c.pushState(root, cfgPush, { drafts });
          const dev = await c.liveDev(root);
          const desk = dev ? `${dev.url}${c.PUSH_ROUTE.replace(/\/push$/, "")}` : undefined;
          const where = desk
            ? `The button is on the Desk: ${desk}`
            : `The Desk is where that button lives, and no preview is running — start one with \`snypd dev\` (a person types that), then it is at http://localhost:4321/_snypd`;
          if (!st.ok) {
            const b = st.blockers[0]!;
            return fail(`nothing to push yet — ${b.reason}`, b.hint);
          }
          const going = st.ahead === 0
            ? st.known ? `\`${st.branch}\` is already on \`${st.remote!.name}\` as of the last fetch — there is nothing to send.` : `\`${st.branch}\` has never been pushed to \`${st.remote!.name}\`.`
            : `${st.ahead} commit${st.ahead === 1 ? "" : "s"} would go:\n${st.commits.slice(0, 5).map((x) => `  ${x.sha.slice(0, 7)} ${x.subject}`).join("\n")}${st.ahead > 5 ? `\n  and ${st.ahead - 5} more` : ""}`;
          return text([
            `A push is a person's to make, so this call does not make one — it tells you where they make it.`,
            ``,
            `${st.branch} → ${st.remote!.name} (${st.origin ?? st.remote!.url})${st.deploy ? ` · ${st.deploy}` : ""}`,
            going,
            `${st.drafts} draft${st.drafts === 1 ? "" : "s"} in flight stay${st.drafts === 1 ? "s" : ""} local — a push sends ${st.branch}, and drafts are not on it.`,
            ``,
            where,
          ].join("\n"), { ...st, ok: true, ready: st.ok, pushed: false, deskUrl: desk });
        }
        if (action === "doctor") return await doctor(root);
        return fail(`unknown action "${action}"`, "site takes: init, set_config, explain_config, set_redirect, set_deploy, doctor, build, push.");
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
  const warnings: string[] = [];
  const warn = (s: string) => { lines.push(`⚠  ${s}`); warnings.push(s); };

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
  let stored: { slug: string }[] = [];
  try {
    index.sync(cfg);
    lint = c.lintSite(root, { cfg, moves: index.moves(), cache: new c.MdastCache(index.mdastStore()) });
    stored = index.files({});   // the item count, from the index that is already open and synced
  } finally { index.close(); }
  if (lint.errors) bad(`${lint.errors} lint error${lint.errors === 1 ? "" : "s"}`, lint.files.flatMap((f) => f.diagnostics.map((d) => `${f.file}:${d.line} ${d.message}`)).slice(0, 5).join("\n"));
  else if (lint.warnings) warn(`${lint.warnings} lint warning${lint.warnings === 1 ? "" : "s"} — content.lint lists them`);
  else ok("content lints clean");

  const redir = c.redirects(cfg);
  const n = Object.keys(redir).length;
  if (n) ok(`${n} redirect${n === 1 ? "" : "s"} declared`);

  const repo = c.Repo.open(root);
  // A problem rather than a warning since S18d: writes land on a drafts branch and publishing lands one
  // path onto the base, so without a repo a draft is never versioned and `content.publish` has nothing to
  // land onto. `init` now creates one wherever that is unambiguously ours to do, so reaching this line at
  // all means somebody scaffolded into a directory that already had files in it.
  if (!repo) bad("not a git repo", "`git init` here: writes are not versioned and nothing can be published without one.");
  else ok("git repo");

  // Where the site goes, and whether anything is waiting to go there (S19a). A warning and never a
  // problem: a site with no remote is a site somebody is still writing, which is most of them for most of
  // their life — and the fix is a person's, not an agent's, in both directions.
  const push = repo ? c.pushState(root, cfg) : undefined;
  if (push) {
    if (push.remote) ok(`remote \`${push.remote.name}\` → ${push.origin ?? push.remote.url}${push.deploy ? ` · ${push.deploy}` : ""}`);
    else if (push.blockers.some((b) => /remote/.test(b.reason))) warn("no remote — this repo is not connected to a host, so nothing can go live yet");
    if (push.remote && push.ok) {
      if (!push.known) warn(`\`${push.branch}\` has never been pushed — a person does that from the Desk, and \`site\` › push says where`);
      else if (push.ahead) warn(`${push.ahead} commit${push.ahead === 1 ? "" : "s"} on \`${push.branch}\` are not on \`${push.remote.name}\` — published items nobody has put live yet`);
      else ok(`\`${push.branch}\` is up to date with \`${push.remote.name}\` as of the last fetch`);
    }
  }

  // ── The facts docs/08 decision 64 adds ───────────────────────────────────────────────────────────
  // Doctor is what the agent has instead of a page, and since S18f the two readings come from one
  // function: `onboardingFacts` in `@snypd/core` computes them, this turns them into sentences, and the
  // Desk turns the same object into a checklist. The rule that follows — no fact appears on the Desk
  // that doctor cannot answer — is now structural rather than a promise, because there is one source.
  const dev = await c.liveDev(root);
  const facts = c.onboardingFacts(root, { cfg, items: stored.length, dev: dev ? { url: dev.url } : undefined });
  const reg = facts.registration;
  if (!reg.present) bad(`no ${c.MCP_FILE}`, `Nothing registers this server with a harness. \`site\` › init writes it; without it the next session has no snypd tools.`);
  else if (!reg.names) bad(`${c.MCP_FILE} does not name a \`snypd\` server`, `It exists but registers something else. Add a \`snypd\` entry to \`mcpServers\`, then restart the harness.`);
  else if (reg.missingCommand) bad(`${c.MCP_FILE} names a command that is not on this machine: ${reg.command}`, reg.absolute
    ? `An absolute path from whoever ran \`init\` — on a clone it fails inside the harness, which renders identically to nobody having restarted. Install snypd here (\`npm i -g @snypd/cli\`) and rewrite the command as \`snypd\`, or point it at a snypd this machine has.`
    : `Nothing by that name is on this shell's PATH. The harness's PATH may differ, so this is a warning about a likely cause and not a proof; \`npm i -g @snypd/cli\` or \`brew install snymrova/tap/snypd\` settles it.`);
  else ok(`registered in ${c.MCP_FILE} as \`${reg.command}\`${reg.resolved && reg.resolved !== reg.command ? ` → ${reg.resolved}` : ""}`);

  // Read from `.snypd/activity.json` since S18f, not from this process's memory. In here the two agree by
  // construction — if this call arrived, a harness is connected — and the file is what lets the *other*
  // reader agree with us: a `snypd dev` preview is a different process and rendered "nothing has called
  // this server yet" through a full session (docs/08 §12.9). The disk record also separates the two
  // silences docs/08 §10 asked for: spawned-and-quiet is a registration problem, never-spawned is a
  // restart. In-memory is the fallback for a server driven by `handle()` without `listen()`.
  // In-process wins where the two disagree, and they will: the record is written a quarter of a second
  // after the server binds (decision 70 — anything sooner is charged to `mcp.coldStart.binary`), so a
  // harness that calls doctor inside its first turn is asking before the file exists. Memory is exact
  // here and the file is what the *other* process has; neither is a substitute for the other.
  const act = activitySnapshot();
  // If this call arrived, a harness is connected — no file can outrank that, including a stale record
  // from a server this root had earlier whose pid is now gone.
  const harness = act.calls > 0 ? "connected" : facts.harness;
  const client = act.client ?? facts.heartbeat?.client;
  const calls = Math.max(act.calls, facts.heartbeat?.calls ?? 0);
  const startedAt = act.startedAt ?? facts.heartbeat?.startedAt;
  if (harness === "connected") ok(`a harness is connected${client ? ` — ${client}` : ""}, ${calls} call${calls === 1 ? "" : "s"} this session`);
  else if (harness === "silent") bad("a server is running but no harness has spoken to it", "It was spawned and then went unused — the harness has it registered and is not calling it. Check the harness's own MCP log for a startup error rather than restarting again.");
  else if (harness === "stale") warn("a harness had this server and let it go — nothing is connected now; restarting the editor spawns a new one");
  else warn("no harness has called this server yet — if an editor is open, it has not been restarted since `.mcp.json` was written");

  // Is a preview already serving this site? The difference between "open this URL" and "look at the tab
  // you already have open", and it is proven over HTTP rather than read from `.snypd/dev.json` — a
  // record outlives the process that wrote it.
  if (dev) ok(`a \`snypd dev\` server is running — Desk at ${dev.url}/_snypd`);
  else warn("no preview server — `snypd dev` starts one, or `content.render_preview` starts a session-scoped one when you ask for a URL");

  const items = facts.items;
  if (items) ok(`${items} item${items === 1 ? "" : "s"}`);
  else warn("no content yet — the `get-started` prompt writes the first post");

  if (facts.placeholderUrl)
    warn(`site.url is ${cfg.config.site.url}, a placeholder — the feed, sitemap and JSON-LD are absolute, so \`site\` › set_config \`site.url\` is needed before anything publishes (content.publish refuses until then)`);

  // Broken and unfinished are different things, and a first run is full of the second kind (S18d): a
  // scaffold with no content and a placeholder URL is a site working exactly as intended two minutes in.
  // Saying "nothing to fix" under two ⚠ rows reads as though the rows did not count.
  const tail = problems.length ? `\n${problems.length} problem${problems.length === 1 ? "" : "s"} to fix:\n${problems.join("\n")}`
    : warnings.length ? `\nnothing broken — ${warnings.length} thing${warnings.length === 1 ? "" : "s"} still unfinished, above`
    : "\nnothing to fix";
  return text([...lines, tail].join("\n"),
    { ok: !problems.length, problems, lint: { errors: lint.errors, warnings: lint.warnings },
      facts: { config: true, theme: !!active, git: !!repo, registered: reg.present && reg.names && !reg.missingCommand, harness: harness === "connected", harnessState: harness, startedAt, client, dev: !!dev, deskUrl: dev ? `${dev.url}/_snypd` : undefined, items, placeholderUrl: facts.placeholderUrl,
        push: push ? { remote: push.remote?.name, origin: push.origin, deploy: push.deploy, branch: push.branch, ahead: push.ahead, known: push.known, ready: push.ok } : undefined } });
}

