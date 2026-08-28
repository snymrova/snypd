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
/** prompts/get result (2025-11-25). A prompt is a scripted opening turn, not a tool: text the agent continues from. */
export interface PromptMessage { role: "user" | "assistant"; content: { type: "text"; text: string } }
export interface GetPromptResult { description?: string; messages: PromptMessage[] }
/** Server → client notification. Used for `notifications/tools/list_changed` when `find_tools` unlocks one. */
export type Notify = (method: string, params?: Record<string, unknown>) => void;
/** tools/call result (2025-11-25). `structuredContent` mirrors the text for callers that parse. */
export interface ToolResult { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }
export interface InitializeResult { protocolVersion: string; capabilities: Record<string, unknown>; serverInfo: { name: string; version: string }; instructions?: string }

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const SERVER = { name: "snypd", version: "0.1.0-s16" };

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
  callTool?(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  listPrompts?(): Promise<Prompt[]>;
  getPrompt?(name: string, args: Record<string, unknown>): Promise<GetPromptResult>;
  /** Called once when the transport is up, with the channel notifications go out on. Never during `initialize`. */
  connect?(notify: Notify): void;
}

export function initializeResult(params: Record<string, unknown> | undefined): InitializeResult {
  const asked = String(params?.protocolVersion ?? "");
  const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0];
  return { protocolVersion, capabilities: { resources: {}, tools: { listChanged: true }, prompts: {} }, serverInfo: SERVER, instructions: "Read snypd://config, then snypd://spec (and snypd://spec/primitives) before writing content. Writes go to a draft branch; publishing a draft-policy type needs a human to approve it on `snypd serve --preview`." };
}

/**
 * What the Desk means by "a harness is connected" (S18b, decisions 44–45).
 *
 * The transport is the only code that sees every message, and it is already on the cold-start path, so
 * recording here costs one object mutation and adds no module. That is the point rather than a
 * convenience: decision 45 says the Desk may never touch `initialize`, and the cheapest way to obey it
 * is to give it nothing new to touch — `server.ts` imports exactly what it imported before.
 *
 * Deliberately not a session store and not an identity. The Desk asks three questions — has anything
 * ever spoken to this server, what did it last ask for, how long ago — and three fields answer all
 * three. It is process-local and dies with the server, which is correct: "connected" is a claim about
 * now, and a `connected` flag that outlived its process would be the one thing worse than no flag.
 */
export interface Activity { calls: number; lastMethod?: string; lastAt?: number; since?: number; client?: string }
const activity: Activity = { calls: 0 };
/** A copy: a page rendering this cannot observe a field change halfway down. */
export const activitySnapshot = (): Activity => ({ ...activity });

/** One message in → zero or one response out. Notifications (no id) never produce output. */
export async function dispatch(msg: Request, h: Handlers): Promise<Response | undefined> {
  const isNotification = msg.id === undefined;
  const ok = (result: unknown): Response | undefined => (isNotification ? undefined : { jsonrpc: "2.0", id: msg.id!, result });
  try {
    if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") throw new RpcError(E.INVALID_REQUEST, "Invalid Request");
    // Counted before the switch, so a method we go on to reject still counts as contact: the Desk
    // reports that a harness is talking to us, not that it is talking to us successfully, and a client
    // sending something this server refuses is very much connected.
    activity.calls++; activity.lastMethod = msg.method; activity.lastAt = Date.now(); activity.since ??= activity.lastAt;
    switch (msg.method) {
      case "initialize": {
        // The client names itself once, here, and the Desk shows it so a person can tell *which*
        // harness reached them — two editors pointed at one repo is the ordinary case, not the odd one.
        const info = msg.params?.clientInfo as { name?: string } | undefined;
        if (typeof info?.name === "string") activity.client = info.name;
        return ok(initializeResult(msg.params));
      }
      case "ping": return ok({});
      case "resources/list": return ok({ resources: await h.listResources() });
      case "resources/templates/list": return ok({ resourceTemplates: (await h.listTemplates?.()) ?? [] });
      case "resources/read": {
        const uri = msg.params?.uri;
        if (typeof uri !== "string") throw new RpcError(E.INVALID_PARAMS, "params.uri required");
        return ok({ contents: await h.readResource(uri) });
      }
      case "tools/list": return ok({ tools: (await h.listTools?.()) ?? [] });
      case "tools/call": {
        const name = msg.params?.name;
        if (typeof name !== "string") throw new RpcError(E.INVALID_PARAMS, "params.name required");
        if (!h.callTool) throw new RpcError(E.METHOD_NOT_FOUND, "This server exposes no tools");
        const args = msg.params?.arguments;
        if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) throw new RpcError(E.INVALID_PARAMS, "params.arguments must be an object");
        return ok(await h.callTool(name, (args as Record<string, unknown>) ?? {}));
      }
      case "prompts/list": return ok({ prompts: (await h.listPrompts?.()) ?? [] });
      case "prompts/get": {
        const name = msg.params?.name;
        if (typeof name !== "string") throw new RpcError(E.INVALID_PARAMS, "params.name required");
        if (!h.getPrompt) throw new RpcError(E.METHOD_NOT_FOUND, "This server exposes no prompts");
        const args = msg.params?.arguments;
        return ok(await h.getPrompt(name, (args as Record<string, unknown>) ?? {}));
      }
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
  // One message is *handled* at a time, not merely answered in order: two writes arriving together
  // would otherwise both start, and the second could finish first (S11 — a create raced its own
  // duplicate check). `dispatch` is called by the chain, never before it.
  let queue: Promise<unknown> = Promise.resolve();
  const send = (r: Response | undefined) => { if (r) output.write(JSON.stringify(r) + "\n"); };
  // Notifications are written straight out rather than queued: they answer no request, and a
  // `tools/list_changed` that waited behind the call which caused it would arrive after the agent had
  // already decided what to do next.
  h.connect?.((method, params) => output.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }) + "\n"));
  const enqueue = (run: () => Promise<Response | undefined>) => { queue = queue.then(run).then(send, (e) => send({ jsonrpc: "2.0", id: null, error: { code: E.INTERNAL, message: String(e) } })); };
  const feed = (chunk: string) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: Request;
      try { msg = JSON.parse(line); } catch (e) { const err = e as Error; enqueue(async () => ({ jsonrpc: "2.0", id: null, error: { code: E.PARSE, message: `Parse error: ${err.message}` } })); continue; }
      const m = msg;
      enqueue(() => dispatch(m, h));
    }
  };
  // Resolves when the input closes *and* the queue has drained: a caller that releases resources on
  // close (S15 — the preview server) must not race the last reply out of the pipe.
  const drained = async () => { await queue; };
  if (!input && typeof Bun !== "undefined") {
    const dec = new TextDecoder();
    return (async () => { for await (const chunk of Bun.stdin.stream()) feed(dec.decode(chunk, { stream: true })); await drained(); })();
  }
  const src = (input ?? process.stdin) as NodeJS.ReadableStream & { setEncoding?(e: string): unknown };
  src.setEncoding?.("utf8");
  src.on("data", (chunk: string | Buffer) => feed(String(chunk)));
  return new Promise<void>((resolve) => { src.on("end", () => void drained().then(resolve)); });
}
