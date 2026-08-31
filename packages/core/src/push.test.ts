/**
 * The push (S19a). Every case here is reachable without a network: the "remote" is a bare repo on disk,
 * which is what makes it worth testing at all — `git push` against a local bare repo exercises the same
 * refspec, the same tracking ref and the same fast-forward rule as GitHub does.
 *
 * What is being pinned is not "git works". It is the three rules the product adds on top of it:
 *
 *  1. **A blocker is a sentence somebody can act on**, and there is one for every state a site can be in
 *     before it can go live — no repo, no commits, no remote, a placeholder URL, nothing published yet.
 *  2. **The drafts branch never goes.** A push sends the base; the bare remote must never learn the name
 *     `snypd/drafts`, because that branch is every word nobody has approved.
 *  3. **A push is idempotent and honest about it** — pushing twice sends nothing the second time and
 *     says so, rather than reporting a success that moved no bytes.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { loadConfig } from "./config";
import { createContent, setStatus } from "./write";
import { git, initRepo, Repo, DRAFTS_BRANCH } from "./git";
import { originName, pushSite, pushState } from "./push";

const ROOT = "corpora/_test/push";
const REMOTE = "corpora/_test/push-remote.git";

/** A site with one committed scaffold, and a bare repo beside it that is not yet its remote. */
function setup(opts: { url?: string; remote?: boolean } = {}) {
  for (const d of [ROOT, REMOTE]) rmSync(d, { recursive: true, force: true });
  mkdirSync(`${ROOT}/content/posts`, { recursive: true });
  writeFileSync(`${ROOT}/snypd.yaml`, `snypd: 1\nsite: { name: Push test, url: ${opts.url ?? "https://push.example"} }\n`);
  initRepo(ROOT, { name: "T", email: "t@example.com" });
  git(ROOT, "add", "-A"); git(ROOT, "commit", "-q", "-m", "init");
  mkdirSync(REMOTE, { recursive: true });
  git(REMOTE, "init", "-q", "--bare", "-b", "main");
  if (opts.remote !== false) git(ROOT, "remote", "add", "origin", `${process.cwd()}/${REMOTE}`);
  return { repo: Repo.open(ROOT)!, cfg: () => loadConfig(ROOT) };
}

/** Write a post, approve nothing, publish it the way `content.publish` does: land one path on the base. */
function publish(slug: string) {
  const cfg = loadConfig(ROOT);
  const r = Repo.open(ROOT)!;
  const c = createContent(ROOT, { type: "post", slug, frontmatter: { title: slug }, body: `The ${slug} body.`, cfg });
  r.useDrafts(c.paths); r.commit(c.paths, `content: create post/${slug}`);
  const s = setStatus(ROOT, { type: "post", slug, status: "published", cfg });
  r.commit(s.paths, `content: publish post/${slug}`);
  return r.land(s.paths, `content: publish post/${slug}`);
}

const refs = () => git(REMOTE, "for-each-ref", "--format=%(refname)").stdout.split("\n").filter(Boolean);

describe("push state (S19a)", () => {
  test("every state a site can be in before it can go live has a blocker with a fix in it", () => {
    // No repo at all.
    const bare = "corpora/_test/push-norepo";
    rmSync(bare, { recursive: true, force: true });
    mkdirSync(bare, { recursive: true });
    writeFileSync(`${bare}/snypd.yaml`, "snypd: 1\nsite: { name: t, url: https://t.example }\n");
    expect(pushState(bare, loadConfig(bare)).blockers[0]!.reason).toBe("not a git repo");

    // A repo with no remote — the ordinary state of a site somebody is still writing.
    const { cfg } = setup({ remote: false });
    const none = pushState(ROOT, cfg());
    expect(none.ok).toBe(false);
    expect(none.blockers[0]!.reason).toContain("no remote");
    expect(none.blockers[0]!.hint).toContain("git remote add origin");

    // A placeholder URL blocks a push for the same reason it blocks a publish: absolute links.
    const ph = setup({ url: "http://localhost:4321" });
    const blocked = pushState(ROOT, ph.cfg());
    expect(blocked.ok).toBe(false);
    expect(blocked.blockers.map((b) => b.reason).join(" ")).toContain("placeholder");
  });

  test("a site whose only branch is drafts has nothing to push, and says which branch that is", () => {
    setup();
    const cfg = loadConfig(ROOT);
    const r = Repo.open(ROOT)!;
    // Delete `main` so the only branch is drafts — the shape of a repo whose first publish has not happened.
    const c = createContent(ROOT, { type: "post", slug: "unpublished", frontmatter: { title: "u" }, body: "x", cfg });
    r.useDrafts(c.paths); r.commit(c.paths, "content: create post/unpublished");
    r.run("branch", "-D", "main");
    const st = pushState(ROOT, loadConfig(ROOT));
    expect(st.ok).toBe(false);
    expect(st.blockers.map((b) => b.reason).join(" ")).toContain("no `main` branch");
    expect(st.blockers.map((b) => b.hint).join(" ")).toContain(DRAFTS_BRANCH);
    // And the act refuses too — the card is not the gate, `pushSite` is.
    expect(pushSite(ROOT, loadConfig(ROOT)).ok).toBe(false);
    expect(refs()).toEqual([]);
  });

  test("the first push sends the base branch, sets up tracking, and leaves drafts at home", () => {
    setup();
    publish("first");
    const before = pushState(ROOT, loadConfig(ROOT));
    expect(before).toMatchObject({ ok: true, branch: "main", known: false });
    expect(before.remote!.name).toBe("origin");
    // No tracking ref means the remote has none of it, so "ahead" is the whole branch — the scaffold
    // commit and the publish. Zero here would leave the card mute on the one push that matters most.
    expect(before.ahead).toBe(2);
    expect(before.commits[0]!.subject).toBe("content: publish post/first");
    expect(before.drafts).toBe(0);           // the count comes from the caller; nobody passed one

    const r = pushSite(ROOT, loadConfig(ROOT), { who: "a human at the Desk" });
    expect(r).toMatchObject({ ok: true, branch: "main", remote: "origin" });
    expect(r.by).toBe("a human at the Desk");
    // Rule 2, the one that would be a disaster: the remote learned `main` and nothing else.
    expect(refs()).toEqual(["refs/heads/main"]);
    expect(git(REMOTE, "log", "-1", "--format=%s", "main").stdout).toBe("content: publish post/first");

    const after = pushState(ROOT, loadConfig(ROOT));
    expect(after).toMatchObject({ ok: true, known: true, ahead: 0 });
    // Rule 3: pushing again is allowed, sends nothing, and reports nothing sent.
    expect(pushSite(ROOT, loadConfig(ROOT))).toMatchObject({ ok: true, sent: 0 });
    expect(refs()).toEqual(["refs/heads/main"]);
  });

  test("a second published item shows up as one commit ahead, with its subject", () => {
    setup();
    publish("first");
    pushSite(ROOT, loadConfig(ROOT));
    publish("second");
    const st = pushState(ROOT, loadConfig(ROOT), { drafts: 3 });
    expect(st).toMatchObject({ ok: true, known: true, ahead: 1, drafts: 3 });
    expect(st.commits[0]!.subject).toBe("content: publish post/second");
    // The drafts branch is ahead of main by more than that, and none of it is what would go.
    expect(Number(git(ROOT, "rev-list", "--count", "main..snypd/drafts").stdout)).toBeGreaterThan(0);

    pushSite(ROOT, loadConfig(ROOT));
    expect(refs()).toEqual(["refs/heads/main"]);
    expect(git(REMOTE, "log", "-1", "--format=%s", "main").stdout).toBe("content: publish post/second");
  });

  test("a remote that rejects a push comes back with git's own words, not ours", () => {
    setup();
    publish("first");
    pushSite(ROOT, loadConfig(ROOT));
    // Move the remote on: now the local base is behind and a fast-forward is impossible.
    const other = "corpora/_test/push-other";
    rmSync(other, { recursive: true, force: true });
    git(".", "clone", "-q", REMOTE, other);
    git(other, "config", "user.email", "o@example.com"); git(other, "config", "user.name", "O");
    writeFileSync(`${other}/other.txt`, "elsewhere\n");
    git(other, "add", "-A"); git(other, "commit", "-q", "-m", "from somewhere else"); git(other, "push", "-q", "origin", "main");
    publish("second");
    const r = pushSite(ROOT, loadConfig(ROOT));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/reject|non-fast-forward|fetch first/i);
    expect(r.hint).toContain("never force-pushes");
    // And the remote still has what it had: a refusal is not a partial push.
    expect(git(REMOTE, "log", "-1", "--format=%s", "main").stdout).toBe("from somewhere else");
  });

  test("originName reads both URL shapes and gives up quietly on neither", () => {
    expect(originName("git@github.com:sunny/snypd.rocks.git")).toBe("github.com/sunny/snypd.rocks");
    expect(originName("https://github.com/sunny/snypd.rocks.git")).toBe("github.com/sunny/snypd.rocks");
    expect(originName("https://gitlab.example.com:8443/team/site")).toBe("gitlab.example.com/team/site");
    expect(originName("/srv/git/site.git")).toBeUndefined();
  });
});
