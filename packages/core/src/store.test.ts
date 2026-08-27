import { describe, expect, test, beforeAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, utimesSync, renameSync } from "node:fs";
import { SiteIndex, loadConfig, MdastCache, readFrontmatter, taxonomyFields } from "./index";

const root = "corpora/_test/store";
const post = (title: string, tags = "ai", extra = "") => `---\ntitle: ${title}\ndate: 2026-02-0${title.length % 9 + 1}\nstatus: published\ncategory: eng\ntags: [${tags}]\n${extra}---\n\n## H\n\nBody of ${title}.\n`;

describe("SiteIndex (S6)", () => {
  beforeAll(() => {
    rmSync(root, { recursive: true, force: true }); mkdirSync(`${root}/content/posts`, { recursive: true });
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    for (const s of ["a", "b", "c"]) writeFileSync(`${root}/content/posts/${s}.md`, post(s, s === "c" ? "ai, mcp" : "ai"));
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
