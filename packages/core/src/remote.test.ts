/**
 * `site` › push, on a site with nowhere to push — the backup step (docs/31 §5 · L5). Nothing here
 * reaches GitHub: `SNYPD_GH` points at `gh.stub.sh`, which prints gh 2.97.0's own lines and keeps its
 * state in a directory. What is pinned is the product's rules on top of gh, not gh:
 *
 *  1. **The drafts branch does not leave.** `createRemote` never passes `--push`, because gh's
 *     `--push` is `git push <remote> HEAD` and HEAD in a snypd site is always `snypd/drafts`. The
 *     argv the stub records is the assertion: it is the one that could regress silently and put every
 *     unapproved word on a public URL, and no other test in this repo would notice.
 *  2. **A backup does not move the site onto the other deploy path.** `deployMode` reads a remote with
 *     no `deploy.mode` as "the host builds on push"; creating one here writes `direct` first, so the
 *     next `site` › deploy still uploads.
 *  3. **Every refusal names its next action** (F3): no `gh`, not logged in, a token with no `repo`,
 *     a token with no `workflow` — that last one checked *before* anything is created, because it
 *     breaks the push and the push comes after the repository exists.
 *  4. **Success is read back from git**, not from gh's stdout: what `push` will use is `git remote -v`.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config";
import { git, initRepo } from "./git";
import { writeDeploy } from "./deploy";
import { deployMode } from "./host";
import { createRemote, findGh, ghAuth, ghHint, remoteState, repoNameFor } from "./remote";

const ROOT = "corpora/_test/remote";
const STATE = resolve("corpora/_test/remote-stub-state");
const STUB = resolve("packages/core/src/gh.stub.sh");

/** A site as `init` leaves it since L1: a repo, a commit, wrangler.toml, no remote — and live, via L2. */
function setup(opts: { remote?: boolean; push?: "agent" | "human"; mode?: "direct" | "git"; name?: string } = {}) {
  rmSync(ROOT, { recursive: true, force: true });
  rmSync(STATE, { recursive: true, force: true });
  mkdirSync(`${ROOT}/content/posts`, { recursive: true });
  const deploy = [opts.push ? `push: ${opts.push}` : "", opts.mode ? `mode: ${opts.mode}` : ""].filter(Boolean);
  writeFileSync(`${ROOT}/snypd.yaml`, `snypd: 1\nsite: { name: ${opts.name ?? "Remote test"}, url: "https://remote-test.stub.workers.dev" }\n${deploy.length ? `deploy: { ${deploy.join(", ")} }\n` : ""}`);
  writeDeploy(ROOT, "cloudflare", { name: opts.name ?? "Remote test" });
  initRepo(ROOT, { name: "T", email: "t@example.com" });
  git(ROOT, "add", "-A"); git(ROOT, "commit", "-q", "-m", "init");
  // The branch a snypd site always has checked out — the one gh's `--push` would have sent.
  git(ROOT, "checkout", "-q", "-b", "snypd/drafts");
  if (opts.remote) git(ROOT, "remote", "add", "origin", "git@github.com:t/remote.git");
  return loadConfig(ROOT);
}

/** A machine GitHub has already seen. After `setup`, always: `setup` wipes the stub's state with the site. */
const loggedIn = () => { mkdirSync(STATE, { recursive: true }); writeFileSync(`${STATE}/loggedin`, ""); };
const calls = () => existsSync(`${STATE}/calls`) ? readFileSync(`${STATE}/calls`, "utf8").trim().split("\n") : [];
const remoteOf = () => git(ROOT, "remote", "-v").stdout;

beforeEach(() => {
  process.env.SNYPD_GH = STUB; process.env.STUB_STATE = STATE;
  delete process.env.STUB_CREATE; delete process.env.STUB_SCOPES;
  mkdirSync(STATE, { recursive: true });
});
afterAll(() => { delete process.env.SNYPD_GH; delete process.env.STUB_STATE; rmSync(ROOT, { recursive: true, force: true }); rmSync(STATE, { recursive: true, force: true }); });

describe("gh, read back", () => {
  test("`auth status` in both of its spellings, with the scopes the next step will want", async () => {
    const cfg = setup();
    const out = await ghAuth(ROOT, { kind: "stub", argv: [STUB] });
    expect(out).toMatchObject({ runs: true, loggedIn: false });              // nobody logged in: exit 1, prose on stderr
    loggedIn();
    const on = await ghAuth(ROOT, { kind: "stub", argv: [STUB] });
    expect(on.loggedIn).toBe(true);
    expect(on.account).toMatchObject({ host: "github.com", login: "stubby", protocol: "https" });
    expect(on.account!.scopes).toEqual(["gist", "read:org", "repo", "workflow"]);
    expect(cfg.ok).toBe(true);
  });

  test("the failures a first create has, each with the line that fixes it", () => {
    expect(ghHint("GraphQL: Name against already exists on this account (createRepository)", "catbook")?.reason).toContain("`catbook`");
    expect(ghHint("HTTP 401: Bad credentials")?.hint).toContain("gh auth login");
    expect(ghHint("HTTP 403: Resource not accessible by integration")?.hint).toContain("gh auth refresh");
    expect(ghHint("something else entirely")).toBeUndefined();
  });

  test("the stub is what SNYPD_GH names, and `gh` is proved by a --version before it is trusted", () => {
    expect(findGh()).toEqual({ kind: "stub", argv: [STUB] });
    const real = findGh({});
    if (real) expect(real).toEqual({ kind: "gh", argv: ["gh"] });            // whatever this machine has
  });

  test("the repository is named after the site, the way the Worker is", () => {
    expect(repoNameFor(ROOT, setup({ name: "Cat Book" }))).toBe("cat-book");
  });
});

describe("what stops a backup, before anything is created (F3)", () => {
  test("every one of them is a sentence with its next action in it", async () => {
    const cfg = setup();

    const noGh = await remoteState(ROOT, cfg, { env: {} });
    // Only meaningful on a box that really has no `gh`; where one exists this asserts the other half.
    if (!noGh.gh) {
      expect(noGh.blockers[0]!.reason).toContain("`gh`");
      expect(noGh.blockers[0]!.hint).toContain("git remote add origin");     // today's refusal, unchanged
    }

    const out = await remoteState(ROOT, cfg);
    expect(out.ok).toBe(false);
    expect(out.loggedIn).toBe(false);
    expect(out.blockers[0]!.hint).toContain("gh auth login");

    loggedIn();
    process.env.STUB_SCOPES = "'gist', 'read:org'";
    const noRepo = await remoteState(ROOT, cfg);
    expect(noRepo.blockers[0]!.reason).toContain("cannot create repositories");
    expect(noRepo.blockers[0]!.hint).toContain("gh auth refresh -s repo");

    // The one that would otherwise be found by the push, after the repository exists: every site carries
    // .github/workflows/snypd.yml, and GitHub refuses a push that adds one without the scope.
    process.env.STUB_SCOPES = "'gist', 'repo'";
    const noWorkflow = await remoteState(ROOT, cfg);
    expect(noWorkflow.ok).toBe(false);
    expect(noWorkflow.blockers[0]!.reason).toContain("workflow");
    expect(noWorkflow.blockers[0]!.hint).toContain("gh auth refresh -s workflow");
    expect(calls().some((c) => c.startsWith("repo create"))).toBe(false);    // nothing was created by any of it
  });

  test("a site that already has a remote has nothing to create, and is told which one it has", async () => {
    const cfg = setup({ remote: true });
    loggedIn();
    const st = await remoteState(ROOT, cfg);
    expect(st.ok).toBe(false);
    expect(st.remote!.name).toBe("origin");
    expect(st.origin).toBe("github.com/t/remote");
    expect(st.blockers[0]!.reason).toContain("already has a remote");
    expect(calls()).toEqual([]);                                            // not even an auth check
  });

  test("two remotes and no `origin`: not a reason to create a third", async () => {
    const cfg = setup({ remote: true });
    git(ROOT, "remote", "rename", "origin", "upstream");
    git(ROOT, "remote", "add", "fork", "git@github.com:t/fork.git");
    loggedIn();
    const st = await remoteState(ROOT, cfg);
    expect(st.ok).toBe(false);
    // `defaultRemote` answers nothing here — `origin`, or the only one, or nothing — so a check written
    // on it would have created a third repository for somebody who already had two.
    expect(st.blockers[0]!.reason).toContain("2 remotes");
    expect(st.blockers[0]!.hint).toContain("will not add a third");
    expect(calls()).toEqual([]);
  });

  test("a tree with no commits: gh would refuse it, and this refuses it first", async () => {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(`${ROOT}/snypd.yaml`, `snypd: 1\nsite: { name: Empty, url: "https://e.example" }\n`);
    initRepo(ROOT, { name: "T", email: "t@example.com" });
    const st = await remoteState(ROOT, loadConfig(ROOT));
    expect(st.blockers[0]!.reason).toContain("nothing has been committed");
  });
});

describe("the backup itself (docs/31 §5 · L5)", () => {
  test("creates the repository, connects it — and never passes --push, because HEAD is the drafts branch", async () => {
    const cfg = setup();
    loggedIn();
    const r = await createRemote(ROOT, cfg);
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://github.com/stubby/remote-test");
    expect(r.visibility).toBe("private");
    expect(r.remote).toMatchObject({ name: "origin" });
    expect(remoteOf()).toContain(`${STATE}/remote-test.git`);             // the stub's stand-in for GitHub, on disk

    // **The assertion this file exists for.** gh's `--push` is `git push <remote> HEAD`, and HEAD here
    // is `snypd/drafts` — every unapproved word on the site. The push is `pushSite`'s, `main:main`.
    const create = calls().find((c) => c.startsWith("repo create"))!;
    expect(create).toBe("repo create remote-test --source . --remote origin --private");
    expect(create).not.toContain("--push");
    expect(git(ROOT, "branch").stdout).toContain("snypd/drafts");
    expect(git(ROOT, "rev-parse", "--abbrev-ref", "HEAD").stdout).toBe("snypd/drafts");
  });

  test("a backup is not a deploy path: `deploy.mode` is pinned to `direct` before the remote exists", async () => {
    const cfg = setup();
    loggedIn();
    expect(deployMode(ROOT, cfg)).toBe("direct");
    const r = await createRemote(ROOT, cfg);
    expect(r.modePinned).toBe(true);
    expect(r.paths).toEqual(["snypd.yaml"]);
    expect(readFileSync(`${ROOT}/snypd.yaml`, "utf8")).toContain("direct");
    // Without the pin this would now be `git`, and the next `site` › deploy would refuse.
    expect(deployMode(ROOT, loadConfig(ROOT))).toBe("direct");
  });

  test("a site that already says `deploy.mode` is left alone, in either direction", async () => {
    const cfg = setup({ mode: "git" });
    loggedIn();
    const r = await createRemote(ROOT, cfg);
    expect(r.ok).toBe(true);
    expect(r.modePinned).toBe(false);
    expect(r.paths).toEqual([]);
    expect(deployMode(ROOT, loadConfig(ROOT))).toBe("git");                 // a declared key is the person's
  });

  test("`public` is a choice and private is the default — a repo holds the drafts branch", async () => {
    const cfg = setup();
    loggedIn();
    const r = await createRemote(ROOT, cfg, { public: true, name: "catbook" });
    expect(r.visibility).toBe("public");
    expect(calls().find((c) => c.startsWith("repo create"))).toContain("catbook --source . --remote origin --public");
    // The site's own sentence, when it has one, goes on the repository as gh's `--description`.
    const two = setup();
    loggedIn();
    await createRemote(ROOT, two, { description: "A book of cats" });
    expect(calls().find((c) => c.startsWith("repo create"))).toContain("--description A book of cats");
  });

  test("a name already on the account is a refusal that says which of the two things it is", async () => {
    const cfg = setup();
    loggedIn();
    process.env.STUB_CREATE = "taken";
    const r = await createRemote(ROOT, cfg);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("already on this account");
    expect(r.hint).toContain("git remote add origin");
  });

  test("gh created it but no remote was added: not a success, and it does not ask for a second repository", async () => {
    const cfg = setup();
    loggedIn();
    process.env.STUB_CREATE = "noremote";
    const r = await createRemote(ROOT, cfg);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("no remote is set");
    expect(r.hint).toContain("do not create it again");
    expect(r.url).toBe("https://github.com/stubby/remote-test");
  });
});
