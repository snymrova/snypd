/**
 * The kill test, and the three defects it found (docs/07 S17).
 *
 * `kill test` itself is one slow test — it spawns a server, builds a site twice and runs a browser-free
 * preview — so the defects it exposed get their own fast tests below. Each of those is written against
 * the *mechanism*, not against the scenario: they would have failed before the fix and they fail again if
 * the fix is reverted, without needing the whole scenario to run.
 */
import { test, expect, describe } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo, loadConfig, createContent, draftSource, Repo, draftBranch } from "@snypd/core";
import { runAgent, DRAFT_BUDGET, TOTAL_GATE } from "./run";
import { passed } from "./scenario";

const stage = () => {
  const root = mkdtempSync(join(tmpdir(), "snypd-agent-t-"));
  cpSync("corpora/kill", root, { recursive: true });
  initRepo(root, { name: "T", email: "t@example.com" }).commit(["."], "init");
  return root;
};

/**
 * D1 is **red**, and this test says so precisely rather than being skipped.
 *
 * Everything the surface does one item at a time works: the upgrades apply, the post writes, the draft is
 * lint-clean in two calls. What fails is the second post onwards — publishing the first item checks out
 * `main`, and every other in-flight draft leaves the working tree with it. The diagnosis and the shape of
 * the fix are in docs/07 §6 "the write model"; it is a change to docs/02 §7, not a bug fix, so it is not
 * being made here.
 *
 * The failing set is asserted exactly. A fix makes this test fail — which is the point: it should not be
 * possible to change the write model and leave the kill test quietly saying the same thing.
 */
const KNOWN_RED = [
  "upgrade.publishing-a-draft", "upgrade.why-only-mcp",
  "new.exists", "new.chart", "new.flow",
  "theme.swapped", "theme.tokens", "published",
];

describe("kill test", () => {
  test("the parts that work, work — and the write model is why the rest does not", async () => {
    const r = await runAgent();

    // D1's sentence, taken literally: one draft, from nothing, lint-clean. This half passes.
    expect(r.draftCalls).toBeLessThanOrEqual(DRAFT_BUDGET);
    expect(r.lint.errors).toBe(0);
    expect(r.calls).toBeLessThanOrEqual(TOTAL_GATE);

    // The first post upgrades, publishes and builds — the surface itself is sound.
    const byId = new Map(r.checks.map((c) => [c.id, c]));
    expect(byId.get("upgrade.cold-start")!.ok).toBe(true);
    expect(byId.get("lint.clean")!.ok).toBe(true);
    expect(byId.get("built")!.ok).toBe(true);

    expect(r.checks.filter((c) => !c.ok).map((c) => c.id).sort()).toEqual([...KNOWN_RED].sort());
    expect(passed(r.checks)).toBe(false);
  }, 180_000);
});

describe("the defects the kill test found", () => {
  test("drafts chain onto each other — the S17 finding, pinned so a fix has to notice it", () => {
    const root = stage();
    try {
      const repo = Repo.open(root)!;
      const cfg = loadConfig(root);
      for (const slug of ["alpha", "beta"]) {
        const r = createContent(root, { type: "post", slug, frontmatter: { title: slug, date: "2026-04-01" }, body: "Words.", cfg });
        repo.useDraft("post", slug, r.paths);
        repo.commit(r.paths, `content: create post/${slug}`);
      }
      // This is the defect, not the design (docs/07 §6 "the write model"): beta is cut from alpha, so
      // publishing beta would carry alpha's unapproved commit to main, and publishing alpha first deletes
      // beta's base. `publishBase()` already names the branch both of them should have used.
      expect(repo.baseOf(draftBranch("post", "alpha"))).toBe("main");
      expect(repo.baseOf(draftBranch("post", "beta"))).toBe(draftBranch("post", "alpha"));
      expect(repo.publishBase()).toBe("main");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("an item's draft is readable while another item's branch is checked out", () => {
    const root = stage();
    try {
      const repo = Repo.open(root)!;
      const cfg = loadConfig(root);
      const a = createContent(root, { type: "post", slug: "alpha", frontmatter: { title: "Alpha", date: "2026-04-01" }, body: "The alpha body.", cfg });
      repo.useDraft("post", "alpha", a.paths);
      repo.commit(a.paths, "content: create post/alpha");
      const b = createContent(root, { type: "post", slug: "beta", frontmatter: { title: "Beta", date: "2026-04-01" }, body: "The beta body.", cfg });
      repo.useDraft("post", "beta", b.paths);
      repo.commit(b.paths, "content: create post/beta");
      // The tree is on beta's branch and holds no alpha at all; the draft is still what alpha's branch says.
      expect(repo.branch()).toBe(draftBranch("post", "beta"));
      expect(draftSource(root, cfg, "post", "alpha")).toContain("The alpha body.");
      expect(draftSource(root, cfg, "post", "beta")).toContain("The beta body.");
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
