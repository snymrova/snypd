/**
 * Tier 4 of the plugin contract — **speak** (P4, docs/10 §4.2).
 *
 * The first three tiers put a plugin inside a build: it declares types, decorates a render, transforms a
 * document, reacts to a publish. This one puts a plugin inside the *conversation*, which is the only
 * interface this CMS has. A plugin that speaks contributes two things and no more:
 *
 *  - **one tool**, named after the plugin, with the actions its module declares as the `action` enum. One
 *    tool per plugin rather than one per verb, for the reason the static catalogue gives (catalog.ts): five
 *    `indexnow.*` tools would be five descriptions, four of which repeat what IndexNow is. The tool is
 *    **never in the always-listed set** — it is found with `find_tools` like everything that is not writing
 *    a post — which is what makes D11's "`tokens.tools` unchanged with every plugin on" a property of the
 *    design rather than a thing to remember.
 *  - **prompts**, named `<plugin>.<name>`, which `prompts/list` carries beside snypd's own two.
 *
 * What a plugin gets handed is deliberately the same set an event handler gets (§4.7): its validated
 * options, the site, the allowlisted `ctx.fetch` built from its own `capabilities.network`, and — because
 * a tool is called by an agent rather than fired by a commit — two reads it would otherwise have to invent:
 * every published page of the site, and its own rows from the event ring. Nothing here is a write. Plugins
 * do not write content (§4.9); a plugin that wants words written exposes a tool and the agent writes them.
 *
 * A module of the wrong shape is a **diagnostic**, not a crash and not a missing tool: the plugin loads,
 * the rest of its tiers work, and doctor says the tool was refused and why. The one thing that is checked
 * at config load instead of here is that the file exists at all (plugins.ts) — because a tool that is
 * missing from the manifest's own directory is a mistake worth finding before the agent asks for it.
 */
import { listContent } from "./content";
import type { Diagnostic, LoadedConfig } from "./config";
import { pluginFetch, readEvents, urlOf, type EventRow } from "./events";
import { pluginModule, type LoadedPlugin } from "./plugins";
import type { Config } from "./schema";

/** One published page of the site, as a plugin tool reads it — the list a ping sends. */
export interface PluginPage { type: string; slug: string; route: string; url: string }

/**
 * What an action is handed beside its arguments. `pages()` and `events()` are functions rather than values
 * because most actions want neither: a tool call should not read the whole site to answer "what is my key".
 */
export interface PluginToolCtx {
  root: string;
  plugin: string;
  /** The site's validated options for this plugin (`plugins: [{ name: {…} }]`). */
  options: Record<string, unknown>;
  site: Config["site"];
  config: Config;
  /** The allowlisted fetch (§4.7): this plugin's `capabilities.network`, or one that refuses everything. */
  fetch: typeof fetch;
  /** Every content file the site's types declare, with its absolute url. Read on call, not on load. */
  pages: () => PluginPage[];
  /** This plugin's rows from `.snypd/events.json`, newest first — what it said the last time it reacted. */
  events: () => EventRow[];
}

/**
 * What an action returns. A string is `{ ok: true, message }`; `data` is put on the tool result's
 * `structuredContent`, so an agent can read a number without parsing a sentence.
 */
export type PluginToolReply = { ok: boolean; message?: string; data?: Record<string, unknown> } | string | void | undefined;

/** One verb of a plugin's tool: `indexnow` › `ping`. */
export interface PluginToolAction {
  name: string;
  /** One line, written to the agent. It is read beside the other actions of the same tool, so it says what *this* one does and not what the plugin is. */
  description: string;
  /** JSON Schema properties this action reads, merged into the tool's one flat property bag the way `site`'s are. Describe which action each belongs to. */
  input?: Record<string, unknown>;
  /** Properties of `input` this action cannot run without. Enforced before `run`, so an action never checks its own arguments twice. */
  required?: string[];
  run: (args: Record<string, unknown>, ctx: PluginToolCtx) => PluginToolReply | Promise<PluginToolReply>;
}

/** The default export of a plugin's `tools:` module. */
export interface PluginToolsModule {
  /** The tool's description — what the whole namespace is. Falls back to the manifest's `description`. */
  description?: string;
  /** Words `find_tools` matches on beyond the name and description: what an agent would actually type. */
  keywords?: string[];
  actions: PluginToolAction[];
}

/** What a plugin prompt is handed: the same reads a tool gets, minus the fetch — a prompt is words, not an act. */
export interface PluginPromptCtx {
  root: string;
  plugin: string;
  options: Record<string, unknown>;
  site: Config["site"];
  config: Config;
}

/** One prompt a plugin contributes. `render` returns the opening turn of a conversation, as markdown. */
export interface PluginPromptDef {
  name: string;
  description: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
  render: (args: Record<string, unknown>, ctx: PluginPromptCtx) => string;
}

/** The default export of a plugin's `prompts:` module. */
export interface PluginPromptsModule { prompts: PluginPromptDef[] }

/** A plugin's tool, resolved: the plugin it came from, the tool's copy, and the actions an agent may call. */
export interface PluginToolSet {
  plugin: string;
  /** The tool's name in the catalogue, which is the plugin's name. */
  name: string;
  description: string;
  keywords: string[];
  actions: PluginToolAction[];
  /** Everything `run` needs, already built. */
  ctx: Omit<PluginToolCtx, "plugin"> & { plugin: string };
}

/** A plugin's prompt, resolved: `<plugin>.<name>` and the closure that renders it. */
export interface PluginPromptSet {
  plugin: string;
  /** `<plugin>.<name>` — namespaced, so a plugin cannot shadow `get-started`. */
  name: string;
  description: string;
  arguments: { name: string; description?: string; required?: boolean }[];
  render: (args: Record<string, unknown>) => string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0]!;
const refusal = (p: LoadedPlugin, key: "tools" | "prompts", why: string): Diagnostic => ({
  level: "error", plugin: p.name, path: `plugins[${p.name}].plugin.${key}`,
  message: `${why} — ${key === "tools" ? "the tool is" : "its prompts are"} not offered; every other tier of this plugin still runs`,
  where: p.file,
});

/** The pages and event rows every action of every plugin shares, read at most once per `loadPluginTools` call. */
function readsFor(root: string, cfg: LoadedConfig, p: LoadedPlugin) {
  let pages: PluginPage[] | undefined;
  let rows: EventRow[] | undefined;
  return {
    root, plugin: p.name, options: p.options, site: cfg.config.site, config: cfg.config,
    fetch: pluginFetch(p),
    pages: () => (pages ??= listContent(root, cfg).map((f) => ({ type: f.type, slug: f.slug, route: f.route, url: urlOf(cfg.config.site.url, f.route) }))),
    events: () => (rows ??= readEvents(root).filter((r) => r.plugin === p.name).reverse()),
  };
}

/**
 * Resolve every loaded plugin's `tools:` module, in `plugins:` order. Returns what the catalogue can
 * merge and the diagnostics doctor should print; never throws — a plugin whose module is broken costs
 * its own tool and nothing else.
 */
export async function loadPluginTools(root: string, cfg: LoadedConfig): Promise<{ sets: PluginToolSet[]; diagnostics: Diagnostic[] }> {
  const sets: PluginToolSet[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const p of cfg.plugins) {
    if (!p.loaded || !p.tools || !p.dir) continue;
    let mod: unknown;
    try { mod = await pluginModule(p, p.tools); }
    catch (e) { diagnostics.push(refusal(p, "tools", `${p.tools} did not import (${message(e)})`)); continue; }
    if (!isObj(mod) || !Array.isArray((mod as unknown as PluginToolsModule).actions)) {
      diagnostics.push(refusal(p, "tools", `${p.tools} default-exports ${mod === undefined ? "nothing" : Array.isArray(mod) ? "an array" : `a ${typeof mod}`} where a tools module exports { description?, keywords?, actions }`));
      continue;
    }
    const m = mod as unknown as PluginToolsModule;
    const actions: PluginToolAction[] = [];
    for (const [i, a] of m.actions.entries()) {
      if (!isObj(a) || typeof a.name !== "string" || !a.name || typeof a.description !== "string" || typeof a.run !== "function") {
        diagnostics.push(refusal(p, "tools", `${p.tools} action ${i} is not { name, description, run }`));
        continue;
      }
      if (actions.some((x) => x.name === a.name)) { diagnostics.push(refusal(p, "tools", `${p.tools} declares the action \`${a.name}\` twice`)); continue; }
      actions.push(a as PluginToolAction);
    }
    if (!actions.length) { diagnostics.push(refusal(p, "tools", `${p.tools} declares no usable action`)); continue; }
    sets.push({
      plugin: p.name, name: p.name,
      description: (typeof m.description === "string" && m.description) || p.manifest?.description || `Tools from the ${p.name} plugin.`,
      keywords: Array.isArray(m.keywords) ? m.keywords.filter((k): k is string => typeof k === "string") : [],
      actions, ctx: readsFor(root, cfg, p),
    });
  }
  return { sets, diagnostics };
}

/** The same, for `prompts:`. Names are `<plugin>.<name>`, so nothing a plugin declares can shadow snypd's own. */
export async function loadPluginPrompts(root: string, cfg: LoadedConfig): Promise<{ sets: PluginPromptSet[]; diagnostics: Diagnostic[] }> {
  const sets: PluginPromptSet[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const p of cfg.plugins) {
    if (!p.loaded || !p.prompts || !p.dir) continue;
    let mod: unknown;
    try { mod = await pluginModule(p, p.prompts); }
    catch (e) { diagnostics.push(refusal(p, "prompts", `${p.prompts} did not import (${message(e)})`)); continue; }
    if (!isObj(mod) || !Array.isArray((mod as unknown as PluginPromptsModule).prompts)) {
      diagnostics.push(refusal(p, "prompts", `${p.prompts} default-exports ${mod === undefined ? "nothing" : Array.isArray(mod) ? "an array" : `a ${typeof mod}`} where a prompts module exports { prompts }`));
      continue;
    }
    const ctx: PluginPromptCtx = { root, plugin: p.name, options: p.options, site: cfg.config.site, config: cfg.config };
    for (const [i, d] of (mod as unknown as PluginPromptsModule).prompts.entries()) {
      if (!isObj(d) || typeof d.name !== "string" || !d.name || typeof d.description !== "string" || typeof d.render !== "function") {
        diagnostics.push(refusal(p, "prompts", `${p.prompts} prompt ${i} is not { name, description, render }`));
        continue;
      }
      const def = d as unknown as PluginPromptDef;
      const name = `${p.name}.${def.name}`;
      if (sets.some((x) => x.name === name)) { diagnostics.push(refusal(p, "prompts", `${p.prompts} declares the prompt \`${def.name}\` twice`)); continue; }
      sets.push({ plugin: p.name, name, description: def.description, arguments: def.arguments ?? [], render: (args) => def.render(args, ctx) });
    }
  }
  return { sets, diagnostics };
}

/**
 * Run one action of one plugin tool. Arguments are checked against the action's `required` first, so a
 * handler never validates its own; anything the handler throws becomes `{ ok: false }` with its message,
 * because a plugin tool that fails is a result an agent can read and not a broken session.
 */
export async function callPluginTool(set: PluginToolSet, action: string, args: Record<string, unknown>): Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }> {
  const a = set.actions.find((x) => x.name === action);
  if (!a) return { ok: false, message: `unknown action "${action}" for ${set.name} — it has: ${set.actions.map((x) => x.name).join(", ")}` };
  for (const k of a.required ?? []) if (args[k] === undefined || args[k] === null || args[k] === "")
    return { ok: false, message: `${k} required for ${set.name} › ${action}` };
  try {
    const reply = await a.run(args, set.ctx);
    if (reply === undefined || reply === null) return { ok: true, message: "done" };
    if (typeof reply === "string") return { ok: true, message: reply };
    if (isObj(reply) && typeof (reply as { ok?: unknown }).ok === "boolean") {
      const r = reply as { ok: boolean; message?: unknown; data?: unknown };
      return { ok: r.ok, message: typeof r.message === "string" && r.message ? r.message : r.ok ? "done" : "failed, and the action said why not", ...(isObj(r.data) ? { data: r.data } : {}) };
    }
    return { ok: false, message: `plugin ${set.plugin} returned ${Array.isArray(reply) ? "an array" : `a ${typeof reply}`} where an action returns { ok, message } or a string` };
  } catch (e) { return { ok: false, message: message(e) }; }
}
