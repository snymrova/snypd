import { describe, expect, test, beforeEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadConfig } from "./index";
import { createContent, updateContent, setStatus, trashContent, restoreContent, splitFrontmatter, target, publishCheck, approve, approvals, contentHash } from "./write";
import { Repo, git, initRepo, isRepoRoot, principal, DRAFTS_BRANCH } from "./git";

const root = "corpora/_test/write";
const fresh = () => {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(`${root}/content/posts`, { recursive: true });
  writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
};

describe("write (S11)", () => {
  beforeEach(fresh);

  test("splitFrontmatter separates the block from the body, and tolerates a file without one", () => {
    expect(splitFrontmatter("---\ntitle: a\n---\n\nBody.\n")).toEqual({ yaml: "title: a", body: "Body.\n", had: true });
    expect(splitFrontmatter("Just prose.\n")).toEqual({ yaml: "", body: "Just prose.\n", had: false });
  });

  test("create: slug from the title, date defaulted, status forced to the initial one", () => {
    const cfg = loadConfig(root);
    const r = createContent(root, { type: "post", frontmatter: { title: "Hello, World!", status: "published" }, body: "## H\n\nWords.", cfg, now: new Date(2026, 7, 27, 12) });
    expect(r.slug).toBe("hello-world");
    expect(r.route).toBe("/posts/hello-world");
    expect(r.status).toBe("draft");                       // an agent drafts, whatever it asked for
    const src = readFileSync(r.file, "utf8");
    expect(src).toStartWith("---\ntitle: Hello, World!\n");
    expect(src).toContain("date: 2026-08-27");            // the type requires it
    expect(src).toContain("status: draft");
    expect(src.endsWith("Words.\n")).toBe(true);
    expect(r.paths).toEqual(["content/posts/hello-world.md"]);
    expect(r.lint!.diagnostics.some((d) => d.n === 0)).toBe(false);
  });

  test("create: refuses a duplicate, a bad slug, an unknown type and a type with mcp.write false", () => {
    const cfg = loadConfig(root);
    createContent(root, { type: "post", slug: "a", frontmatter: { title: "A" }, cfg });
    expect(() => createContent(root, { type: "post", slug: "a", frontmatter: { title: "A" }, cfg })).toThrow(/already exists/);
    expect(() => createContent(root, { type: "post", slug: "Not A Slug", frontmatter: { title: "A" }, cfg })).toThrow(/invalid slug/);
    expect(() => createContent(root, { type: "ghost", slug: "a", cfg })).toThrow(/unknown type/);
    expect(() => createContent(root, { type: "post", frontmatter: {}, cfg })).toThrow(/slug required/);
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\ntypes: { post: { mcp: { write: false } } }\n");
    expect(() => createContent(root, { type: "post", slug: "b", frontmatter: { title: "B" }, cfg: loadConfig(root) })).toThrow(/not writable over MCP/);
  });

  test("update: a patch moves only the keys it names and keeps comments; null deletes", () => {
    const cfg = loadConfig(root);
    const t = target(root, cfg, "post", "keep");
    writeFileSync(t.file, "---\ntitle: Keep\n# why this date\ndate: 2026-01-01\ntags: [ai]\ndescription: old\n---\n\nBody.\n");
    const r = updateContent(root, { type: "post", slug: "keep", patch: { description: "new", tags: ["ai", "mcp"], canonical: null }, cfg });
    const src = readFileSync(r.file, "utf8");
    expect(src).toContain("# why this date");             // the comment survives
    expect(src).toContain("date: 2026-01-01");
    expect(src).toContain("description: new");
    expect(src).toContain("- mcp");
    expect(src).toContain("Body.");
    expect(updateContent(root, { type: "post", slug: "keep", body: "New body.", cfg }).status).toBe("draft");
    expect(readFileSync(t.file, "utf8")).toContain("New body.");
    expect(() => updateContent(root, { type: "post", slug: "keep", patch: { status: "published" }, cfg })).toThrow(/not patchable/);
    expect(() => updateContent(root, { type: "post", slug: "nope", body: "x", cfg })).toThrow(/no post with slug/);
    expect(() => updateContent(root, { type: "post", slug: "keep", cfg })).toThrow(/nothing to update/);
  });

  test("set_status: only transitions the machine allows; publishing stamps updated", () => {
    const cfg = loadConfig(root);
    createContent(root, { type: "post", slug: "s", frontmatter: { title: "S", date: "2026-01-01" }, cfg });
    expect(() => setStatus(root, { type: "post", slug: "s", status: "trashed", cfg })).not.toThrow();
    expect(() => setStatus(root, { type: "post", slug: "s", status: "published", cfg })).toThrow(/not a transition/);   // trashed → draft only
    setStatus(root, { type: "post", slug: "s", status: "draft", cfg });
    const r = setStatus(root, { type: "post", slug: "s", status: "published", cfg, now: new Date(2026, 7, 27, 12) });
    expect(r.status).toBe("published");
    expect(readFileSync(r.file, "utf8")).toContain("updated: 2026-08-27");
    expect(() => setStatus(root, { type: "post", slug: "s", status: "published", cfg })).toThrow(/already published/);
    expect(() => setStatus(root, { type: "post", slug: "s", status: "nope", cfg })).toThrow(/unknown status/);
  });

  test("trash moves the file and restore brings it back as a draft", () => {
    const cfg = loadConfig(root);
    const c = createContent(root, { type: "post", slug: "t", frontmatter: { title: "T" }, cfg });
    const r = trashContent(root, { type: "post", slug: "t", cfg });
    expect(existsSync(c.file)).toBe(false);
    expect(existsSync(`${root}/content/.trash/post/t.md`)).toBe(true);
    expect(r.paths).toEqual(["content/posts/t.md", "content/.trash/post/t.md"]);
    expect(readFileSync(`${root}/content/.trash/post/t.md`, "utf8")).toContain("status: trashed");
    const b = restoreContent(root, { type: "post", slug: "t", cfg });
    expect(existsSync(c.file)).toBe(true);
    expect(b.status).toBe("draft");
    expect(existsSync(`${root}/content/.trash/post/t.md`)).toBe(false);
    expect(() => restoreContent(root, { type: "post", slug: "t", cfg })).toThrow(/nothing trashed/);
  });

  test("publish needs a human, and the approval covers one version only", async () => {
    const cfg = loadConfig(root);
    const c = createContent(root, { type: "post", slug: "p", frontmatter: { title: "P" }, cfg });
    const ix = approvals(root);
    let check = publishCheck(root, cfg, ix, "post", "p");
    expect(check.ok).toBe(false);
    expect(check.hint).toContain("/_snypd/review/post/p");
    approve(ix, { type: "post", slug: "p", hash: contentHash(readFileSync(c.file, "utf8")), by: "sunny", at: "2026-08-27T10:00:00Z" });
    expect(publishCheck(root, cfg, ix, "post", "p").ok).toBe(true);
    updateContent(root, { type: "post", slug: "p", body: "Different words entirely.", cfg });
    check = publishCheck(root, cfg, ix, "post", "p");
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("changed after it was approved");
  });

  test("a type whose policy is publish needs no approval", async () => {
    writeFileSync(`${root}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\ntypes: { post: { mcp: { write: publish } } }\n");
    const cfg = loadConfig(root);
    createContent(root, { type: "post", slug: "free", frontmatter: { title: "F" }, cfg });
    expect(publishCheck(root, cfg, approvals(root), "post", "free")).toMatchObject({ ok: true, policy: "publish" });
  });
});

describe("git (S11)", () => {
  const repo = "corpora/_test/repo";
  const setup = () => {
    rmSync(repo, { recursive: true, force: true });
    mkdirSync(`${repo}/content/posts`, { recursive: true });
    writeFileSync(`${repo}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    initRepo(repo, { name: "T", email: "t@example.com" });   // guarded: never inits into the enclosing repo
    git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "init");
  };

  test("a directory inside another repo is not a site repo", () => {
    expect(isRepoRoot("corpora/100")).toBe(false);       // toplevel is the snypd repo: a bench must never commit
    expect(Repo.open("corpora/100")).toBeUndefined();
  });

  test("principal is the trailer value, overridable by env", () => {
    expect(principal({ SNYPD_PRINCIPAL: "human:sunny" } as never)).toBe("human:sunny");
    expect(principal({ USER: "sunny" } as never)).toBe("agent:claude-code/sunny");
  });

  test("a write commits to the site's one drafts branch with the principal trailer, leaving main clean", () => {
    setup();
    const r = Repo.open(repo)!;
    expect(r.branch()).toBe("main");
    const cfg = loadConfig(repo);
    const c = createContent(repo, { type: "post", slug: "first", frontmatter: { title: "First" }, body: "Words.", cfg });
    const d = r.useDrafts(c.paths);
    expect(d).toMatchObject({ branch: DRAFTS_BRANCH, base: "main", created: true });
    const commit = r.commit(c.paths, "content: create post/first", "agent:claude-code/t");
    expect(commit.committed).toBe(true);
    expect(r.run("log", "-1", "--format=%B").stdout).toContain("Snypd-Principal: agent:claude-code/t");
    expect(r.dirty()).toEqual([]);
    expect(r.commit(c.paths, "content: create post/first").committed).toBe(false);   // nothing changed
    expect(r.run("ls-tree", "main", "--name-only", "content/posts/").stdout).toBe("");   // main never saw it
    expect(r.history("content/posts/first.md")[0]).toMatchObject({ subject: "content: create post/first", principal: "agent:claude-code/t" });
  });

  test("a second write reuses the branch; land moves the base without moving the tree", () => {
    setup();
    const r = Repo.open(repo)!;
    const cfg = loadConfig(repo);
    const c = createContent(repo, { type: "post", slug: "second", frontmatter: { title: "Second" }, cfg });
    r.useDrafts(c.paths); r.commit(c.paths, "content: create post/second");
    const u = updateContent(repo, { type: "post", slug: "second", body: "More.", cfg });
    expect(r.useDrafts(u.paths)).toMatchObject({ created: false, base: "main" });
    r.commit(u.paths, "content: update post/second");

    const landed = r.land(["content/posts/second.md"], "content: publish post/second");
    expect(landed).toMatchObject({ ok: true, changed: true, base: "main" });
    expect(r.branch()).toBe(DRAFTS_BRANCH);                                       // the tree did not move
    expect(r.exists(DRAFTS_BRANCH)).toBe(true);                                   // and the branch is not deleted
    expect(r.run("ls-tree", "main", "--name-only", "content/posts/").stdout).toBe("content/posts/second.md");
    expect(r.show("main", "content/posts/second.md")).toContain("More.");
    expect(r.run("log", "-1", "main", "--format=%B").stdout).toContain("Snypd-Principal:");
    // Landing the same version again is a no-op, not a second commit: publish is re-runnable.
    const head = r.run("rev-parse", "main").stdout;
    expect(r.land(["content/posts/second.md"], "content: publish post/second")).toMatchObject({ ok: true, changed: false });
    expect(r.run("rev-parse", "main").stdout).toBe(head);
  });

  test("landing one item leaves every other draft off the base — the S17 defect, pinned", () => {
    setup();
    const r = Repo.open(repo)!;
    const cfg = loadConfig(repo);
    for (const slug of ["alpha", "beta"]) {
      const c = createContent(repo, { type: "post", slug, frontmatter: { title: slug }, body: `The ${slug} body.`, cfg });
      r.useDrafts(c.paths);
      r.commit(c.paths, `content: create post/${slug}`);
    }
    // Both drafts are files on disk at the same time. Under a branch per item, writing beta checked out
    // beta's branch and alpha vanished from the content folder until it published.
    expect(existsSync(`${repo}/content/posts/alpha.md`)).toBe(true);
    expect(existsSync(`${repo}/content/posts/beta.md`)).toBe(true);

    r.land(["content/posts/alpha.md"], "content: publish post/alpha");
    // Publishing alpha carries alpha and nothing else: beta is neither in main's tree nor in its history.
    expect(r.run("ls-tree", "main", "--name-only", "content/posts/").stdout).toBe("content/posts/alpha.md");
    expect(r.run("log", "main", "--format=%s").stdout).not.toContain("post/beta");
    expect(existsSync(`${repo}/content/posts/beta.md`)).toBe(true);               // and it is still there to work on
    // main is an ancestor of the drafts branch, so the two never diverge.
    expect(r.run("merge-base", "--is-ancestor", "main", DRAFTS_BRANCH).ok).toBe(true);
  });

  test("land refuses a path with uncommitted changes — an approval covers bytes, not a filename", () => {
    setup();
    const r = Repo.open(repo)!;
    const cfg = loadConfig(repo);
    const c = createContent(repo, { type: "post", slug: "fourth", frontmatter: { title: "Fourth" }, body: "Words.", cfg });
    r.useDrafts(c.paths); r.commit(c.paths, "content: create post/fourth");
    writeFileSync(`${repo}/content/posts/fourth.md`, "---\ntitle: Fourth\nstatus: draft\n---\n\nDifferent words.\n");
    const landed = r.land(["content/posts/fourth.md"], "content: publish post/fourth");
    expect(landed.ok).toBe(false);
    expect(landed.reason).toMatch(/uncommitted/);
  });

  test("useDrafts refuses to carry someone else's uncommitted work onto the drafts branch", () => {
    setup();
    const r = Repo.open(repo)!;
    writeFileSync(`${repo}/snypd.yaml`, "snypd: 1\nsite: { name: edited, url: https://t.example }\n");
    const c = createContent(repo, { type: "post", slug: "third", frontmatter: { title: "Third" }, cfg: loadConfig(repo) });
    expect(() => r.useDrafts(c.paths)).toThrow(/uncommitted change/);
    expect(r.branch()).toBe("main");
  });

  test("initRepo refuses a dir that is not its own top level — the guard that stops a fixture committing to snypd", () => {
    // A directory *inside* this repo with no repo of its own: `git -C` there walks up and finds snypd.
    // Before the guard, `git init` failing (or never running) left `add -A` + `commit` pointed here,
    // which is exactly how a test fixture once committed the whole snypd working tree.
    const inside = "corpora/_test/not-a-repo";
    rmSync(inside, { recursive: true, force: true }); mkdirSync(inside, { recursive: true });
    expect(isRepoRoot(inside)).toBe(false);                                     // inside snypd, but not its own root
    expect(() => initRepo("corpora/_test/does-not-exist")).toThrow("does not exist");
    // A real init here *does* make it its own top level, which is the only case that may proceed.
    const r = initRepo(inside, { name: "T", email: "t@example.com" });
    expect(isRepoRoot(inside)).toBe(true);
    expect(r.root).toBe(inside);
    rmSync(inside, { recursive: true, force: true });
  });
});
