/**
 * The kill test (docs/07 D1), and the write model it forced (S17b).
 *
 * `kill test` itself is one slow test — it spawns a server, builds a site twice and runs a browser-free
 * preview — so the invariants it depends on get their own fast tests below. Each of those is written
 * against the *mechanism*, not against the scenario: they fail if the write model regresses, without
 * needing the whole scenario to run.
 */
import { test, expect, describe } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo, loadConfig, createContent, draftSource, Repo, DRAFTS_BRANCH } from "@snypd/core";
import { runAgent, DRAFT_BUDGET, TOTAL_GATE } from "./run";
import { passed } from "./scenario";

const stage = () => {
  const root = mkdtempSync(join(tmpdir(), "snypd-agent-t-"));
  cpSync("corpora/kill", root, { recursive: true });
  initRepo(root, { name: "T", email: "t@example.com" }).commit(["."], "init");
  return root;
};

describe("kill test", () => {
  /**
   * D1, whole. Every check in `scenario.ts` is an assertion about the site the run left behind, so this
   * passing means: three plain posts were upgraded into the primitives they were latent in, a fourth was
   * written with a chart and a flow, the theme was swapped, two tokens were retuned, all four items were
   * approved by a human and published, and the result lints and builds.
   *
   * It was 3/11 in S17. The eight that failed all failed for one reason — a branch per item meant one
   * draft in the tree at a time, and publishing one merged the others' unapproved commits (docs/07 §6).
   */
  test("D1: the kill test passes, inside its call budget", async () => {
    const r = await runAgent();

    const failed = r.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
    expect(failed).toEqual([]);
    expect(passed(r.checks)).toBe(true);

    // D1's sentence, taken literally: one draft, from nothing, lint-clean, inside the call budget.
    expect(r.draftCalls).toBeLessThanOrEqual(DRAFT_BUDGET);
    expect(r.lint.errors).toBe(0);
    expect(r.calls).toBeLessThanOrEqual(TOTAL_GATE);
  }, 180_000);
});

describe("the write model the kill test forced (S17b)", () => {
  test("two drafts are in the tree at once, and publishing one leaves the other there", () => {
    const root = stage();
    try {
      const repo = Repo.open(root)!;
      const cfg = loadConfig(root);
      for (const slug of ["alpha", "beta"]) {
        const r = createContent(root, { type: "post", slug, frontmatter: { title: slug, date: "2026-04-01" }, body: `The ${slug} body.`, cfg });
        repo.useDrafts(r.paths);
        repo.commit(r.paths, `content: create post/${slug}`);
      }
      // Both readable, at the same time, with no branch switching — the S17 defect, inverted.
      expect(draftSource(root, cfg, "post", "alpha")).toContain("The alpha body.");
      expect(draftSource(root, cfg, "post", "beta")).toContain("The beta body.");
      expect(repo.branch()).toBe(DRAFTS_BRANCH);

      const landed = repo.land(["content/posts/alpha.md"], "content: publish post/alpha");
      expect(landed).toMatchObject({ ok: true, changed: true, base: "main" });
      // The tree did not move, beta is still a draft in it, and beta's words are not on main.
      expect(repo.branch()).toBe(DRAFTS_BRANCH);
      expect(draftSource(root, cfg, "post", "beta")).toContain("The beta body.");
      expect(repo.show("main", "content/posts/beta.md")).toBeUndefined();
      expect(repo.show("main", "content/posts/alpha.md")).toContain("The alpha body.");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("an unapproved draft is not in the published branch's history either", () => {
    const root = stage();
    try {
      const repo = Repo.open(root)!;
      const cfg = loadConfig(root);
      const secret = createContent(root, { type: "post", slug: "unapproved", frontmatter: { title: "Unapproved", date: "2026-04-01" }, body: "Words nobody signed off.", cfg });
      repo.useDrafts(secret.paths);
      repo.commit(secret.paths, "content: create post/unapproved");
      const ok = createContent(root, { type: "post", slug: "approved", frontmatter: { title: "Approved", date: "2026-04-01" }, body: "Words a human read.", cfg });
      repo.useDrafts(ok.paths);
      repo.commit(ok.paths, "content: create post/approved");

      repo.land(["content/posts/approved.md"], "content: publish post/approved");
      // A merge would have made the unapproved commit an ancestor of main. `land` commits a tree, with
      // the base as its only parent, so the words are in neither the tree nor the history.
      expect(repo.run("log", "main", "--format=%s").stdout).not.toContain("post/unapproved");
      expect(repo.run("rev-list", "main", "--", "content/posts/unapproved.md").stdout).toBe("");
      expect(repo.run("merge-base", "--is-ancestor", "main", DRAFTS_BRANCH).ok).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("a site outside the monorepo can preview — the theme bundle resolves @snypd", async () => {
    const root = stage();
    let stop: (() => void) | undefined;
    try {
      // The real claim, tested the real way. A temp root has no `node_modules/@snypd` to walk up to, so a
      // bundle that kept the bare specifier could not be imported at all and `render_preview` failed with
      // `Cannot find package '@snypd/render'` — for every site that is not this repo. Asserting on the
      // emitted file instead would pass on a cache hit from another test in the same process.
      const { preview } = await import("@snypd/render/preview");
      const s = await preview(root, { port: 0, watch: false });
      stop = s.stop;
      const res = await fetch(`${s.url}/posts/cold-start/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("cold start");
    } finally { stop?.(); rmSync(root, { recursive: true, force: true }); }
  }, 60_000);
});
