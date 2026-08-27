import { expect, test } from "bun:test";

/** Drive the stdio stub end to end, the way a harness would. */
async function session(msgs: object[]) {
  const proc = Bun.spawn(["bun", "run", "packages/mcp/src/server.ts"], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  for (const m of msgs) proc.stdin.write(JSON.stringify(m) + "\n");
  proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  return out.trim().split("\n").map((l) => JSON.parse(l));
}

test("initialize → resources/list → resources/read serves snypd://spec/primitives/*", async () => {
  const [init, list, read, missing, unknown] = await session([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "resources/list" },
    { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "snypd://spec/primitives/chart" } },
    { jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "snypd://spec/primitives/grid" } },
    { jsonrpc: "2.0", id: 5, method: "tools/list" },
  ]);
  expect(init.result.protocolVersion).toBe("2025-11-25");
  const uris = list.result.resources.map((r: any) => r.uri);
  expect(uris).toContain("snypd://spec");
  expect(uris.filter((u: string) => u.startsWith("snypd://spec/primitives/")).length).toBe(13);
  expect(read.result.contents[0].mimeType).toBe("application/yaml");
  expect(read.result.contents[0].text).toContain("name: chart");
  expect(missing.error.code).toBe(-32002);
  expect(unknown.error.code).toBe(-32601);
});
