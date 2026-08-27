import { describe, expect, test } from "bun:test";
import { createServer } from "./server";
import { PROTOCOL_VERSIONS } from "./protocol";

/** Drive the real stdio process end to end, the way a harness would. */
async function session(msgs: (object | string)[], root = "corpora/100") {
  const proc = Bun.spawn([process.execPath, "packages/mcp/src/server.ts"], { stdin: "pipe", stdout: "pipe", stderr: "ignore", env: { ...process.env, SNYPD_ROOT: root } });
  for (const m of msgs) proc.stdin.write((typeof m === "string" ? m : JSON.stringify(m)) + "\n");
  proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  return out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const req = (id: number, method: string, params?: object) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

describe("stdio", () => {
  test("initialize → resources/list → resources/read: config, spec/*, types/*", async () => {
    const [init, list, cfg, prim, types, post, tax, missing, unknown] = await session([
      req(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } }),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      req(2, "resources/list"),
      req(3, "resources/read", { uri: "snypd://config" }),
      req(4, "resources/read", { uri: "snypd://spec/primitives/chart" }),
      req(5, "resources/read", { uri: "snypd://types" }),
      req(6, "resources/read", { uri: "snypd://types/post" }),
      req(7, "resources/read", { uri: "snypd://taxonomies/tag" }),
      req(8, "resources/read", { uri: "snypd://spec/primitives/grid" }),
      req(9, "nope/nothing"),
    ]);
    expect(init.result.protocolVersion).toBe("2025-06-18");                 // negotiated down to what the client asked
    expect(init.result.serverInfo.name).toBe("snypd");
    const uris = list.result.resources.map((r: any) => r.uri);
    expect(uris[0]).toBe("snypd://config");
    expect(uris.filter((u: string) => u.startsWith("snypd://spec/primitives/")).length).toBe(13);
    expect(uris).toEqual(expect.arrayContaining(["snypd://types", "snypd://types/post", "snypd://taxonomies/category"]));
    expect(cfg.result.contents[0].mimeType).toBe("application/yaml");
    expect(cfg.result.contents[0].text).toContain("name: corpus-100 # ← snypd.yaml:3");
    expect(cfg.result.contents[0].text).toContain("types: <@snypd/spec default");
    expect(prim.result.contents[0].text).toContain("name: chart");
    expect(Object.keys(JSON.parse(types.result.contents[0].text))).toEqual(["post", "page", "author"]);
    const p = JSON.parse(post.result.contents[0].text);
    expect(p.required).toEqual(["title", "date"]);
    expect(p["x-type"].urlPattern).toBe("/posts/{slug}");
    expect(JSON.parse(tax.result.contents[0].text).properties.title.type).toBe("string");
    expect(missing.error.code).toBe(-32002);
    expect(unknown.error.code).toBe(-32601);
  });
  test("unknown protocol version → ours; parse error; notifications are silent", async () => {
    const out = await session([req(1, "initialize", { protocolVersion: "1999-01-01" }), "{not json", { jsonrpc: "2.0", method: "notifications/cancelled" }, req(2, "ping"), req(3, "tools/list"), req(4, "prompts/list")]);
    expect(out.map((m) => m.id)).toEqual([1, null, 2, 3, 4]);
    expect(out[0].result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
    expect(out[1].error.code).toBe(-32700);
    expect(out[3].result.tools).toEqual([]);
  });
});

describe("in-process", () => {
  test("initialize path imports nothing heavy", async () => {
    const s = createServer("corpora/100");
    const r = await s.handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect((r as any).result.capabilities).toEqual({ resources: {}, tools: {}, prompts: {} });
    const missing = await s.handle({ jsonrpc: "2.0", id: 2, method: "resources/read", params: {} });
    expect((missing as any).error.code).toBe(-32602);
    expect(await s.handle({ jsonrpc: "2.0", method: "resources/read", params: {} })).toBeUndefined(); // notification → no reply even on error
  });
});
