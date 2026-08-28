/**
 * Git as the CMS's write log (docs/02 §6, §11). Every content write an agent makes is a commit on the
 * **drafts branch** — one branch for the whole site, `snypd/drafts`, always the checked-out one — and
 * publishing lands *one item's paths* onto the branch that branch was cut from, with plumbing rather than
 * a checkout and a merge. `main` therefore only ever moves by a published item, and the working tree only
 * ever moves once per site: nothing an agent does can make one draft disappear while it writes another.
 *
 * That is S17b, and it replaces a branch per item (docs/07 §6 "the write model"). A branch per item is
 * the obvious design and it cannot work here: there is one working tree, so at most one draft is visible
 * at a time, and a branch cut from another branch carries that branch's unapproved commits when it merges.
 * Both halves are fixed by moving isolation off the checkout and into the *land* — `land()` builds the
 * next `main` commit in a temporary index (`GIT_INDEX_FILE`), taking the base's tree and replacing exactly
 * the paths being published. Words nobody approved are not in that tree and are not in that commit's
 * ancestry either: the landed commit's only parent is the base.
 *
 * Two rules keep this safe to run inside another repo:
 *  - a site is git-backed only when `git rev-parse --show-toplevel` **is the site root**. A corpus
 *    under `corpora/100` therefore has no git ops at all — its toplevel is the snypd repo, and a
 *    benchmark must never commit to it.
 *  - only the paths a write touched are staged, so unrelated edits in the tree are left alone.
 * Runtime-neutral: `node:child_process`, no Bun API (docs/04 runtime interface).
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { userInfo } from "node:os";

export interface GitResult { ok: boolean; stdout: string; stderr: string; code: number }
export interface CommitResult { committed: boolean; sha?: string; branch?: string; reason?: string }

/** `agent:claude-code/<user>` (docs/02 §11). `SNYPD_PRINCIPAL` overrides; the trailer is the audit trail. */
export function principal(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SNYPD_PRINCIPAL) return env.SNYPD_PRINCIPAL;
  let user = env.SNYPD_USER || env.USER || env.LOGNAME || "";
  if (!user) { try { user = userInfo().username; } catch { user = "unknown"; } }
  return `agent:claude-code/${user}`;
}

/** One branch for every draft on the site. The tree sits here from the first write until the site is deleted. */
export const DRAFTS_BRANCH = "snypd/drafts";
/** Where drafts land when nothing else is recorded — a repo `snypd init` made, before its first publish. */
export const DEFAULT_BASE = "main";

export function git(root: string, ...args: string[]): GitResult { return gitEnv(root, {}, ...args); }

/** `git()` plus environment — `land()` needs `GIT_INDEX_FILE`, and nothing else may inherit it. */
function gitEnv(root: string, extra: Record<string, string>, ...args: string[]): GitResult {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...extra } });
  return { ok: r.status === 0, code: r.status ?? -1, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}

/**
 * Create a repo at `root` and refuse to hand one back unless `root` *itself* became the top level.
 *
 * `git()` runs with `cwd: root` and git finds a repo by walking **up**, so an init that did not take —
 * a missing directory, a failed call, a half-cleaned fixture — leaves every later `add -A` / `commit`
 * silently operating on the *enclosing* repo. That is not hypothetical: three test fixtures did their
 * own `git init` + `add -A` + `commit -m init`, and one of them committed the entire snypd working tree
 * as `T <t@example.com> "init"`. This is the header's first rule applied one level earlier — a tree that
 * cannot be its own repo must fail loudly rather than write into somebody else's.
 */
export function initRepo(root: string, user?: { name: string; email: string }): Repo {
  if (!existsSync(root)) throw new Error(`initRepo: ${root} does not exist`);
  const r = git(root, "init", "-q", "-b", "main");
  if (!r.ok) throw new Error(`initRepo: git init failed in ${root}: ${r.stderr}`);
  if (!isRepoRoot(root)) throw new Error(`initRepo: ${root} is not its own git top level after init (toplevel is ${git(root, "rev-parse", "--show-toplevel").stdout}) — refusing, because add/commit here would land in that repo`);
  if (user) { git(root, "config", "user.email", user.email); git(root, "config", "user.name", user.name); }
  return Repo.open(root)!;   // isRepoRoot passed one line above, so `open` cannot be undefined here
}

/** True when `root` is itself the top level of a work tree — not merely inside one (see the header). */
export function isRepoRoot(root: string): boolean {
  const r = git(root, "rev-parse", "--show-toplevel");
  if (!r.ok) return false;
  const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
  return real(r.stdout) === real(root);
}

export class Repo {
  private constructor(readonly root: string) {}
  /** A repo when the root is a work tree top level, `undefined` otherwise — callers then just write files. */
  static open(root: string): Repo | undefined { return isRepoRoot(root) ? new Repo(root) : undefined; }

  run(...args: string[]): GitResult { return git(this.root, ...args); }
  /**
   * The checked-out branch. `symbolic-ref` first, deliberately: on a repo whose first commit has not been
   * made yet `rev-parse --abbrev-ref HEAD` fails and returns nothing, and `useDrafts` would then record an
   * empty string as the branch drafts publish onto. `symbolic-ref` names the unborn branch correctly, and
   * falls back for the one case it cannot answer — a detached HEAD, where `rev-parse` says "HEAD".
   */
  branch(): string {
    const sym = this.run("symbolic-ref", "--quiet", "--short", "HEAD");
    return sym.ok && sym.stdout ? sym.stdout : this.run("rev-parse", "--abbrev-ref", "HEAD").stdout;
  }
  hasCommits(): boolean { return this.run("rev-parse", "--verify", "-q", "HEAD").ok; }
  exists(branch: string): boolean { return this.run("rev-parse", "--verify", "-q", `refs/heads/${branch}`).ok; }
  /**
   * Paths that differ from HEAD plus untracked ones, optionally scoped. Empty = clean.
   * Deliberately not `status --porcelain`: its lines are `XY path`, and an unstaged modification leads
   * with a space that `git()`'s trim eats — the first character of the path goes with it. These two
   * commands print bare paths, one per line, and `ls-files --others` lists untracked *files*, where
   * porcelain would collapse a new directory to `content/` and match nothing a caller just wrote.
   */
  dirty(paths: string[] = []): string[] {
    const tracked = this.hasCommits() ? this.run("diff", "--name-only", "HEAD", "--", ...paths) : this.run("diff", "--name-only", "--cached", "--", ...paths);
    const untracked = this.run("ls-files", "--others", "--exclude-standard", "--", ...paths);
    const lines = (r: GitResult) => (r.ok && r.stdout ? r.stdout.split("\n").filter(Boolean) : []);
    return [...new Set([...lines(tracked), ...lines(untracked)])];
  }
  /** The branch this one was cut from — recorded in its config so `land()` knows what a publish moves. */
  baseOf(branch: string): string | undefined { const r = this.run("config", "--get", `branch.${branch}.snypdBase`); return r.ok && r.stdout ? r.stdout : undefined; }

  /**
   * One file as it stands on a branch, without checking it out. `undefined` when the branch lacks it.
   *
   * Deliberately not `run()`: that trims, which is right for a ref name and wrong for a file — it eats the
   * trailing newline every content file ends with, so the bytes hash differently from the same file on disk
   * and every approval would read as "changed after it was approved".
   */
  show(branch: string, path: string): string | undefined {
    const r = spawnSync("git", ["show", `${branch}:${path}`], { cwd: this.root, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
    return r.status === 0 ? (r.stdout ?? "") : undefined;
  }

  /** The branch a publish moves: what `snypd/drafts` was cut from, or wherever HEAD is if it is not drafts. */
  publishBase(): string {
    const current = this.branch();
    return current === DRAFTS_BRANCH ? this.baseOf(DRAFTS_BRANCH) ?? DEFAULT_BASE : current;
  }

  /**
   * Put the tree on the site's one drafts branch, creating it from the current branch the first time.
   *
   * Called before every write, and after the first one it is a no-op — which is the point. A branch per
   * item (S17) checked out on every write, so the content folder only ever held the item written last;
   * one branch for all of them means every draft in flight is a file on disk, visible to the agent, to
   * `snypd build --drafts`, to the preview server and to the person reading it.
   *
   * Refuses when the tree carries work this write did not do: the one switch this ever performs would
   * otherwise carry somebody's uncommitted edit onto the drafts branch with it.
   */
  useDrafts(ours: string[] = []): { branch: string; base: string; created: boolean } {
    const branch = DRAFTS_BRANCH;
    const current = this.branch();
    if (current === branch) return { branch, base: this.baseOf(branch) ?? DEFAULT_BASE, created: false };
    const foreign = this.dirty().filter((p) => !ours.includes(p));
    if (foreign.length) throw new Error(`refusing to switch to ${branch}: ${foreign.length} uncommitted change(s) in the tree (${foreign.slice(0, 3).join(", ")}${foreign.length > 3 ? ", …" : ""}). Commit or stash them first — a branch switch would carry them onto the draft.`);
    const existed = this.exists(branch);
    const base = (existed ? this.baseOf(branch) : undefined) ?? (current || DEFAULT_BASE);
    const r = existed ? this.run("checkout", "-q", branch) : this.run("checkout", "-q", "-b", branch);
    if (!r.ok) throw new Error(`git checkout ${branch}: ${r.stderr}`);
    this.run("config", `branch.${branch}.snypdBase`, base);
    return { branch, base, created: !existed };
  }

  /** Stage exactly these paths and commit them with the principal trailer. No paths changed → no commit. */
  commit(paths: string[], subject: string, who = principal()): CommitResult {
    if (!paths.length) return { committed: false, reason: "nothing to commit" };
    const add = this.run("add", "--", ...paths);
    if (!add.ok) return { committed: false, reason: `git add: ${add.stderr}` };
    const staged = this.run("diff", "--cached", "--name-only", "--", ...paths).stdout;
    if (!staged) return { committed: false, reason: "no change" };
    const message = `${subject}\n\nSnypd-Principal: ${who}\n`;
    const c = this.run("-c", "core.hooksPath=/dev/null", "commit", "-q", "--no-verify", "-m", message, "--only", "--", ...paths);
    if (!c.ok) return { committed: false, reason: `git commit: ${c.stderr || c.stdout}` };
    return { committed: true, sha: this.run("rev-parse", "HEAD").stdout, branch: this.branch() };
  }

  /**
   * Land exactly these paths from the drafts branch onto the branch it was cut from. Publishing is the
   * only caller (docs/02 §6), and this is the whole safety claim of the write model.
   *
   * No checkout and no merge. The next `main` commit is built in a throwaway index: read the base's tree,
   * overwrite the published paths with the blobs the drafts branch has for them (or remove them, for a
   * trash), write the tree, commit it with the base as its **only** parent. Three properties follow, and
   * a merge has none of them:
   *  - the tree that lands carries one item's words; every other draft in flight is untouched on `main`.
   *  - unapproved commits do not become ancestors of `main`, so nothing unread is in its history either.
   *  - the working tree never moves, so the agent's content folder is the same before and after a publish.
   *
   * The drafts branch is then given the landed commit as a second parent, with its **own tree unchanged**
   * — a record, not a merge: it keeps `main` an ancestor of `snypd/drafts` so the two never diverge, and
   * because the tree is identical the checked-out files and the index stay exactly as they were.
   */
  land(paths: string[], subject: string, who = principal()): { ok: boolean; base?: string; sha?: string; changed: boolean; reason?: string } {
    const files = [...new Set(paths.filter(Boolean))];
    if (!files.length) return { ok: false, changed: false, reason: "nothing to land" };
    const from = this.branch();
    const base = from === DRAFTS_BRANCH ? this.baseOf(DRAFTS_BRANCH) ?? DEFAULT_BASE : from;
    if (from === base) return { ok: true, base, changed: false, reason: `already on ${base}` };
    if (!this.hasCommits()) return { ok: false, base, changed: false, reason: "nothing has been committed yet" };
    const uncommitted = this.dirty(files);
    if (uncommitted.length) return { ok: false, base, changed: false, reason: `uncommitted change(s) in ${uncommitted.slice(0, 3).join(", ")} — the publish would land a different version from the one that was approved` };

    // Relative to the repo root, which is `git()`'s cwd — an absolute path built from `this.root` would
    // be resolved against that cwd a second time when the root itself is relative, as it is under test.
    const index = `.git/snypd-land-${process.pid}-${Date.now()}.index`;
    const idx = (...args: string[]) => gitEnv(this.root, { GIT_INDEX_FILE: index }, ...args);
    try {
      const baseExists = this.exists(base);
      const read = baseExists ? idx("read-tree", base) : idx("read-tree", "--empty");
      if (!read.ok) return { ok: false, base, changed: false, reason: `git read-tree ${base}: ${read.stderr}` };
      for (const file of files) {
        const entry = this.run("ls-tree", "-z", from, "--", file).stdout.replace(/\0$/, "");
        if (entry) {
          const [meta] = entry.split("\t");
          const [mode, , sha] = meta!.split(/\s+/);
          const u = idx("update-index", "--add", "--cacheinfo", `${mode},${sha},${file}`);
          if (!u.ok) return { ok: false, base, changed: false, reason: `git update-index ${file}: ${u.stderr}` };
        } else {
          idx("update-index", "--force-remove", "--", file);   // absent on drafts = a trash: remove it from the base
        }
      }
      const tree = idx("write-tree");
      if (!tree.ok) return { ok: false, base, changed: false, reason: `git write-tree: ${tree.stderr}` };
      const baseTree = baseExists ? this.run("rev-parse", `${base}^{tree}`).stdout : "";
      if (tree.stdout === baseTree) return { ok: true, base, changed: false, reason: `${base} already has this version` };

      const parents = baseExists ? ["-p", this.run("rev-parse", base).stdout] : [];
      const commit = this.run("-c", "core.hooksPath=/dev/null", "commit-tree", tree.stdout, ...parents, "-m", `${subject}\n\nSnypd-Principal: ${who}\n`);
      if (!commit.ok) return { ok: false, base, changed: false, reason: `git commit-tree: ${commit.stderr}` };
      const sha = commit.stdout;
      // With the old value named: another process that moved `main` between the read-tree and here loses
      // the race loudly instead of having its commit dropped.
      const ref = baseExists ? this.run("update-ref", `refs/heads/${base}`, sha, this.run("rev-parse", base).stdout) : this.run("update-ref", `refs/heads/${base}`, sha);
      if (!ref.ok) return { ok: false, base, changed: false, reason: `git update-ref ${base}: ${ref.stderr}` };

      const head = this.run("rev-parse", from).stdout;
      const record = this.run("-c", "core.hooksPath=/dev/null", "commit-tree", this.run("rev-parse", `${from}^{tree}`).stdout, "-p", head, "-p", sha, "-m", `${subject} (landed on ${base})\n\nSnypd-Principal: ${who}\n`);
      if (record.ok) this.run("update-ref", `refs/heads/${from}`, record.stdout, head);
      return { ok: true, base, sha, changed: true };
    } finally { rmSync(join(this.root, index), { force: true }); }
  }

  /** Commits touching one path, newest first (`snypd://history/{type}/{slug}`). */
  history(path: string, limit = 20): { sha: string; date: string; subject: string; principal?: string }[] {
    const r = this.run("log", `-n${limit}`, "--format=%H%x1f%aI%x1f%s%x1f%(trailers:key=Snypd-Principal,valueonly)", "--", path);
    if (!r.ok || !r.stdout) return [];
    return r.stdout.split("\n").map((l) => { const [sha, date, subject, who] = l.split("\x1f"); return { sha: sha!, date: date!, subject: subject!, principal: who?.trim() || undefined }; });
  }
}
