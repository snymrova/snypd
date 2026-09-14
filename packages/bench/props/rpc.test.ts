/**
 * The JSON-RPC surface under fuzz (H4, docs/11 finding 4, the third input). An agent's harness is a
 * process writing lines at ours, and the lines are whatever a model produced — a method it invented, an
 * `id` that is an object, `arguments` that are a string, a tool call whose every field is the wrong
 * kind. Two properties:
 *
 *  6a. In process, over `dispatch`: every message gets exactly the reply the protocol says — none for a
 *      notification, one for a request, with the request's own id, one of `result`/`error`, an error
 *      code from the protocol's set — and a tool call is answered with a *tool* result, never an RPC
 *      error, because a tool that threw is a diagnostic the agent needed and did not get. After any
 *      sequence the server still answers `ping`, still lists the same tools, and the site's own config
 *      still loads: no call an agent can make leaves a site that cannot build.
 *  6b. On the wire, over `serveStdio`: a session of lines, some of them not JSON, and every line out is
 *      valid JSON-RPC; every request id is answered once; every line that was not JSON is answered
 *      with a parse error and the session goes on.
 *
 * `bench` and `content.render_preview` are not in the alphabet: the first runs the benchmark suite and
 * the second starts a server, and both are things the tests beside them already exercise for what they
 * are. `site` › `init`, `set_deploy`, `build` and `push` are left out for the same reason.
 */
import { afterAll, describe, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { git, initRepo, loadConfig } from "@snypd/core";
import { createServer } from "@snypd/mcp/server";
import { E, type Request, type Response } from "@snypd/mcp/protocol";
import { announce, fc, params, sentence, source, word, words } from "./arbitrary";
import { LINES, MESSAGES } from "./corpus";

setDefaultTimeout(600_000);
announce();

const ROOT = resolve("corpora/_test/props/rpc");
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

/** A site with two posts and a page, committed, so the write tools have a branch to write on. */
function fresh(): void {
  rmSync(ROOT, { recursive: true, force: true });
  for (const d of ["content/posts", "content/pages"]) mkdirSync(join(ROOT, d), { recursive: true });
  writeFileSync(join(ROOT, "snypd.yaml"), "snypd: 1\nsite: { name: R, url: https://r.example }\ntheme: { use: editorial }\n");
  writeFileSync(join(ROOT, "content/posts/one.md"), source({ type: "post", slug: "one", fm: { title: "One", date: "2026-01-01", status: "published", tags: ["ai"] }, body: "Words.\n" }));
  writeFileSync(join(ROOT, "content/posts/two.md"), source({ type: "post", slug: "two", fm: { title: "Two", date: "2026-01-02", status: "draft" }, body: "More words.\n" }));
  writeFileSync(join(ROOT, "content/pages/about.md"), source({ type: "page", slug: "about", fm: { title: "About", status: "published" }, body: "About.\n" }));
  initRepo(ROOT, { name: "P", email: "p@example.com" });
  git(ROOT, "add", "-A"); git(ROOT, "commit", "-q", "-m", "init");
}

// ── messages ────────────────────────────────────────────────────────────────────────────────────────
const junk = fc.oneof(fc.string({ maxLength: 8 }), fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string({ maxLength: 3 }), { maxLength: 2 }), fc.dictionary(word, fc.string({ maxLength: 3 }), { maxKeys: 2, noNullPrototype: true }));
const maybe = <T>(a: fc.Arbitrary<T>, freq = 3) => fc.option(a, { nil: undefined, freq });
const typeName = fc.constantFrom("post", "page", "author", "nope", "");
const slugName = fc.constantFrom("one", "two", "about", "missing", "../../etc", "", "a b");
const frontmatter = fc.dictionary(fc.constantFrom("title", "date", "status", "tags", "description", "author", "made-up"), fc.oneof(words(1, 3), fc.constant("2026-03-01"), fc.constant("published"), fc.array(fc.constantFrom("ai", "mcp"), { maxLength: 2 }), junk), { maxKeys: 4, noNullPrototype: true });
const markdown = fc.oneof(sentence, fc.constant(""), fc.constant(":::chart{type=\"bar\"}\n- { label: a, value: 1 }\n:::\n"), fc.constant("<script>1</script>"), fc.constant("---\ntitle: x\n---\nsmuggled frontmatter"));
const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
/** Arguments for each tool: plausible keys with plausible values, and any of them replaced by junk. */
const args: fc.Arbitrary<[string, Record<string, unknown>]> = fc.oneof(
  fc.record({ type: maybe(typeName, 1), slug: maybe(slugName), frontmatter: maybe(fc.oneof(frontmatter, junk)), body: maybe(fc.oneof(markdown, junk)) }, { noNullPrototype: true }).map((a) => ["content.create", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName, 1), slug: maybe(slugName, 1), patch: maybe(fc.oneof(frontmatter, junk)), body: maybe(fc.oneof(markdown, junk)) }, { noNullPrototype: true }).map((a) => ["content.update", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName), status: maybe(fc.constantFrom("draft", "published", "trashed", "gone")), taxonomy: maybe(fc.constantFrom("tag", "category", "x")), term: maybe(fc.constantFrom("ai", "none")), fields: maybe(fc.oneof(fc.array(fc.constantFrom("title", "tags"), { maxLength: 2 }), junk)), sort: maybe(fc.constantFrom("date", "title", "slug", "x")), limit: maybe(fc.oneof(fc.integer({ min: -1, max: 5 }), junk)) }, { noNullPrototype: true }).map((a) => ["content.query", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName), slug: maybe(slugName), severity: maybe(fc.constantFrom("error", "all", 1)) }, { noNullPrototype: true }).map((a) => ["content.lint", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName, 1), slug: maybe(slugName, 1), status: maybe(fc.oneof(fc.constantFrom("draft", "published", "trashed", "review"), junk), 1) }, { noNullPrototype: true }).map((a) => ["content.set_status", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName, 1), slug: maybe(slugName, 1) }, { noNullPrototype: true }).map((a) => ["content.publish", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName), slug: maybe(slugName), markdown: maybe(markdown), apply: maybe(fc.oneof(fc.boolean(), fc.array(fc.constantFrom("1", "2")), junk)), minConfidence: maybe(fc.oneof(fc.double({ min: -1, max: 2 }), junk)) }, { noNullPrototype: true }).map((a) => ["content.suggest_blocks", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName, 1), slug: maybe(slugName, 1) }, { noNullPrototype: true }).map((a) => ["content.trash", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName, 1), slug: maybe(slugName, 1) }, { noNullPrototype: true }).map((a) => ["content.restore", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ query: maybe(fc.oneof(fc.constantFrom("change the accent colour", "redirect", "", "zzz"), junk)) }, { noNullPrototype: true }).map((a) => ["find_tools", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ action: maybe(fc.constantFrom("set", "set_tokens", "set_settings", "nope"), 1), name: maybe(fc.constantFrom("base", "editorial", "technical", "missing")), variation: maybe(fc.constantFrom("dusk", "paper", null, "x")), tokens: maybe(fc.oneof(fc.dictionary(fc.constantFrom("color.accent", "measure", "invented"), fc.oneof(fc.constantFrom("#8a3324", "38rem", "red; }", null), junk), { maxKeys: 2, noNullPrototype: true }), junk)), settings: maybe(fc.oneof(fc.dictionary(fc.constantFrom("showDates", "tagline", "nothing"), fc.oneof(fc.boolean(), words(1, 2), fc.constant(null), junk), { maxKeys: 2, noNullPrototype: true }), junk)) }, { noNullPrototype: true }).map((a) => ["theme", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ action: maybe(fc.constantFrom("set_config", "explain_config", "set_nav", "set_redirect", "doctor", "nope"), 1), path: maybe(fc.constantFrom("site.name", "site.url", "theme.use", "snypd", "types.post.urlPattern", "bench.budgets.jsKb", "site.redirects[/a]", "")), value: maybe(fc.oneof(words(1, 2), fc.constant("https://r.example"), fc.constant(null), fc.constant(2), junk)), location: maybe(fc.constantFrom("header", "footer", "side")), items: maybe(fc.oneof(fc.array(fc.oneof(fc.record({ label: words(1, 2), ref: fc.constantFrom("/", "post/one", "/nowhere") }, { noNullPrototype: true }), fc.record({ label: words(1, 2), url: fc.constantFrom("https://x.example", "javascript:x") }, { noNullPrototype: true })), { maxLength: 3 }), junk)), from: maybe(fc.constantFrom("/old", "/posts/one", "b", "")), to: maybe(fc.constantFrom("/", "/posts/one", "/old", null, "")) }, { noNullPrototype: true }).map((a) => ["site", compact(a)] as [string, Record<string, unknown>]),
  fc.record({ type: maybe(typeName, 1), slug: maybe(slugName, 1) }, { noNullPrototype: true }).map((a) => ["content.explain", compact(a)] as [string, Record<string, unknown>]),
);
const uri = fc.constantFrom("snypd://config", "snypd://types", "snypd://types/post", "snypd://types/nope", "snypd://spec/primitives", "snypd://spec/primitives/chart", "snypd://content/post/one", "snypd://content/post/missing", "snypd://history/post/one", "snypd://lint/post/one", "snypd://theme", "snypd://nav", "snypd://plugins", "snypd://nope", "http://x.example", "", "snypd://content/../../x");
const id = fc.oneof({ weight: 5, arbitrary: fc.nat({ max: 1000 }) }, { weight: 2, arbitrary: fc.string({ maxLength: 6 }) }, { weight: 1, arbitrary: fc.constant(null) });
/** A well-formed request for one of the methods, then a wrong envelope around it now and then. */
const wellFormed: fc.Arbitrary<Request> = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ jsonrpc: "2.0" as const, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fuzz", version: "0" } } }) },
  { weight: 1, arbitrary: fc.constantFrom<Request>({ jsonrpc: "2.0", method: "ping" }, { jsonrpc: "2.0", method: "resources/list" }, { jsonrpc: "2.0", method: "resources/templates/list" }, { jsonrpc: "2.0", method: "tools/list" }, { jsonrpc: "2.0", method: "prompts/list" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } }) },
  { weight: 2, arbitrary: uri.map((u): Request => ({ jsonrpc: "2.0", method: "resources/read", params: { uri: u } })) },
  { weight: 6, arbitrary: args.map(([name, a]): Request => ({ jsonrpc: "2.0", method: "tools/call", params: { name, arguments: a } })) },
  { weight: 1, arbitrary: fc.tuple(fc.constantFrom("get-started", "write-post", "review-drafts", "build-theme", "nope"), fc.dictionary(fc.constantFrom("topic", "type", "slug"), fc.oneof(words(1, 3), junk), { maxKeys: 2, noNullPrototype: true })).map(([name, a]): Request => ({ jsonrpc: "2.0", method: "prompts/get", params: { name, arguments: a } })) },
);
const envelope: fc.Arbitrary<(r: Request) => Request> = fc.constantFrom<(r: Request) => Request>(
  (r) => ({ ...r, jsonrpc: "1.0" as never }), (r) => { const { jsonrpc: _, ...rest } = r; return rest as Request; }, (r) => ({ ...r, method: 7 as never }), (r) => ({ ...r, method: "made/up" }),
  (r) => ({ ...r, params: "string" as never }), (r) => ({ ...r, params: [1, 2] as never }), (r) => ({ ...r, params: null as never }), (r) => ({ ...r, params: { ...(r.params ?? {}), arguments: "not an object" } }),
  (r) => ({ ...r, params: { ...(r.params ?? {}), name: 1 } }), (r) => ({ ...r, params: { ...(r.params ?? {}), uri: 1 } }), (r) => ({ ...r, id: { nested: true } as never }), (r) => ({ ...r, id: 1.5 }),
);
const message: fc.Arbitrary<Request> = fc.tuple(wellFormed, maybe(id, 1), maybe(envelope, 5)).map(([r, i, wrap]) => { const m = i === undefined ? r : { ...r, id: i }; return wrap ? wrap(m) : m; });

const CODES = new Set<number>(Object.values(E));
const names = (r: Response | undefined) => (r && "result" in r ? (r.result as { tools: { name: string }[] }).tools.map((t) => t.name) : []);
/** The protocol's reading of a message (decision 159): a valid notification, a valid request, or neither — and the id its reply must carry. */
function classify(m: unknown): { kind: "notification" } | { kind: "request"; id: unknown } | { kind: "invalid"; id: unknown } {
  const shaped = typeof m === "object" && m !== null && !Array.isArray(m);
  const r = m as Partial<Request>;
  const idOk = shaped && (typeof r.id === "number" || typeof r.id === "string" || r.id === null);
  const valid = shaped && r.jsonrpc === "2.0" && typeof r.method === "string" && (r.id === undefined || idOk);
  if (!valid) return { kind: "invalid", id: idOk ? r.id : null };
  return r.id === undefined ? { kind: "notification" } : { kind: "request", id: r.id };
}
function check(m: Request, r: Response | undefined, at: string): void {
  const c = classify(m);
  if (c.kind === "notification") { if (r !== undefined) throw new Error(`${at}: a notification was answered: ${JSON.stringify(r)}`); return; }
  if (r === undefined) throw new Error(`${at}: a ${c.kind === "invalid" ? "broken message" : "request"} went unanswered: ${JSON.stringify(m)}`);
  if (r.jsonrpc !== "2.0") throw new Error(`${at}: reply is not JSON-RPC 2.0`);
  if (JSON.stringify(r.id) !== JSON.stringify(c.id)) throw new Error(`${at}: reply id ${JSON.stringify(r.id)} for ${JSON.stringify(m)}`);
  if (("result" in r) === ("error" in r)) throw new Error(`${at}: a reply with ${"result" in r ? "both result and error" : "neither result nor error"}`);
  JSON.stringify(r);   // it has to go on the wire
  if (c.kind === "invalid") { if (!("error" in r) || r.error.code !== E.INVALID_REQUEST) throw new Error(`${at}: a broken message was not refused as Invalid Request: ${JSON.stringify(r)}`); return; }
  if ("error" in r) {
    if (!CODES.has(r.error.code)) throw new Error(`${at}: error code ${r.error.code} is not one of the protocol's`);
    if (!r.error.message) throw new Error(`${at}: an error with no message`);
    if (m.method === "tools/call" && typeof m.params?.name === "string" && (m.params.arguments === undefined || (typeof m.params.arguments === "object" && m.params.arguments !== null && !Array.isArray(m.params.arguments))))
      throw new Error(`${at}: a well-formed tool call got an RPC error instead of a tool result: ${r.error.message}`);
  } else if (m.method === "tools/call") {
    const t = r.result as { content?: unknown; isError?: unknown };
    if (!Array.isArray(t.content) || !t.content.every((c) => c && typeof c === "object" && (c as { type: unknown }).type === "text" && typeof (c as { text: unknown }).text === "string")) throw new Error(`${at}: a tool result without text content: ${JSON.stringify(r.result).slice(0, 200)}`);
    if (t.isError !== undefined && typeof t.isError !== "boolean") throw new Error(`${at}: isError is ${typeof t.isError}`);
  }
}

describe("the JSON-RPC surface under fuzz", () => {
  test("6a. every message is answered as the protocol says, a tool call is answered by the tool, and the site still loads afterwards", async () => {
    await fc.assert(fc.asyncProperty(fc.array(message, { minLength: 1, maxLength: 10 }), async (msgs) => {
      fresh();
      const server = createServer(ROOT);
      const log: string[] = [];
      try {
        const before = names(await server.handle({ jsonrpc: "2.0", id: "t0", method: "tools/list" }));
        for (const [i, m] of msgs.entries()) {
          log.push(`${m.method}${m.params && typeof m.params === "object" && "name" in m.params ? ` ${String(m.params.name)}` : ""}`);
          let r: Response | undefined;
          try { r = await server.handle(m); } catch (e) { throw new Error(`message ${i} (${log.join(" · ")}) threw: ${(e as Error).stack}`); }
          check(m, r, `message ${i} (${log.join(" · ")})`);
        }
        const pong = await server.handle({ jsonrpc: "2.0", id: "t1", method: "ping" });
        if (!pong || !("result" in pong)) throw new Error(`after ${log.join(" · ")}: ping went unanswered`);
        // The list grows and never shrinks: `find_tools` unlocks what it found (S16), and a catalogue
        // tool called by name unlocks itself. Nothing else may change it.
        const after = names(await server.handle({ jsonrpc: "2.0", id: "t2", method: "tools/list" }));
        for (const n of before) if (!after.includes(n)) throw new Error(`after ${log.join(" · ")}: tool ${n} vanished from the list`);
        for (const n of after) if (!before.includes(n) && !log.some((l) => l === "tools/call find_tools" || l === `tools/call ${n}`)) throw new Error(`after ${log.join(" · ")}: tool ${n} appeared unasked`);
        const cfg = loadConfig(ROOT);
        if (!cfg.ok) throw new Error(`after ${log.join(" · ")}: the site no longer loads — ${cfg.diagnostics.filter((d) => d.level === "error").map((d) => d.message).join("; ")}`);
      } finally { await server.close(); }
    }), params(20, { examples: MESSAGES as unknown as [Request[]][] }));
  });

  test("6b. on the wire: every line out is JSON-RPC, every request id is answered once, and a line that is not JSON is a parse error and not the end", async () => {
    const line = fc.oneof({ weight: 6, arbitrary: message.map((m) => JSON.stringify(m)) }, { weight: 1, arbitrary: fc.constantFrom("", "   ", "{", "not json", "[1,2]", "null", "\"a string\"", "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}garbage") });
    await fc.assert(fc.asyncProperty(fc.array(line, { minLength: 1, maxLength: 8 }), async (lines) => {
      fresh();
      const proc = Bun.spawn([process.execPath, resolve("packages/mcp/src/server.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, SNYPD_ROOT: ROOT } });
      proc.stdin.write(lines.join("\n") + "\n"); proc.stdin.end();
      const out = (await new Response(proc.stdout).text()).split("\n").filter(Boolean);
      const code = await proc.exited;
      if (code !== 0) throw new Error(`the server exited ${code}: ${await new Response(proc.stderr).text()}`);
      const replies = out.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { throw new Error(`a line out that is not JSON: ${l.slice(0, 120)}`); } });
      for (const r of replies) {
        if (r.jsonrpc !== "2.0") throw new Error(`a line out that is not JSON-RPC 2.0: ${JSON.stringify(r).slice(0, 120)}`);
        if (!("method" in r) && ("result" in r) === ("error" in r)) throw new Error(`a reply with ${"result" in r ? "both" : "neither"} result and error`);
      }
      const expectedIds: string[] = [], parseErrors = lines.filter((l) => l.trim() && !isJson(l)).length;
      for (const l of lines) { if (!l.trim() || !isJson(l)) continue; const c = classify(JSON.parse(l)); if (c.kind !== "notification") expectedIds.push(JSON.stringify(c.id)); }
      const gotIds = replies.filter((r) => !("method" in r) && !(r.error && (r.error as { code: number }).code === E.PARSE)).map((r) => JSON.stringify(r.id));
      if (gotIds.sort().join() !== expectedIds.sort().join()) throw new Error(`answered ids ${gotIds.join()} for requests ${expectedIds.join()}`);
      const gotParse = replies.filter((r) => r.error && (r.error as { code: number }).code === E.PARSE).length;
      if (gotParse !== parseErrors) throw new Error(`${parseErrors} lines were not JSON and ${gotParse} parse errors came back`);
    }), params(5, { examples: LINES }));
  });
});
const isJson = (l: string) => { try { JSON.parse(l); return true; } catch { return false; } };
