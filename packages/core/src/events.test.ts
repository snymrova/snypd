/**
 * Events — fire and report (P3, docs/10 §4.5, decision 87) — and the allowlisted fetch (§4.7).
 *
 * Six plugins listen to `push` on one site, and between them they are every way a handler can behave:
 * one that pings a local server through `ctx.fetch` (allowed host), one that tries the same host with no
 * `network:` (refused before a connection), one that throws, one that never answers (the clock), one that
 * returns something that is not a reply, and the bundled `indexnow`, whose module is also called directly
 * with a fake fetch so the request it builds is checked byte for byte without a network.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config";
import { changedContent, eventLines, fireEvent, hostAllowed, pluginFetch, readEvents, urlOf, type EventCtx, type PushPayload } from "./events";
import { git, initRepo, Repo } from "./git";
import { pushSite } from "./push";
import { createContent, setStatus } from "./write";

const ROOT = "corpora/_test/events";
const REMOTE = "corpora/_test/events-remote.git";

const plugin = (name: string, yaml: string, files: Record<string, string>) => {
  mkdirSync(join(ROOT, "plugins", name), { recursive: true });
  writeFileSync(join(ROOT, "plugins", name, "snypd.yaml"), yaml);
  for (const [f, text] of Object.entries(files)) writeFileSync(join(ROOT, "plugins", name, f), text);
};

describe("events (P3): fire and report, the allowlisted fetch, and what a push tells its listeners", () => {
  let server: ReturnType<typeof Bun.serve>;
  const hits: { path: string; body: unknown }[] = [];
  let port = 0;
  beforeAll(() => {
    server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => { hits.push({ path: new URL(req.url).pathname, body: req.headers.get("content-type")?.includes("json") ? await req.json() : await req.text() }); return new Response("ok", { status: 202 }); } });
    port = server.port!;
  });
  afterAll(() => { server.stop(true); for (const d of [ROOT, REMOTE]) rmSync(d, { recursive: true, force: true }); });

  test("the fetch is the allowlist: exact host or *.host, refused before a connection, and a wall clock", async () => {
    expect(hostAllowed("api.indexnow.org", ["api.indexnow.org"])).toBe(true);
    expect(hostAllowed("API.IndexNow.org", ["api.indexnow.org"])).toBe(true);
    expect(hostAllowed("evil.indexnow.org", ["api.indexnow.org"])).toBe(false);
    expect(hostAllowed("a.b.example.com", ["*.example.com"])).toBe(true);
    expect(hostAllowed("example.com", ["*.example.com"])).toBe(true);
    expect(hostAllowed("notexample.com", ["*.example.com"])).toBe(false);
    expect(hostAllowed("anything", [])).toBe(false);
    const f = pluginFetch({ name: "p", network: ["127.0.0.1"] });
    const r = await f(`http://127.0.0.1:${port}/ping`);
    expect(r.status).toBe(202);
    await expect(pluginFetch({ name: "p", network: ["example.com"] })(`http://127.0.0.1:${port}/x`)).rejects.toThrow("fetch to http://127.0.0.1:" + port + " refused — plugin p declares capabilities.network [example.com]; a host it needs is added there, in the plugin's own snypd.yaml");
    await expect(pluginFetch({ name: "q", network: [] })("https://example.com/")).rejects.toThrow("declares capabilities.network nothing");
    // a URL object and a Request are the same check
    await expect(pluginFetch({ name: "q", network: [] })(new URL("https://example.com/"))).rejects.toThrow("refused");
    await expect(pluginFetch({ name: "q", network: [] })(new Request("https://example.com/"))).rejects.toThrow("refused");
    // the clock: a host that never answers is the fetch's error, under the handler's own clock
    const slow = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Promise<Response>(() => {}) });
    try { await expect(pluginFetch({ name: "p", network: ["127.0.0.1"] }, 60)(`http://127.0.0.1:${slow.port}/`)).rejects.toThrow(); }
    finally { slow.stop(true); }
  });

  test("a push fires `push` at every listener in order; each behaviour is a row and a line, never a failed push", async () => {
    for (const d of [ROOT, REMOTE]) rmSync(d, { recursive: true, force: true });
    mkdirSync(join(ROOT, "content/posts"), { recursive: true });
    writeFileSync(join(ROOT, "snypd.yaml"), `snypd: 1\nsite: { name: E, url: https://e.example }\nplugins:\n  - pinger: { path: /hook }\n  - mute\n  - thrower\n  - sleeper\n  - garbage\n  - stringy\n`);
    plugin("pinger", "plugin: { name: pinger, version: 0.0.1, api: 1, options: { type: object, properties: { path: { type: string } } }, capabilities: { network: [127.0.0.1] }, events: { push: ./push.ts, publish: ./publish.ts } }\n", {
      "push.ts": `export default async (payload, ctx) => { const r = await ctx.fetch("http://127.0.0.1:${port}" + ctx.options.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: ctx.event, plugin: ctx.plugin, site: ctx.site.url, urls: payload.urls, changed: payload.changed.map((c) => [c.path, c.route, c.deleted]), sent: payload.sent, branch: payload.branch }) }); return { ok: r.ok, message: "posted " + payload.urls.length + " urls, got " + r.status }; };\n`,
      "publish.ts": `export default async (item, ctx) => { await ctx.fetch("http://127.0.0.1:${port}/published", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) }); return "told the hook about " + item.url; };\n`,
    });
    plugin("mute", "plugin: { name: mute, version: 0.0.1, api: 1, events: { push: ./push.ts } }\n", { "push.ts": `export default async (p, ctx) => { await ctx.fetch("http://127.0.0.1:${port}/never"); return "reached it"; };\n` });
    plugin("thrower", "plugin: { name: thrower, version: 0.0.1, api: 1, events: { push: ./push.ts } }\n", { "push.ts": "export default () => { throw new Error('webhook exploded'); };\n" });
    plugin("sleeper", "plugin: { name: sleeper, version: 0.0.1, api: 1, events: { push: ./push.ts } }\n", { "push.ts": "export default () => new Promise(() => {});\n" });
    plugin("garbage", "plugin: { name: garbage, version: 0.0.1, api: 1, events: { push: ./push.ts } }\n", { "push.ts": "export default () => 42;\n" });
    plugin("stringy", "plugin: { name: stringy, version: 0.0.1, api: 1, events: { push: ./push.ts } }\n", { "push.ts": "export default () => undefined;\n" });
    initRepo(ROOT, { name: "T", email: "t@example.com" });
    git(ROOT, "add", "-A"); git(ROOT, "commit", "-q", "-m", "init");
    mkdirSync(REMOTE, { recursive: true });
    git(REMOTE, "init", "-q", "--bare", "-b", "main");
    git(ROOT, "remote", "add", "origin", `${process.cwd()}/${REMOTE}`);
    const cfg = loadConfig(ROOT);
    expect(cfg.ok).toBe(true);
    expect(cfg.plugins.map((p) => `${p.name}:${p.loaded}`)).toEqual(["pinger:true", "mute:true", "thrower:true", "sleeper:true", "garbage:true", "stringy:true"]);

    // publish two posts through the same path the MCP takes, then push: the first push carries the whole site
    const repo = Repo.open(ROOT)!;
    const publish = (slug: string) => {
      const c = createContent(ROOT, { type: "post", slug, frontmatter: { title: slug }, body: `The ${slug} body.`, cfg });
      repo.useDrafts(c.paths); repo.commit(c.paths, `content: create post/${slug}`);
      const s = setStatus(ROOT, { type: "post", slug, status: "published", cfg });
      repo.commit(s.paths, `content: publish post/${slug}`);
      return repo.land(s.paths, `content: publish post/${slug}`);
    };
    expect(publish("alpha").ok).toBe(true);
    expect(publish("beta").ok).toBe(true);
    const r1 = pushSite(ROOT, cfg);
    expect(r1.ok).toBe(true);
    expect(r1.paths).toContain("content/posts/alpha.md");
    expect(r1.paths).toContain("snypd.yaml");   // a first push sends the whole branch, config and all
    let changed = changedContent(ROOT, cfg, r1.paths!);
    expect(changed.map((c) => `${c.route}:${c.deleted}`)).toEqual(["/posts/alpha:false", "/posts/beta:false"]);   // snypd.yaml and plugins/ are not pages
    const payload: PushPayload = { branch: r1.branch, remote: r1.remote, sent: r1.sent, commits: [], changed, urls: [...new Set(changed.map((c) => c.url))] };
    expect(payload.urls).toEqual(["https://e.example/posts/alpha/", "https://e.example/posts/beta/"]);

    const rows = await fireEvent(ROOT, cfg, "push", payload, { timeoutMs: 80 });
    expect(rows.map((r) => `${r.plugin}:${r.ok}`)).toEqual(["pinger:true", "mute:false", "thrower:false", "sleeper:false", "garbage:false", "stringy:true"]);   // plugins: order, one at a time
    expect(rows[0]!.message).toBe("posted 2 urls, got 202");
    expect(rows[1]!.message).toBe(`fetch to http://127.0.0.1:${port} refused — plugin mute declares capabilities.network nothing; a host it needs is added there, in the plugin's own snypd.yaml`);
    expect(rows[2]!.message).toBe("webhook exploded");
    expect(rows[3]!.message).toBe("handler took longer than 80 ms and was abandoned");
    expect(rows[4]!.message).toBe("plugin garbage returned a number where an event handler returns { ok, message } or a string");
    expect(rows[5]!.message).toBe("done");
    expect(rows.every((r) => r.event === "push" && typeof r.at === "string" && typeof r.ms === "number")).toBe(true);
    // the hook saw what the plugin was told: the event, its own options, the site, and the pages
    expect(hits.filter((h) => h.path === "/hook")).toEqual([{ path: "/hook", body: { event: "push", plugin: "pinger", site: "https://e.example", urls: payload.urls, changed: [["content/posts/alpha.md", "/posts/alpha", false], ["content/posts/beta.md", "/posts/beta", false]], sent: r1.sent, branch: "main" } }]);
    expect(hits.some((h) => h.path === "/never")).toBe(false);   // refused before a connection, not after
    // the lines a tool result prints, and the ring on disk
    expect(eventLines(rows)).toEqual([
      "✓ pinger on push: posted 2 urls, got 202",
      `⚠ mute on push failed: fetch to http://127.0.0.1:${port} refused — plugin mute declares capabilities.network nothing; a host it needs is added there, in the plugin's own snypd.yaml`,
      "⚠ thrower on push failed: webhook exploded",
      "⚠ sleeper on push failed: handler took longer than 80 ms and was abandoned",
      "⚠ garbage on push failed: plugin garbage returned a number where an event handler returns { ok, message } or a string",
      "✓ stringy on push: done",
    ]);
    expect(existsSync(join(ROOT, ".snypd/events.json"))).toBe(true);
    expect(readEvents(ROOT)).toEqual(rows);
    expect(JSON.parse(readFileSync(join(ROOT, ".snypd/events.json"), "utf8"))).toEqual({ rows });

    // `publish`: only the one listener that declares it; the payload is the item and where it landed
    const landed = publish("gamma");
    const prows = await fireEvent(ROOT, cfg, "publish", { type: "post", slug: "gamma", route: "/posts/gamma", url: urlOf(cfg.config.site.url, "/posts/gamma"), path: "content/posts/gamma.md", base: landed.base, sha: landed.sha });
    expect(prows.map((r) => `${r.plugin}:${r.ok}:${r.message}`)).toEqual(["pinger:true:told the hook about https://e.example/posts/gamma/"]);
    expect(hits.find((h) => h.path === "/published")!.body).toMatchObject({ type: "post", slug: "gamma", route: "/posts/gamma", url: "https://e.example/posts/gamma/", path: "content/posts/gamma.md", base: "main" });
    expect(readEvents(ROOT)).toHaveLength(7);   // appended, oldest first

    // a second push carries only what moved since, and a deletion is a page that is gone
    const del = repo.run("rm", "-q", "content/posts/alpha.md");
    expect(del.ok).toBe(true);
    repo.run("commit", "-q", "-m", "content: unpublish post/alpha");
    const branch = repo.branch();
    if (branch !== "main") repo.run("checkout", "-q", "main");
    const r2 = pushSite(ROOT, cfg);
    expect(r2.ok).toBe(true);
    changed = changedContent(ROOT, cfg, r2.paths!);
    expect(changed.map((c) => `${c.route}:${c.deleted}`)).toContain("/posts/gamma:false");
    // a no-op push tells the listeners so, with nothing to name
    const r3 = pushSite(ROOT, cfg);
    expect(r3.ok).toBe(true);
    expect(r3.sent).toBe(0);
    expect(r3.paths).toEqual([]);
    // a site with no listener pays nothing: no rows, no file touched
    writeFileSync(join(ROOT, "snypd.yaml"), `snypd: 1\nsite: { name: E, url: https://e.example }\n`);
    const before = readFileSync(join(ROOT, ".snypd/events.json"), "utf8");
    expect(await fireEvent(ROOT, loadConfig(ROOT), "push", payload)).toEqual([]);
    expect(readFileSync(join(ROOT, ".snypd/events.json"), "utf8")).toBe(before);
  });

  test("changedContent maps git paths to pages by the type's dir and urlPattern, nested paths and deletions included", () => {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(join(ROOT, "content/pages/docs"), { recursive: true });
    mkdirSync(join(ROOT, "content/posts"), { recursive: true });
    writeFileSync(join(ROOT, "snypd.yaml"), "snypd: 1\nsite: { name: E, url: https://e.example/ }\n");
    writeFileSync(join(ROOT, "content/posts/here.md"), "---\ntitle: Here\ndate: 2026-09-01\n---\n");
    writeFileSync(join(ROOT, "content/pages/docs/intro.md"), "---\ntitle: Intro\n---\n");
    const cfg = loadConfig(ROOT);
    const out = changedContent(ROOT, cfg, ["content/posts/here.md", "content/posts/gone.md", "content/pages/docs/intro.md", "content/pages/index.md", "snypd.yaml", "content/media/a.png", "content/posts/.draft.md", "themes/x/theme.yaml", "content/nav/header.yaml"]);
    expect(out).toEqual([
      { path: "content/posts/here.md", type: "post", slug: "here", route: "/posts/here", url: "https://e.example/posts/here/", deleted: false },
      { path: "content/posts/gone.md", type: "post", slug: "gone", route: "/posts/gone", url: "https://e.example/posts/gone/", deleted: true },
      { path: "content/pages/docs/intro.md", type: "page", slug: "intro", route: "/docs/intro", url: "https://e.example/docs/intro/", deleted: false },
      { path: "content/pages/index.md", type: "page", slug: "index", route: "/index", url: "https://e.example/index/", deleted: true },
    ]);
    expect(urlOf("https://e.example", "/")).toBe("https://e.example/");
    expect(urlOf("https://e.example/", "/a/b")).toBe("https://e.example/a/b/");
  });

  test("indexnow's push handler: the request IndexNow specifies, through ctx.fetch, and an honest line for every answer", async () => {
    const mod = (await import("../../../plugins/indexnow/push.ts")).default;
    const calls: { url: string; init: RequestInit }[] = [];
    const ctxWith = (status: number, options: Record<string, unknown> = { key: "abcdefgh12345678" }): EventCtx => ({
      event: "push", plugin: "indexnow", options, site: { name: "E", url: "https://e.example", locales: ["en"], defaultLocale: "en" }, config: {} as never, root: ROOT,
      fetch: (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); return new Response(null, { status, statusText: status === 202 ? "Accepted" : status === 422 ? "Unprocessable Entity" : "" }); }) as typeof fetch,
    });
    const base = { branch: "main", sent: 2, commits: [], changed: [] };
    const two = { ...base, urls: ["https://e.example/posts/a/", "https://e.example/posts/b/"] };
    expect(await mod(two, ctxWith(202))).toEqual({ ok: true, message: "pinged api.indexnow.org with 2 URLs (202)" });
    expect(calls[0]!.url).toBe("https://api.indexnow.org/indexnow");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ host: "e.example", key: "abcdefgh12345678", keyLocation: "https://e.example/indexnow/abcdefgh12345678.txt", urlList: two.urls });
    expect(await mod(two, ctxWith(422))).toEqual({ ok: false, message: "api.indexnow.org answered 422 Unprocessable Entity for 2 URLs — the key was not verified; https://e.example/indexnow/abcdefgh12345678.txt has to be live first, and it is emitted by this plugin, so build and push once with it enabled" });
    expect(await mod(two, ctxWith(429))).toEqual({ ok: false, message: "api.indexnow.org answered 429 for 2 URLs — too many requests; the next push tries again" });
    expect(await mod({ ...base, urls: [] }, ctxWith(202))).toEqual({ ok: true, message: "nothing to ping — the push carried no content change" });
    expect(await mod({ ...base, sent: 0, urls: [] }, ctxWith(202))).toEqual({ ok: true, message: "nothing to ping — the remote already had everything" });
    expect(calls).toHaveLength(3);   // nothing to ping means no request
    // a custom endpoint goes to that host; whether it is allowed is the allowlist's call, not this module's
    await mod(two, ctxWith(200, { key: "abcdefgh12345678", endpoint: "https://www.bing.com/indexnow" }));
    expect(calls[3]!.url).toBe("https://www.bing.com/indexnow");
    // and the bundled manifest allows exactly the protocol's endpoints
    const cfg = loadConfig(ROOT);
    void cfg;
    const yaml = readFileSync("plugins/indexnow/snypd.yaml", "utf8");
    expect(yaml).toContain("network: [api.indexnow.org, www.bing.com, yandex.com, search.seznam.cz, searchadvisor.naver.com]");
    expect(yaml).toContain("emit: [indexnow/]");
  });
});
