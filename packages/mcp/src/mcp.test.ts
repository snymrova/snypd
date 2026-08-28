import { describe, expect, test, beforeAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    const [, templates, lintOk, lintMissing] = await session([
      req(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } }),
      req(2, "resources/templates/list"),
      req(3, "resources/read", { uri: "snypd://lint/post/post-00005" }),
      req(4, "resources/read", { uri: "snypd://lint/post/nope" }),
    ]);
    expect(templates.result.resourceTemplates.map((t: any) => t.uriTemplate)).toEqual(["snypd://content/{type}/{slug}", "snypd://history/{type}/{slug}", "snypd://lint/{type}/{slug}"]);
    const lintRes = JSON.parse(lintOk.result.contents[0].text);
    expect(lintRes.file).toBe("content/posts/post-00005.md");
    expect(lintRes.errors).toBe(0); expect(lintRes.diagnostics).toEqual([]); expect(lintRes.words).toBeGreaterThan(100);
    expect(lintMissing.error.code).toBe(-32002);
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
    expect(out[3].result.tools.map((t: any) => t.name)).toEqual(["content.create", "content.update", "content.query", "content.lint", "content.set_status", "content.publish", "content.suggest_blocks", "content.render_preview", "content.trash", "content.restore", "find_tools"]);
  });
});

describe("in-process", () => {
  test("initialize path imports nothing heavy", async () => {
    const s = createServer("corpora/100");
    const r = await s.handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect((r as any).result.capabilities).toEqual({ resources: {}, tools: { listChanged: true }, prompts: {} });
    const missing = await s.handle({ jsonrpc: "2.0", id: 2, method: "resources/read", params: {} });
    expect((missing as any).error.code).toBe(-32602);
    expect(await s.handle({ jsonrpc: "2.0", method: "resources/read", params: {} })).toBeUndefined(); // notification → no reply even on error
  });
});

/** S11: the write loop as an agent drives it — tools/call over the same stdio server, on a real repo. */
describe("content.* tools", () => {
  const site = "corpora/_test/mcp-site";
  const call = (id: number, name: string, args: object = {}) => req(id, "tools/call", { name, arguments: args });
  const structured = (m: any) => m.result.structuredContent;

  beforeAll(async () => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(`${site}/content/posts`, { recursive: true });
    writeFileSync(`${site}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    const { git, initRepo } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });   // guarded: never inits into the enclosing repo
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init");
  });

  test("create → query → lint → publish: refused without a human, then merged after approval", async () => {
    const [, created, dupe, queried, linted, refused] = await session([
      req(1, "initialize"),
      call(2, "content.create", { type: "post", frontmatter: { title: "Why MCP only", description: "A short answer." }, body: "## Why\n\nBecause the surface is the product.\n" }),
      call(3, "content.create", { type: "post", slug: "why-mcp-only", frontmatter: { title: "Again" } }),
      call(4, "content.query", { type: "post" }),
      call(5, "content.lint", { type: "post", slug: "why-mcp-only" }),
      call(6, "content.publish", { type: "post", slug: "why-mcp-only" }),
    ], site);

    expect(structured(created)).toMatchObject({ ok: true, type: "post", slug: "why-mcp-only", route: "/posts/why-mcp-only", status: "draft" });
    expect(structured(created).git).toMatchObject({ enabled: true, committed: true, branch: "snypd/draft-post-why-mcp-only", base: "main" });
    expect(created.result.content[0].text).toContain("committed");

    expect(dupe.result.isError).toBe(true);                                   // a tool error, not a protocol error
    expect(dupe.result.content[0].text).toContain("already exists");
    expect(dupe.error).toBeUndefined();

    expect(structured(queried)).toMatchObject({ ok: true, total: 1 });
    expect(structured(queried).items[0]).toMatchObject({ slug: "why-mcp-only", status: "draft" });
    expect(structured(linted)).toMatchObject({ ok: true, files: 1 });

    expect(refused.result.isError).toBe(true);
    expect(structured(refused).hint).toContain("/_snypd/review/post/why-mcp-only");

    // the human approves the exact version on the review page (the preview server calls the same function)
    const c = await import("@snypd/core");
    const cfg = c.loadConfig(site);
    const t = c.target(site, cfg, "post", "why-mcp-only");
    c.approve(c.approvals(site), { type: "post", slug: "why-mcp-only", hash: c.contentHash(readFileSync(t.file, "utf8")), by: "sunny", at: new Date().toISOString() });

    const [, published, again] = await session([req(1, "initialize"), call(2, "content.publish", { type: "post", slug: "why-mcp-only" }), call(3, "content.publish", { type: "post", slug: "why-mcp-only" })], site);
    expect(structured(published)).toMatchObject({ ok: true, status: "published" });
    expect(structured(published).git.merged).toBe(true);
    expect(readFileSync(t.file, "utf8")).toContain("status: published");
    expect(c.git(site, "rev-parse", "--abbrev-ref", "HEAD").stdout).toBe("main");
    expect(c.git(site, "ls-tree", "main", "--name-only", "content/posts/").stdout).toBe("content/posts/why-mcp-only.md");
    expect(again.result.isError).toBe(true);                                   // the approval was spent
  });

  test("update patches one key, trash and restore move the file, and the resource reads it back", async () => {
    const [, updated, read, trashed, gone, restored, history] = await session([
      req(1, "initialize"),
      call(2, "content.update", { type: "post", slug: "why-mcp-only", patch: { description: "The surface is the product." } }),
      req(3, "resources/read", { uri: "snypd://content/post/why-mcp-only" }),
      call(4, "content.trash", { type: "post", slug: "why-mcp-only" }),
      req(5, "resources/read", { uri: "snypd://content/post/why-mcp-only" }),
      call(6, "content.restore", { type: "post", slug: "why-mcp-only" }),
      req(7, "resources/read", { uri: "snypd://history/post/why-mcp-only" }),
    ], site);
    expect(structured(updated)).toMatchObject({ ok: true, status: "published" });
    expect(read.result.contents[0].text).toContain("description: The surface is the product.");
    expect(read.result.contents[0].text).toContain("body: |");
    expect(structured(trashed)).toMatchObject({ ok: true, status: "trashed" });
    expect(gone.error.code).toBe(-32002);
    expect(structured(restored)).toMatchObject({ ok: true, status: "draft" });
    const h = JSON.parse(history.result.contents[0].text);
    expect(h.git).toBe(true);
    expect(h.commits[0].principal).toStartWith("agent:claude-code/");
    expect(h.commits.map((x: any) => x.subject)).toContain("content: create post/why-mcp-only");
  });

  /** S15: the upgrade loop — read prose, get the primitives back, and write the accepted ones in one call. */
  test("suggest_blocks reads a post, explains itself, and applies to the draft branch", async () => {
    const prose = "Here is what we measured.\n\n| Format | Tokens |\n| --- | --- |\n| HTML | 6120 |\n| Twin | 504 |\n| Feed | 61 |\n\n> Warning: measured on one box, not a cloud runner.\n";
    const [, , listed, appliedNoFill, applied, inlineOnly, refused] = await session([
      req(1, "initialize"),
      call(2, "content.create", { type: "post", slug: "measured", frontmatter: { title: "What we measured" }, body: prose }),
      call(3, "content.suggest_blocks", { type: "post", slug: "measured" }),
      call(4, "content.suggest_blocks", { type: "post", slug: "measured", apply: true }),
      call(5, "content.suggest_blocks", { type: "post", slug: "measured", apply: true, fill: { "1": { source: "https://snypd.rocks/bench" } } }),
      call(6, "content.suggest_blocks", { markdown: prose }),
      call(7, "content.suggest_blocks", { markdown: prose, apply: true }),
    ], site);

    const s3 = structured(listed);
    expect(s3.count).toBe(2);
    expect(s3.suggestions.map((x: any) => x.primitive)).toEqual(["chart", "callout"]);
    expect(s3.suggestions[0].needs[0].prop).toBe("source");                  // the prose carries no URL
    expect(s3.suggestions[0].because[0]).toBeTruthy();                       // the reason is a sentence, from the detector YAML
    expect(listed.result.content[0].text).toContain("→  `chart`");

    // apply without meeting the need: the callout lands, the chart is skipped and says why
    const s4 = structured(appliedNoFill);
    expect(s4.applied.map((a: any) => a.primitive)).toEqual(["callout"]);
    expect(s4.skipped[0].why).toContain("source");
    expect(readFileSync(`${site}/content/posts/measured.md`, "utf8")).not.toContain("TODO");

    // fill it, and the chart lands too — on the draft branch, with the lint it caused
    const s5 = structured(applied);
    expect(s5.applied.map((a: any) => a.primitive)).toEqual(["chart"]);
    expect(s5.git).toMatchObject({ committed: true, branch: "snypd/draft-post-measured" });
    expect(s5.lint.errors).toBe(0);
    const file = readFileSync(`${site}/content/posts/measured.md`, "utf8");
    expect(file).toContain(':::chart{type="bar" source="https://snypd.rocks/bench"');
    expect(file).toContain("- { label: HTML, value: 6120 }");
    expect(file).toContain(':::callout{kind="warning"}');

    expect(structured(inlineOnly).count).toBe(2);                            // a bare string scores fine
    expect(refused.result.isError).toBe(true);                               // …but there is nothing to write it back to
    expect(refused.result.content[0].text).toContain("stored item");
  });

  test("render_preview starts the session's preview server and returns the three URLs", async () => {
    const [, r] = await session([
      req(1, "initialize"),
      call(2, "content.render_preview", { type: "post", slug: "measured", port: 0 }),
    ], site);
    const p = structured(r);
    expect(p.ok).toBe(true);
    expect(p.route).toBe("/posts/measured");
    expect(p.url).toMatch(/^http:\/\/[^/]+\/posts\/measured$/);
    expect(p.markdownUrl).toEndWith("/posts/measured/index.md");
    expect(p.reviewUrl).toEndWith("/_snypd/review/post/measured");
    const missing = await session([req(1, "initialize"), call(2, "content.render_preview", { type: "post", slug: "nope", port: 0 })], site);
    expect(missing[1]!.result.isError).toBe(true);
  });

  test("a bad status transition and an unknown tool come back as fixable text", async () => {
    const [, badStatus, unknownTool, badArgs] = await session([
      req(1, "initialize"),
      call(2, "content.set_status", { type: "post", slug: "why-mcp-only", status: "nope" }),
      call(3, "content.nope", {}),
      req(4, "tools/call", { name: "content.create", arguments: [] }),
    ], site);
    expect(badStatus.result.content[0].text).toContain("unknown status");
    expect(unknownTool.result.content[0].text).toContain("Listed: content.create");
    expect(badArgs.error.code).toBe(-32602);
  });
});

/**
 * S16: the deferred surface. What is being tested is the *bargain* — a small list every turn, the rest
 * reachable — so the assertions are about what `tools/list` costs before and after, not just that a tool works.
 */
describe("find_tools + the catalogue", () => {
  const site = "corpora/_test/mcp-s16";
  const call = (id: number, name: string, args: object = {}) => req(id, "tools/call", { name, arguments: args });
  const structured = (m: any) => m.result.structuredContent;

  beforeAll(async () => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(site, { recursive: true });
    const { initRepo, git } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });
    writeFileSync(`${site}/.gitkeep`, "");
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init");
  });

  test("the listed surface is content.* + find_tools; a query hands over the rest and says so", async () => {
    const out = await session([
      req(1, "initialize"),
      req(2, "tools/list"),
      call(3, "find_tools", { query: "change the accent colour" }),
      req(4, "tools/list"),
      call(5, "find_tools", { query: "xyzzy" }),
    ], "corpora/theme");
    const [, before, found, after, unmatched] = out.filter((m: any) => m.id !== undefined);

    // The client is told its list grew, once — the second find unlocks nothing new and stays quiet.
    expect(out.filter((m: any) => m.method === "notifications/tools/list_changed")).toHaveLength(1);

    const names = (m: any) => m.result.tools.map((t: any) => t.name);
    expect(names(before)).not.toContain("theme");
    expect(names(before).at(-1)).toBe("find_tools");
    // The find returns the schema itself, so a client that never re-lists can still call it.
    expect(structured(found).tools[0].name).toBe("theme");
    expect(structured(found).tools[0].inputSchema.properties.action.enum).toContain("set_tokens");
    expect(names(after)).toContain("theme");
    // Only what matched joins the list: finding the theme tool must not drag the bench tool in with it.
    expect(names(after)).not.toContain("bench");
    expect(structured(unmatched)).toMatchObject({ count: 0 });
    expect(structured(unmatched).available).toEqual(["theme", "site", "bench"]);
  });

  test("a catalogue tool is callable before it was ever listed", async () => {
    const [, doctor, list] = await session([
      req(1, "initialize"),
      call(2, "site", { action: "doctor" }),
      req(3, "tools/list"),
    ], "corpora/theme");
    expect(doctor.result.isError).toBeUndefined();
    expect(doctor.result.content[0].text).toContain("config loads");
    expect(list.result.tools.map((t: any) => t.name)).toContain("site");
  });

  test("init → set_config → redirect → tokens → scaffold, each validated before it sticks", async () => {
    const [, init, dupeInit, renamed, bad, explained, unknownToken, redirected, loop, scaffolded, activated] = await session([
      req(1, "initialize"),
      call(2, "site", { action: "init", name: "S16", url: "https://s16.example", description: "A test." }),
      call(3, "site", { action: "init", name: "again", url: "https://s16.example" }),
      call(4, "site", { action: "set_config", path: "site.name", value: "S16 renamed" }),
      call(5, "site", { action: "set_config", path: "site.url", value: "not a url" }),
      call(6, "site", { action: "explain_config", path: "site.name" }),
      call(7, "theme", { action: "set_tokens", tokens: { "color.nope": "#000" } }),
      call(8, "site", { action: "set_redirect", from: "/posts/old", to: "/posts/new" }),
      call(9, "site", { action: "set_redirect", from: "/posts/new", to: "/posts/old" }),
      call(10, "theme", { action: "scaffold", name: "scratchy", extends: "editorial" }),
      call(11, "theme", { action: "set", name: "scratchy" }),
    ], site);

    expect(structured(init)).toMatchObject({ ok: true, git: true });
    expect(structured(init).created).toContain("snypd.yaml");
    expect(dupeInit.result.isError).toBe(true);
    expect(structured(renamed)).toMatchObject({ ok: true, from: "S16", to: "S16 renamed" });

    // The one that matters: an invalid value is rolled back, and the file still loads afterwards.
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toContain("left unchanged");
    expect(readFileSync(`${site}/snypd.yaml`, "utf8")).toContain("https://s16.example");
    expect(explained.result.content[0].text).toContain("snypd.yaml");

    expect(unknownToken.result.isError).toBe(true);
    expect(unknownToken.result.content[0].text).toContain("color.accent");   // the hint names real ones

    expect(structured(redirected)).toMatchObject({ from: "/posts/old", to: "/posts/new" });
    expect(loop.result.isError).toBe(true);
    expect(loop.result.content[0].text).toContain("loop");

    expect(structured(scaffolded)).toMatchObject({ theme: "scratchy", extends: "editorial" });
    expect(readFileSync(`${site}/themes/scratchy/theme.yaml`, "utf8")).toContain("extends: editorial");
    expect(structured(activated)).toMatchObject({ theme: "scratchy", from: "editorial", changed: true });
  });

  test("switching to a theme that does not declare a token you set says so rather than losing it", async () => {
    const bare = "corpora/_test/mcp-s16-strand";
    rmSync(bare, { recursive: true, force: true }); mkdirSync(bare, { recursive: true });
    writeFileSync(`${bare}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\ntheme:\n  use: editorial\n  tokens:\n    color.accent: \"#0a5\"\n");
    const [, switched] = await session([req(1, "initialize"), call(2, "theme", { action: "set", name: "base" })], bare);
    expect(structured(switched)).toMatchObject({ theme: "base", from: "editorial", strandedTokens: ["color.accent"] });
    expect(switched.result.content[0].text).toContain("base does not declare");
  });

  test("theme, tokens and coverage are resources, and prompts are scripts an agent can run", async () => {
    const [, theme, tokens, coverage, badTheme, prompts, post, badPrompt] = await session([
      req(1, "initialize"),
      req(2, "resources/read", { uri: "snypd://theme" }),
      req(3, "resources/read", { uri: "snypd://theme/tokens" }),
      req(4, "resources/read", { uri: "snypd://theme/coverage" }),
      req(5, "resources/read", { uri: "snypd://theme/nope" }),
      req(6, "prompts/list"),
      req(7, "prompts/get", { name: "write-post", arguments: { topic: "benchmarks" } }),
      req(8, "prompts/get", { name: "nope" }),
    ], "corpora/theme");

    expect(theme.result.contents[0].text).toContain("active: editorial");
    expect(tokens.result.contents[0].text).toContain("color.accent");
    const cov = JSON.parse(coverage.result.contents[0].text);
    expect(cov.summary.own + cov.summary.inherited + cov.summary.fallback + cov.summary.missing).toBe(cov.summary.total);
    expect(cov.summary.missing).toBe(0);
    expect(badTheme.error.code).toBe(-32002);

    expect(prompts.result.prompts.map((p: any) => p.name)).toEqual(["get-started", "write-post"]);
    // A prompt has to name the calls it wants made, or it is a paragraph rather than a workflow.
    expect(post.result.messages[0].content.text).toContain("benchmarks");
    expect(post.result.messages[0].content.text).toContain("content.suggest_blocks");
    expect(badPrompt.error).toBeDefined();
  });
});
