/**
 * S1 STUB MCP server (stdio). Answers `initialize` with no dependencies loaded so the
 * cold-start benchmark measures the floor. Real server with @modelcontextprotocol/sdk lands in S4.
 */
const dec = new TextDecoder();
let buf = "";
for await (const chunk of Bun.stdin.stream()) {
  buf += dec.decode(chunk);
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {
        protocolVersion: "2025-11-25", capabilities: { resources: {}, tools: {}, prompts: {} },
        serverInfo: { name: "snypd", version: "0.1.0-s1" } } }) + "\n");
    }
  }
}
export {};
