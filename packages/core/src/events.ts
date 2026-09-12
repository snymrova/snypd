/**
 * Events — fire and report (docs/10 §4.5, decision 87; P3).
 *
 * A static site has two acts with a consequence outside the machine: an item lands on the base branch
 * (`publish`) and the branch is sent to the host (`push`). Those are the two events, and there are no
 * others: `onCreate`, `onUpdate`, `onStatusChange` and `onDelete` (docs/02 §9) are places a plugin could
 * react to an agent's keystroke, nothing at launch needs them, and the surface stays as small as the
 * launch set does.
 *
 * Three rules, each a test in events.test.ts:
 *   1. **Fire and report.** A handler runs *after* the act succeeded and returns `{ ok, message }`. A
 *      handler that throws, times out or returns nonsense is a row with `ok: false` and the reason — a
 *      line in the tool result and a row in `.snypd/events.json` — and never a failed publish. The words
 *      are on `main` whether or not IndexNow answered. No retries in 0.x; a plugin that needs one exposes
 *      a tool to run again (P4's `indexnow › ping`).
 *   2. **The fetch is the allowlist.** A handler is handed `ctx.fetch`, which reaches the hosts its
 *      manifest declares under `capabilities.network` and refuses every other one before a connection is
 *      made. A plugin with no `network:` gets a fetch that refuses everything. It can still call the global
 *      `fetch` — Bun does not sandbox an import, and docs/10 §4.7 says so — but what it *declared* and what
 *      it *did* are both inspectable, which is the contribution snypd can honestly make.
 *   3. **Ordered by the `plugins:` array, and one at a time.** No priorities, no parallelism: a handler
 *      that pings a search engine after another handler regenerated a file wants that order to be the
 *      list's, and a publish is not a hot path.
 *
 * The rows live in `.snypd/events.json`, not in `activity.json` (amending the file decision 87 named):
 * `activity.json` is one process's liveness record, rewritten wholesale by a throttled writer inside the
 * MCP server, and a push event fires from two processes — the server's `site › push` and the Desk's
 * button under `snypd dev`. An append-only ring of the last hundred rows, written by whichever process
 * fired the event, is the shape a history has; a heartbeat is not.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LoadedConfig } from "./config";
import { ensureDisposableDir, INDEX_DIR } from "./paths";
import { pluginModule, type EventName, type LoadedPlugin } from "./plugins";
import type { PushCommit } from "./push";
import type { Config } from "./schema";

/** One handler's answer, as recorded: who, to what, whether it worked, and what it said. */
export interface EventRow { at: string; event: EventName; plugin: string; ok: boolean; message: string; ms: number }

/** What `publish` hands its handlers: the item that just landed, and where. */
export interface PublishPayload {
  type: string; slug: string; route: string;
  /** Absolute, trailing slash — what a search engine or a webhook wants. */
  url: string;
  /** Site-relative path of the file, as `git` names it. */
  path: string;
  /** The base branch it landed on and the landed commit; absent when the site is not a git repo. */
  base?: string; sha?: string;
}
/** One content file a push carried, mapped to the page it is: what a ping wants to name. */
export interface ChangedContent { path: string; type: string; slug: string; route: string; url: string; /** the file is gone from the branch, so the page is gone from the site */ deleted: boolean }
/** What `push` hands its handlers: the branch that went, the commits on it, and the pages they touched. */
export interface PushPayload {
  branch: string; remote?: string;
  /** Commits sent — `0` means the remote already had them and nothing new is live. */
  sent: number;
  commits: PushCommit[];
  /** The content files those commits touched, as pages; config, theme and media changes are not here. */
  changed: ChangedContent[];
  /** The `url` of every entry in `changed`, deduplicated and in order — the list a ping sends. */
  urls: string[];
}
export type EventPayload<N extends EventName> = N extends "publish" ? PublishPayload : PushPayload;

export interface EventCtx {
  event: EventName;
  plugin: string;
  /** The site's validated options for this plugin (`plugins: [{ name: {…} }]`). */
  options: Record<string, unknown>;
  site: Config["site"];
  config: Config;
  root: string;
  /** The allowlisted fetch (rule 2), with a wall clock: `capabilities.network` or nothing. */
  fetch: typeof fetch;
}
/** A handler's reply. A string is `{ ok: true, message }`; nothing at all is `ok` with no message. */
export type EventReply = { ok: boolean; message?: string } | string | void | undefined;
export type EventHandler<N extends EventName = EventName> = (payload: EventPayload<N>, ctx: EventCtx) => EventReply | Promise<EventReply>;

/** How long one handler may take, end to end. A publish waits this long at most per listening plugin. */
export const EVENT_TIMEOUT_MS = 10_000;
/** How long one `ctx.fetch` may take. Under the handler's clock, so a slow host is the fetch's error and not the handler's. */
export const FETCH_TIMEOUT_MS = 8_000;
/** Rows kept in `.snypd/events.json`. */
export const EVENT_LOG_ROWS = 100;

const eventsPath = (root: string) => join(root, INDEX_DIR, "events.json");

/** Exact host, or `*.example.com` for a host and everything under it. Never a port, never a scheme. */
export const hostAllowed = (host: string, network: string[]): boolean =>
  network.some((h) => { const want = h.toLowerCase(); const have = host.toLowerCase(); return want.startsWith("*.") ? have === want.slice(2) || have.endsWith(want.slice(1)) : have === want; });

/**
 * The fetch a plugin is handed (docs/10 §4.7): its manifest's `capabilities.network`, enforced before any
 * connection is made, and a wall clock. The refusal names the plugin, the origin and the remedy — which
 * is a line in the plugin's own `snypd.yaml`, because the site cannot widen a plugin's allowlist and a
 * plugin cannot widen it at runtime.
 */
export function pluginFetch(plugin: Pick<LoadedPlugin, "name" | "network">, timeoutMs = FETCH_TIMEOUT_MS): typeof fetch {
  const f = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!hostAllowed(url.hostname, plugin.network))
      throw new Error(`fetch to ${url.origin} refused — plugin ${plugin.name} declares capabilities.network ${plugin.network.length ? `[${plugin.network.join(", ")}]` : "nothing"}; a host it needs is added there, in the plugin's own snypd.yaml`);
    const clock = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, clock]) : clock;
    return fetch(input, { ...init, signal });
  };
  return f as typeof fetch;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0]!;
const normalise = (reply: unknown, plugin: string): { ok: boolean; message: string } => {
  if (reply === undefined || reply === null) return { ok: true, message: "done" };
  if (typeof reply === "string") return { ok: true, message: reply };
  if (typeof reply === "object" && typeof (reply as { ok?: unknown }).ok === "boolean") {
    const r = reply as { ok: boolean; message?: unknown };
    return { ok: r.ok, message: typeof r.message === "string" && r.message ? r.message : r.ok ? "done" : "failed, and the handler said why not" };
  }
  return { ok: false, message: `plugin ${plugin} returned ${Array.isArray(reply) ? "an array" : `a ${typeof reply}`} where an event handler returns { ok, message } or a string` };
};

/** The handler module through the loader every plugin tier shares (`plugins.ts` `pluginModule`, decision 83). */
const eventModule = (p: LoadedPlugin, rel: string): Promise<unknown> => pluginModule(p, rel);

export interface FireOptions { timeoutMs?: number; /** for a test that wants the rows and not the file */ record?: boolean }

/**
 * Fire one event at every loaded plugin that listens, in `plugins:` order, and record what each said.
 * Never throws and never rejects: the caller has already done the thing the event is about, and this
 * function's job is to report, not to decide.
 */
export async function fireEvent<N extends EventName>(root: string, cfg: LoadedConfig, event: N, payload: EventPayload<N>, opts: FireOptions = {}): Promise<EventRow[]> {
  const listeners = cfg.plugins.filter((p) => p.loaded && p.dir && p.events[event]);
  if (!listeners.length) return [];
  const timeoutMs = opts.timeoutMs ?? EVENT_TIMEOUT_MS;
  const rows: EventRow[] = [];
  for (const p of listeners) {
    const t0 = performance.now();
    let r: { ok: boolean; message: string };
    try {
      const fn = await eventModule(p, p.events[event]!);
      if (typeof fn !== "function") throw new Error(`${p.events[event]} (events.${event}) does not export a default function`);
      const ctx: EventCtx = { event, plugin: p.name, options: p.options, site: cfg.config.site, config: cfg.config, root, fetch: pluginFetch(p) };
      let clock: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => { clock = setTimeout(() => reject(new Error(`handler took longer than ${timeoutMs} ms and was abandoned`)), timeoutMs); });
      try { r = normalise(await Promise.race([Promise.resolve((fn as EventHandler<N>)(payload, ctx)), late]), p.name); }
      finally { clearTimeout(clock); }
    } catch (e) { r = { ok: false, message: message(e) }; }
    rows.push({ at: new Date().toISOString(), event, plugin: p.name, ok: r.ok, message: r.message, ms: Math.round(performance.now() - t0) });
  }
  if (opts.record !== false) recordEvents(root, rows);
  return rows;
}

/** The lines a tool result and the Desk print, one per handler: what ran, on what, and what it said. */
export const eventLines = (rows: EventRow[]): string[] => rows.map((r) => (r.ok ? `✓ ${r.plugin} on ${r.event}: ${r.message}` : `⚠ ${r.plugin} on ${r.event} failed: ${r.message}`));

/** Append to the ring in `.snypd/events.json`. Best effort: a log that threw would fail the publish it exists to describe. */
export function recordEvents(root: string, rows: EventRow[]): void {
  if (!rows.length) return;
  const file = eventsPath(root);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    ensureDisposableDir(join(root, INDEX_DIR));
    const all = [...readEvents(root), ...rows].slice(-EVENT_LOG_ROWS);
    writeFileSync(tmp, `${JSON.stringify({ rows: all }, null, 2)}\n`);
    renameSync(tmp, file);
  } catch { try { rmSync(tmp, { force: true }); } catch { /* nothing here is worth an exception */ } }
}

/** Every recorded row, oldest first; `[]` when there is no file or it is not ours to read. */
export function readEvents(root: string): EventRow[] {
  const file = eventsPath(root);
  if (!existsSync(file)) return [];
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as { rows?: unknown };
    return Array.isArray(j.rows) ? j.rows.filter((r): r is EventRow => typeof r === "object" && r !== null && typeof (r as EventRow).plugin === "string" && typeof (r as EventRow).event === "string") : [];
  } catch { return []; }
}

/** `https://site` + `/posts/a` → `https://site/posts/a/`; the form the sitemap and the feed use (emit.ts `absolute`). */
export const urlOf = (siteUrl: string, route: string) => `${siteUrl.replace(/\/+$/, "")}${route === "/" ? "/" : `${route}/`}`;

/**
 * The pages a set of changed files are. A path under a type's `dir` is that type's item, and its route is
 * the type's `urlPattern` over the slug (or the nested path) — the same rule `listContent` applies to the
 * files on disk, applied here to a list git produced, so a deleted file still maps to the page it was.
 * Paths that are not content (config, theme, media, `.snypd/`) are left out: a ping names pages.
 */
export function changedContent(root: string, cfg: LoadedConfig, paths: string[]): ChangedContent[] {
  const out: ChangedContent[] = [];
  const types = Object.entries(cfg.config.types).sort((a, b) => b[1].dir.length - a[1].dir.length);   // the deepest dir wins a nested layout
  for (const raw of paths) {
    const path = raw.split("\\").join("/").replace(/^\.\//, "");
    if (!path.endsWith(".md")) continue;
    const hit = types.find(([, def]) => path.startsWith(`${def.dir.replace(/\/+$/, "")}/`));
    if (!hit) continue;
    const [type, def] = hit;
    const relPath = path.slice(def.dir.replace(/\/+$/, "").length + 1, -3);
    if (relPath.split("/").some((seg) => seg.startsWith(".") || seg === "")) continue;
    const slug = relPath.slice(relPath.lastIndexOf("/") + 1);
    const route = def.urlPattern.replace("{slug}", slug).replace("{path}", relPath).replace(/\/+$/, "") || "/";
    out.push({ path, type, slug, route, url: urlOf(cfg.config.site.url, route), deleted: !existsSync(join(root, path)) });
  }
  return out;
}
