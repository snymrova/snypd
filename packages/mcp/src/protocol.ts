/**
 * The MCP wire layer (docs/03): JSON-RPC 2.0, newline-delimited, over stdio. Deliberately not
 * `@modelcontextprotocol/sdk` at runtime — importing it costs ~140 ms before `initialize` can be
 * answered (measured S4), 3× the 50 ms cold-start budget; its types are used at compile time only
 * so the shapes stay the official ones. Zero runtime imports: this file must load in ~0 ms.
 */
// Shapes mirror @modelcontextprotocol/sdk/types.js (2025-11-25). Not `import type`d from the SDK:
// Bun still resolves the package at startup and that alone costs ~20 ms (measured S4).
export interface Resource { uri: string; name: string; mimeType?: string; description?: string; title?: string }
export interface ResourceContents { uri: string; mimeType?: string; text: string }
export interface ResourceTemplate { uriTemplate: string; name: string; mimeType?: string; description?: string }
export interface Tool { name: string; description?: string; inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] }; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean } }
export interface Prompt { name: string; description?: string; arguments?: { name: string; description?: string; required?: boolean }[] }
export interface InitializeResult { protocolVersion: string; capabilities: Record<string, unknown>; serverInfo: { name: string; version: string }; instructions?: string }

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const SERVER = { name: "snypd", version: "0.1.0-s4" };

export type Id = number | string | null;
export interface Request { jsonrpc: "2.0"; id?: Id; method: string; params?: Record<string, unknown> }
export type Response = { jsonrpc: "2.0"; id: Id; result: unknown } | { jsonrpc: "2.0"; id: Id; error: { code: number; message: string; data?: unknown } };

export class RpcError extends Error { constructor(public code: number, message: string, public data?: unknown) { super(message); } }
export const E = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL: -32603, RESOURCE_NOT_FOUND: -32002 } as const;

/** What the server exposes. Everything is a lazy function so `initialize` never touches spec/core. */
export interface Handlers {
  listResources(): Promise<Resource[]>;
  readResource(uri: string): Promise<ResourceContents[]>;
  listTemplates?(): Promise<ResourceTemplate[]>;
  listTools?(): Promise<Tool[]>;
  listPrompts?(): Promise<Prompt[]>;
}

export function initializeResult(params: Record<string, unknown> | undefined): InitializeResult {
  const asked = String(params?.protocolVersion ?? "");
  const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0];
  return { protocolVersion, capabilities: { resources: {}, tools: {}, prompts: {} }, serverInfo: SERVER, instructions: "Read snypd://config, then snypd://spec (and snypd://spec/primitives) before writing content." };
}

/** One message in → zero or one response out. Notifications (no id) never produce output. */
export async function dispatch(msg: Request, h: Handlers): Promise<Response | undefined> {
  const isNotification = msg.id === undefined;
  const ok = (result: unknown): Response | undefined => (isNotification ? undefined : { jsonrpc: "2.0", id: msg.id!, result });
  try {
    if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") throw new RpcError(E.INVALID_REQUEST, "Invalid Request");
    switch (msg.method) {
      case "initialize": return ok(initializeResult(msg.params));
      case "ping": return ok({});
      case "resources/list": return ok({ resources: await h.listResources() });
      case "resources/templates/list": return ok({ resourceTemplates: (await h.listTemplates?.()) ?? [] });
      case "resources/read": {
        const uri = msg.params?.uri;
        if (typeof uri !== "string") throw new RpcError(E.INVALID_PARAMS, "params.uri required");
        return ok({ contents: await h.readResource(uri) });
      }
      case "tools/list": return ok({ tools: (await h.listTools?.()) ?? [] });
      case "prompts/list": return ok({ prompts: (await h.listPrompts?.()) ?? [] });
      default:
        if (msg.method.startsWith("notifications/")) return undefined;
        throw new RpcError(E.METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    if (isNotification) return undefined;
    const err = e instanceof RpcError ? e : new RpcError(E.INTERNAL, (e as Error).message);
    return { jsonrpc: "2.0", id: msg.id ?? null, error: { code: err.code, message: err.message, ...(err.data !== undefined ? { data: err.data } : {}) } };
  }
}

/**
 * Run the newline-delimited loop. `Bun.stdin.stream()` when available — `process.stdin` costs
 * ~15 ms extra before the first message on Bun 1.4 (measured S4) — with the Node stream as fallback.
 */
export function serveStdio(h: Handlers, input?: NodeJS.ReadableStream, output: NodeJS.WritableStream = process.stdout) {
  let buf = "";
  let queue: Promise<unknown> = Promise.resolve();   // responses go out in request order
  const send = (r: Response | undefined) => { if (r) output.write(JSON.stringify(r) + "\n"); };
  const enqueue = (p: Promise<Response | undefined>) => { queue = queue.then(() => p).then(send, (e) => send({ jsonrpc: "2.0", id: null, error: { code: E.INTERNAL, message: String(e) } })); };
  const feed = (chunk: string) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: Request;
      try { msg = JSON.parse(line); } catch (e) { enqueue(Promise.resolve({ jsonrpc: "2.0", id: null, error: { code: E.PARSE, message: `Parse error: ${(e as Error).message}` } })); continue; }
      enqueue(dispatch(msg, h));
    }
  };
  if (!input && typeof Bun !== "undefined") {
    const dec = new TextDecoder();
    return (async () => { for await (const chunk of Bun.stdin.stream()) feed(dec.decode(chunk, { stream: true })); })();
  }
  const src = (input ?? process.stdin) as NodeJS.ReadableStream & { setEncoding?(e: string): unknown };
  src.setEncoding?.("utf8");
  src.on("data", (chunk: string | Buffer) => feed(String(chunk)));
  return new Promise<void>((resolve) => { src.on("end", () => resolve()); });
}
