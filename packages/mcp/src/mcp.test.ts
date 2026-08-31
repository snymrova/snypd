import { describe, expect, test, beforeAll, setDefaultTimeout } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "./server";
import { PROTOCOL_VERSIONS, activitySnapshot } from "./protocol";

/**
 * Every test here drives a whole MCP session — a server, an `initialize`, and up to eleven tool calls,
 * several of which reload and revalidate the entire config or open the index. Against `bun test`'s 5 s
 * default that is close enough to the line that two of them failed on roughly one run in three on a
 * loaded box (docs/08 §12.10), at HEAD, with no change of anyone's to blame. A suite that fails a third
 * of the time trains its reader to re-run rather than to look — which is how a real failure gets waved
 * through. Raised file-wide rather than per test, because the cause is what these tests *are*: the
 * timeout is a hang detector here, not an assertion about speed. Speed is `snypd bench`'s job, where it
 * is measured against a budget instead of a stopwatch that only fires when the box is busy.
 */
setDefaultTimeout(30_000);

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

  /**
   * S18b: what the Desk's status card reads. The record lives in `protocol.ts` because that is the one
   * funnel every message crosses and it is already on the cold-start path — decision 45 says the Desk
   * may never touch `initialize`, and adding no module is how that is obeyed rather than promised.
   */
  test("activity records contact, including calls this server refuses", async () => {
    const before = activitySnapshot().calls;
    const s = createServer("corpora/100");
    await s.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "a-harness" } } });
    expect(activitySnapshot().client).toBe("a-harness");

    await s.handle({ jsonrpc: "2.0", id: 2, method: "no/such/method" });
    const a = activitySnapshot();
    // A method we reject is still a harness talking to us: the card reports contact, not success.
    expect(a.lastMethod).toBe("no/such/method");
    expect(a.calls).toBe(before + 2);
    expect(a.since).toBeLessThanOrEqual(a.lastAt!);
  });

  /**
   * S18f — the same record, on disk, for the process that renders the page (docs/08 §12.9 and §10).
   *
   * Driven against a real spawned server rather than `handle()`, because the two facts under test are
   * both about the *transport*: `startedAt` is written when it comes up, and the record is removed when
   * it goes down. A snapshot from inside this process would demonstrate neither.
   */
  test("the heartbeat is on disk while the server lives, and gone when it does not", async () => {
    const root = "corpora/_test/mcp-heartbeat";
    rmSync(root, { recursive: true, force: true });
    mkdirSync(`${root}/content/posts`, { recursive: true });
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: hb, url: https://hb.example }\n");
    const { readHeartbeat } = await import("@snypd/core");
    const proc = Bun.spawn([process.execPath, "packages/mcp/src/server.ts"], { stdin: "pipe", stdout: "pipe", stderr: "ignore", env: { ...process.env, SNYPD_ROOT: root } });
    try {
      proc.stdin.write(JSON.stringify(req(1, "initialize", { clientInfo: { name: "a-harness" } })) + "\n");
      proc.stdin.flush();
      const reader = proc.stdout.getReader();
      await reader.read();                                   // the reply is on the wire; the flush follows it
      reader.releaseLock();
      // The write is scheduled off the turn that answers `initialize`, so this waits for the event loop
      // rather than for a duration — the point of the design is that the protocol never pays for it.
      let rec = readHeartbeat(root);
      for (let i = 0; i < 50 && !rec; i++) { await Bun.sleep(20); rec = readHeartbeat(root) }
      expect(rec).toBeDefined();
      expect(rec!.pid).toBe(proc.pid);
      expect(rec!.client).toBe("a-harness");
      expect(rec!.calls).toBeGreaterThan(0);
      expect(rec!.startedAt).toBeLessThanOrEqual(rec!.lastAt!);   // it was up before anything called it
    } finally {
      proc.stdin.end();
      await proc.exited;
    }
    expect(readHeartbeat(root)).toBeUndefined();             // a record that outlived its process is a lie
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
    expect(structured(created).git).toMatchObject({ enabled: true, committed: true, branch: "snypd/drafts", base: "main" });
    expect(created.result.content[0].text).toContain("committed");

    expect(dupe.result.isError).toBe(true);                                   // a tool error, not a protocol error
    expect(dupe.result.content[0].text).toContain("already exists");
    expect(dupe.error).toBeUndefined();

    expect(structured(queried)).toMatchObject({ ok: true, total: 1 });
    expect(structured(queried).items[0]).toMatchObject({ slug: "why-mcp-only", status: "draft" });
    expect(structured(linted)).toMatchObject({ ok: true, files: 1 });

    expect(refused.result.isError).toBe(true);
    expect(structured(refused).hint).toContain("/_snypd/review/post/why-mcp-only");
    // S18e: the hint names the call that turns that path into a URL a person can open. It used to name
    // `snypd serve --preview`, a command the agent cannot run and the human no longer needs to type.
    expect(structured(refused).hint).toContain("content.render_preview");
    expect(structured(refused).hint).not.toContain("--preview");

    // the human approves the exact version on the review page (the preview server calls the same function)
    const c = await import("@snypd/core");
    const cfg = c.loadConfig(site);
    const t = c.target(site, cfg, "post", "why-mcp-only");
    c.approve(c.approvals(site), { type: "post", slug: "why-mcp-only", hash: c.contentHash(readFileSync(t.file, "utf8")), by: "sunny", at: new Date().toISOString() });

    const [, published, again] = await session([req(1, "initialize"), call(2, "content.publish", { type: "post", slug: "why-mcp-only" }), call(3, "content.publish", { type: "post", slug: "why-mcp-only" })], site);
    expect(structured(published)).toMatchObject({ ok: true, status: "published" });
    expect(structured(published).git).toMatchObject({ landed: true, base: "main" });
    expect(readFileSync(t.file, "utf8")).toContain("status: published");
    // S17b: publishing lands a path on `main` and leaves the tree on the drafts branch, where the next
    // write goes and where every other draft still is. A checkout here is what used to make them vanish.
    expect(c.git(site, "rev-parse", "--abbrev-ref", "HEAD").stdout).toBe("snypd/drafts");
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
  test("suggest_blocks reads a post, explains itself, and applies on the drafts branch", async () => {
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

    // fill it, and the chart lands too — on the drafts branch, with the lint it caused
    const s5 = structured(applied);
    expect(s5.applied.map((a: any) => a.primitive)).toEqual(["chart"]);
    expect(s5.git).toMatchObject({ committed: true, branch: "snypd/drafts" });
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
    expect(p.startedBy).toBe("session");   // no `snypd dev` here, so this one is the session's own
    expect(r.result.content[0].text).toContain("Started for this session");
    const missing = await session([req(1, "initialize"), call(2, "content.render_preview", { type: "post", slug: "nope", port: 0 })], site);
    expect(missing[1]!.result.isError).toBe(true);
  });

  /**
   * S18e, `07` decision 51 — ownership inverts. A preview the person started is theirs: it existed
   * before this session and it is very likely the tab they are already looking at, so the agent is
   * handed *that* URL rather than binding a second server beside it. Which is also docs/08 §12.3's fix,
   * from the other end: two callers defaulting to 4321 with no fallback used to make a human with a
   * preview open turn every `render_preview` in the harness into an EADDRINUSE and no URL at all.
   */
  test("render_preview hands back the `snypd dev` server when the person already started one", async () => {
    const c = await import("@snypd/core");
    const { preview } = await import("@snypd/render/preview");
    const dev = await preview(site, { port: 0, watch: false });
    try {
      c.writeDev(site, { url: dev.url, port: dev.port, hostname: dev.hostname, root: resolve(site), pid: process.pid, startedAt: new Date().toISOString() });
      const [, r] = await session([req(1, "initialize"), call(2, "content.render_preview", { type: "post", slug: "measured" })], site);
      const p = structured(r);
      expect(p.server).toBe(dev.url);
      expect(p.url).toBe(`${dev.url}/posts/measured`);
      expect(p.startedBy).toBe("dev");
      expect(r.result.content[0].text).toContain("already running");
    } finally { dev.stop(); c.clearDev(site) }
  });

  test("a record nobody is answering is not handed to an agent as a URL", async () => {
    const c = await import("@snypd/core");
    c.writeDev(site, { url: "http://localhost:9", port: 9, hostname: "localhost", root: resolve(site), pid: process.pid, startedAt: "" });
    const [, r] = await session([req(1, "initialize"), call(2, "content.render_preview", { type: "post", slug: "measured", port: 0 })], site);
    expect(structured(r).server).not.toContain(":9/");
    expect(structured(r).startedBy).toBe("session");   // it fell back to starting its own
    c.clearDev(site);
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
/**
 * S18d — a refused write leaves nothing behind.
 *
 * `useDrafts` refuses to switch branches when the tree carries work this write did not do, and that
 * guard used to run *after* the content was on disk: the tool answered `isError` over a write that had
 * happened, and `content.query` then listed the item the agent had just been told it failed to create.
 * The first run in an empty directory hit it every time, because an `init` that could not create a repo
 * could not commit its own scaffold either — so the dirty tree the guard tripped on was `init`'s.
 *
 * The assertion that matters is not the refusal. It is the two lines after it: nothing on disk, nothing
 * in the index.
 */
describe("a refused write is not a half-done one", () => {
  const site = "corpora/_test/mcp-dirty";
  const call = (id: number, name: string, args: object = {}) => req(id, "tools/call", { name, arguments: args });

  beforeAll(async () => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(`${site}/content/posts`, { recursive: true });
    writeFileSync(`${site}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    const { git, initRepo } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });   // guarded: never inits into the enclosing repo
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init");
    // Somebody else's uncommitted work, sitting in the tree — exactly what `init` used to leave behind.
    writeFileSync(`${site}/notes.md`, "half-written, not ours to carry onto a draft branch\n");
  });

  test("a dirty tree refuses the create, and writes no file and no index row", async () => {
    const [, created, queried] = await session([
      req(1, "initialize"),
      call(2, "content.create", { type: "post", frontmatter: { title: "Stranded" }, body: "Nothing should survive this call.\n" }),
      call(3, "content.query", { type: "post" }),
    ], site);

    expect(created.result.isError).toBe(true);
    expect(created.result.content[0].text).toContain("refusing to switch");
    expect(existsSync(`${site}/content/posts/stranded.md`)).toBe(false);
    expect(queried.result.structuredContent).toMatchObject({ ok: true, total: 0 });   // the index never saw it either
    // Still on the branch it started on: a refusal that moved the tree would be its own surprise.
    const { git } = await import("@snypd/core");
    expect(git(site, "symbolic-ref", "--short", "HEAD").stdout).toBe("main");
  });

  test("committing the foreign work unblocks the same call, unchanged", async () => {
    const { git } = await import("@snypd/core");
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "notes");
    const [, created] = await session([
      req(1, "initialize"),
      call(2, "content.create", { type: "post", frontmatter: { title: "Stranded" }, body: "Now it lands.\n" }),
    ], site);
    expect(created.result.isError).toBeUndefined();
    expect(created.result.structuredContent).toMatchObject({ ok: true, slug: "stranded" });
    expect(created.result.structuredContent.git).toMatchObject({ committed: true, branch: "snypd/drafts", base: "main" });
  });
});

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

/**
 * The first run, from the side the agent is standing on (S18d, docs/08 §8).
 *
 * Four surfaces carry onboarding and three of them are strings: `initialize`'s `instructions`, `site` ›
 * init's return text, the `get-started` prompt, and `site` › doctor. A string is exactly the kind of
 * thing that rots silently — `instructions` named `snypd serve --preview` three sessions after the Desk
 * became the page a person reviews on, and `get-started` told everyone who had run `snypd init` to stop.
 * Neither could fail a test, because nothing read them.
 *
 * These run against a directory with no config, which is the state `bun test` otherwise never enters
 * (docs/08 §1). It is not the binary and it is not empty of a workspace — decision 55 is right that only
 * `packages/bench/smoke/` can make the full claim — but the surfaces asserted here are strings and
 * branches, and this is where they are cheap to hold still.
 */
describe("the first run, from the agent's side", () => {
  const site = "corpora/_test/mcp-first-run";
  const call = (id: number, name: string, args: object = {}) => req(id, "tools/call", { name, arguments: args });
  const structured = (m: any) => m.result.structuredContent;

  beforeAll(async () => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(site, { recursive: true });
    const { initRepo, git } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });   // the enclosing repo is a checkout: never `git init` into it
    writeFileSync(`${site}/.gitkeep`, "");
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init");
  });

  test("`initialize` names the prompt that carries a new site to its first post", async () => {
    const [init] = await session([req(1, "initialize")], site);
    const s = init.result.instructions as string;
    // The one surface guaranteed to reach the agent on every session start, before any tool call — and
    // the only thing on the far side of a restart that destroyed the context `init` printed into.
    expect(s).toContain("get-started");
    expect(s).toContain("snypd://spec/primitives");
    expect(s).toContain("/_snypd");
    expect(s).not.toContain("--preview");   // the review page has a name; this used to point past it
  });

  test("`get-started` branches on what the site already is, and never tells a scaffolded one to stop", async () => {
    const [, p] = await session([req(1, "initialize"), req(2, "prompts/get", { name: "get-started" })], site);
    const s = p.result.messages[0].content.text as string;
    // Branch B is the majority path — restarted harness, config that loads, nothing written — and the
    // version before this session ended it at step 1 with the word "stop".
    expect(s).toContain("content.query");
    expect(s).toContain("zero items");
    expect(s).toContain("Do not run init");
    expect(s).toContain("content.render_preview");
    // …and it does not ask for a URL up front on the branch that creates a site, because init no longer
    // needs one (decision 63) and asking for a production domain before the first pixel is the defect.
    expect(s).toContain("Do **not** ask for the URL");
  });

  test("`site` › init takes no arguments, and the text it returns is addressed to the agent", async () => {
    const [, init] = await session([req(1, "initialize"), call(2, "site", { action: "init" })], site);
    expect(init.result.isError).toBeUndefined();
    expect(structured(init)).toMatchObject({ ok: true, git: true, placeholderUrl: true, name: "mcp-first-run" });
    const s = init.result.content[0].text as string;
    expect(s).toContain("placeholder");
    expect(s).toContain("Do not ask for it yet.");           // the URL is due at publish, and only there
    expect(s).toContain("snypd://spec/primitives");          // what to do next, not what was done
  });

  test("`doctor` answers the facts the Desk renders, including the ones nothing could reach before", async () => {
    const [, doc] = await session([req(1, "initialize", { clientInfo: { name: "an-editor", version: "0" } }), call(2, "site", { action: "doctor" })], site);
    const s = doc.result.content[0].text as string;
    // Decision 64: one implementation of the derived facts, two renderings. The structured half is what
    // S18f's checklist reads, so it is asserted as data rather than as prose.
    expect(structured(doc).facts).toMatchObject({ config: true, theme: true, git: true, registered: true, harness: true, items: 0, placeholderUrl: true });
    expect(structured(doc).facts.client).toBe("an-editor");   // `initialize` said who it was; doctor says so back
    // S18f: the facts come from `.snypd/activity.json` now, not from this process's memory, so doctor
    // and a Desk in a different process cannot disagree. `startedAt` is the second field, and the one
    // that separates docs/08 §10's two silences.
    expect(structured(doc).facts.harnessState).toBe("connected");
    expect(structured(doc).facts.startedAt).toBeGreaterThan(0);
    expect(s).toContain("an-editor");                        // two editors on one repo is the ordinary case
    expect(s).toContain("registered in .mcp.json");
    expect(s).toContain("a harness is connected");
    expect(s).toContain("no content yet");
    expect(s).toContain("a placeholder");
    // Broken and unfinished are different things: a scaffold with no content and no origin yet is the
    // product working, two minutes in. "nothing to fix" under two ⚠ rows read as though they did not count.
    // S18e adds the fifth derived fact — is a preview already serving this site (decision 64's rule:
    // nothing on the Desk that doctor cannot answer). Nothing is running in a test, so it is a ⚠.
    expect(s).toContain("no preview server");
    // S19a adds the sixth: where does this site go when it goes live. A repo with no remote is the
    // ordinary state of a site somebody is still writing, so it is a ⚠ and never a problem — and it is
    // the fourth unfinished thing on a two-minute-old scaffold.
    expect(s).toContain("no remote");
    expect(structured(doc).facts.push).toMatchObject({ branch: "main", ahead: 0, known: false, ready: false });
    expect(s).toContain("nothing broken — 4 things still unfinished");
  });

  /**
   * S19a′: the gap the majority path had. `bunx @snypd/cli init` with no flags is docs/08 §2's first run,
   * and it produces a site with no host config — which `init` can then never add, because it refuses a
   * directory that already has a `snypd.yaml`. That refusal is right; the missing verb was the defect.
   */
  test("`site` › set_deploy gives an already-initialised site a host, and never overwrites one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snypd-deploy-"));
    const c = await import("@snypd/core");
    c.initSite(dir, { name: "No Host Yet", url: "https://nohost.example" });      // exactly the no-flags first run
    c.initRepo(dir, { name: "T", email: "t@example.com" });
    c.git(dir, "add", "-A"); c.git(dir, "commit", "-q", "-m", "init");
    expect(existsSync(join(dir, "wrangler.toml"))).toBe(false);
    // And the only other way in is shut: this is the refusal that made the verb necessary.
    expect(() => c.initSite(dir, { name: "x", deploy: "cloudflare" })).toThrow(/already exists/);

    const [, added] = await session([req(1, "initialize"), call(2, "site", { action: "set_deploy", deploy: "cloudflare" })], dir);
    expect(added.result.isError).toBeUndefined();
    expect(structured(added)).toMatchObject({ ok: true, deploy: "cloudflare", changed: true });
    expect(readFileSync(join(dir, "wrangler.toml"), "utf8")).toContain('directory = "./dist"');
    expect(existsSync(join(dir, ".github/workflows/snypd.yml"))).toBe(true);
    // It lands on the base rather than sitting on the drafts branch (decision 43): a host config is not
    // a draft, and a push that did not carry it would build the site with no build command.
    expect(c.git(dir, "log", "-1", "--format=%s", "main").stdout).toBe("site: deploy cloudflare");
    expect(c.git(dir, "ls-tree", "main", "--name-only", "wrangler.toml").stdout).toBe("wrangler.toml");

    // Second call: a `wrangler.toml` in a repo is somebody's, so this reports rather than resets.
    writeFileSync(join(dir, "wrangler.toml"), "# hand-tuned\n");
    const [, again] = await session([req(1, "initialize"), call(2, "site", { action: "set_deploy", deploy: "cloudflare" })], dir);
    expect(structured(again)).toMatchObject({ ok: true, changed: false });
    expect(readFileSync(join(dir, "wrangler.toml"), "utf8")).toBe("# hand-tuned\n");
  });

  /**
   * S19a, decision 44: the asymmetry is the feature. An agent can ask for a push and cannot make one, so
   * what this asserts is a *refusal that is useful* — the state, what would go, and the URL of the button
   * a person clicks — and that nothing left the machine.
   */
  test("`site` › push tells the agent where the button is and does not press it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snypd-push-"));
    const remote = mkdtempSync(join(tmpdir(), "snypd-push-remote-"));
    const c = await import("@snypd/core");
    c.initSite(dir, { name: "Pushable", url: "https://pushable.example" });
    c.initRepo(dir, { name: "T", email: "t@example.com" });
    c.git(dir, "add", "-A"); c.git(dir, "commit", "-q", "-m", "init");
    c.git(remote, "init", "-q", "--bare", "-b", "main");
    c.git(dir, "remote", "add", "origin", remote);

    const [, asked] = await session([req(1, "initialize"), call(2, "site", { action: "push" })], dir);
    const s = asked.result.content[0].text as string;
    expect(asked.result.isError).toBeUndefined();
    expect(structured(asked)).toMatchObject({ ok: true, pushed: false, ready: true, branch: "main", known: false });
    expect(s).toContain("a person's to make");
    expect(s).toContain("_snypd");                       // where the button is
    expect(s).toContain("main → origin");
    // The number that was wrong the first time this ran against a real site: the tool said "0 drafts in
    // flight stay local" while three sat in the tree. A sentence about what does *not* go public may not
    // be wrong in the reassuring direction.
    c.createContent(dir, { type: "post", slug: "not-going", frontmatter: { title: "Not going" }, body: "Words." });
    const [, withDraft] = await session([req(1, "initialize"), call(2, "site", { action: "push" })], dir);
    expect(structured(withDraft).drafts).toBe(1);
    expect(withDraft.result.content[0].text as string).toContain("1 draft in flight stays local");
    // The remote heard nothing: this tool has no push in it, only the sentence that says who does.
    expect(c.git(remote, "for-each-ref", "--format=%(refname)").stdout).toBe("");
  });

  test("the placeholder comes due exactly once, at publish, and the refusal changes when it is fixed", async () => {
    const [, , created, refused] = await session([
      req(1, "initialize"),
      call(2, "content.create", { type: "post", frontmatter: { title: "First" }, body: "Words enough to be a post.\n" }),
      call(3, "content.query", { type: "post" }),
      call(4, "content.publish", { type: "post", slug: "first" }),
    ], site);
    // Drafting is not blocked by the placeholder — that is the half of the bargain that makes deferring
    // the question tolerable at all.
    expect(created.result.isError).toBeUndefined();
    expect(refused.result.isError).toBe(true);
    expect(refused.result.content[0].text).toContain("placeholder");
    expect(refused.result.content[0].text).toContain("site.url");

    const [, set, stillRefused] = await session([
      req(1, "initialize"),
      call(2, "site", { action: "set_config", path: "site.url", value: "https://first-run.example" }),
      call(3, "content.publish", { type: "post", slug: "first" }),
    ], site);
    expect(set.result.isError).toBeUndefined();
    // Now the refusal is the *other* one — the approval a human owes, which is the product working
    // rather than a setup step. A single message that changes from one to the other is the whole test.
    expect(stillRefused.result.isError).toBe(true);
    expect(stillRefused.result.content[0].text).not.toContain("placeholder");
    expect(stillRefused.result.content[0].text).toContain("needs a human");
  });
});
