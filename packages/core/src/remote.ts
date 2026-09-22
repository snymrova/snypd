/**
 * `site` › push, on a site that has nowhere to push yet — the backup step (docs/31 §5 · L5).
 *
 * Everything L2 built goes one way: `site` › deploy uploads `dist/` to Cloudflare through the host's
 * own CLI, and the site is live without a repository existing anywhere but this disk. That is the
 * shortest path to a URL and it is also, for exactly as long as it lasts, a site whose only copy is a
 * laptop. This module is the other half: when a person says *back it up*, `gh` creates the repository
 * and `git` fills it — and from then on the workflow `writeDeploy` already committed starts linting
 * and building every push, which is the second thing a repository is for.
 *
 * It is the same contract as `host.ts`, one host over: snypd holds no GitHub token, calls no API, and
 * runs somebody else's CLI as a child process. `gh` keeps the credential in its own store the way
 * `wrangler` does and the way `git` holds an SSH key. `SNYPD_GH` names an executable to run in place
 * of `gh` — the test suite points it at `gh.stub.sh` — and it is an environment variable rather than a
 * config key for `host.ts`'s reason: a site's config must not be able to redirect this at a program.
 *
 * **Three things the obvious implementation gets wrong**, each of which decided a line here.
 *
 * 1. **`--push` would push the drafts branch.** docs/31 §5 · L5 writes the step as
 *    `gh repo create --source=. --push`, and that flag cannot be used here. In gh 2.97.0's
 *    `pkg/cmd/repo/create/create.go` the working-tree branch of that flag is
 *    `opts.GitClient.Push(ctx, baseRemote, "HEAD")` — gh's own interactive prompt words it *"push
 *    commits from the current branch"* — and on a bare repo it is `push --mirror`. The current branch
 *    in a snypd site is **always `snypd/drafts`** (docs/02 §6: one branch, always checked out), so
 *    `--push` sends every unapproved word on the site to a brand-new remote, which is the one thing
 *    `pushSite` exists to refuse. So this creates the repository and adds the remote, and nothing
 *    more; the push is `pushSite`'s, `main:main`, one ref, never forced, policy checked, the `push`
 *    event fired. The flag would have saved one function call and lost every guarantee around it.
 *
 * 2. **Adding a remote silently moves the site onto the other deploy path.** `deployMode` reads an
 *    absent `deploy.mode` as *"a remote means this was connected the S18d′ way and deploys on push"*
 *    (decision 228), which is right for every site that existed before L1 and wrong the instant a
 *    backup remote appears on a site that has been deploying directly. Left alone, the sequence is:
 *    deploy → live → back it up → the next deploy refuses with *"this site deploys on push"*. So when
 *    the site is `direct` at the moment the remote is created and its config does not say so out loud,
 *    this writes `deploy.mode: direct` before it creates anything. The config change comes back as a
 *    path for the caller to commit, the way `deploySite` returns the `site.url` it set.
 *
 * 3. **The token needs `workflow` scope, and the failure arrives one step later.** Every site carries
 *    `.github/workflows/snypd.yml` from `writeDeploy`, so the first push carries a workflow file, and
 *    GitHub refuses that push outright when the OAuth token lacks the `workflow` scope — *"refusing to
 *    allow an OAuth App to create or update workflow"*, a message that arrives from `git push` after
 *    the repository has been created and names neither `gh` nor the scope it wants. `gh auth status`
 *    prints the scopes it holds, so this reads them first and refuses with `gh auth refresh -s
 *    workflow` while nothing has been created yet.
 */
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import type { LoadedConfig } from "./config";
import { Repo, principal } from "./git";
import { runTool, deployMode, type HostRun } from "./host";
import { originName, type PushBlocker } from "./push";
import { setConfig } from "./site";

/** How long `gh` gets — a create is one API call, and `auth status` validates a token over the network. */
const GH_TIMEOUT_MS = 60_000;
/** The scope GitHub demands of a push that carries `.github/workflows/` — every snypd site's first one does. */
export const WORKFLOW_SCOPE = "workflow";

/** How GitHub's CLI is reached on this machine, or the stub named by `SNYPD_GH`. */
export interface GhCli { kind: "gh" | "stub"; argv: string[] }

/** `gh` on the PATH, proved by a `--version` before it is trusted with anything. */
export function findGh(env: NodeJS.ProcessEnv = process.env): GhCli | undefined {
  if (env.SNYPD_GH) return { kind: "stub", argv: [env.SNYPD_GH] };
  try {
    if (spawnSync("gh", ["--version"], { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] }).status === 0)
      return { kind: "gh", argv: ["gh"] };
  } catch { /* not there, which is a state and not an error */ }
  return undefined;
}

export interface GhAccount { host: string; login: string; protocol?: string; scopes: string[] }

/**
 * `gh auth status`, read as the three facts a create needs: does `gh` run, is anybody logged in, and
 * does the token hold the scopes the *next* step will want.
 *
 * The output is prose in both directions — there is no `--json` on this subcommand — and it moved from
 * stderr to stdout across gh's 2.x line, so both are read. Two spellings of the same line are in the
 * wild: `Logged in to github.com account <login>` (2.4x and after) and `Logged in to github.com as
 * <login>` (before it).
 */
export async function ghAuth(root: string, cli: GhCli, opts: { timeoutMs?: number } = {}): Promise<{ runs: boolean; loggedIn: boolean; account?: GhAccount; run: HostRun }> {
  const run = await runTool(root, cli.argv, ["auth", "status"], { timeoutMs: opts.timeoutMs ?? GH_TIMEOUT_MS });
  if (run.spawnError) return { runs: false, loggedIn: false, run };
  const all = `${run.stdout}\n${run.stderr}`;
  const m = /Logged in to (\S+) (?:account|as) (\S+)/.exec(all);
  if (!m) {
    if (/not logged in|You are not logged into any/i.test(all)) return { runs: true, loggedIn: false, run };
    return { runs: run.ok, loggedIn: false, run };
  }
  const scopes = (/Token scopes:\s*(.+)/.exec(all)?.[1] ?? "").split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  return { runs: true, loggedIn: true, account: { host: m[1]!, login: m[2]!, protocol: /Git operations protocol:\s*(\S+)/.exec(all)?.[1], scopes }, run };
}

/**
 * What the repository is called. The Worker's name (`wrangler.toml`) is `slug(site.name)`, and a
 * repository by the same name is one fewer thing for a person to hold in their head; a site still on
 * the scaffold's name falls back to the directory, which is what the person typed after `init`.
 */
export function repoNameFor(root: string, cfg: LoadedConfig): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return slug(cfg.config.site.name) || slug(basename(root)) || "site";
}

export interface RemoteState {
  /** Already connected: there is nothing for this to do, and the name is `push`'s to use. */
  remote?: { name: string; url: string };
  origin?: string;
  gh?: GhCli["kind"];
  /** `undefined` until `gh auth status` has been asked. */
  loggedIn?: boolean;
  account?: GhAccount;
  /** The repository that would be created, and how it would be created. */
  name: string;
  visibility: "private" | "public";
  /** `deploy.mode: direct` would be written first, because a remote alone would move this site to `git`. */
  pinsMode: boolean;
  blockers: PushBlocker[];
  ok: boolean;
}

/**
 * Everything `createRemote` checks before it creates anything, as a report — `deployState`'s shape, for
 * `deployState`'s reason: a refusal is a sentence somebody can act on, and doctor renders the same rows.
 */
export async function remoteState(root: string, cfg: LoadedConfig, opts: { name?: string; public?: boolean; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<RemoteState> {
  const blockers: PushBlocker[] = [];
  const repo = Repo.open(root);
  const remote = repo?.defaultRemote();
  const st: RemoteState = {
    remote, origin: remote ? originName(remote.url) : undefined,
    name: opts.name ?? repoNameFor(root, cfg),
    visibility: opts.public ? "public" : "private",
    pinsMode: false, blockers, ok: false,
  };

  if (!repo) { blockers.push({ reason: "not a git repo", hint: "`git init` here. A repository on GitHub is a copy of one on this machine, and there is none." }); return st; }
  if (!repo.hasCommits()) { blockers.push({ reason: "nothing has been committed yet", hint: "`gh` refuses to create a repository from a tree with no commits, and it is right to. `site` › init commits the scaffold, and every content write commits itself." }); return st; }
  if (remote) {
    blockers.push({ reason: `this site already has a remote — \`${remote.name}\` → ${st.origin ?? remote.url}`, hint: "`site` › push sends the base branch there. Nothing needs creating." });
    return st;
  }

  const cli = findGh(opts.env);
  if (!cli) {
    // **Today's refusal**, unchanged (docs/31 §5 · L5): a person with no `gh` does what they did before,
    // and the sentence that told them how is `pushState`'s. This adds the one line that would have made
    // it a single call, because not knowing `gh` exists is the likeliest reason to be reading it.
    blockers.push({
      reason: "no remote, and GitHub's CLI (`gh`) is not on this machine, so one cannot be created from here",
      hint: "Either install it (https://cli.github.com) and ask again — this creates the repository, private, and pushes — or make an empty repo on GitHub by hand and:\n    git remote add origin git@github.com:you/your-site.git",
    });
    return st;
  }
  st.gh = cli.kind;

  const who = await ghAuth(root, cli, { timeoutMs: opts.timeoutMs });
  if (!who.runs) {
    blockers.push({ reason: `\`gh\` did not run${who.run.spawnError ? `: ${who.run.spawnError}` : ""}`, hint: `\`gh auth status\` in a shell shows why. ${who.run.stderr.trim().split("\n").pop() ?? ""}`.trim() });
    return st;
  }
  st.loggedIn = who.loggedIn;
  st.account = who.account;
  if (!who.loggedIn) {
    // Not `gh auth login` run by us, the way `deploy` runs `wrangler login` (decision 230). That login is
    // one browser tab and a click; this one is a device code a person reads off *this* terminal and types
    // into another — there is no callback to wait on and nothing we could hand them mid-tool-call.
    blockers.push({ reason: "GitHub does not know this machine", hint: "A person runs `gh auth login` in a shell once — it asks for a scope list, and `repo` and `workflow` are the two this needs — then ask again. Unlike the Cloudflare login, this one cannot be run from in here: it prints a code to type into a browser." });
    return st;
  }
  const scopes = who.account?.scopes ?? [];
  if (scopes.length && !scopes.includes("repo"))
    blockers.push({ reason: `this \`gh\` token cannot create repositories — its scopes are ${scopes.join(", ")}`, hint: "`gh auth refresh -s repo` adds the one it is missing." });
  else if (scopes.length && !scopes.includes(WORKFLOW_SCOPE))
    // Checked here rather than discovered by the push, which is the step it actually breaks — and which
    // breaks it *after* the repository exists, with a message that names neither `gh` nor the scope.
    blockers.push({
      reason: `this \`gh\` token cannot push a workflow file — its scopes are ${scopes.join(", ")}, with no \`${WORKFLOW_SCOPE}\``,
      hint: `Every snypd site carries \`.github/workflows/snypd.yml\`, and GitHub refuses a push that adds one unless the token says \`${WORKFLOW_SCOPE}\`. \`gh auth refresh -s ${WORKFLOW_SCOPE}\` in a shell, then ask again. Nothing has been created yet.`,
    });

  st.pinsMode = blockers.length === 0 && deployMode(root, cfg) === "direct" && !(cfg.config as { deploy?: { mode?: string } }).deploy?.mode;
  st.ok = blockers.length === 0;
  return st;
}

export interface RemoteResult {
  ok: boolean;
  /** The repository's web URL, as `gh` printed it. */
  url?: string;
  /** The remote `gh` added, read back from git rather than taken from stdout. */
  remote?: { name: string; url: string };
  origin?: string;
  visibility?: "private" | "public";
  /** `deploy.mode: direct` was written so that a backup remote does not move this site onto the push path. */
  modePinned?: boolean;
  /** Repo-relative paths this changed — the caller commits them *before* it pushes. */
  paths: string[];
  reason?: string;
  hint?: string;
  by: string;
  at: string;
  state: RemoteState;
}

/**
 * Create the repository and connect it — and nothing else. The push is the caller's, through
 * `pushSite`, for the reason in this file's header: `--push` would send `snypd/drafts`.
 */
export async function createRemote(root: string, cfg: LoadedConfig, opts: { name?: string; public?: boolean; description?: string; who?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<RemoteResult> {
  const who = opts.who ?? principal();
  const state = await remoteState(root, cfg, opts);
  const at = () => new Date().toISOString();
  const refuse = (reason: string, hint?: string, extra: Partial<RemoteResult> = {}): RemoteResult => ({ ok: false, paths: [], reason, hint, by: who, at: at(), state, ...extra });
  if (!state.ok) return refuse(state.blockers[0]!.reason, state.blockers[0]!.hint);

  // Before the network, not after: a remote that exists while `deploy.mode` still reads as absent is a
  // site whose next deploy refuses, and the window between the two calls is the whole failure.
  const paths: string[] = [];
  if (state.pinsMode) paths.push(...setConfig(root, "deploy.mode", "direct").paths);

  const cli = findGh(opts.env)!;
  const args = ["repo", "create", state.name, "--source", ".", "--remote", "origin", `--${state.visibility}`,
    ...(opts.description ? ["--description", opts.description] : [])];
  const run = await runTool(root, cli.argv, args, { timeoutMs: opts.timeoutMs ?? GH_TIMEOUT_MS });
  if (!run.ok) {
    const h = ghHint(`${run.stdout}\n${run.stderr}`, state.name);
    const last = run.stderr.trim().split("\n").filter(Boolean).pop();
    return refuse(h?.reason ?? run.spawnError ?? last ?? `gh repo create exited ${run.code}`, h?.hint ?? "gh's own words are above, verbatim; a host's refusal is not ours to paraphrase.", { paths });
  }

  // `gh` prints the repository's URL alone on stdout when there is no terminal (create.go: the `else`
  // branch of `isTTY`), and adds the remote itself with the git protocol the person's `gh` is set to.
  // The remote is read back from git rather than trusted from that line: what `push` will use is what
  // `git remote -v` says, and if the add somehow did not happen this must not report success.
  const url = /^https?:\/\/\S+$/m.exec(run.stdout)?.[0];
  const remote = Repo.open(root)?.defaultRemote();
  if (!remote)
    return refuse(`gh created ${url ?? state.name} but no remote is set on this repo`, `Connect it by hand: \`git remote add origin ${url ? `${url}.git` : "<url>"}\`, then \`site\` › push. The repository exists — do not create it again.`, { url, paths });

  return { ok: true, url: url ?? remote.url, remote, origin: originName(remote.url), visibility: state.visibility, modePinned: state.pinsMode, paths, by: who, at: at(), state };
}

/** The failures a first `gh repo create` actually has, each with the one line that fixes it (F3). */
export function ghHint(output: string, name = "the site"): { reason: string; hint: string } | undefined {
  if (/Name already exists on this account|already exists/i.test(output))
    return { reason: `a repository called \`${name}\` is already on this account`, hint: `Either it is this site's, already backed up from somewhere else — \`git remote add origin\` it and push — or the name is taken by something else and this one needs another. \`site\` › push \`name\` sets it.` };
  if (/HTTP 401|Bad credentials|authentication required/i.test(output))
    return { reason: "GitHub rejected this `gh` token", hint: "A person runs `gh auth login` in a shell and asks again. Snypd holds no GitHub credential; `gh` keeps its own." };
  if (/HTTP 403|not accessible by integration|Resource not accessible/i.test(output))
    return { reason: "this `gh` token is not allowed to create that repository", hint: "An organisation name needs a token with access to it — `gh auth refresh -s repo` and, for an org with SSO, `gh auth login` again to authorise it. A repository under the account's own name needs neither." };
  if (/could not resolve to a User|Could not resolve to an Organization/i.test(output))
    return { reason: "the owner in that name is not an account this token can see", hint: "`owner/name` needs an organisation this account belongs to; the bare name goes under the account itself." };
  return undefined;
}
