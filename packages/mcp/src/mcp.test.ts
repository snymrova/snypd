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
    expect(templates.result.resourceTemplates.map((t: any) => t.uriTemplate)).toEqual(["snypd://content/{type}/{slug}", "snypd://history/{type}/{slug}", "snypd://lint/{type}/{slug}", "snypd://{plugin}/last"]);
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

  /**
   * The default path since S19c (decision 80): an agent writes a post and publishes it, and no part of
   * that waits for a person. The approval flow is not gone — it is opt-in, and the test below this one
   * is it, declaring `mcp.write: draft` the way a site that wants a reviewer would.
   */
  test("create → query → lint → publish: an agent takes a post all the way, alone", async () => {
    const [, created, dupe, queried, linted, published, again] = await session([
      req(1, "initialize"),
      call(2, "content.create", { type: "post", frontmatter: { title: "Why MCP only", description: "A short answer." }, body: "## Why\n\nBecause the surface is the product.\n" }),
      call(3, "content.create", { type: "post", slug: "why-mcp-only", frontmatter: { title: "Again" } }),
      call(4, "content.query", { type: "post" }),
      call(5, "content.lint", { type: "post", slug: "why-mcp-only" }),
      call(6, "content.publish", { type: "post", slug: "why-mcp-only" }),
      call(7, "content.publish", { type: "post", slug: "why-mcp-only" }),
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

    // No approval, no refusal, no URL to hand anybody.
    expect(published.result.isError).toBeUndefined();
    expect(structured(published)).toMatchObject({ ok: true, status: "published" });
    expect(structured(published).git).toMatchObject({ landed: true, base: "main" });
    const c = await import("@snypd/core");
    const t = c.target(site, c.loadConfig(site), "post", "why-mcp-only");
    expect(readFileSync(t.file, "utf8")).toContain("status: published");
    // S17b: publishing lands a path on `main` and leaves the tree on the drafts branch, where the next
    // write goes and where every other draft still is. A checkout here is what used to make them vanish.
    expect(c.git(site, "rev-parse", "--abbrev-ref", "HEAD").stdout).toBe("snypd/drafts");
    expect(c.git(site, "ls-tree", "main", "--name-only", "content/posts/").stdout).toBe("content/posts/why-mcp-only.md");
    // Publishing twice is a no-op rather than an error: under `draft` policy the second call failed
    // because the approval was spent, and there is no approval to spend here.
    expect(again.result.isError).toBeUndefined();
  });

  test("a type whose policy is `draft` still refuses without a human, and merges after approval", async () => {
    const reviewed = "corpora/_test/mcp-site-draft";
    rmSync(reviewed, { recursive: true, force: true });
    mkdirSync(`${reviewed}/content/posts`, { recursive: true });
    writeFileSync(`${reviewed}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\ntypes: { post: { mcp: { write: draft } } }\n");
    const c = await import("@snypd/core");
    c.initRepo(reviewed, { name: "T", email: "t@example.com" });
    c.git(reviewed, "add", "-A"); c.git(reviewed, "commit", "-q", "-m", "init");

    const [, , refused] = await session([
      req(1, "initialize"),
      call(2, "content.create", { type: "post", slug: "needs-a-read", frontmatter: { title: "Needs a read" }, body: "Words enough to be a post.\n" }),
      call(3, "content.publish", { type: "post", slug: "needs-a-read" }),
    ], reviewed);
    expect(refused.result.isError).toBe(true);
    expect(structured(refused).hint).toContain("/_snypd/review/post/needs-a-read");
    // S18e: the hint names the call that turns that path into a URL a person can open. It used to name
    // `snypd serve --preview`, a command the agent cannot run and the human no longer needs to type.
    expect(structured(refused).hint).toContain("content.render_preview");
    expect(structured(refused).hint).not.toContain("--preview");

    // the human approves the exact version on the review page (the preview server calls the same function)
    const cfg = c.loadConfig(reviewed);
    const t = c.target(reviewed, cfg, "post", "needs-a-read");
    c.approve(c.approvals(reviewed), { type: "post", slug: "needs-a-read", hash: c.contentHash(readFileSync(t.file, "utf8")), by: "sunny", at: new Date().toISOString() });

    const [, published, again] = await session([req(1, "initialize"), call(2, "content.publish", { type: "post", slug: "needs-a-read" }), call(3, "content.publish", { type: "post", slug: "needs-a-read" })], reviewed);
    expect(structured(published)).toMatchObject({ ok: true, status: "published" });
    expect(structured(published).git).toMatchObject({ landed: true, base: "main" });
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
    expect(structured(unmatched).available).toEqual(["theme", "site", "bench", "content.explain"]);
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
    const [, init, dupeInit, renamed, bad, explained, unknownToken, hostileToken, redirected, loop, scaffolded, activated] = await session([
      req(1, "initialize"),
      call(2, "site", { action: "init", name: "S16", url: "https://s16.example", description: "A test." }),
      call(3, "site", { action: "init", name: "again", url: "https://s16.example" }),
      call(4, "site", { action: "set_config", path: "site.name", value: "S16 renamed" }),
      call(5, "site", { action: "set_config", path: "site.url", value: "not a url" }),
      call(6, "site", { action: "explain_config", path: "site.name" }),
      call(7, "theme", { action: "set_tokens", tokens: { "color.nope": "#000" } }),
      // H0 / E5: two tokens, the second refused. The first must not be written either.
      call(71, "theme", { action: "set_tokens", tokens: { "color.accent": "#123456", "color.bg": "#fff } html { display: none" } }),
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

    expect(hostileToken.result.isError).toBe(true);
    expect(hostileToken.result.content[0].text).toContain("color.bg");
    expect(hostileToken.result.content[0].text).toContain("Nothing was written");
    expect(readFileSync(`${site}/snypd.yaml`, "utf8")).not.toContain("#123456");   // not even the good one

    expect(structured(redirected)).toMatchObject({ from: "/posts/old", to: "/posts/new" });
    expect(loop.result.isError).toBe(true);
    expect(loop.result.content[0].text).toContain("loop");

    expect(structured(scaffolded)).toMatchObject({ theme: "scratchy", extends: "editorial" });
    expect(readFileSync(`${site}/themes/scratchy/theme.yaml`, "utf8")).toContain("extends: editorial");
    expect(structured(activated)).toMatchObject({ theme: "scratchy", from: "editorial", changed: true });
  });

  test("U2: set_nav writes the menu, commits it, refuses a dead ref, and snypd://nav reads it back", async () => {
    const site = "corpora/_test/mcp-nav";
    rmSync(site, { recursive: true, force: true }); mkdirSync(site, { recursive: true });
    const { initRepo } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });
    const [, , written, again, dead, badLoc, resource, doctor, removed] = await session([
      req(1, "initialize"),
      call(0, "site", { action: "init", name: "Nav", url: "https://nav.example" }),
      call(2, "site", { action: "set_nav", location: "header", items: [{ label: "Home", ref: "/" }, { label: "GitHub", url: "https://github.com/x", rel: "external" }] }),
      call(3, "site", { action: "set_nav", location: "header", items: [{ label: "Home", ref: "/" }, { label: "GitHub", url: "https://github.com/x", rel: "external" }] }),
      call(4, "site", { action: "set_nav", location: "footer", items: [{ label: "About", ref: "page/about" }] }),
      call(5, "site", { action: "set_nav", location: "sidebar", items: [] }),
      req(6, "resources/read", { uri: "snypd://nav" }),
      call(7, "site", { action: "doctor" }),
      call(8, "site", { action: "set_nav", location: "header", items: null }),
    ], site);
    expect(structured(written)).toMatchObject({ ok: true, changed: true, location: "header", file: "content/nav/header.yaml", links: [{ label: "Home", href: "/" }, { label: "GitHub", href: "https://github.com/x", rel: "external" }] });
    expect(written.result.content[0].text).toContain("committed");
    expect(structured(again)).toMatchObject({ ok: true, changed: false });
    expect(dead.result.isError).toBe(true);
    expect(dead.result.content[0].text).toContain("`About` → `page/about`");
    expect(existsSync(`${site}/content/nav/footer.yaml`)).toBe(false);
    expect(badLoc.result.isError).toBe(true);
    expect(badLoc.result.content[0].text).toContain("`header` and `footer`");
    expect(resource.result.contents[0].text).toContain("locations: [header, footer]");
    expect(resource.result.contents[0].text).toContain('{ label: "Home", ref: "/" }   # → /');
    expect(doctor.result.content[0].text).toContain("menus: header 2 items, footer none");
    expect(structured(removed)).toMatchObject({ ok: true, changed: true });
    expect(existsSync(`${site}/content/nav/header.yaml`)).toBe(false);
  });

  test("U3: set_settings writes what the theme declared, refuses what it did not, and snypd://theme/settings reads it back", async () => {
    const site = "corpora/_test/mcp-settings";
    rmSync(site, { recursive: true, force: true }); mkdirSync(site, { recursive: true });
    const { initRepo } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });
    const [, , listed, unset, written, unknown, wrongType, refusedSelect, set, doctor, back] = await session([
      req(1, "initialize"),
      call(0, "site", { action: "init", name: "Set", url: "https://set.example", theme: "editorial" }),
      req(2, "resources/list"),
      req(3, "resources/read", { uri: "snypd://theme/settings" }),
      call(4, "theme", { action: "set_settings", settings: { tagline: "Notes on building", dateFormat: "long" } }),
      call(5, "theme", { action: "set_settings", settings: { tagLine: "typo" } }),
      call(6, "theme", { action: "set_settings", settings: { showDates: "yes" } }),
      call(7, "theme", { action: "set_settings", settings: { dateFormat: "medium" } }),
      req(8, "resources/read", { uri: "snypd://theme/settings" }),
      call(9, "site", { action: "doctor" }),
      call(10, "theme", { action: "set_settings", settings: { dateFormat: null } }),
    ], site);

    // A resource, so it is free until read (T2) — and listed only by a theme that has some to offer.
    expect(listed.result.resources.map((r: any) => r.uri)).toContain("snypd://theme/settings");
    expect(unset.result.contents[0].text).toContain("6 declared, 0 set here");
    expect(unset.result.contents[0].text).toContain("type: select [iso, long, short]");

    expect(structured(written)).toMatchObject({ ok: true, settings: { tagline: "Notes on building", dateFormat: "long" } });
    expect(written.result.content[0].text).toContain("dateFormat: \"iso\" → \"long\"");
    expect(written.result.content[0].text).toContain("committed");
    expect(readFileSync(`${site}/snypd.yaml`, "utf8")).toContain("tagline: Notes on building");

    // An id the theme does not declare, and a value of the wrong shape: both refused, and the second is
    // the thing `set_tokens` could never check, because a token has no declared type and a setting does.
    expect(unknown.result.isError).toBe(true);
    expect(unknown.result.content[0].text).toContain("unknown setting: tagLine");
    expect(unknown.result.content[0].text).toContain("showDates (boolean)");
    expect(wrongType.result.isError).toBe(true);
    expect(wrongType.result.content[0].text).toContain("showDates: expected true or false");
    expect(refusedSelect.result.content[0].text).toContain("expected one of iso | long | short");
    expect(readFileSync(`${site}/snypd.yaml`, "utf8")).not.toContain("showDates");   // nothing was written

    expect(set.result.contents[0].text).toContain("6 declared, 2 set here");
    expect(set.result.contents[0].text).toContain("value: \"long\"   # set in snypd.yaml");
    expect(doctor.result.content[0].text).toContain("settings: 6 declared by `editorial`, 2 set (tagline, dateFormat)");

    // null is the way back to the theme's default, as it is for a token.
    expect(back.result.content[0].text).toContain("dateFormat: \"long\" → \"iso\" (default)");
    expect(readFileSync(`${site}/snypd.yaml`, "utf8")).not.toContain("dateFormat");

    // On to `base`, which declares none: the resource is not listed, the tool says what the theme does
    // have instead of failing blankly, and the value left behind is a warning with a way to remove it.
    const [, , baseList, noSettings, baseDoctor] = await session([
      req(1, "initialize"),
      call(2, "theme", { action: "set", name: "base" }),
      req(3, "resources/list"),
      call(4, "theme", { action: "set_settings", settings: { tagline: "x" } }),
      call(5, "site", { action: "doctor" }),
    ], site);
    expect(baseList.result.resources.map((r: any) => r.uri)).not.toContain("snypd://theme/settings");
    expect(noSettings.result.isError).toBe(true);
    expect(noSettings.result.content[0].text).toContain("theme `base` declares no settings");
    expect(noSettings.result.content[0].text).toContain("set_tokens");
    expect(baseDoctor.result.content[0].text).toContain("1 setting value `base` does not declare, left by another theme: tagline");
    expect(baseDoctor.result.content[0].text).not.toContain("settings: 0 declared");
  });

  /**
   * D10 (docs/10 §7.1): a plugin in a site's own `plugins/` dir — not bundled, not on npm — loads by the
   * same path and passes the same gates, and `snypd://plugins` names its source as `plugins/`. Doctor
   * prints one row per plugin, and a refused one is a problem carrying its own diagnostic.
   */
  test("P1: snypd://plugins names a site-local plugin's source, doctor prints a row per plugin, and a refused plugin is a problem", async () => {
    const site = "corpora/_test/mcp-plugins";
    rmSync(site, { recursive: true, force: true }); mkdirSync(join(site, "plugins/local"), { recursive: true });
    const { initRepo } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });
    writeFileSync(join(site, "plugins/local/snypd.yaml"), "plugin:\n  name: local\n  version: 0.0.1\n  api: 1\n  description: A plugin that lives in this site.\n  options: { type: object, required: [greeting], properties: { greeting: { type: string } } }\ntaxonomies:\n  topic: { attaches: [post] }\n");
    const [, , list, plugins, doctor, cfg] = await session([
      req(1, "initialize"),
      call(0, "site", { action: "init", name: "Plug", url: "https://plug.example" }),
      req(2, "resources/list"),
      req(3, "resources/read", { uri: "snypd://plugins" }),
      call(4, "site", { action: "doctor" }),
      req(5, "resources/read", { uri: "snypd://config" }),
    ], site);
    expect(list.result.resources.map((r: any) => r.uri)).toContain("snypd://plugins");
    // a fresh site: none enabled, and the bundled set is one line away
    expect(plugins.result.contents[0].text).toContain("plugins: {}   # none — `plugins: [changelog]` in snypd.yaml enables a bundled one, no install");
    expect(plugins.result.contents[0].text).toContain("bundled: [analytics, autolink, changelog, indexnow]");
    expect(doctor.result.content[0].text).not.toContain("plugin `");

    // enable the bundled one and the local one, the local one with bad options
    writeFileSync(join(site, "snypd.yaml"), readFileSync(join(site, "snypd.yaml"), "utf8") + "plugins:\n  - changelog\n  - local: { greetings: hi }\n");
    const [, plugins2, doctor2] = await session([
      req(1, "initialize"),
      req(2, "resources/read", { uri: "snypd://plugins" }),
      call(3, "site", { action: "doctor" }),
    ], site);
    const text = plugins2.result.contents[0].text as string;
    expect(text).toContain("  changelog:\n    version: \"0.1.0\"");
    expect(text).toContain("contributes: { types: [release], taxonomies: [product] }");
    expect(text).toContain("  local:\n    version: \"0.0.1\"\n    from: plugins/local\n    does: []");
    expect(text).toContain("status: refused — options do not validate");
    expect(text).toMatch(/error: plugins\[local\]\.greeting: .*\(snypd\.yaml:\d+\)/);
    const d = doctor2.result.content[0].text as string;
    expect(d).toContain("✅ plugin `changelog` 0.1.0 declares (");
    expect(d).toContain("❌ plugin `local` not loaded — options do not validate");
    expect(structured(doctor2).ok).toBe(false);
    expect(structured(doctor2).problems.join("\n")).toContain("plugins[local].greeting");

    // fix the options: loaded, and the site's config carries its taxonomy with provenance
    writeFileSync(join(site, "snypd.yaml"), readFileSync(join(site, "snypd.yaml"), "utf8").replace("greetings: hi", "greeting: hi"));
    const [, plugins3, doctor3, cfg3] = await session([
      req(1, "initialize"),
      req(2, "resources/read", { uri: "snypd://plugins" }),
      call(3, "site", { action: "doctor" }),
      req(4, "resources/read", { uri: "snypd://config" }),
    ], site);
    expect(plugins3.result.contents[0].text).toContain("  local:\n    version: \"0.0.1\"\n    from: plugins/local\n    does: [declares]");
    expect(plugins3.result.contents[0].text).toContain('options: {"greeting":"hi"}');
    expect(doctor3.result.content[0].text).toContain("✅ plugin `local` 0.0.1 declares (plugins/local)");
    expect(structured(doctor3).ok).toBe(true);
    expect(cfg3.result.contents[0].text).toContain("plugin local (plugins/local/snypd.yaml) — 0.0.1, plugins/local, declares");
    expect(cfg3.result.contents[0].text).toContain("topic: # ← plugins/local/snypd.yaml:8");
    void cfg;

    // P2: enable `analytics` — the beacon the site has not paid for is refused with the remedy, and doctor
    // says so; afford it and doctor prints the hooks it fills and the bytes it declares, and the resource
    // prints the hook table — every slot and filter with who fills it, in order (docs/09 §4.4 rule 3).
    writeFileSync(join(site, "snypd.yaml"), readFileSync(join(site, "snypd.yaml"), "utf8").replace("  - changelog\n", "  - changelog\n  - analytics: { provider: plausible }\n"));
    const [, doctor4] = await session([req(1, "initialize"), call(2, "site", { action: "doctor" })], site);
    const d4 = doctor4.result.content[0].text as string;
    expect(d4).toContain("❌ plugin `analytics` not loaded — over the client JS budget (3 KB asked, 0 KB left)");
    expect(structured(doctor4).problems.join("\n")).toContain("Set bench.budgets.jsKb: 3 to afford it, or remove the plugin");
    writeFileSync(join(site, "snypd.yaml"), readFileSync(join(site, "snypd.yaml"), "utf8") + "bench: { budgets: { jsKb: 3 } }\n");
    const [, plugins5, doctor5, built] = await session([
      req(1, "initialize"),
      req(2, "resources/read", { uri: "snypd://plugins" }),
      call(3, "site", { action: "doctor" }),
      call(4, "site", { action: "build" }),
    ], site);
    const d5 = doctor5.result.content[0].text as string;
    expect(d5).toContain("✅ plugin `analytics` 0.1.0 decorates (");
    expect(d5).toContain(") — slots head, body-end · client 3 KB");
    expect(d5).toContain("✅ client JS: 3 KB declared by plugins, 3 KB afforded (bench.budgets.jsKb)");
    const t5 = plugins5.result.contents[0].text as string;
    expect(t5).toContain("    slots: { head: ./slots/head.tsx, body-end: ./slots/beacon.tsx }");
    expect(t5).toContain("  slots: { head: [analytics], body-start: [], before-content: [], after-content: [], footer-end: [], body-end: [analytics] }");
    expect(t5).toContain("client: { declared: 3, budget: 3 }");
    expect(structured(built)).toMatchObject({ ok: true, hooks: { plugins: ["analytics"], diagnostics: [] } });
    expect(readFileSync(join(site, "dist/index.html"), "utf8")).toContain('<script defer src="https://plausible.io/js/script.js" data-domain="plug.example"></script>');
  });

  test("P3: a publish fires the plugins that listen and the result says what they said; doctor and snypd://plugins print stages, events, prefixes and hosts; a build emits through core", async () => {
    const site = "corpora/_test/mcp-p3";
    rmSync(site, { recursive: true, force: true }); mkdirSync(join(site, "plugins/hello"), { recursive: true });
    const { initRepo } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });
    writeFileSync(join(site, "plugins/hello/snypd.yaml"), "plugin:\n  name: hello\n  version: 0.0.1\n  api: 1\n  capabilities: { network: [example.com], emit: [hello/] }\n  stages: { transform: ./t.ts, emit: ./e.ts }\n  events: { publish: ./p.ts }\n");
    writeFileSync(join(site, "plugins/hello/t.ts"), "export default (root) => { root.children.push({ type: 'paragraph', children: [{ type: 'text', value: '— hello was here' }] }); };\n");
    writeFileSync(join(site, "plugins/hello/e.ts"), "export default () => [{ path: 'hello/marker.txt', bytes: 'hi' }, { path: 'index.html', bytes: 'evil' }];\n");
    writeFileSync(join(site, "plugins/hello/p.ts"), "export default (item, ctx) => `saw ${item.url} land on ${item.base} (${ctx.plugin} may fetch ${ctx.config.plugins.length} plugins' worth of nothing)`;\n");
    await session([req(1, "initialize"), call(0, "site", { action: "init", name: "P3", url: "https://p3.example" })], site);
    writeFileSync(join(site, "snypd.yaml"), readFileSync(join(site, "snypd.yaml"), "utf8") + "plugins:\n  - autolink\n  - hello\n");
    const { git } = await import("@snypd/core");
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init with plugins");   // a clean tree, so the drafts branch can be entered
    const [, plugins, doctor, created, published, built] = await session([
      req(1, "initialize"),
      req(2, "resources/read", { uri: "snypd://plugins" }),
      call(3, "site", { action: "doctor" }),
      call(4, "content.create", { type: "post", frontmatter: { title: "Hello", tags: ["snypd"] }, body: "We like snypd, and we say hello.\n" }),
      call(5, "content.publish", { type: "post", slug: "hello" }),
      call(6, "site", { action: "build" }),
    ], site);
    const t = plugins.result.contents[0].text as string;
    expect(t).toContain("  autolink:\n    version: \"0.1.0\"");
    expect(t).toContain("    stages: { transform: ./transform.ts }");
    expect(t).toContain("    stages: { transform: ./t.ts, emit: ./e.ts }   # writes under hello/");
    expect(t).toContain("    events: { publish: ./p.ts }   # may fetch example.com");
    expect(t).toContain("  stages: { transform: [autolink, hello], emit: [hello] }");
    expect(t).toContain("  events: { publish: [hello], push: [] }");
    const d = doctor.result.content[0].text as string;
    expect(d).toContain("✅ plugin `autolink` 0.1.0 transforms (");
    expect(d).toContain(") — stages transform");
    expect(d).toContain("✅ plugin `hello` 0.0.1 transforms + reacts (plugins/hello) — stages transform, emit; events publish · writes hello/ · fetches example.com");
    expect(structured(doctor).ok).toBe(true);
    expect(structured(created)).toMatchObject({ ok: true, slug: "hello" });
    // the publish: landed, then the listener heard about it — a line in the result and a row in the structured answer
    const p = published.result.content[0].text as string;
    expect(p).toContain("published post/hello → /posts/hello");
    expect(p).toContain("✓ hello on publish: saw https://p3.example/posts/hello/ land on main (hello may fetch 2 plugins' worth of nothing)");
    expect(structured(published).events).toEqual([expect.objectContaining({ plugin: "hello", event: "publish", ok: true })]);
    expect(existsSync(join(site, ".snypd/events.json"))).toBe(true);
    // the build: the transform reached the page, autolink linked the tag, the emit wrote under its prefix and was refused the page
    expect(structured(built)).toMatchObject({ ok: true, emitted: 1, hooks: { plugins: ["autolink", "hello"] } });
    expect(built.result.content[0].text).toContain("(1 emitted by plugins)");
    expect(built.result.content[0].text).toContain("⚠ plugin hello stages.emit on /index.html: index.html: outside the plugin's emit prefix hello/ (capabilities.emit in its snypd.yaml); not written");
    const html = readFileSync(join(site, "dist/posts/hello/index.html"), "utf8");
    expect(html).toContain("— hello was here");
    expect(html).toContain('<a href="/tag/snypd/">snypd</a>');
    expect(readFileSync(join(site, "dist/hello/marker.txt"), "utf8")).toBe("hi");
    expect(readFileSync(join(site, "dist/index.html"), "utf8")).not.toBe("evil");
  });

  test("P4: a plugin's tool is found, never listed, and callable; its prompt is namespaced; snypd://<plugin>/last is its own rows; content.explain says what ran", async () => {
    const site = "corpora/_test/mcp-p4";
    rmSync(site, { recursive: true, force: true }); mkdirSync(join(site, "plugins/speaker"), { recursive: true });
    const { initRepo, git } = await import("@snypd/core");
    initRepo(site, { name: "T", email: "t@example.com" });
    // A site-local plugin, not bundled and not on npm (D10), that speaks: one tool with two verbs and one
    // prompt. `keywords` is what makes it findable in the agent's own words rather than in ours.
    writeFileSync(join(site, "plugins/speaker/snypd.yaml"), "plugin:\n  name: speaker\n  version: 0.0.1\n  api: 1\n  description: Fallback description.\n  tools: ./tools.ts\n  prompts: ./prompts.ts\n");
    writeFileSync(join(site, "plugins/speaker/tools.ts"),
      "export default { description: \"Counts and greets.\", keywords: [\"greet\", \"hello there\", \"count pages\"], actions: [\n" +
      "  { name: \"greet\", description: \"greets whoever is named\", input: { who: { type: \"string\", description: \"`greet`: who\" } }, required: [\"who\"], run: (a, ctx) => `hello ${a.who} from ${ctx.site.name}` },\n" +
      "  { name: \"count\", description: \"counts this site's pages\", run: (_a, ctx) => ({ ok: true, message: `${ctx.pages().length} pages`, data: { pages: ctx.pages().length } }) },\n] };\n");
    writeFileSync(join(site, "plugins/speaker/prompts.ts"),
      "export default { prompts: [{ name: \"walk\", description: \"Walks the tiers.\", arguments: [{ name: \"topic\", required: false }], render: (a, ctx) => `Walk ${a.topic ?? \"the tiers\"} on ${ctx.site.name}.` }] };\n");
    await session([req(1, "initialize"), call(0, "site", { action: "init", name: "P4", url: "https://p4.example" })], site);
    writeFileSync(join(site, "snypd.yaml"), readFileSync(join(site, "snypd.yaml"), "utf8") + "plugins:\n  - autolink\n  - speaker\n  - indexnow: { key: 0123456789abcdef0123456789abcdef }\n");
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init with a plugin that speaks");

    const { CORE_TOOLS } = await import("./tools");
    // filtered by id: `find_tools` announces the list grew, and a notification in the stream would
    // otherwise shift every reply after it by one
    const out = await session([
      req(1, "initialize"),
      req(2, "tools/list"),
      call(3, "find_tools", { query: "ping search engines" }),
      req(4, "tools/list"),
      call(5, "speaker", { action: "greet", who: "tier four" }),
      call(6, "speaker", { action: "shout" }),
      req(7, "prompts/list"),
      req(8, "prompts/get", { name: "speaker.walk", arguments: { topic: "speaking" } }),
      call(9, "content.create", { type: "post", frontmatter: { title: "Speaks", tags: ["snypd"] }, body: "A plugin can speak, and snypd is what it speaks to.\n" }),
      call(10, "content.explain", { type: "post", slug: "speaks" }),
    ], site);
    const [, listed, found, after, called, badAction, prompts, got, created, explained] = out.filter((m: any) => m.id !== undefined);
    expect(out.filter((m: any) => m.method === "notifications/tools/list_changed")).toHaveLength(1);
    const names = (m: any) => m.result.tools.map((t: any) => t.name);

    // **D11, byte for byte.** Three plugins are on, one of which declares a tool, and the surface an
    // agent pays for on every turn is the same object it would have been with none.
    expect(listed.result.tools).toEqual(CORE_TOOLS);
    expect(names(listed)).not.toContain("speaker");
    expect(names(listed)).not.toContain("indexnow");

    // the exit criterion: a plugin's tool competes with the built-ins on the query an agent would type
    expect(structured(found).tools.map((t: any) => t.name)).toEqual(["indexnow"]);
    expect(structured(found).tools[0].inputSchema.properties.action.enum).toEqual(["ping"]);
    expect(found.result.content[0].text).toContain("Added by the `indexnow` plugin");
    // …and only what matched: finding indexnow must not hand over the plugin next to it
    expect(names(after)).toContain("indexnow");
    expect(names(after)).not.toContain("speaker");

    // callable before it was ever listed, exactly as a catalogue tool is; the module's own description wins
    expect(called.result.isError).toBeUndefined();
    expect(called.result.content[0].text).toBe("speaker › greet: hello tier four from P4");
    expect(structured(called)).toMatchObject({ ok: true, plugin: "speaker", action: "greet" });
    // a verb that does not exist is snypd refusing and says what the verbs are — not the plugin answering
    expect(badAction.result.isError).toBe(true);
    expect(badAction.result.content[0].text).toBe('unknown action "shout" for speaker — it has: greet, count');

    // prompts: namespaced, described as the plugin's, and rendered with the site in hand
    const pnames = prompts.result.prompts.map((x: any) => x.name);
    // snypd's two first, then the plugins' in `plugins:` order, each namespaced by its plugin
    expect(pnames).toEqual(["get-started", "write-post", "speaker.walk", "indexnow.get-indexed"]);
    expect(prompts.result.prompts[2].description).toContain("(from the `speaker` plugin)");
    expect(got.result.messages[0].content.text).toBe("Walk speaking on P4.");

    // content.explain: what ran, not what was declared — and the real index is untouched by the scratch build
    expect(structured(created)).toMatchObject({ ok: true, slug: "speaks" });
    const x = explained.result.content[0].text as string;
    expect(x).toContain("post/speaks → /posts/speaks");
    expect(x).toContain("autolink — transforms: stages transform");
    expect(x).toContain("speaker — speaks: tools");
    expect(x).toContain("✎ autolink stages.transform — changed the tree in place");
    expect(x).toContain("✎ indexnow stages.emit → indexnow/0123456789abcdef0123456789abcdef.txt");
    expect(x).toContain("dist/ and the site's index are untouched.");
    expect(structured(explained).ran.map((r: any) => `${r.plugin} ${r.hook}`)).toContain("autolink stages.transform");
    expect(structured(explained).key).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(join(site, "dist"))).toBe(false);   // explaining a post does not build the site

    // doctor names the verbs, not just the word "speaks" — and says why the tool list did not grow
    const [, doctor] = (await session([req(1, "initialize"), call(2, "site", { action: "doctor" })], site)).filter((m: any) => m.id !== undefined);
    const dd = doctor.result.content[0].text as string;
    expect(dd).toContain("✅ plugin `speaker` 0.0.1 speaks (plugins/speaker)");
    expect(dd).toContain("✅ `speaker` speaks: `speaker` › greet · `speaker` › count · prompt speaker.walk — found with find_tools, so tools/list did not grow (D11)");
    expect(dd).toContain("✅ `indexnow` speaks: `indexnow` › ping · prompt indexnow.get-indexed");
    expect(structured(doctor).ok).toBe(true);

    // `snypd://indexnow/last` is listed because indexnow reacts, and reads as the ring's view of it
    const [, res, last, absent] = (await session([
      req(1, "initialize"),
      req(2, "resources/list"),
      req(3, "resources/read", { uri: "snypd://indexnow/last" }),
      req(4, "resources/read", { uri: "snypd://speaker/last" }),
    ], site)).filter((m: any) => m.id !== undefined);
    const uris = res.result.resources.map((r: any) => r.uri);
    expect(uris).toContain("snypd://indexnow/last");
    expect(uris).not.toContain("snypd://autolink/last");   // autolink transforms; it never reacts, so it has no rows
    expect(uris).not.toContain("snypd://speaker/last");
    expect(last.result.contents[0].text).toContain("listens: [push]");
    expect(last.result.contents[0].text).toContain("no event has fired at it yet");
    // A loaded plugin that does not react is not listed — it can write no rows — but reading it answers
    // that question rather than 404ing on it, which is the more useful of the two for whoever asked.
    expect(absent.result.contents[0].text).toContain("listens: []   # nothing — this plugin does not react");
    // a name that is not a plugin of this site is a miss, with the resource that lists them in the message
    const [, missing] = (await session([req(1, "initialize"), req(2, "resources/read", { uri: "snypd://nosuch/last" })], site)).filter((m: any) => m.id !== undefined);
    expect(missing.error.code).toBe(-32002);
    expect(missing.error.message).toContain("snypd://plugins lists this site's");

    // …and with rows in the ring it is the rows, newest first, failures included — the P3 event log read
    // per plugin rather than whole, which is the only place a failed ping is written down
    const { recordEvents } = await import("@snypd/core");
    recordEvents(site, [
      { at: "2026-09-12T10:00:00.000Z", event: "push", plugin: "indexnow", ok: false, message: "api.indexnow.org answered 403 Forbidden for 2 URLs", ms: 91 },
      { at: "2026-09-12T10:05:00.000Z", event: "push", plugin: "autolink", ok: true, message: "not mine", ms: 1 },
      { at: "2026-09-12T10:10:00.000Z", event: "push", plugin: "indexnow", ok: true, message: "pinged api.indexnow.org with 2 URLs (200)", ms: 143 },
    ]);
    const [, rows] = (await session([req(1, "initialize"), req(2, "resources/read", { uri: "snypd://indexnow/last" })], site)).filter((m: any) => m.id !== undefined);
    const r = rows.result.contents[0].text as string;
    expect(r).toContain("the last 2 times an event fired at it");
    expect(r).toContain('message: "pinged api.indexnow.org with 2 URLs (200)"');
    expect(r).toContain('message: "api.indexnow.org answered 403 Forbidden for 2 URLs"');
    expect(r.indexOf("(200)")).toBeLessThan(r.indexOf("403"));   // newest first
    expect(r).not.toContain("not mine");                          // one plugin's own rows, not the ring
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
    // U3: the summary an agent reads at session start says the theme has settings, because a surface
    // nobody can find is a surface nobody uses. One line, and only from a theme that declares some.
    expect(theme.result.contents[0].text).toContain("settings: 6 declared, 0 set here — snypd://theme/settings");
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
    // U2 adds the seventh: the theme renders two menus and the site has written neither yet — the header
    // a visitor sees first is a bare site name until `site` › set_nav. A ⚠ that names the remedy.
    expect(s).toContain("no menus yet");
    expect(s).toContain("nothing broken — 5 things still unfinished");
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
   * S19c, decision 80: `deploy.push` decides, and `agent` is the default. Both halves are asserted here
   * against a bare repo standing in for a host, because the difference between them is whether bytes
   * left the machine — which is not a thing to take a return value's word for.
   */
  test("`site` › push pushes by default, and hands over to a person when the site says `human`", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snypd-push-"));
    const remote = mkdtempSync(join(tmpdir(), "snypd-push-remote-"));
    const c = await import("@snypd/core");
    c.initSite(dir, { name: "Pushable", url: "https://pushable.example" });
    c.initRepo(dir, { name: "T", email: "t@example.com" });
    c.git(dir, "add", "-A"); c.git(dir, "commit", "-q", "-m", "init");
    c.git(remote, "init", "-q", "--bare", "-b", "main");
    c.git(dir, "remote", "add", "origin", remote);

    // The default: it pushes, and the remote has `main` and nothing else afterwards.
    const [, pushed] = await session([req(1, "initialize"), call(2, "site", { action: "push" })], dir);
    expect(pushed.result.isError).toBeUndefined();
    expect(structured(pushed)).toMatchObject({ ok: true, pushed: true, policy: "agent", branch: "main" });
    expect(pushed.result.content[0].text as string).toContain("pushed main → origin");
    expect(c.git(remote, "for-each-ref", "--format=%(refname)").stdout).toBe("refs/heads/main");

    // …and the opt-in: a site that wants a person in the loop gets the S19a shape back.
    const [, , asked] = await session([
      req(1, "initialize"),
      call(2, "site", { action: "set_config", path: "deploy.push", value: "human" }),
      call(3, "site", { action: "push" }),
    ], dir);
    const s = asked.result.content[0].text as string;
    expect(structured(asked)).toMatchObject({ ok: true, pushed: false, policy: "human", ready: true });
    expect(s).toContain("does not push");
    expect(s).toContain("_snypd");                       // where the button is
    expect(s).toContain("main → origin");
    // The number that was wrong the first time this ran against a real site: the tool said "0 drafts in
    // flight stay local" while three sat in the tree. A sentence about what does *not* go public may not
    // be wrong in the reassuring direction.
    c.createContent(dir, { type: "post", slug: "not-going", frontmatter: { title: "Not going" }, body: "Words." });
    const [, withDraft] = await session([req(1, "initialize"), call(2, "site", { action: "push" })], dir);
    expect(structured(withDraft).drafts).toBe(1);
    expect(withDraft.result.content[0].text as string).toContain("1 draft in flight stays local");
    expect(c.git(remote, "for-each-ref", "--format=%(refname)").stdout).toBe("refs/heads/main");
    // Nothing new left the machine on the refused call — the drafts branch in particular.
    expect(c.git(remote, "for-each-ref", "--format=%(refname)").stdout).toBe("refs/heads/main");
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
    // Setting it was the whole debt. Until S19c a second refusal waited behind this one — the approval a
    // human owed — and the test's point was that the message changed from one to the other. Under
    // decision 80 the default type publishes, so the URL is the only thing that was ever owed, and the
    // same call that refused now goes all the way. The renamed variable is the assertion.
    const published = stillRefused;
    expect(published.result.isError).toBeUndefined();
    expect(published.result.content[0].text).not.toContain("placeholder");
    expect(structured(published)).toMatchObject({ ok: true, status: "published" });
  });
});
