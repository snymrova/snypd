/**
 * `site` › push and the Desk's one button (S19a, `07` Phase 4, decision 44) — the only place a snypd
 * process makes something public.
 *
 * Everything else in this codebase writes files and git *locally*: a draft is a commit on
 * `snypd/drafts`, a publish is a commit landed on the base branch, and neither of them is visible to
 * anybody until the base reaches a host. That last step is the one this module is about, and it is
 * deliberately the smallest thing that could work — `git push <remote> <base>:<base>`. Snypd holds no
 * credential, calls no deploy API and knows nothing about Cloudflare or Vercel beyond the config file
 * `writeDeploy` wrote for them (`07` §3b). The host is watching the branch; the push is the event.
 *
 * **Who is allowed to press it is the whole design.** `pushState` is a read and anybody may call it;
 * `pushSite` is the act, and exactly one caller in the product performs it — the POST handler behind the
 * Desk's button, where a person is looking at a browser on their own machine. The MCP tool
 * (`site` › push) returns this state and the URL of that button, and does not push. That is decision
 * 44's argument taken literally: a human clicking is a stronger gate than a `destructiveHint` on a tool
 * an agent can call, and it is the difference between D6's "edited only via MCP" and a product where an
 * agent can put words on the internet on its own initiative.
 *
 * It is not a lock, and it does not pretend to be one. Anybody with the repo can type `git push`, and
 * that is the correct escape hatch for CI, for a headless box and for somebody who disagrees with us —
 * the point is that snypd's *own* surfaces do not do it for them.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isPlaceholderUrl, type LoadedConfig } from "./config";
import { DRAFTS_BRANCH, Repo, principal, type GitResult } from "./git";
import { DEPLOY_TARGETS, type DeployTarget } from "./deploy";

/** Where the Desk's button lives, spelled once — `preview.ts` routes it and the MCP tool hands it out. */
export const PUSH_ROUTE = "/_snypd/push";

export interface PushCommit { sha: string; subject: string }
/** Something that must be true before a push means anything. Both halves are shown to a person. */
export interface PushBlocker { reason: string; hint: string }

export interface PushState {
  /** The branch that would go: the one publishes land on. `snypd/drafts` is never it (see `pushSite`). */
  branch: string;
  remote?: { name: string; url: string };
  /** `github.com/owner/site`, when the URL is legible enough to say so — for a link, never for a decision. */
  origin?: string;
  /** The host config in the repo, if `init --deploy` wrote one. Absent is fine: any host that runs a
   *  binary and serves a folder needs none of it. */
  deploy?: DeployTarget;
  /** False when this clone has no `refs/remotes/<remote>/<branch>` — never pushed, or never fetched. */
  known: boolean;
  /** Commits the remote does not have, as of the last fetch. `0` with `known` is "up to date". */
  ahead: number;
  commits: PushCommit[];
  /** Items in flight that this push will **not** carry, because a draft is not on the base branch. */
  drafts: number;
  /** Uncommitted paths in the working tree — also not carried, and worth saying rather than implying. */
  dirty: number;
  blockers: PushBlocker[];
  /** Nothing stands in the way. `ahead === 0` with `ok` is a site that is already live and current. */
  ok: boolean;
}

/** `github.com/owner/repo` out of either URL shape, or nothing. Cosmetic: no decision reads it. */
export function originName(url: string): string | undefined {
  const m = /^(?:git@([^:]+):|(?:ssh|git|https?):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/)(.+?)(?:\.git)?\/?$/.exec(url);
  const host = m?.[1] ?? m?.[2];
  return host && m?.[3] ? `${host}/${m[3]}` : undefined;
}

/** The host config `writeDeploy` leaves in the repo, read by presence — the file is the declaration. */
export function deployTarget(root: string): DeployTarget | undefined {
  return DEPLOY_TARGETS.find((t) => existsSync(join(root, t === "cloudflare" ? "wrangler.toml" : "vercel.json")));
}

/**
 * Everything the Desk's push card and `site` › push both render, in one read of local git.
 *
 * Costs four to five `git` calls on a repo and one `existsSync` — no network, ever. The Desk memoises it
 * (see `preview.ts`), because the page it lives on inherits `preview.ttfb ≤ 50 ms` and a spawn per
 * request is the thing that budget forbids.
 */
export function pushState(root: string, cfg: LoadedConfig, opts: { drafts?: number } = {}): PushState {
  const blockers: PushBlocker[] = [];
  const repo = Repo.open(root);
  const branch = repo?.publishBase() ?? "main";
  const state = (extra: Partial<PushState> = {}): PushState => {
    const s: PushState = { branch, known: false, ahead: 0, commits: [], drafts: opts.drafts ?? 0, dirty: 0, deploy: deployTarget(root), blockers, ok: false, ...extra };
    s.ok = s.blockers.length === 0;
    return s;
  };

  if (!repo) {
    blockers.push({ reason: "not a git repo", hint: "`git init` here. A push sends a branch, and there is no branch." });
    return state();
  }
  if (!repo.hasCommits()) {
    blockers.push({ reason: "nothing has been committed yet", hint: "Write something — `site` › init commits the scaffold, and every content write commits itself." });
    return state();
  }

  const remote = repo.defaultRemote();
  if (!remote) {
    const many = repo.remotes().length > 1;
    blockers.push({
      reason: many ? "several remotes and none of them is `origin`" : "no remote — this repo is not connected to a host",
      hint: many
        ? "Name one `origin`, or push by hand: snypd sends the base branch to `origin` and will not guess between the others."
        : "Create an empty repo on GitHub, then:\n    git remote add origin git@github.com:you/your-site.git\nThe host watches that repo; snypd never talks to it directly.",
    });
  }

  // The same gate `publishCheck` applies one step earlier, for the same reason and one level up: the feed,
  // the sitemap and the JSON-LD are absolute, so a site pushed under the placeholder is a site whose every
  // canonical URL is `localhost`. Publishing already refuses; this is the last place to catch a repo whose
  // content was published before the URL was set.
  if (isPlaceholderUrl(cfg.config.site.url))
    blockers.push({
      reason: `site.url is still ${cfg.config.site.url} — a placeholder`,
      hint: "`site` › set_config `site.url` to the origin this will be served from. The feed, sitemap and JSON-LD are absolute, so a push under the placeholder publishes localhost links.",
    });

  // A base that does not exist means nothing has ever landed: the repo has only the drafts branch. Pushing
  // it is the one thing this must not do — the drafts branch is every unapproved word on the site.
  if (!repo.exists(branch))
    blockers.push({
      reason: `there is no \`${branch}\` branch yet — nothing has been published`,
      hint: `Everything so far is on \`${DRAFTS_BRANCH}\`, which is drafts and stays local. Publish one item (a human approves it on the review page, then \`content.publish\`) and \`${branch}\` comes into existence with it.`,
    });

  const un = remote && repo.exists(branch) ? repo.unpushed(remote.name, branch) : undefined;
  return state({
    remote,
    origin: remote ? originName(remote.url) : undefined,
    known: un?.known ?? false,
    ahead: un?.count ?? 0,
    commits: un?.commits ?? [],
    dirty: repo.dirty().length,
  });
}

export interface PushResult {
  ok: boolean;
  /** What was sent, when it was. */
  branch: string;
  remote?: string;
  /** Commits ahead at the moment the push was made — `0` means the remote already had them. */
  sent: number;
  /** git's own words, when it refused. Shown verbatim: a credential error is not ours to paraphrase. */
  reason?: string;
  hint?: string;
  by?: string;
  at?: string;
}

/**
 * Send the base branch. **The one caller is the Desk's POST handler** — see this file's header.
 *
 * The drafts branch is not sent and there is no option to send it. A host that builds a non-production
 * branch runs `snypd build`, which emits published items only, so a pushed `snypd/drafts` produces a
 * preview of the site *without* the drafts in it — a worse answer than no preview, and a public URL for
 * the privilege. Branch previews are `07` S19a's second half and they need the host's build command to
 * be branch-aware first; until that exists and is verified against a real project, this sends one branch.
 */
export function pushSite(root: string, cfg: LoadedConfig, opts: { who?: string; timeoutMs?: number } = {}): PushResult {
  const st = pushState(root, cfg);
  if (!st.ok) return { ok: false, branch: st.branch, remote: st.remote?.name, sent: 0, reason: st.blockers[0]!.reason, hint: st.blockers[0]!.hint };
  const repo = Repo.open(root)!;
  const remote = st.remote!;
  if (st.branch === DRAFTS_BRANCH)
    return { ok: false, branch: st.branch, remote: remote.name, sent: 0, reason: `refusing to push \`${DRAFTS_BRANCH}\``, hint: "The drafts branch is every unapproved word on this site. Publish an item and the base branch is what goes." };

  const r: GitResult = repo.push(remote.name, st.branch, { setUpstream: !st.known, timeoutMs: opts.timeoutMs });
  const who = opts.who ?? principal();
  const at = new Date().toISOString();
  if (!r.ok) return { ok: false, branch: st.branch, remote: remote.name, sent: 0, reason: r.stderr || `git push exited ${r.code}`, hint: pushHint(r.stderr, st.branch), by: who, at };
  return { ok: true, branch: st.branch, remote: remote.name, sent: st.ahead, by: who, at };
}

/** The two failures a first push actually has, in the words of somebody who can fix them. */
export function pushHint(stderr: string, branch = "main"): string | undefined {
  if (/could not read Username|Authentication failed|terminal prompts disabled|Permission denied \(publickey\)|access rights/i.test(stderr))
    return `git could not authenticate to the remote, and snypd will not prompt for a credential inside a web request — a dev server has no terminal to ask on. Push once from a shell (\`git push -u origin ${branch}\`) so the credential helper or the ssh key is set up; after that this button works.`;
  if (/rejected|non-fast-forward|fetch first|behind/i.test(stderr))
    return "The remote has commits this clone does not. `git pull --rebase` and look at what came back before pushing again — snypd never force-pushes.";
  return undefined;
}
