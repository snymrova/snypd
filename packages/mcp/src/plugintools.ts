/**
 * The plugin half of the tool surface — tier 4 (P4, docs/10 §4.2).
 *
 * A plugin that declares `tools:` contributes **one** catalogue tool named after itself, whose `action`
 * enum is the verbs its module declares. That is the same shape `theme`, `site` and `bench` have, so an
 * agent that has learned one has learned all of them, and it is the shape `indexnow › ping` was written
 * in: a namespace and a verb, not a tool per verb.
 *
 * **Nothing here is ever in the always-listed set.** `listTools()` returns `CORE_TOOLS` until `find_tools`
 * unlocks something, and a plugin tool can only arrive through `find_tools` — which is why enabling every
 * first-party plugin leaves `tokens.tools` byte-identical (D11). The cost of a plugin tool is a config
 * read on the first `find_tools` of a session, paid by a site that has one and by no other.
 *
 * The ranking is the catalogue's own (`rank`), over the union: a plugin's tool competes with `site` and
 * `theme` on the same terms rather than being appended after them.
 */
import { rank, KEYWORDS as STATIC_KEYWORDS, CATALOG } from "./catalog";
import type { Tool, ToolResult } from "./protocol";

type Core = typeof import("@snypd/core");
type PluginToolSet = Awaited<ReturnType<Core["loadPluginTools"]>>["sets"][number];

/** A plugin's tool, as the catalogue and `find_tools` see it, with the set that answers a call to it. */
export interface PluginTool { tool: Tool; keywords: string[]; set: PluginToolSet }

/**
 * The tool definition for one plugin's action set. The description ends with the action list because an
 * agent reading it in `find_tools` output sees the verbs before it reads the schema — and because a tool
 * whose actions are only in an enum reads as one thing that does something vague.
 */
function toolOf(set: PluginToolSet): Tool {
  const properties: Record<string, unknown> = {
    action: {
      type: "string",
      description: set.actions.map((a) => `\`${a.name}\` ${a.description}`).join(" · "),
      enum: set.actions.map((a) => a.name),
    },
  };
  // One flat property bag, as `site`'s is: an action's own inputs are merged, and each says which action
  // reads it. A name two actions both use is one property — they are the same argument by then.
  for (const a of set.actions) for (const [k, v] of Object.entries(a.input ?? {})) if (!(k in properties)) properties[k] = v;
  return {
    name: set.name,
    description: `${set.description} Added by the \`${set.plugin}\` plugin, which this site enables in \`plugins:\` — snypd://plugins says what else it declares.`,
    inputSchema: { type: "object", properties, required: ["action"] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  };
}

/**
 * Every loaded plugin's tools for one site root, in `plugins:` order, plus the diagnostics a broken module
 * produced. Reads the config, so it is called only from `find_tools` and from a call that reached the
 * plugin branch — never on the `initialize` path `mcp.coldStart` measures.
 */
export async function pluginTools(root: string): Promise<{ tools: PluginTool[]; diagnostics: { message: string }[] }> {
  const c = await import("@snypd/core");
  const cfg = c.loadConfig(root);
  // A config that does not load is not this function's problem to report: every other tool says so
  // already, and `find_tools` refusing to find anything because snypd.yaml has a typo would hide the typo.
  if (!cfg.plugins.some((p) => p.loaded && p.tools)) return { tools: [], diagnostics: [] };
  const { sets, diagnostics } = await c.loadPluginTools(root, cfg);
  return { tools: sets.map((set) => ({ tool: toolOf(set), keywords: [set.plugin, ...set.keywords, ...set.actions.map((a) => a.name)], set })), diagnostics };
}

/** Rank the static catalogue and the plugin tools together against one query (the union `find_tools` searches). */
export function searchAll(plugins: PluginTool[], query: string): Tool[] {
  if (!plugins.length) return rank(CATALOG, (t) => STATIC_KEYWORDS[t.name] ?? [], query);
  const byName = new Map(plugins.map((p) => [p.tool.name, p.keywords]));
  // A plugin whose name collides with a built-in loses the name — the built-in is the one an agent's
  // muscle memory reaches for, and a plugin cannot be allowed to shadow `site`. It keeps every other tier.
  const list = [...CATALOG, ...plugins.filter((p) => !CATALOG.some((t) => t.name === p.tool.name)).map((p) => p.tool)];
  return rank(list, (t) => STATIC_KEYWORDS[t.name] ?? byName.get(t.name) ?? [], query);
}

/**
 * Call one plugin tool. A wrong `action` is snypd refusing, and the refusal says what the verbs are; a
 * failure *inside* an action is the plugin answering, and that one carries the line saying so — because
 * "the plugin said no" and "there is no such verb" are two different things for whoever reads the result.
 */
export async function callPlugin(p: PluginTool, args: Record<string, unknown>): Promise<ToolResult> {
  const c = await import("@snypd/core");
  const verbs = p.set.actions.map((a) => a.name);
  const action = typeof args.action === "string" ? args.action : "";
  const refuse = (message: string): ToolResult =>
    ({ content: [{ type: "text", text: message }], structuredContent: { ok: false, error: message, plugin: p.set.plugin, actions: verbs }, isError: true });
  if (!action) return refuse(`action required — ${p.tool.name} has: ${verbs.join(", ")}`);
  if (!verbs.includes(action)) return refuse(`unknown action "${action}" for ${p.tool.name} — it has: ${verbs.join(", ")}`);
  const r = await c.callPluginTool(p.set, action, args);
  const head = `${p.set.plugin} › ${action}: ${r.message}`;
  return {
    content: [{ type: "text", text: r.ok ? head : `${head}\n↳ the plugin's own answer; every other tier of it still ran` }],
    structuredContent: { ok: r.ok, plugin: p.set.plugin, action, message: r.message, ...(r.data ? { data: r.data } : {}) },
    ...(r.ok ? {} : { isError: true }),
  };
}
