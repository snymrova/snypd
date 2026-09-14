import { describe, expect, test, beforeAll } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, utimesSync, renameSync, statSync } from "node:fs";
import { SiteIndex, loadConfig, MdastCache, readFrontmatter, taxonomyFields, RACY_MS } from "./index";

const root = "corpora/_test/store";
const post = (title: string, tags = "ai", extra = "") => `---\ntitle: ${title}\ndate: 2026-02-0${title.length % 9 + 1}\nstatus: published\ncategory: eng\ntags: [${tags}]\n${extra}---\n\n## H\n\nBody of ${title}.\n`;

describe("SiteIndex (S6)", () => {
  beforeAll(() => {
    rmSync(root, { recursive: true, force: true }); mkdirSync(`${root}/content/posts`, { recursive: true });
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    for (const s of ["a", "b", "c"]) writeFileSync(`${root}/content/posts/${s}.md`, post(s, s === "c" ? "ai, mcp" : "ai"));
    // Written a minute ago, as far as the index can tell: a file written in the same breath as the sync
    // that reads it is one H3 hashes again on purpose, and these tests are about the files that are not.
    const then = new Date(Date.now() - 60_000);
    for (const s of ["a", "b", "c"]) utimesSync(`${root}/content/posts/${s}.md`, then, then);
  });
  test("readFrontmatter matches the parser without a markdown parse", () => {
    expect(readFrontmatter(post("x"))).toMatchObject({ title: "x", status: "published", tags: ["ai"] });
    expect(readFrontmatter("no frontmatter")).toEqual({});
    expect(readFrontmatter("---\n: bad: [\n---\n")).toEqual({});
  });
  test("taxonomyFields maps a type's taxonomies to their frontmatter fields", () => {
    expect(taxonomyFields(loadConfig(root).config.types.post!)).toEqual({ category: "category", tag: "tags" });
  });
  test("sync: cold hashes everything, warm hashes nothing, touch hashes one and changes nothing", async () => {
    const cfg = loadConfig(root);
    const ix = await SiteIndex.open(root);
    let r = ix.sync(cfg);
    expect(r.files.length).toBe(3); expect(r.hashed).toBe(3); expect(r.changed.length).toBe(3);
    r = ix.sync(cfg);
    expect(r.hashed).toBe(0); expect(r.changed).toEqual([]); expect(r.removed).toEqual([]);
    const now = new Date(); utimesSync(`${root}/content/posts/a.md`, now, now);
    r = ix.sync(cfg);
    expect(r.hashed).toBe(1); expect(r.changed).toEqual([]);
    expect(ix.files({ type: "post" }).map((f) => f.slug).sort()).toEqual(["a", "b", "c"]);
    expect(ix.files()[0]!.frontmatter.category).toBe("eng");
    expect(ix.terms("tag").map((t) => `${t.term}:${t.path}`)).toEqual(["ai:content/posts/a.md", "ai:content/posts/b.md", "ai:content/posts/c.md", "mcp:content/posts/c.md"]);
    expect(ix.byTerm("tag", "mcp").map((f) => f.slug)).toEqual(["c"]);
    ix.close();
  });
  test("H3, finding 3: a same-length edit inside the mtime's tick is seen — a stat too close to its mtime vouches for nothing", async () => {
    const dir = "corpora/_test/store-racy";
    rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/content/posts`, { recursive: true });
    writeFileSync(`${dir}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    const f = `${dir}/content/posts/r.md`;
    const cfg = loadConfig(dir);
    const ix = await SiteIndex.open(dir);
    // A coarse clock, made deterministic: both writes get the same whole-millisecond mtime, as two writes
    // in one tick of HFS+, FAT or a network mount do. (Restoring a finer mtime through utimes would not
    // reproduce it — utimes rounds, and the index would see the rounding as a change.)
    const tick = new Date(Date.now());
    writeFileSync(f, post("r1")); utimesSync(f, tick, tick);
    expect(ix.sync(cfg).changed).toEqual(["content/posts/r.md"]);
    const { size } = statSync(f);
    writeFileSync(f, post("r2")); utimesSync(f, tick, tick);
    expect(statSync(f).size).toBe(size); expect(statSync(f).mtimeMs).toBe(tick.getTime());   // every stat field the index keeps is equal
    let r = ix.sync(cfg);
    expect(r.changed).toEqual(["content/posts/r.md"]);
    expect(ix.file("content/posts/r.md")!.title).toBe("r2");
    // …and the vouching expires: once a sync starts RACY_MS after the mtime, the stat is trusted again.
    const old = new Date(Date.now() - 10 * RACY_MS); utimesSync(f, old, old);
    ix.sync(cfg);                                   // re-hashed: the mtime changed
    r = ix.sync(cfg); expect(r.hashed).toBe(0);     // the previous sync started long after that mtime
    ix.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("H3, finding 7: two processes on one index queue instead of failing — WAL, a busy timeout, immediate transactions", async () => {
    const dir = "corpora/_test/store-busy";
    rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/content/posts`, { recursive: true });
    writeFileSync(`${dir}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    writeFileSync(`${dir}/content/posts/q.md`, post("q"));
    const ix = await SiteIndex.open(dir);
    ix.setRoute("/before", "k0", ["index.html"]);
    // Another process takes the write lock and holds it for 400 ms — `build` mid-close, `dev` mid-sync.
    const holder = Bun.spawn([process.execPath, "-e", `
      const { SiteIndex } = await import(${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)});
      const ix = await SiteIndex.open(${JSON.stringify(dir)});
      ix.transaction(() => { ix.setRoute("/holder", "k1", ["index.html"]); console.log("locked"); Bun.sleepSync(400); });
      ix.close();`], { stdout: "pipe", stderr: "inherit" });
    const reader = holder.stdout.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("locked");
    // A reader passes the writer: under the rollback journal this read waited for (or failed on) the lock.
    const t0 = performance.now();
    expect(ix.route("/before")?.key).toBe("k0");
    expect(performance.now() - t0).toBeLessThan(200);
    // A writer waits its turn: sync is a transaction, and before H3 this threw `database is locked`.
    const r = ix.sync(loadConfig(dir));
    expect(r.changed).toEqual(["content/posts/q.md"]);
    expect(await holder.exited).toBe(0);
    expect(ix.route("/holder")?.key).toBe("k1");
    expect(existsSync(`${dir}/.snypd/index.sqlite-wal`)).toBe(true);   // the journal mode is WAL, not the in-memory rollback journal
    ix.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("sync: an edit re-reads frontmatter and terms; a delete drops the row", async () => {
    const cfg = loadConfig(root);
    const ix = await SiteIndex.open(root);
    ix.sync(cfg);
    writeFileSync(`${root}/content/posts/b.md`, post("b2", "bun"));
    let r = ix.sync(cfg);
    expect(r.changed).toEqual(["content/posts/b.md"]);
    expect(ix.file("content/posts/b.md")!.title).toBe("b2");
    expect(ix.byTerm("tag", "bun").map((f) => f.slug)).toEqual(["b"]);
    rmSync(`${root}/content/posts/b.md`);
    r = ix.sync(cfg);
    expect(r.removed).toEqual(["content/posts/b.md"]); expect(ix.files().length).toBe(2); expect(ix.byTerm("tag", "bun")).toEqual([]);
    ix.close();
  });
  test("moves: a slug change is remembered for rule 10 until the route comes back", async () => {
    const cfg = loadConfig(root);
    const ix = await SiteIndex.open(root);
    ix.sync(cfg);
    writeFileSync(`${root}/content/posts/a.md`, post("a", "ai", "slug: a-new\n"));
    // the route comes from the filename (listContent), so rename the file to move it
    renameSync(`${root}/content/posts/a.md`, `${root}/content/posts/a-new.md`);
    let r = ix.sync(cfg);
    expect(r.removed).toEqual(["content/posts/a.md"]); expect(r.moved).toEqual([]);   // a rename is a delete + add: no history to move
    // an in-place route change (urlPattern) is a move
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\ntypes: { post: { urlPattern: \"/blog/{slug}\" } }\n");
    r = ix.sync(loadConfig(root));
    expect(r.moved.map((m) => [m.from, m.to])).toEqual([["/posts/a-new", "/blog/a-new"], ["/posts/c", "/blog/c"]]);
    expect(ix.moves().length).toBe(2);
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    r = ix.sync(loadConfig(root));
    expect(r.moved).toEqual([]); expect(ix.moves()).toEqual([]);
    ix.close();
  });
  test("mdast store: parsed documents round-trip through the index", async () => {
    const ix = await SiteIndex.open(root);
    const a = new MdastCache(ix.mdastStore());
    const src = post("z");
    a.get(src); expect(a.misses).toBe(1);
    const b = new MdastCache(ix.mdastStore());
    const c = b.get(src);
    expect(b.hits).toBe(1); expect(b.misses).toBe(0); expect(c.doc.frontmatter.title).toBe("z"); expect(c.tree.blocks).toEqual([]);
    ix.pruneMdast();   // z is no file's hash
    const d = new MdastCache(ix.mdastStore()); d.get(src); expect(d.misses).toBe(1);
    ix.close();
  });
  test("route cache rows", async () => {
    const ix = await SiteIndex.open(root);
    ix.setRoute("/x", "k1", ["index.html"]);
    expect(ix.route("/x")).toEqual({ route: "/x", key: "k1", outputs: ["index.html"] });
    ix.deleteRoute("/x"); expect(ix.route("/x")).toBeUndefined();
    ix.setMeta("built", "1"); expect(ix.meta("built")).toBe("1");
    ix.close();
  });
});
