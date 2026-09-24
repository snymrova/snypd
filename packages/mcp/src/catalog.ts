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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { activitySnapshot, type Tool, type ToolResult } from "./protocol";

type Core = typeof import("@snypd/core");
let core: Core | undefined;
const loadCore = async () => (core ??= await import("@snypd/core"));

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const S = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });
const TYPE_ = str("Content type: `post`, `page`, `author` (snypd://types lists them)");

/** Words `find_tools` matches on beyond the name and description — what an agent would actually type. */
export const KEYWORDS: Record<string, string[]> = {
  theme: ["theme", "design", "look", "see", "eyes", "screenshot", "picture", "crop", "hover", "overflow", "contrast", "style", "css", "colour", "color", "token", "font", "dark mode", "palette", "skin", "brand", "typography", "scaffold", "appearance", "setting", "logo", "tagline", "show dates", "date format", "social links", "footer"],
  site: ["config", "configuration", "settings", "snypd.yaml", "redirect", "moved", "url", "doctor", "health", "diagnose", "build", "deploy", "publish site", "push", "live", "go live", "put it online", "online", "upload", "ship", "launch", "name", "domain", "host", "cloudflare", "vercel", "wrangler", "login", "back it up", "backup", "back up", "github", "repository", "repo", "gh"],
  bench: ["bench", "benchmark", "speed", "performance", "budget", "fast", "slow", "measure", "timing", "regression", "lighthouse", "accessibility", "a11y", "screenshot", "screenshots", "shoot", "photograph", "contact"],
  "content.explain": ["explain", "why", "what ran", "pipeline", "stages", "transform", "filter", "slot", "hook", "plugin", "debug", "trace", "inspect", "autolink", "changed my post", "unexpected", "link appeared", "route key", "cache"],
};

export const CATALOG: Tool[] = [
  { name: "theme",
    description: "Change how the site looks: switch theme or one of the named looks it ships, retune its tokens, scaffold a new one, or seed a scaffold's palette and type scale from one colour. A theme in snypd is `theme.yaml` plus one stylesheet — no components are required, because every primitive and layout resolves up the `extends:` chain — so `scaffold` gives you a working theme you only have to restyle. Read snypd://theme for what is installed and which variations the active theme ships, snypd://theme/variations for what each of those looks is, snypd://theme/tokens for every knob and its default, snypd://theme/settings for the choices the theme offers a site (a logo, whether dates show, social links), snypd://theme/coverage for which primitives the active theme actually implements, and snypd://theme/pieces for the pieces a theme can be assembled from (`pieces:` in theme.yaml). `look` is how you see what you changed: one route, one width, one scheme, cropped to one slot, with what is wrong listed first and boxed on the picture — call it after every change to a theme, not only at the end.",
    inputSchema: S({
      action: str("`set` a different theme, or one of the named looks it ships · `set_tokens` to retune the active one · `set_settings` for the choices it offers (logo, dates, social links — snypd://theme/settings) · `scaffold` a new theme that extends an existing one · `seed` a theme in themes/ from one colour: a palette that passes the contrast gate by construction, plus a fluid type scale · `look` at the site as it renders now — facts as text, one cropped picture, the full page as a link; `view: outline` for landmarks and headings as text, no picture", { enum: ["set", "set_tokens", "set_settings", "scaffold", "seed", "look"] }),
      name: str("`set`: the theme to use — optional when `variation` is given. `scaffold`: the name of the new theme (also its directory under themes/)"),
      variation: str("`set`: one of the named looks the theme ships — a complete token set with a name, e.g. `ink`. snypd://theme/variations says what each one is. `null` goes back to the theme's own tokens. Can be sent with `name` to switch theme and look in one call"),
      tokens: { type: "object", description: "`set_tokens`: token name → value, e.g. {\"color.accent\": \"#8a3324\"}. A token set to null goes back to the theme's default. Only tokens declared `customisable` can be set — snypd://theme/tokens lists them" },
      settings: { type: "object", description: "`set_settings`: setting id → value, e.g. {\"showDates\": false, \"tagline\": \"Notes on building\"}. A setting set to null goes back to the theme's default. Each is checked against the type the theme declared — snypd://theme/settings lists them with their types and what they mean" },
      extends: str("`scaffold`: the theme the new one inherits every layout, primitive and token from. Default `base`"),
      seed: str("`seed`: the colour whose hue and chroma become the accent, e.g. `oklch(0.55 0.13 252)` or `#1f5fbf`"),
      strategy: str("`seed`: how far colour reaches beyond the accent. Default `balanced`", { enum: ["restrained", "balanced", "expressive"] }),
      scheme: str("`seed`: which modes to design. Default `both`, as light-dark() pairs. `look`: `light` (default) or `dark`", { enum: ["both", "light", "dark"] }),
      ratio: str("`seed`: type-scale ratio at phone:desktop width, e.g. `1.2:1.25`"),
      base: str("`seed`: body size in px at phone:desktop width, e.g. `17:19`"),
      face: str("`seed`: one web font from the shelf, copied into the theme with its licence, e.g. `ibm-plex-serif`; an id the shelf lacks is answered with the list"),
      route: str("`look`: the page, e.g. `/` (default) or `/posts/long-read/`"),
      slot: str("`look`: crop to one slot — `masthead`, `cover`, `prose`, `code`, `blocks`, `entries`, `post-foot`, `footer`, `home`, `notes`, `toc`, `wall`, `column`; none for the first screen. snypd://theme/pieces lists the slots"),
      selector: str("`look`: crop to a CSS selector instead of a slot, e.g. `.snypd-stat-row`"),
      width: { type: "number", description: "`look`: viewport width in px. Default 1280; 390 is a phone" },
      state: str("`look`: `rest` (default) · `hover` or `focus` the first link or button in the crop · `menu-open` opens the phone menu · `open` opens the first <details> or <dialog>", { enum: ["rest", "hover", "focus", "menu-open", "open"] }),
      target: str("`look`: what `state` acts on, as a selector, when the first one in the crop is not the one you mean"),
      since: str("`look`: `last` (default) says what changed since the previous look at the same route, crop, width, scheme and state; `none` skips it", { enum: ["last", "none"] }),
      view: str("`look`: `picture` (default) or `outline` — landmarks and headings, ~150 tokens, no image", { enum: ["picture", "outline"] }),
    }, ["action"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },

  { name: "site",
    description: "Change the site itself rather than a post: one config key, a menu, a redirect for a URL that moved, a health report, a build, or putting the site online — `deploy` uploads it through the host's own CLI and answers with the URL. Config writes are validated before they stick — a patch that would not load is rolled back and the diagnostics come back instead, so a wrong key cannot leave the site broken. Read snypd://config first: it is the merged result with provenance, so it already says where every value came from; snypd://nav is the menus.",
    inputSchema: S({
      action: str("`init` a new site here · `set_config` one key · `explain_config` where a value came from · `set_nav` a menu · `set_redirect` for a moved URL · `set_deploy` to add a host's config to a site that has none · `doctor` for a health report · `build` the site to dist/ · `deploy` to put it online — builds, uploads through the host's CLI (Cloudflare, `wrangler`), and answers with the URL; on a machine the host has never seen it runs `wrangler login` first and a person clicks allow once · `push` to back the site up on GitHub and send the published branch — on a site with no remote it creates the repository first, private, through `gh` (or, with `preview`, it pushes the drafts branch for a preview)", { enum: ["init", "set_config", "explain_config", "set_nav", "set_redirect", "set_deploy", "doctor", "build", "deploy", "push"] }),
      path: str("`set_config`/`explain_config`: a dotted path into the config, e.g. `site.name`, `theme.use`, `types.post.urlPattern`. Bracket a key that contains dots"),
      value: { description: "`set_config`: the new value — any JSON. `null` deletes the key and restores whatever it was overriding" },
      location: str("`set_nav`: which menu — a location the theme declares (`header`, `footer`; snypd://nav lists them)"),
      items: { type: "array", description: "`set_nav`: the whole menu, in order — [{ label, ref | url, rel? }]. `ref` is a route (`/about`) or type/slug (`page/about`) and follows the item when its slug changes; `url` is verbatim, for links off this site. A `ref` that resolves to nothing is refused. `null` removes the menu", items: { type: "object", properties: { label: { type: "string" }, ref: { type: "string" }, url: { type: "string" }, rel: { type: "string" } }, required: ["label"] } },
      from: str("`set_redirect`: the old route, e.g. `/posts/old-slug`"),
      to: str("`set_redirect`: the route it moved to. `null` removes the redirect instead"),
      name: str("`init`: the site's name, as a reader sees it. Optional — defaults to the directory's name. `push`: the repository to create when this site has no remote yet — optional, and defaults to the site's name; `owner/name` puts it under an organisation"),
      url: str("`init`: the absolute origin it will be served from, e.g. https://example.com. Optional — defaults to a localhost placeholder, because the feed, sitemap and JSON-LD need a real one at publish and not before"),
      description: str("`init`: one sentence about the site"),
      theme: str("`init`: the theme to start on. Default `editorial`"),
      public: { type: "boolean", description: "`push`: when this site has no remote and one is created, make the repository public. The default is private — a site's repository holds its drafts branch, which is every word nobody has approved" },
      preview: { type: "boolean", description: "`push`: send `snypd/drafts` instead of the site, so a host that builds branches serves a preview *with the drafts in it* (noindex, at its preview URL). This sends every unapproved word on the site to the remote — readable by anyone who can read the repository, and by anyone with the preview URL. Nothing is published by it. Read the result's first lines before relaying it as done" },
      deploy: str("`init`/`set_deploy`: the host's half — a build command and `dist/` as the output dir, plus a PR workflow. On `init` the default is `cloudflare` (docs/31 decision 229); `none` is for a site served by something that needs no config of ours. Required on `set_deploy`. snypd holds no credential either way", { enum: ["cloudflare", "vercel", "none"] }),
    }, ["action"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } },

  { name: "bench",
    description: "Run snypd's own benchmark suite and read the result. Every speed claim in this project is a number from here with a budget next to it, so this is how you check that a change — a theme, a token, a hundred new posts — did not cost something. `run` takes minutes at full size; `quick` is the same metrics at fewer repetitions. snypd://bench/latest is the last full report and costs nothing to read.",
    inputSchema: S({
      action: str("`run` the suite · `compare` two saved reports · `shoot` themes on every route, width and scheme, into a contact sheet whose per-route PNGs you then read", { enum: ["run", "compare", "shoot"] }),
      suite: str("`run`: `full` (default) · `quick` · `page` (a real browser: 0 KB JS, axe, CLS) · `visual` (per-primitive render cost) · `suggest` (suggest_blocks precision)", { enum: ["full", "quick", "page", "visual", "suggest"] }),
      a: str("`compare`: path to the baseline report JSON"),
      b: str("`compare`: path to the new report JSON"),
      themes: { type: "array", items: { type: "string" }, description: "`shoot`: themes to photograph side by side, `theme` or `theme/variation`; the active theme by default" },
      routes: { type: "array", items: { type: "string" }, description: "`shoot`: routes to photograph; the specimen's nine by default, or those of them this site has" },
      scheme: str("`shoot`: `both` (default) · `light` · `dark`", { enum: ["both", "light", "dark"] }),
    }, ["action"]),
    annotations: { readOnlyHint: true, idempotentHint: false } },

  { name: "content.explain",
    description: "Explain one item's pipeline: which plugin stages, filters and slots actually ran over it, what each of them changed, the route key that decides whether it re-renders, and the files plugins emitted beside it. Read this when a post came out different from what was written — a link that appeared in the prose, a title that is not the one in the frontmatter — or before trusting a plugin you have just enabled. It builds the site into a scratch directory to find out, so it reports what ran and not what was declared; `dist/` and the site's index are untouched. Every other content tool is always listed; this one is here because it is read once when something is surprising, not on the turn a post is written.",
    inputSchema: S({ type: TYPE_, slug: str("The item's slug — its filename without `.md`") }, ["type", "slug"]),
    annotations: { readOnlyHint: true, idempotentHint: true } },
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
  return rank(CATALOG, (t) => KEYWORDS[t.name] ?? [], query);
}

/**
 * The ranking itself, over any list of tools and any keyword source — the static catalogue above, and
 * since P4 the plugin tools merged with it (plugintools.ts). One function rather than two, because a
 * plugin's tool has to compete with `site` and `theme` on the same terms or `find_tools` has two
 * standards: "ping search engines" must reach `indexnow` past three built-ins that mention pushing.
 */
export function rank(list: Tool[], keywordsOf: (t: Tool) => string[], query: string): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const names = new Set(list.map((t) => t.name));
  const words = q.split(/[^a-z0-9.]+/).filter((w) => w && !STOP.has(w) && (w.length > 2 || names.has(w)));
  if (!words.length) return list;
  const scored = list.map((t) => {
    const hay = `${t.name} ${t.description ?? ""}`.toLowerCase();
    const keys = keywordsOf(t).map((k) => k.toLowerCase());
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
/** A dotted path into a plain object, for the structured half of `explain_config`; a bracketed key (`tokens["color.accent"]`) is one segment. */
const getAt = (o: Record<string, unknown>, path: string): unknown =>
  (path.match(/\[("[^"]*"|'[^']*')\]|[^.[\]]+/g) ?? []).map((k) => k.replace(/^\[|\]$/g, "").replace(/^["']|["']$/g, "")).reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);
const need = (args: Record<string, unknown>, key: string): string => {
  const v = args[key];
  if (typeof v !== "string" || !v) throw new Error(`${key} required`);
  return v;
};

/** What a catalogue call may borrow from the session that made it: the preview server `render_preview` shares. */
export interface CallContext { preview?: () => Promise<{ url: string }> }

export async function call(root: string, name: string, args: Record<string, unknown>, ctx: CallContext = {}): Promise<ToolResult> {
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
        // `set` takes a theme, a variation, or both (U6a). Both are checked before either is written:
        // switching to a theme and *then* discovering it does not ship the look that was asked for would
        // leave the site somewhere nobody asked to be, which is decision 120's rule one surface over.
        if (action === "set") {
          const wantTheme = typeof args.name === "string" && args.name ? args.name : undefined;
          // `null` is a value here and not the absence of one — it is "back to the theme's own tokens" —
          // so the key's presence and its value are two different questions all the way down.
          const hasVariation = Object.hasOwn(args, "variation");
          let wantVariation: string | null = null;
          if (!wantTheme && !hasVariation) return fail("name or variation required", "`name` switches theme; `variation` switches to one of the looks the active theme ships (snypd://theme lists them). Both together is one call.");
          if (hasVariation) {
            if (typeof args.variation === "string" && args.variation) wantVariation = args.variation;
            else if (args.variation !== null) return fail(`variation must be a name or null, got ${JSON.stringify(args.variation)}`, "snypd://theme lists what this theme ships; null goes back to its own tokens.");
          }

          const cfg0 = cfgOf();
          const before = cfg0.config.theme.use;
          const beforeVariation = cfg0.config.theme.variation;
          const installed = c.installedThemes(root, before);
          if (wantTheme && !installed.find((t) => t.name === wantTheme)) return fail(`no theme "${wantTheme}"`, `Installed: ${installed.map((t) => t.name).join(", ")}. \`theme\` › scaffold makes a new one.`);
          const themeChanges = wantTheme !== undefined && wantTheme !== before;
          const target = wantTheme ?? before;

          // The variations of the theme we are *going* to be on, which is not the one loaded when both
          // arguments are given. Resolving that chain is the only way to check the pair before writing.
          const looks: { name: string; description: string }[] = themeChanges ? c.variationsOf(root, target) : c.themeVariations(cfg0);
          if (wantVariation && !looks.some((v) => v.name === wantVariation))
            return fail(`theme \`${target}\` ships no variation "${wantVariation}"`, looks.length
              ? `It ships ${looks.map((v) => v.name).join(", ")} — snypd://theme/variations says what each one is. Nothing was written.`
              : `It ships none: its tokens are its only look. \`theme\` › set_tokens is the knob it does have. Nothing was written.`);

          // A theme switch with no variation named clears the old theme's: a variation is a name in the
          // *theme's* vocabulary, and carrying `ink` across to a theme that never heard of it is how a
          // site ends up with the stranded value `loadConfig` then has to warn about on every load.
          const cleared = themeChanges && beforeVariation !== undefined && !hasVariation;
          // What the site will be on when this returns. Spelled out rather than reached for with `??`,
          // because `null` is a value here — "the theme's own tokens" — and not the absence of one.
          const after: string | null = hasVariation ? wantVariation : cleared ? null : beforeVariation ?? null;
          const variationChanges = after !== (beforeVariation ?? null);
          if (!themeChanges && !variationChanges)
            return text(`${target}${after ? ` › ${after}` : ""} is already active`, { ok: true, theme: target, variation: after, changed: false });

          const paths: string[] = [], lines: string[] = [];
          if (themeChanges) { paths.push(...c.setConfig(root, "theme.use", wantTheme!).paths); lines.push(`theme ${before} → ${wantTheme}`); }
          if (variationChanges) {
            const own = "(the theme's own tokens)";
            paths.push(...c.setConfig(root, "theme.variation", after).paths);
            lines.push(`variation ${beforeVariation ?? own} → ${after ?? own}${cleared ? " — cleared by the theme switch" : ""}`);
          }
          const cfg = cfgOf();
          const stranded = c.themeTokens(cfg).filter((t) => t.overridden && !t.customisable);
          // A theme in the site's own `themes/` travels with the config that names it (S24). `snypd new
          // theme` commits its scaffold on whatever branch is checked out — the drafts branch, when an
          // agent made it — and a landing carries only the paths it is given, so until this the switch
          // reached `main` while the theme stayed behind and `main` could not build. The tracked files
          // under the theme's directory ride the same commit and the same landing as `snypd.yaml`.
          if (themeChanges) {
            const local = installed.find((t) => t.name === wantTheme && t.dir.startsWith(join(root, "themes")));
            if (local) paths.push(...c.Repo.open(root)?.run("ls-files", "--", relative(root, local.dir)).stdout.split("\n").filter(Boolean) ?? []);
          }
          const git = await commit([...new Set(paths)], themeChanges ? `theme: use ${target}${after ? ` › ${after}` : ""}` : `theme: variation ${after ?? "cleared"}`);
          lines.push(git);
          if (stranded.length) lines.push(`⚠ ${stranded.length} token override${stranded.length === 1 ? "" : "s"} in snypd.yaml that ${target} does not declare: ${stranded.map((t) => t.name).join(", ")}`);
          const moved = after ? looks.find((v) => v.name === after) : undefined;
          if (moved) lines.push(`  ${moved.description.replace(/\s+/g, " ").trim()}`);
          lines.push(themeChanges
            ? "Look at it with content.render_preview; snypd://theme/coverage says which primitives this theme implements itself."
            : "Look at it with content.render_preview. A variation moves only the tokens it names, and your own theme.tokens still win over it.");
          return text(lines.join("\n"), { ok: true, theme: target, from: before, variation: after, fromVariation: beforeVariation ?? null, changed: true, strandedTokens: stranded.map((t) => t.name) });
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
          // H0, decision 120: the whole patch is refused before any of it is written. `setConfig` would
          // roll back the offending key on its own — it re-loads and restores — but it rolls back *that*
          // key, and a two-token patch whose second value is refused would otherwise leave the first
          // one written. `set_settings` below has always worked this way; this is the same rule, and
          // now there is something for it to check.
          const refused = entries.flatMap(([k, v]) => { if (v === null) return []; const r = c.cssValue(v); return r.ok ? [] : [`${k}: ${r.why}`]; });
          if (refused.length) return fail(refused.join("; "), "Nothing was written. A token becomes a CSS custom property in `:root`, so its value has to be one — a colour, a length, a font stack, or a calc/clamp/light-dark of them.");
          const paths: string[] = [], done: string[] = [];
          for (const [k, v] of entries) {
            const w = c.setConfig(root, c.pathKey(["theme", "tokens", k]), v);
            paths.push(...w.paths);
            done.push(`${k}: ${table.get(k)!.value} → ${v === null ? `${table.get(k)!.default} (default)` : String(v)}`);
          }
          const git = await commit([...new Set(paths)], `theme: tokens (${entries.map(([k]) => k).join(", ")})`);
          return text([`${entries.length} token${entries.length === 1 ? "" : "s"} set`, ...done.map((d) => `  ${d}`), git].join("\n"), { ok: true, tokens: Object.fromEntries(entries) });
        }
        // U3. The same shape as set_tokens — read the table, refuse the whole patch before writing any of
        // it, then one `setConfig` per key so each is its own rollback. The difference is that a setting
        // is *typed*: `set_tokens` can only ask whether a token exists and may be moved, and this can ask
        // whether `showDates: "yes"` is a boolean, which is the point of having declared it.
        if (action === "set_settings") {
          const patch = args.settings;
          if (!patch || typeof patch !== "object" || Array.isArray(patch)) return fail("settings required", "An object of setting → value, e.g. {\"showDates\": false}.");
          const cfg = cfgOf();
          const rows = c.themeSettings(cfg);
          if (!rows.length) return fail(`theme \`${cfg.config.theme.use}\` declares no settings`, "It is tokens and parts only — `theme` › set_tokens is the knob it does have, and snypd://theme/tokens lists them.");
          const table = new Map(rows.map((r) => [r.id, r]));
          const entries = Object.entries(patch as Record<string, unknown>);
          if (!entries.length) return fail("settings required", `Nothing to set. ${cfg.config.theme.use} declares: ${rows.map((r) => r.id).join(", ")}.`);
          const unknown = entries.filter(([k]) => !table.has(k)).map(([k]) => k);
          if (unknown.length) return fail(`unknown setting${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`, `\`${cfg.config.theme.use}\` declares ${rows.map((r) => `${r.id} (${r.type})`).join(", ")}. snypd://theme/settings says what each one means.`);
          const refused = entries.flatMap(([k, v]) => {
            if (v === null) return [];
            const r = c.settingValue(table.get(k)!, v);
            return r.ok ? [] : [`${k}: ${r.why}`];
          });
          if (refused.length) return fail(refused.join("; "), "Nothing was written. The theme declares what each setting is; snypd://theme/settings has the type and, for a select, the options.");
          const paths: string[] = [], done: string[] = [];
          for (const [k, v] of entries) {
            const row = table.get(k)!;
            const w = c.setConfig(root, c.pathKey(["theme", "settings", k]), v);
            paths.push(...w.paths);
            const to = v === null ? `${row.default === undefined ? "unset" : JSON.stringify(row.default)} (default)` : JSON.stringify(v);
            done.push(`${k}: ${row.value === undefined ? "unset" : JSON.stringify(row.value)} → ${to}`);
          }
          const git = await commit([...new Set(paths)], `theme: settings (${entries.map(([k]) => k).join(", ")})`);
          return text([`${entries.length} setting${entries.length === 1 ? "" : "s"} set`, ...done.map((d) => `  ${d}`), git,
            "A setting is read by the theme's parts, so content.render_preview is how to see what it did."].join("\n"), { ok: true, settings: Object.fromEntries(entries) });
        }

        if (action === "scaffold") {
          // The generator lives in core since X1, because `snypd new theme` is the same act from a
          // terminal and two copies of a starter file is two starter files that drift. What stays here
          // is what is different about this door: the commit, and a reply shaped for the caller.
          let r;
          try { r = c.scaffoldTheme(root, { name: need(args, "name"), extends: typeof args.extends === "string" ? args.extends : undefined }); }
          catch (e) { const err = e as Error & { hint?: string }; return fail(err.message, err.hint ?? ""); }
          const git = await commit(r.files, `theme: scaffold ${r.name} extends ${r.extends}`);
          return text([
            `scaffolded ${r.dir}/ extending ${r.extends}`,
            `  theme.yaml   tokens and metadata; ${r.inheritedTokens} tokens inherited, none redeclared yet`,
            `  DESIGN.md    the brief \u2014 use scene, visitor mode, the rut, where the boldness goes; fill it before the stylesheet`,
            `  theme.css    one stylesheet \u2014 the only file you have to write`,
            git,
            `\`theme\` \u203a set ${r.name} makes it active; content.render_preview shows it.`,
          ].join("\n"), { ok: true, theme: r.name, extends: r.extends, dir: r.dir, files: r.files, inheritedTokens: r.inheritedTokens });
        }
        if (action === "seed") {
          // TF3 (docs/29 §4): the same `expandSeed` + `writeSeed` as `snypd seed`; this door adds the commit.
          const name = need(args, "name");
          const pair = (k: string) => { const v = args[k]; if (typeof v !== "string") return undefined; const [a, b = a] = v.split(":").map(Number); return [a!, b!] as [number, number]; };
          let r, files: string[];
          try {
            const dir = join(root, "themes", name);
            // Loaded here and only here: the shelf is sixteen fonts, and the initialize path stays small.
            const shelf = typeof args.face === "string" ? await import("@snypd/shelf") : undefined;
            const want = shelf?.shelfFace(args.face as string);
            if (shelf && !want) return fail(`no face "${args.face}" on the shelf`, `One of: ${shelf.loadShelf().faces.map((f) => f.id).join(", ")}.`);
            r = c.expandSeed({ seed: need(args, "seed"), strategy: args.strategy as never, scheme: args.scheme as never, ratio: pair("ratio"), base: pair("base"), xHeight: want?.xHeight });
            if (!existsSync(join(dir, "theme.yaml"))) return fail(`no theme "${name}" in themes/`, `\`theme\` › scaffold ${name} first; seeding fills a theme, it does not make one.`);
            const got = want && shelf!.installFace(want.id, dir);
            files = c.writeSeed(dir, name, r, got ? { id: got.face.id, font: got.font, stack: got.stack, role: got.face.role, pairsWith: got.face.pairsWith } : undefined).map((f) => relative(root, f));
          } catch (e) { const err = e as Error & { hint?: string }; return fail(err.message, err.hint ?? ""); }
          const git = await commit(files, `theme: seed ${name} from ${r.input.seed} (${r.input.strategy})`);
          const low = (rule: string) => Math.min(...r.report.pairs.filter((p) => p.rule === rule).map((p) => p.ratio)).toFixed(2);
          return text([
            `seeded themes/${name}: ${Object.keys(r.tokens).length} tokens, inputs under ## Seed in DESIGN.md`,
            `  worst side: text ${low("contrast.text")}:1 · muted ${low("contrast.muted")}:1 · accent ${low("contrast.accent")}:1 · on-accent ${low("contrast.on-accent")}:1`,
            ...r.report.notes.map((n) => `  ${n}`),
            git,
            "theme.css reads these as var(--color-accent) etc.; `bench` › shoot photographs the result.",
          ].join("\n"), { ok: true, theme: name, files, tokens: Object.fromEntries(Object.entries(r.tokens).map(([k, v]) => [k, v.default])), notes: r.report.notes, steps: r.report.steps });
        }
        if (action === "look") return await lookAt(root, args, cfgOf, ctx);
        return fail(`unknown action "${action}"`, "theme takes: set, set_tokens, set_settings, scaffold, seed, look.");
      }

      case "site": {
        const action = need(args, "action");
        if (action === "init") {
          // Neither `name` nor `url` is required (S18d, docs/08 decision 63). `need(args, "url")` stood
          // here until this session, which meant the *clone* path demanded a production origin from an
          // agent that had no way to know one — the same defect as the CLI's exit-2, and fixing one and
          // not the other would leave decision 52's placeholder fact reachable from one caller only.
          const r = c.initSite(root, { name: typeof args.name === "string" ? args.name : undefined, url: typeof args.url === "string" ? args.url : undefined, description: typeof args.description === "string" ? args.description : undefined, theme: typeof args.theme === "string" ? args.theme : undefined, deploy: args.deploy as "cloudflare" | "vercel" | "none" | undefined });
          // An empty directory gets its repo from `initSite` itself (S18d): the scaffold has to be
          // committed, or the agent's very next `content.create` refuses on a tree carrying it.
          const git = r.git
            ? `${r.gitInit ? "git init — new repository. " : ""}${await commit(r.paths, `site: init ${r.name}`)}`
            : "not a git repo, and this directory already has files in it — run `git init` here yourself, then retry; writes cannot be versioned or published without one";
          // Written for the agent that called it (decision 60). This is the clone case's equivalent of
          // `snypd init`'s stdout: the tools are already loaded here, so there is no restart to relay —
          // what has to be said instead is what is still unknown, and when it stops being optional.
          return text([`initialised \`${r.name}\` — ${r.created.join(", ")}`, git,
            ...(r.deploy ? [`${r.deploy}: host config and a PR workflow are in the repo (the default). Nothing here holds a credential; a connected host builds with \`${c.buildCommand(c.VERSION)}\` and serves dist/.`] : []),
            ...(r.placeholderUrl ? [r.deploy === "cloudflare"
              ? `site.url is ${r.url}, a placeholder. The first \`site\` › deploy reads the real one back from the host and sets it. Do not ask for it yet. Unless a person has a domain in mind, never.`
              : `site.url is ${r.url}, a placeholder. The feed, sitemap and JSON-LD are absolute, so the real origin is needed before the site is pushed to a host — \`site\` › push refuses until then, and says so. Do not ask for it yet.`] : []),
            "Next: read snypd://spec/primitives, then content.create a post and content.render_preview to look at it."].join("\n"), { ok: true, ...r });
        }
        // The sentence is in both halves (R4, decision 199): Claude Code hands a model `structuredContent` when
        // a result has one, so `{ ok: true }` beside a text-only answer reached the model as nothing at all.
        if (action === "explain_config") { const path = need(args, "path"), cfg = cfgOf(); return text(cfg.explain(path), { ok: true, path, value: cfg.source(path) ? getAt(cfg.raw as Record<string, unknown>, path) : undefined, explanation: cfg.explain(path) }); }
        if (action === "set_config") {
          const path = need(args, "path");
          if (!("value" in args)) return fail("value required", "Pass `value: null` to delete the key instead.");
          const w = c.setConfig(root, path, args.value);
          if (!w.paths.length) return text(`${path} is already ${JSON.stringify(args.value)}`, { ok: true, changed: false });
          const git = await commit(w.paths, `site: ${path}`);
          return text([`${path}: ${JSON.stringify(w.from) ?? "unset"} → ${JSON.stringify(w.to)}`, git].join("\n"), { ok: true, changed: true, path, from: w.from, to: w.to });
        }
        if (action === "set_nav") {
          const location = need(args, "location");
          if (!("items" in args)) return fail("items required", "The whole menu as a list of { label, ref | url }; pass `items: null` to remove it.");
          const items = args.items === null ? null : Array.isArray(args.items) ? args.items : undefined;
          if (items === undefined) return fail("items must be a list", "[{ label: \"About\", ref: \"page/about\" }, { label: \"GitHub\", url: \"https://…\" }]");
          const w = c.setNav(root, location, items);
          if (!w.paths.length) return text(items === null ? `there is no ${location} menu to remove` : `the ${location} menu already reads that way`, { ok: true, changed: false, location, items: w.items });
          const git = await commit(w.paths, items === null ? `nav: remove the ${location} menu` : `nav: ${location} — ${w.links.map((l) => l.label).join(", ")}`);
          return text([
            items === null ? `removed ${w.file}` : `${w.file}: ${w.links.map((l) => `${l.label} → ${l.href}`).join(" · ")}`,
            git,
            items === null ? "" : "Every page re-renders with it on the next build; content.render_preview shows it now.",
          ].filter(Boolean).join("\n"), { ok: true, changed: true, location, file: w.file, items: w.items, links: w.links });
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
          ].filter(Boolean).join("\n"), { ok: true, from: w.from_, to: w.to_, ...(to === null ? { removed: true } : { status: 301 }), git });
        }
        if (action === "build") {
          const { build } = await import("@snypd/render");
          const r = await build(root);
          return text([
            `built ${r.routes} route${r.routes === 1 ? "" : "s"} in ${r.ms.toFixed(0)} ms`,
            `  ${r.rendered} rendered, ${r.cached} from cache, ${r.artefacts} artefacts${r.emitted ? ` (${r.emitted} emitted by plugins)` : ""}, ${r.media} media${r.removed ? `, ${r.removed} removed` : ""}`,
            // The lists, by name (R4, docs/20 §2.4 · 11): an archive per dated type is the one route an
            // agent that just declared a type is waiting to see, and a count of routes does not say it.
            ...(r.lists.length || r.terms ? [`  lists: ${[
              ...r.lists.map((l) => `${l.route === "/" ? "/" : `${l.route}/`} ${l.type ? `${l.title} (${l.entries} ${l.type})` : `(${l.entries} newest)`}`),
              ...(r.terms ? [`${r.terms} term page${r.terms === 1 ? "" : "s"}`] : []),
            ].join(" · ")}`] : []),
            // A type this theme has no layout for, and what drew it instead (decision 197) — the same line `snypd build` prints.
            ...r.fallbacks.map((f) => `  ${f.type} renders through \`${f.used}\` — ${r.theme.name} declares no \`${f.wanted}\` layout`),
            // A hook that failed is a line here and never a failed build (P2): the page went out without that plugin's contribution.
            ...r.hooks.diagnostics.map((d) => `  ⚠ plugin ${d.plugin} ${d.hook}${d.route ? ` on ${d.route}` : ""}: ${d.message}`),
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
            `Connect the repo to ${targetName === "cloudflare" ? "Cloudflare (Workers, the option their dashboard gives you for a repo)" : "Vercel"} once, in their dashboard; after that every push builds. \`site\` › push says what would go and where a person presses it.`,
          ].join("\n"), { ok: true, deploy: targetName, created, changed: true });
        }
        /**
         * **`deploy` uploads** (docs/31 §4, decisions 228–230): the walk's step 9. Build, `wrangler deploy`
         * from the site root through the host's own CLI, read the URL back — and on a first deploy set
         * `site.url` from what the host said, build again and upload again, so nothing the host serves
         * points at `localhost`. On a machine Cloudflare has never seen it runs `wrangler login` first,
         * which opens a tab; the person clicks *allow* and this call continues. That wait is the one
         * human action inside the tool, and the result's first line says whether it happened.
         *
         * `deploy.push: human` refuses here exactly as it refuses `push` (229). A site with a remote and
         * no `deploy.mode` is a git-connected site and is sent to `push` instead — snypd.rocks and every
         * site that deployed before L2 keeps deploying the way it did.
         */
        if (action === "deploy") {
          const cfgDeploy = cfgOf();
          const { build } = await import("@snypd/render");
          const r = await c.deploySite(root, cfgDeploy, { as: "agent", build: async (rt) => { await build(rt); } });
          const kb = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
          const structured = { ok: r.ok, deployed: r.ok, target: r.target, url: r.url, urls: r.urls, uploaded: r.uploaded, skipped: r.skipped, files: r.files, bytes: r.bytes, versionId: r.versionId, loggedIn: r.loggedIn, urlSet: r.urlSet, deploys: r.deploys, mode: r.state.mode, policy: r.state.policy, blockers: r.state.blockers, by: r.by, at: r.at };
          if (!r.ok) return { ...fail(`not deployed: ${r.reason}`, r.hint), structuredContent: { ...structured, error: r.reason, hint: r.hint } };
          const git = r.paths.length ? await commit(r.paths, `site: url ${r.urlSet} — from ${r.target}`) : "";
          return text([
            `${r.url} is live — ${r.files} file${r.files === 1 ? "" : "s"}, ${kb(r.bytes ?? 0)}, on ${r.target}${r.uploaded !== undefined ? ` (${r.uploaded} uploaded${r.skipped ? `, ${r.skipped} the host already had` : ""})` : ""}.`,
            ...(r.loggedIn ? [`Cloudflare had not seen this machine: \`wrangler login\` ran and a person allowed it. It will not ask again here.`] : []),
            ...(r.urlSet ? [`site.url was the placeholder; it is now ${r.urlSet}, read back from the host — the site was built and uploaded a second time against it, so its feed, sitemap and JSON-LD say the right origin. ${git}`] : []),
            ...(r.urls && r.urls.length > 1 ? [`Also answers at ${r.urls.filter((u) => u !== r.url).join(", ")}.`] : []),
            `Every deploy from now on is one call and no clicks. This machine is the only copy of the words — \`site\` › push backs it up: it creates a private repository through \`gh\` and sends the published branch, drafts stay here.`,
          ].join("\n"), structured);
        }
        /**
         * **`push` pushes** (S19c, decision 80), unless `deploy.push` is `human` — in which case it does
         * what it did for the whole of S19a: reports the state and hands back the URL of the Desk's
         * button.
         *
         * S19a shipped the second behaviour as the only one, on decision 44's argument that a human
         * clicking beats a `destructiveHint`. What changed is not that argument but its scope: "MCP is
         * the only interface" was false at the last mile, and the cases that broke are not edge cases —
         * CI, a headless box, a scheduled post, and D1's kill test, which cannot finish a site it may
         * not publish. The gate that does the real work is `publishCheck`, per type, in config.
         *
         * The result says which of the two happened in its first line, because an agent relaying "I have
         * put your site live" when it has not is worse than either behaviour on its own.
         */
        if (action === "push") {
          let cfgPush = cfgOf();
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
          /**
           * **A preview push** (S19d, decision 167): `snypd/drafts` goes instead of the site. The exposure
           * statement leads the result whether the push happened or was refused, because the agent
           * relays this to a person and the person is deciding whether unapproved text may be read.
           */
          if (args.preview === true) {
            const st = c.pushState(root, cfgPush, { drafts, preview: true });
            if (!st.ok) { const b = st.blockers[0]!; return fail(`nothing to preview yet — ${b.reason}`, b.hint); }
            const r = c.pushSite(root, cfgPush, { as: "agent", preview: true });
            if (!r.ok) return text([`not pushed: ${r.reason}`, r.hint ?? "", "", "What a preview push exposes, for the person deciding:", ...c.DRAFTS_PUSH_EXPOSES].filter((l, i) => l || i > 1).join("\n"), { ...st, ok: false, pushed: false, reason: r.reason, hint: r.hint, exposes: c.DRAFTS_PUSH_EXPOSES });
            return text([
              r.sent ? `pushed ${c.DRAFTS_BRANCH} → ${st.remote!.name}: ${r.sent} commit${r.sent === 1 ? "" : "s"} of drafts, for a preview` : `${c.DRAFTS_BRANCH} → ${st.remote!.name}: the remote already had it`,
              st.deploy ? `${st.deploy} builds every branch it is connected to; the build of \`${c.DRAFTS_BRANCH}\` includes the ${drafts} draft${drafts === 1 ? "" : "s"} and marks itself noindex. The URL is the host's preview URL for that branch — read it from the host, snypd does not know it.` : `Whatever builds that branch serves the preview; snypd holds no deploy API and does not know its URL.`,
              `Nothing was published: production is the base branch, and only \`content.publish\` moves it.`,
              "",
              "What this exposed:",
              ...c.DRAFTS_PUSH_EXPOSES,
            ].join("\n"), { ...st, ok: true, pushed: true, preview: true, sent: r.sent, exposes: c.DRAFTS_PUSH_EXPOSES });
          }
          /**
           * **Back it up** (docs/31 §5 · L5): a site with no remote, and `gh` on the machine.
           *
           * Until L2 every site had a remote by construction, because a remote was how a site went
           * live at all — so "no remote" was a dead end with a `git remote add` line under it, and
           * that was the whole truth. Since L1 the default site has *no* remote and is live anyway:
           * `deploy` uploads `dist/` and the only copy of the words is this disk. So the refusal
           * became the wrong answer to the right question, and this is the right one — `gh` creates
           * the repository, private, `git` fills it, and the workflow `init` already committed starts
           * linting and building every push from the next one on.
           *
           * Deliberately *not* `gh repo create --push`: that pushes `HEAD`, which in a snypd site is
           * always `snypd/drafts` (`remote.ts` header, from gh 2.97.0's source). The create adds the
           * remote; the push below is `pushSite`'s, `main:main`, with every guarantee it carries.
           *
           * Gated by `deploy.push` exactly as the push is (decision 80): creating a repository on
           * somebody's GitHub account is the same kind of act as sending a branch to it, and a site
           * that said `human` said it about this too.
           */
          let backup: Awaited<ReturnType<typeof c.createRemote>> | undefined;
          // Read the rest of the state *first*. A site with no published branch, or still on the
          // placeholder URL, cannot push whatever is done about the remote — and creating a repository
          // on somebody's account and then refusing the push is the worst of both. Only the missing
          // remote is this step's to fix, so every other blocker is answered before `gh` is touched.
          const before = c.pushState(root, cfgPush, { drafts });
          const others = before.blockers.filter((b) => !/\bremotes?\b/.test(b.reason));
          if (!before.remote && !others.length && !c.Repo.open(root)?.remotes().length && (cfgPush.config as { deploy?: { push?: string } }).deploy?.push !== "human") {
            backup = await c.createRemote(root, cfgPush, { name: typeof args.name === "string" ? args.name : undefined, public: args.public === true, description: cfgPush.config.site.description });
            // A refusal here is not a failure of `push` — it is the state `push` was already in, said
            // with the extra line `gh` made available. The blockers fall through to `pushState` below.
            if (backup.paths.length) await commit(backup.paths, "site: deploy.mode direct — a backup remote is not a deploy path");
            if (backup.ok) cfgPush = cfgOf();
          }
          // Four to five `git` spawns, so it is read again only when a remote appeared under it.
          const st = backup?.ok ? c.pushState(root, cfgPush, { drafts }) : before;
          const dev = await c.liveDev(root);
          const desk = dev ? `${dev.url}${c.PUSH_ROUTE.replace(/\/push$/, "")}` : undefined;
          const where = desk
            ? `The button is on the Desk: ${desk}`
            : `The Desk is where that button lives, and no preview is running — start one with \`snypd dev\` (a person types that), then it is at http://localhost:4321/_snypd`;
          if (!st.ok) {
            // Which refusal a person is owed, in the order that makes the next action the right one:
            // the backup's own words when it was tried and could not happen; otherwise the blocker that
            // is not about the remote, because *that* is what a backup would not have fixed and
            // `pushState` lists the missing remote first; otherwise the missing remote itself.
            const b = backup && !backup.ok ? { reason: backup.reason!, hint: backup.hint }
              : !st.remote && others.length ? { reason: others[0]!.reason, hint: `${others[0]!.hint}\nThis is what a backup would not have fixed, so nothing was created — \`site\` › push creates the repository through \`gh\` once there is something it could send.` }
              : st.blockers[0]!;
            return fail(`nothing to push yet — ${b.reason}`, b.hint);
          }
          if (st.policy === "agent") {
            const r = c.pushSite(root, cfgPush, { as: "agent" });
            if (!r.ok) return fail(`push failed: ${r.reason}`, backup?.ok
              // A repository that was created seconds ago and a push that cannot authenticate to it is
              // one thing and not two: `gh` holds a token that `git` has not been told about.
              ? `${r.hint ?? ""}\n${r.hint ? "" : `The repository is at ${backup.url} and is not going anywhere. `}\`gh auth setup-git\` makes git use the credential \`gh\` already holds, then ask again — nothing needs creating a second time.`.trim()
              : r.hint);
            // The `push` event (P3, docs/10 §4.5): the branch is on the remote; now every listening plugin
            // hears which pages went. A handler's failure is a line below and never a failed push.
            const changed = c.changedContent(root, cfgPush, r.paths ?? []);
            const events = await c.fireEvent(root, cfgPush, "push", { branch: r.branch, remote: r.remote, sent: r.sent, commits: st.commits, changed, urls: [...new Set(changed.map((x) => x.url))] });
            return text([
              ...(backup?.ok ? [
                `Created ${backup.url} — ${backup.visibility}, on the GitHub account \`gh\` is logged in to. This machine is no longer the only copy.`,
                ...(backup.modePinned ? [`\`deploy.mode\` is now \`direct\` in snypd.yaml, written on purpose: a site with a remote and no such key is read as one the host builds on push, and this site deploys from here. \`site\` › deploy goes on working exactly as it did.`] : []),
              ] : []),
              r.sent ? `pushed ${st.branch} → ${st.remote!.name}: ${r.sent} commit${r.sent === 1 ? "" : "s"}` : `${st.branch} → ${st.remote!.name}: the remote already had it`,
              ...(backup?.ok ? [`\`${c.DRAFTS_BRANCH}\` stayed here: a first push sends the published branch and nothing else. The workflow in \`.github/workflows/\` lints and builds every push from now on — it needs no secret, because it only reads the repo.`] : []),
              // A backed-up site is already live from here, so "give it a minute and read the URL" would
              // be the wrong sentence: nothing about this push changes what the host is serving.
              ...(backup?.ok ? [] : [st.deploy ? `${st.deploy} builds from the branch; give it a minute, then read ${cfgPush.config.site.url}.` : `Whatever watches that branch builds next; there is no deploy API here to poll.`]),
              `${st.drafts} draft${st.drafts === 1 ? "" : "s"} in flight stay${st.drafts === 1 ? "s" : ""} local — a push sends ${st.branch}, and drafts are not on it.`,
              ...c.eventLines(events),
              ...(desk ? [`The Desk shows what went and when: ${desk}`] : []),
            ].join("\n"), { ...st, ok: true, ready: true, pushed: true, sent: r.sent, deskUrl: desk, changed, events, ...(backup?.ok ? { created: { url: backup.url, visibility: backup.visibility, origin: backup.origin, modePinned: backup.modePinned } } : {}) });
          }
          const going = st.ahead === 0
            ? st.known ? `\`${st.branch}\` is already on \`${st.remote!.name}\` as of the last fetch — there is nothing to send.` : `\`${st.branch}\` has never been pushed to \`${st.remote!.name}\`.`
            : `${st.ahead} commit${st.ahead === 1 ? "" : "s"} would go:\n${st.commits.slice(0, 5).map((x) => `  ${x.sha.slice(0, 7)} ${x.subject}`).join("\n")}${st.ahead > 5 ? `\n  and ${st.ahead - 5} more` : ""}`;
          return text([
            `\`deploy.push\` is \`human\` on this site, so this call does not push — it tells you where a person does.`,
            ``,
            `${st.branch} → ${st.remote!.name} (${st.origin ?? st.remote!.url})${st.deploy ? ` · ${st.deploy}` : ""}`,
            going,
            `${st.drafts} draft${st.drafts === 1 ? "" : "s"} in flight stay${st.drafts === 1 ? "s" : ""} local — a push sends ${st.branch}, and drafts are not on it.`,
            ``,
            where,
          ].join("\n"), { ...st, ok: true, ready: st.ok, pushed: false, deskUrl: desk });
        }
        if (action === "doctor") return await doctor(root);
        return fail(`unknown action "${action}"`, "site takes: init, set_config, explain_config, set_nav, set_redirect, set_deploy, doctor, build, push.");
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
        if (action === "shoot") {
          const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
          const r = await bench.shoot({ root, themes: strs(args.themes), routes: strs(args.routes), scheme: args.scheme as "light" | "dark" | "both" | undefined, out: join(root, "shots") });
          if (r.skipped) return fail(r.skipped);
          return text(`${bench.formatShoot(r)}\n\nRead the sheets — one per route and scheme, every candidate side by side — before saying anything about how a theme looks.`,
            { ok: true, out: r.out, contact: join(r.out, r.contact), sheets: r.sheets, shots: r.shots.length, ms: r.ms });
        }
        return fail(`unknown action "${action}"`, "bench takes: run, compare, shoot.");
      }
      case "content.explain": return await explain(root, need(args, "type"), need(args, "slug"));
    }
    return fail(`unknown tool "${name}"`);
  } catch (e) {
    const err = e as Error & { hint?: string };
    return fail(err.message, err.hint);
  }
}

/**
 * `content.explain` — what actually ran over one item (P4, docs/02 §9, docs/10 §4.7).
 *
 * The declaration is already readable: `snypd://plugins` prints every stage, filter and slot a plugin
 * says it fills, and doctor prints it beside the version. What no table can say is which of them *ran*
 * and which of them *changed something* — a filter declared and never reached, and one reached that
 * returned the value untouched, look identical from a manifest. §4.7 makes a claim that rests on this:
 * snypd does not sandbox a plugin, and what it offers instead is that "what it declared and what it did
 * are both inspectable". This is the second half of that sentence.
 *
 * So it builds, rather than describes. A build is the only honest source: a transform's inputs include
 * the site's whole term list, the `entries` filter runs on lists this item merely appears in, and a route
 * key is computed from the theme, the plugins and the config together. The build goes to a **scratch
 * directory with its own index**, so neither `dist/` nor `.snypd/index.sqlite` is touched — a diagnostic
 * that leaves the real incremental state believing files exist which do not would break the next real
 * build, and explaining a post must not be a way to break a site. Drafts are on: an unpublished post is
 * exactly the one somebody is asking about.
 */
async function explain(root: string, type: string, slug: string): Promise<ToolResult> {
  const c = await loadCore();
  const cfg = c.loadConfig(root);
  if (!cfg.ok) return fail(`snypd.yaml is invalid: ${c.formatDiagnostics(cfg.diagnostics)}`);
  if (!cfg.config.types[type]) return fail(`unknown type "${type}"`, `Known types: ${Object.keys(cfg.config.types).join(", ")}`);
  const t = c.target(root, cfg, type, slug);
  if (!existsSync(t.file)) return fail(`no ${type} with slug "${slug}"`, "content.query lists what exists.");

  const { build, loadHooks } = await import("@snypd/render");
  const scratch = mkdtempSync(join(tmpdir(), "snypd-explain-"));
  let result: Awaited<ReturnType<typeof build>>;
  let key: string | undefined, outputs: string[] = [];
  try {
    const hooks = await loadHooks(cfg, { record: true });
    const index = await c.SiteIndex.open(root, join(scratch, "index.sqlite"));
    try {
      result = await build(root, { out: join(scratch, "dist"), cfg, index, hooks, drafts: true });
      const row = index.route(t.route);
      key = row?.key; outputs = row?.outputs ?? [];
    } finally { index.close(); }
  } finally { rmSync(scratch, { recursive: true, force: true }); }

  const runs = result.hooks.record ?? [];
  const here = runs.filter((r) => r.route === t.route);
  const emits = runs.filter((r) => r.hook === "stages.emit");
  const elsewhere = runs.length - here.length - emits.length;
  const plugins = cfg.plugins.filter((p) => p.loaded);
  const mark = (r: { changed: boolean }) => (r.changed ? "✎" : "·");

  const lines = [`${type}/${slug} → ${t.route}`];
  if (!plugins.length) {
    lines.push("", "No plugin is enabled on this site, so nothing but the theme touched this page.",
      "`snypd://plugins` lists the bundled ones; `plugins: [autolink]` in snypd.yaml enables one with no install.");
  } else {
    lines.push("", `declared, in \`plugins:\` order — ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} loaded:`);
    for (const p of plugins) {
      const what = [
        Object.keys(p.stages).length && `stages ${Object.keys(p.stages).join(", ")}`,
        Object.keys(p.slots).length && `slots ${Object.keys(p.slots).join(", ")}`,
        Object.keys(p.filters).length && `filters ${Object.keys(p.filters).join(", ")}`,
        Object.keys(p.events).length && `events ${Object.keys(p.events).join(", ")}`,
        p.tools && "tools",
      ].filter(Boolean).join(" · ");
      lines.push(`  ${p.name} — ${p.tiers.join(" + ")}${what ? `: ${what}` : " (root keys only — nothing runs per page)"}`);
    }
    lines.push("", here.length ? `what ran over ${t.route}, in order:` : `nothing ran over ${t.route} — every declared hook above is for a value or a place this page does not have.`);
    for (const r of here) lines.push(`  ${mark(r)} ${r.plugin} ${r.hook}${r.note ? ` — ${r.note}` : ""}`);
    if (emits.length) {
      lines.push("", "emitted beside the pages, once per build:");
      for (const r of emits) lines.push(`  ✎ ${r.plugin} ${r.hook} → ${r.route?.replace(/^\//, "")}${r.note ? ` (${r.note})` : ""}`);
    }
    if (elsewhere) lines.push("", `${elsewhere} more hook run${elsewhere === 1 ? "" : "s"} on other routes this build — a filter runs wherever its value is read, so a list this item appears in ran its own.`);
  }

  if (result.hooks.diagnostics.length) {
    lines.push("", "a hook failed, and the page rendered without it:");
    for (const d of result.hooks.diagnostics) lines.push(`  ❌ ${d.plugin} ${d.hook}${d.route ? ` on ${d.route}` : ""}: ${d.message}`);
  }

  lines.push("", `route key: ${key ?? "not planned — this item produced no route"}`);
  lines.push("  # the whole input to whether this page re-renders: its source, the theme's bytes, the plugins' bytes, the config, and — while a transform is on — every term the site uses, because adding a term elsewhere changes this page (decision 95).");
  if (outputs.length) lines.push(`outputs: ${outputs.join(", ")}`);

  const rows = c.readEvents(root).filter((r) => r.event === "publish").slice(-3).reverse();
  lines.push("", rows.length ? "the last publishes a plugin reacted to:" : "no plugin has reacted to a publish on this machine yet (snypd://<plugin>/last is one plugin's own rows).");
  for (const r of rows) lines.push(`  ${r.ok ? "✓" : "⚠"} ${r.plugin}: ${r.message} (${r.at})`);

  lines.push("", `built ${result.routes} routes + ${result.artefacts} artefacts in a scratch directory, which is gone — dist/ and the site's index are untouched.`);
  return text(lines.join("\n"), {
    ok: true, type, slug, route: t.route, key, outputs,
    declared: plugins.map((p) => ({ plugin: p.name, tiers: p.tiers, stages: Object.keys(p.stages), slots: Object.keys(p.slots), filters: Object.keys(p.filters), events: Object.keys(p.events), tools: !!p.tools })),
    ran: here, emitted: emits, elsewhere, diagnostics: result.hooks.diagnostics,
  });
}

/** `site` › doctor: everything that decides whether this repo is a working site, in one read. */
/**
 * `theme › look` (E1, docs/36 §5a): the site as it renders now, from the preview this session already
 * shares with `render_preview`. Facts first as text, one picture second, the rest as links — the image is
 * the one content block that costs tokens, and it is the crop, not the page.
 *
 * With no browser on the machine the call still answers, with every fact that needs none (`check theme`:
 * the contrast of the tokens, the static taste rules, the CSS lints) and one line on how to get eyes.
 */
async function lookAt(root: string, args: Record<string, unknown>, cfgOf: () => import("@snypd/core").LoadedConfig, ctx: CallContext): Promise<ToolResult> {
  const eyes = await import("@snypd/bench/look");
  eyesLoaded = true;
  const opt = (k: string) => (typeof args[k] === "string" && args[k] ? (args[k] as string) : undefined);
  const width = args.width === undefined ? undefined : Number(args.width);
  if (width !== undefined && (!Number.isInteger(width) || width < 200 || width > 3000)) return fail(`width must be whole pixels, 200–3000; got ${JSON.stringify(args.width)}`, "390 is a phone, 768 a tablet, 1280 a laptop.");
  const scheme = opt("scheme");
  if (scheme && scheme !== "light" && scheme !== "dark") return fail(`look takes one scheme at a time: \`light\` or \`dark\`, not \`${scheme}\``, "One picture per call; look again for the other.");
  const state = opt("state");
  if (state && !(eyes.LOOK_STATES as readonly string[]).includes(state)) return fail(`no state "${state}"`, `states: ${eyes.LOOK_STATES.join(", ")}`);
  const cfg = cfgOf();
  const slot = opt("slot");
  const cacheDir = join((await import("@snypd/core/paths")).ensureDisposableDir(join(root, ".snypd")), "look");
  const uri = (f: string) => `snypd://look/${relative(cacheDir, f).split(/[\\/]/).join("/")}`;

  const blind = async (why: string, hint: string) => {
    const { checkTheme } = await import("@snypd/render/check");
    const r = await checkTheme(root, cfg.config.theme.use);
    const shown = r.rules.filter((x) => x.status === "fail" || x.status === "warn");
    return text([
      `no picture — ${why}`,
      `What can be known without a browser, from \`check theme ${r.name}\`:`,
      ...(shown.length ? shown.slice(0, 12).map((x) => `${x.status === "fail" ? "✗" : "⚠"} ${x.rule}  ${x.detail}${x.where ? `  (${x.where})` : ""}`) : [`✓ ${r.rules.filter((x) => x.status === "pass").length} rules pass — contrast of the tokens, the static taste rules, the CSS lints`]),
      hint,
    ].join("\n"), { ok: true, picture: false, reason: why, hint, check: { ok: r.ok, rules: shown } });
  };
  if (!eyes.eyesBrowser()) return await blind("no browser on this machine", "`snypd eyes install` fetches chrome-headless-shell (~90 MB) to ~/.cache/snypd once — a person runs it; or set SNYPD_CHROME to any Chromium.");
  if (!ctx.preview) return fail("no preview server to look at", "`theme` › look runs inside `snypd serve`, which shares the session's preview with content.render_preview.");

  const server = await ctx.preview();
  let r;
  try {
    r = await eyes.look({
      url: server.url, cacheDir, route: opt("route"), slot, selector: opt("selector"),
      // The piece in that slot says which classes it emits: those find the slot before any guess does.
      slotClasses: slot ? cfg.pieces.find((p) => p.slot === slot)?.entry.emits : undefined,
      width, scheme: scheme as "light" | "dark" | undefined, state: state as never, target: opt("target"),
      since: opt("since") as "last" | "none" | undefined, view: opt("view") as "picture" | "outline" | undefined,
    });
  } catch (e) {
    const err = e as Error & { hint?: string };
    if (err instanceof eyes.NoBrowserError) return await blind(err.message, err.hint);
    return fail(err.message, err.hint);
  }
  const content: ToolResult["content"] = [{ type: "text", text: eyes.formatLook(r, uri) }];
  if (r.image) content.push({ type: "image", data: r.image.data, mimeType: r.image.mimeType });
  if (r.files.full) content.push({ type: "resource_link", uri: uri(r.files.full), name: "full page", mimeType: "image/webp", description: `${r.route} at ${r.width} px, ${r.scheme}, every problem boxed` });
  if (r.files.before) content.push({ type: "resource_link", uri: uri(r.files.before), name: "before", mimeType: "image/webp", description: "the previous look at this crop, without boxes" });
  const { image, files, ...facts } = r;
  return { content, structuredContent: { ok: true, ...facts, image: image ? { width: image.width, height: image.height, mimeType: image.mimeType } : undefined, full: files.full && uri(files.full), before: files.before && uri(files.before) } };
}

/** Close the browser `look` started, if it did. Called when the session ends; never imports what was not loaded. */
export async function disposeCatalog(): Promise<void> {
  if (eyesLoaded) (await import("@snypd/bench/look")).closeEyes();
}
let eyesLoaded = false;

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

  // The plugins (P1, docs/10 §4.1): one row per entry — version, what it does, where it came from — and a
  // refused one is a problem carrying its own diagnostic, because the site loaded without it.
  for (const p of cfg.plugins) {
    const why = p.diagnostics.filter((d) => d.level === "error").map((d) => `${d.path}: ${d.message}${d.where ? ` (${d.where})` : ""}`).join("\n");
    if (!p.found) warn(`plugin \`${p.entry}\` not found — \`bun add snypd-plugin-${p.name}\`, or a \`plugins/${p.name}/snypd.yaml\` here`);
    else if (!p.loaded) bad(`plugin \`${p.name}\` not loaded — ${p.why}`, why);
    else {
      // What it hooks (P2) and what it runs (P3), then what it is allowed: the emit prefix and the hosts,
      // because a reader deciding whether to keep a plugin wants those two on the same line as its name.
      const hooks = [
        Object.keys(p.slots).length ? `slots ${Object.keys(p.slots).join(", ")}` : "",
        Object.keys(p.filters).length ? `filters ${Object.keys(p.filters).join(", ")}` : "",
        Object.keys(p.stages).length ? `stages ${Object.keys(p.stages).join(", ")}` : "",
        Object.keys(p.events).length ? `events ${Object.keys(p.events).join(", ")}` : "",
      ].filter(Boolean).join("; ");
      const allowed = [p.clientKb ? `client ${p.clientKb} KB` : "", p.stages.emit ? `writes ${p.emitPrefixes.join(", ")}` : "", p.events.publish || p.events.push ? (p.network.length ? `fetches ${p.network.join(", ")}` : "no network") : ""].filter(Boolean).join(" · ");
      ok(`plugin \`${p.name}\` ${p.manifest?.version ?? "(no plugin: block)"} ${p.tiers.join(" + ") || "declares nothing"} (${p.where})${hooks ? ` — ${hooks}` : ""}${allowed ? ` · ${allowed}` : ""}`);
    }
  }
  /**
   * Tier 4 (P4): the verbs, not just the word "speaks".
   *
   * The lines above are read from the manifest, which is why they are free. This one has to import the
   * plugin's module to know what is in it — so it is here, in the call whose whole job is to be thorough,
   * and nowhere on the path a session pays for. It is also the only surface a broken tools module has:
   * `loadPluginTools` refuses it with a diagnostic rather than throwing, and a refusal nobody prints is
   * a plugin that silently does four of its five tiers.
   */
  const speaks = cfg.plugins.filter((p) => p.loaded && (p.tools || p.prompts));
  if (speaks.length) {
    const [t, pr] = await Promise.all([c.loadPluginTools(root, cfg), c.loadPluginPrompts(root, cfg)]);
    for (const d of [...t.diagnostics, ...pr.diagnostics]) bad(`plugin \`${d.plugin}\` ${d.message}`, `${d.path}: ${d.message}`);
    for (const p of speaks) {
      const verbs = t.sets.find((x) => x.plugin === p.name)?.actions.map((a) => `\`${p.name}\` › ${a.name}`) ?? [];
      const names = pr.sets.filter((x) => x.plugin === p.name).map((x) => x.name);
      if (!verbs.length && !names.length) continue;
      ok(`\`${p.name}\` speaks: ${[verbs.join(" · "), names.length ? `prompt${names.length === 1 ? "" : "s"} ${names.join(", ")}` : ""].filter(Boolean).join(" · ")} — found with find_tools, so tools/list did not grow (D11)`);
    }
  }
  // The client-JS line (P2, decision 84): what the plugins declared against what the site afforded. Only
  // when there is something to say — a site with no plugin and a budget of 0 is the default and prints nothing.
  const jsKb = (cfg.config.bench.budgets as Record<string, unknown>).jsKb;
  const declared = c.clientKbDeclared(cfg.plugins);
  if (declared || (typeof jsKb === "number" && jsKb > 0)) ok(`client JS: ${declared} KB declared by plugins, ${typeof jsKb === "number" ? jsKb : 0} KB afforded (bench.budgets.jsKb) — \`snypd bench page\` measures what reached the page`);

  const stranded = c.themeTokens(cfg).filter((t) => t.overridden && !t.customisable);
  if (stranded.length) warn(`${stranded.length} token override${stranded.length === 1 ? "" : "s"} the theme does not declare: ${stranded.map((t) => t.name).join(", ")}`);

  // The settings the theme offers and what this site has answered (U3). A theme with none prints no row:
  // most themes will have none for a while, and a row that says "0 declared" is a line every session
  // pays for to learn nothing.
  const settings = c.themeSettings(cfg);
  if (settings.length) {
    const answered = settings.filter((x) => x.set);
    const refused = settings.filter((x) => x.invalid);
    if (refused.length) bad(`${refused.length} setting value${refused.length === 1 ? "" : "s"} the theme refuses`, refused.map((x) => `theme.settings.${x.id}: ${x.invalid}`).join("\n"));
    ok(`settings: ${settings.length} declared by \`${cfg.config.theme.use}\`, ${answered.length} set${answered.length ? ` (${answered.map((x) => x.id).join(", ")})` : ""} — snypd://theme/settings`);
  }
  const strandedSet = c.strandedSettings(cfg);
  if (strandedSet.length) warn(`${strandedSet.length} setting value${strandedSet.length === 1 ? "" : "s"} \`${cfg.config.theme.use}\` does not declare, left by another theme: ${strandedSet.join(", ")} — \`site\` › set_config theme.settings.<id> null removes one`);

  // The look, and the same stranding story a third time (U6a). Only from a theme that ships variations,
  // for the reason the settings row above gives — except the stranded warning, which is worth saying
  // whatever the theme ships, because it is the one state where the site is not rendering what it asked for.
  const looks = c.themeVariations(cfg);
  const activeLook = looks.find((v) => v.active);
  if (looks.length) ok(`variations: ${looks.length} shipped by \`${cfg.config.theme.use}\`, on \`${activeLook?.name ?? "none"}\`${activeLook && !activeLook.tokenCount ? " (the theme's own tokens)" : ""} — snypd://theme`);
  const strandedLook = c.strandedVariation(cfg);
  if (strandedLook) warn(`theme.variation is \`${strandedLook}\`, which \`${cfg.config.theme.use}\` does not ship${looks.length ? ` (it ships ${looks.map((v) => v.name).join(", ")})` : ""} — its own tokens are rendering; \`theme\` › set with variation null removes it`);

  const index = await c.SiteIndex.open(root);
  let lint: Awaited<ReturnType<Core["lintSite"]>>;
  let stored: { slug: string; type: string; route: string; status: string; frontmatter: Record<string, unknown> }[] = [];
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

  // The menus (U2). A declared location with no file is the state every `init` site starts in, so it is
  // a warning that names the remedy, not a problem; a dead `ref` is already a lint error above.
  const locations = c.navLocations(cfg);
  if (locations.length) {
    const menus = locations.map((l) => c.loadNav(root, l, cfg));
    const empty = menus.filter((m) => !m.exists);
    if (empty.length === menus.length) warn(`no menus yet — theme \`${cfg.config.theme.use}\` renders ${locations.map((l) => `\`${l}\``).join(" and ")}; \`site\` › set_nav writes one`);
    else ok(`menus: ${menus.map((m) => `${m.location} ${m.exists ? `${m.items.length} item${m.items.length === 1 ? "" : "s"}` : "none"}`).join(", ")}`);
  }

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
  // How this site goes live decides which rows say so (L3, docs/31 §4 "what the agent sees"). A site with
  // a remote and no `deploy.mode` deploys on push, and the push rows below are its story. Every site
  // `init` has made since L1 deploys directly, and for those "no remote" was the wrong sentence — it said
  // nothing could go live, on the one path where going live is a single call. The four host rows are read
  // from the tree and from `.snypd/deploy.json`, never from wrangler: `preflight: false` costs nothing,
  // and the preflight form is a package-runner start and a request to Cloudflare for a fact that only
  // changes when a deploy changes it. So "logged in" is answered as of the last deploy, and said as such.
  const dep = await c.deployState(root, cfg, { preflight: false });
  const last = c.readDeploy(root);
  const when = (iso: string) => iso.replace("T", " ").slice(0, 16);
  const sameUrl = (a: string, b: string) => a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();
  if (dep.mode === "direct") {
    if (dep.target === "cloudflare") {
      const runner = c.findRunner();
      if (runner) ok(`host: ${dep.target}, deployed from here through wrangler ${dep.wrangler} via \`${runner.kind}\`${dep.policy === "human" ? " — `deploy.push` is `human`, so `site` › deploy reports and a person uploads" : ""}`);
      else warn(`host: ${dep.target}, but neither \`npx\` nor \`bunx\` is on this machine, so wrangler cannot run — install Node (https://nodejs.org) or Bun (https://bun.sh); snypd does not bundle the host's CLI`);
      if (last) ok(`last deploy ${when(last.at)} by ${last.by}: ${last.url} — ${last.files} file${last.files === 1 ? "" : "s"}${last.deploys > 1 ? `, ${last.deploys} uploads` : ""}${last.account?.email ? `; logged in as ${last.account.email} then` : ""}`);
      else warn("no deploy on record here — `site` › deploy puts it online: one call, and on a machine the host has never seen a person clicks allow once");
      // The backup row (L5). A direct-deployed site is live with no repository anywhere but this disk,
      // and that is a fact worth saying once a deploy has happened — not before, when "no remote" is
      // simply what a site being written looks like.
      if (!push?.remote) {
        const gh = c.findGh();
        if (last) warn(`this machine is the only copy — the site is live and nothing is backed up${gh ? ". `site` › push creates a private repository through `gh` and sends the published branch" : "; GitHub's CLI (`gh`) is not here, so `site` › push says the two lines that connect one by hand"}`);
        else if (gh) ok("`gh` is here, so `site` › push can create the repository this site has not needed yet");
      }
      if (dep.placeholderUrl) warn(`site.url is ${dep.url}, a placeholder — the first \`site\` › deploy reads the real one back from the host and sets it`);
      else if (last && last.urls.some((u) => sameUrl(u, dep.url))) ok(`site.url is the host's — ${dep.url}`);
      else if (last) warn(`site.url is ${dep.url}, and the host did not answer at it on the last deploy (${last.urls.join(", ")}) — a domain not attached yet, or a URL set by hand; the feed and sitemap say ${dep.url} either way`);
    } else if (dep.blockers[0]) {
      // No host config, or a host whose CLI this does not run: the blocker deploy would refuse with, said
      // now — an unfinished thing rather than a problem, because a site with no host is a site somebody
      // is still writing, and the remedy is one call.
      warn(`${dep.blockers[0].reason} — ${dep.blockers[0].hint}`);
      if (dep.placeholderUrl) warn(`site.url is ${dep.url}, a placeholder — the feed, sitemap and JSON-LD are absolute; a direct deploy sets it from the host, and a push needs \`site\` › set_config \`site.url\` first`);
    }
  } else {
    if (push?.remote) ok(`remote \`${push.remote.name}\` → ${push.origin ?? push.remote.url}${push.deploy ? ` · ${push.deploy}` : ""}`);
    else if (push?.blockers.some((b) => /remote/.test(b.reason))) warn("no remote — `deploy.mode` is `git`, so the host builds what is pushed, and there is nowhere to push");
    if (push?.remote && push.ok) {
      if (!push.known) warn(`\`${push.branch}\` has never been pushed — a person does that from the Desk, and \`site\` › push says where`);
      else if (push.ahead) warn(`${push.ahead} commit${push.ahead === 1 ? "" : "s"} on \`${push.branch}\` are not on \`${push.remote.name}\` — published items nobody has put live yet`);
      else ok(`\`${push.branch}\` is up to date with \`${push.remote.name}\` as of the last fetch`);
    }
    if (dep.placeholderUrl) warn(`site.url is ${dep.url}, a placeholder — the feed, sitemap and JSON-LD are absolute, so \`site\` › set_config \`site.url\` is needed before the site is pushed to a host (\`site\` › push refuses until then)`);
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

  // The eyes (E1): which browser `theme › look` will start, found without starting it. A machine with none
  // is a warning and not a problem — every look still answers, with what can be known without a picture.
  const { eyesBrowser, eyesBrowsers } = await import("@snypd/bench/look");
  const seeing = eyesBrowser();
  if (seeing) ok(`eyes: \`theme\` › look uses ${seeing.name} — ${seeing.path}${eyesBrowsers().length > 1 ? ` (${eyesBrowsers().length - 1} more to fall back on)` : ""}`);
  else warn("eyes: no browser — `theme` › look answers without a picture; `snypd eyes install` fetches chrome-headless-shell (~90 MB) once, or set SNYPD_CHROME");

  const items = facts.items;
  if (items) ok(`${items} item${items === 1 ? "" : "s"}`);
  else warn("no content yet — the `get-started` prompt writes the first post");

  // The basics (S36): what a reader or a network sees before a word of the site — the tab's icon, the page
  // a broken link lands on, the card a shared link shows, the line under a search result. Asked only of a
  // site with content; each unfinished one names the prompt that finishes it.
  if (items) {
    const live = stored.filter((f) => cfg.config.statuses[f.status]?.public === true);
    const icon = cfg.config.site.icon as string | undefined;
    const media = join(root, "content", "media");
    if (!icon) warn("no site.icon — browsers ask for one on every page; the `site-basics` prompt draws it as SVG");
    else ok(`icon ${icon}${existsSync(join(media, "icons", "favicon.ico")) ? " + favicon.ico, apple-touch-icon" : " — `snypd cards` rasterises favicon.ico and apple-touch-icon from it"}`);
    if (live.some((f) => f.route === "/404")) ok("a not-found page of the site's own at /404, also served as /404.html");
    else warn("no not-found page — the build writes a plain /404.html; the `site-basics` prompt writes one in the site's voice");
    const cards = existsSync(join(media, "cards")) ? readdirSync(join(media, "cards")).filter((f) => f.endsWith(".png")).length : 0;
    if (cards) ok(`${cards} share card${cards === 1 ? "" : "s"} in content/media/cards — \`snypd cards\` redraws what changed`);
    else warn("no share cards — every page shares the same image (or none); `snypd cards` draws one per page in the theme");
    const bare = live.filter((f) => !(typeof f.frontmatter.description === "string" && f.frontmatter.description.trim()));
    if (bare.length) warn(`${bare.length} published item${bare.length === 1 ? " has" : "s have"} no description — search results and share cards fall back to the first paragraph (${bare.slice(0, 3).map((f) => `${f.type}/${f.slug}`).join(", ")}${bare.length > 3 ? "…" : ""})`);
  }

  // Broken and unfinished are different things, and a first run is full of the second kind (S18d): a
  // scaffold with no content and a placeholder URL is a site working exactly as intended two minutes in.
  // Saying "nothing to fix" under two ⚠ rows reads as though the rows did not count.
  const tail = problems.length ? `\n${problems.length} problem${problems.length === 1 ? "" : "s"} to fix:\n${problems.join("\n")}`
    : warnings.length ? `\nnothing broken — ${warnings.length} thing${warnings.length === 1 ? "" : "s"} still unfinished, above`
    : "\nnothing to fix";
  return text([...lines, tail].join("\n"),
    { ok: !problems.length, problems, lint: { errors: lint.errors, warnings: lint.warnings },
      facts: { config: true, theme: !!active, git: !!repo, registered: reg.present && reg.names && !reg.missingCommand, harness: harness === "connected", harnessState: harness, startedAt, client, dev: !!dev, deskUrl: dev ? `${dev.url}/_snypd` : undefined, items, placeholderUrl: facts.placeholderUrl,
        push: push ? { remote: push.remote?.name, origin: push.origin, deploy: push.deploy, branch: push.branch, ahead: push.ahead, known: push.known, ready: push.ok } : undefined,
        // Two keys, not one, because F4's instrument diffs doctor's facts key by key after `rm -rf .snypd/`
        // (bench/smoke/onboard.ts): `deploy` is derived from the tree on every call and must survive;
        // `lastDeploy` is the record a deploy left of an event on the host, which nothing here can
        // re-derive without the network, and is exempt by name the way `dev` is.
        deploy: { target: dep.target, mode: dep.mode, policy: dep.policy, wrangler: dep.wrangler, url: dep.url, ready: dep.ok },
        lastDeploy: last ? { at: last.at, by: last.by, url: last.url, urls: last.urls, files: last.files, bytes: last.bytes, deploys: last.deploys, email: last.account?.email, urlIsHosts: !dep.placeholderUrl && last.urls.some((u) => sameUrl(u, dep.url)) } : undefined } });
}

