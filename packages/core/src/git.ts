/**
 * Git as the CMS's write log (docs/02 §7, §11). Every content write an agent makes is a commit on a
 * per-item draft branch, carrying the principal in a trailer; publishing merges that branch. `main`
 * is never dirtied mid-edit, so a half-written post cannot reach a build.
 *
 * Two rules keep this safe to run inside another repo:
 *  - a site is git-backed only when `git rev-parse --show-toplevel` **is the site root**. A corpus
 *    under `corpora/100` therefore has no git ops at all — its toplevel is the snypd repo, and a
 *    benchmark must never commit to it.
 *  - only the paths a write touched are staged, so unrelated edits in the tree are left alone.
 * Runtime-neutral: `node:child_process`, no Bun API (docs/04 runtime interface).
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
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

export const draftBranch = (type: string, slug: string) => `snypd/draft-${type}-${slug}`;

export function git(root: string, ...args: string[]): GitResult {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
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
  branch(): string { return this.run("rev-parse", "--abbrev-ref", "HEAD").stdout; }
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
  /** The branch a draft was cut from — recorded in the branch's config so publish knows where to merge. */
  baseOf(branch: string): string | undefined { const r = this.run("config", "--get", `branch.${branch}.snypdBase`); return r.ok && r.stdout ? r.stdout : undefined; }

  /**
   * Put HEAD on the draft branch for one item, creating it from the current branch the first time.
   * Refuses when the tree carries other people's uncommitted work: switching branches would drag it along.
   */
  useDraft(type: string, slug: string, ours: string[] = []): { branch: string; base: string; created: boolean } {
    const branch = draftBranch(type, slug);
    const current = this.branch();
    if (current === branch) return { branch, base: this.baseOf(branch) ?? current, created: false };
    const foreign = this.dirty().filter((p) => !ours.includes(p));
    if (foreign.length) throw new Error(`refusing to switch to ${branch}: ${foreign.length} uncommitted change(s) in the tree (${foreign.slice(0, 3).join(", ")}${foreign.length > 3 ? ", …" : ""}). Commit or stash them first — a branch switch would carry them onto the draft.`);
    const existed = this.exists(branch);
    const base = (existed ? this.baseOf(branch) : undefined) ?? current;
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

  /** Merge a draft back into its base and delete it. Publishing is the only caller (docs/02 §7). */
  merge(branch: string, base = this.baseOf(branch), subject = `content: publish ${branch.replace(/^snypd\/draft-/, "")}`): { ok: boolean; base?: string; reason?: string } {
    if (!base) return { ok: false, reason: `no recorded base for ${branch}` };
    const foreign = this.dirty();
    if (foreign.length) return { ok: false, reason: `uncommitted changes in the tree (${foreign.slice(0, 3).join(", ")})` };
    const co = this.run("checkout", "-q", base);
    if (!co.ok) return { ok: false, reason: `git checkout ${base}: ${co.stderr}` };
    const m = this.run("-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "-q", "-m", `${subject}\n\nSnypd-Principal: ${principal()}\n`, branch);
    if (!m.ok) { this.run("merge", "--abort"); return { ok: false, reason: `git merge ${branch}: ${m.stderr || m.stdout}` }; }
    this.run("branch", "-q", "-D", branch);
    return { ok: true, base };
  }

  /** Commits touching one path, newest first (`snypd://history/{type}/{slug}`). */
  history(path: string, limit = 20): { sha: string; date: string; subject: string; principal?: string }[] {
    const r = this.run("log", `-n${limit}`, "--format=%H%x1f%aI%x1f%s%x1f%(trailers:key=Snypd-Principal,valueonly)", "--", path);
    if (!r.ok || !r.stdout) return [];
    return r.stdout.split("\n").map((l) => { const [sha, date, subject, who] = l.split("\x1f"); return { sha: sha!, date: date!, subject: subject!, principal: who?.trim() || undefined }; });
  }
}
