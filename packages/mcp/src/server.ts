/**
 * `snypd serve` — the MCP server on stdio (docs/03). `initialize` is answered by protocol.ts alone;
 * resources.ts and tools.ts are imported only when the first resources/* or tools/* request arrives,
 * so the cold-start benchmark (spawn → initialize) measures the Bun floor plus this file.
 * Root = SNYPD_ROOT or cwd. Never write to stdout except protocol messages.
 */
import { dispatch, serveStdio, type Handlers, type Notify, type Request } from "./protocol";

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
    listen: async () => { await serveStdio(lazy); await close(); },
  };
}

if (import.meta.main) void createServer().listen();
