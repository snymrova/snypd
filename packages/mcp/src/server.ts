/**
 * STUB MCP server (stdio), S1–S3. `initialize` answers with nothing loaded so the cold-start
 * benchmark measures the floor; `resources/list` + `resources/read` lazily import @snypd/spec
 * on first use and serve `snypd://spec/**`. The real server on @modelcontextprotocol/sdk lands in S4.
 */
type Req = { jsonrpc: "2.0"; id?: number | string; method: string; params?: any };
const reply = (id: Req["id"], result: unknown) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id: Req["id"], code: number, message: string) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");

let spec: typeof import("@snypd/spec") | undefined;
const loadSpec = async () => (spec ??= await import("@snypd/spec"));

export async function handle(msg: Req) {
  switch (msg.method) {
    case "initialize":
      return reply(msg.id, { protocolVersion: "2025-11-25", capabilities: { resources: {}, tools: {}, prompts: {} }, serverInfo: { name: "snypd", version: "0.1.0-s3" } });
    case "ping": return reply(msg.id, {});
    case "resources/list": {
      const s = await loadSpec();
      return reply(msg.id, { resources: s.resources().map(({ uri, name, mimeType, description }) => ({ uri, name, mimeType, description })) });
    }
    case "resources/read": {
      const s = await loadSpec();
      const r = s.resource(String(msg.params?.uri ?? ""));
      if (!r) return fail(msg.id, -32002, `Resource not found: ${msg.params?.uri}`);
      return reply(msg.id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.text() }] });
    }
    default:
      if (msg.id !== undefined) return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

if (import.meta.main) {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of Bun.stdin.stream()) {
    buf += dec.decode(chunk);
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try { await handle(JSON.parse(line)); } catch (e) { fail(null as any, -32700, `Parse error: ${(e as Error).message}`); }
    }
  }
}
