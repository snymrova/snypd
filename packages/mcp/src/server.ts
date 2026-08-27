/**
 * `snypd serve` — the MCP server on stdio (docs/03). `initialize` is answered by protocol.ts alone;
 * resources.ts is imported only when the first resources/* request arrives, so the cold-start
 * benchmark (spawn → initialize) measures the Bun floor plus this file.
 * Root = SNYPD_ROOT or cwd. Never write to stdout except protocol messages.
 */
import { dispatch, serveStdio, type Handlers, type Request } from "./protocol";

export function createServer(root = process.env.SNYPD_ROOT ?? process.cwd()) {
  let h: Handlers | undefined;
  const lazy: Handlers = {
    listResources: async () => (h ??= (await import("./resources")).handlers(root)).listResources(),
    readResource: async (uri) => (h ??= (await import("./resources")).handlers(root)).readResource(uri),
  };
  return { handle: (msg: Request) => dispatch(msg, lazy), listen: () => serveStdio(lazy) };
}

if (import.meta.main) createServer().listen();
