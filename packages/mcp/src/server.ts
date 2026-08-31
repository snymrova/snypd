/**
 * `snypd serve` — the MCP server on stdio (docs/03). `initialize` is answered by protocol.ts alone;
 * resources.ts and tools.ts are imported only when the first resources/* or tools/* request arrives,
 * so the cold-start benchmark (spawn → initialize) measures the Bun floor plus this file.
 * Root = SNYPD_ROOT or cwd. Never write to stdout except protocol messages.
 */
import { dispatch, persistActivity, serveStdio, type Activity, type Handlers, type Notify, type Request } from "./protocol";

export function createServer(root = process.env.SNYPD_ROOT ?? process.cwd()) {
  let h: Handlers | undefined, t: Pick<Handlers, "listTools" | "callTool"> | undefined, p: Pick<Handlers, "listPrompts" | "getPrompt"> | undefined;
  // Held rather than passed at construction: the transport is up after the handlers exist, and a tool
  // that fires `tools/list_changed` (S16 `find_tools`) must reach whatever channel is live by then.
  let notify: Notify | undefined;
  const res = async () => (h ??= (await import("./resources")).handlers(root));
  const tools = async () => (t ??= (await import("./tools")).handlers(root, (m, params) => notify?.(m, params)));   // S11: writes load only when one is called
  const prompts = async () => (p ??= (await import("./prompts")).handlers(root));   // S16: editorial workflows
  const lazy: Handlers = {
    connect: (fn) => { notify = fn; },
    listResources: async () => (await res()).listResources(),
    readResource: async (uri) => (await res()).readResource(uri),
    listTemplates: async () => (await res()).listTemplates!(),
    listTools: async () => (await tools()).listTools!(),
    callTool: async (name, args) => (await tools()).callTool!(name, args),
    listPrompts: async () => (await prompts()).listPrompts!(),
    getPrompt: async (name, args) => (await prompts()).getPrompt!(name, args),
  };
  /** Only tools hold resources, and only if one was actually called — never import tools.ts to close it. */
  const close = async () => { if (t) await (await import("./tools")).dispose(); };
  return {
    handle: (msg: Request) => dispatch(msg, lazy),
    close,
    listen: async () => {
      // From here rather than from `protocol.ts` because this is the file that knows the root — and
      // *lazily*, like everything else in this file. `@snypd/core/heartbeat` is a leaf (`node:fs`,
      // `node:path`, one string), so a static import is cheap; it is deferred anyway because "cheap" was
      // measured at 2.5 ms on a busy box and `initialize` is gated at 50 ms. What actually cost the
      // artefact 5–10 ms was doing this work *at all* before the reply had flushed, which is why
      // `FIRST_WRITE_MS` exists and why nothing here runs for a quarter of a second.
      persistActivity((a) => void writeRecord(root, a));
      try { await serveStdio(lazy) } finally { await clearRecord(root); await close(); }
    },
  };
}

if (import.meta.main) void createServer().listen();

/**
 * The heartbeat writer (S18f, `07` decision 70), imported on first use and never before.
 *
 * `written` is a sequence guard rather than a nicety: the initial write is scheduled at `listen()` and
 * the first call writes immediately, so two snapshots can be in flight at once across an `await import`.
 * Landing them out of order would leave `calls: 0` on disk while a harness was talking to us — the Desk
 * grey for a second on the one transition a person is watching for.
 */
let heartbeat: Promise<typeof import("@snypd/core/heartbeat")> | undefined;
let written = -1;
async function writeRecord(root: string, a: Activity): Promise<void> {
  if (a.calls <= written) return;
  written = a.calls;
  const m = await (heartbeat ??= import("@snypd/core/heartbeat"));
  m.writeHeartbeat(root, { startedAt: a.startedAt ?? Date.now(), calls: a.calls, lastMethod: a.lastMethod, lastAt: a.lastAt, since: a.since, client: a.client });
}

/**
 * Removed on the way out for the reason `clearDev` is: a record that outlives its process tells a person
 * their harness is connected to a server that is gone. Nothing to clear if nothing was ever written.
 */
async function clearRecord(root: string): Promise<void> {
  if (!heartbeat) return;
  (await heartbeat).clearHeartbeat(root);
}
