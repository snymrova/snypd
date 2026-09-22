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
 * **Who is allowed to press it is a declared policy, not a hardcoded refusal** (S19c, decision 80).
 * `deploy.push` is `agent` by default: the tool pushes. A site that sets `human` gets the S19a shape
 * back — `site` › push returns this state and the URL of the Desk's button, and does not push.
 *
 * S19a built the second of those as the only shape, on decision 44's argument that a human clicking is a
 * stronger gate than a `destructiveHint`. That argument is still true and is no longer the one that
 * decides: an interface that stops at the last mile and waits for a mouse is not "the only interface",
 * and the cases it breaks are not edge cases — CI, a headless box, a scheduled post, and D1's own kill
 * test, which cannot finish a site it is not allowed to publish. The gate that remains is the one that
 * was always doing the work: `publishCheck`, per type, in config a person owns.
 *
 * The Desk's button stays exactly where it was. It is a convenience now rather than a gate, and it is
 * still the only control on that page.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isPlaceholderUrl, type LoadedConfig } from "./config";
import { DRAFTS_BRANCH, Repo, principal, type GitResult } from "./git";
import { DEPLOY_TARGETS, type DeployTarget } from "./deploy";

/** Where the Desk's button lives, spelled once — `preview.ts` routes it and the MCP tool hands it out. */
export const PUSH_ROUTE = "/_snypd/push";

/**
 * What pushing the drafts branch exposes (S19d, decision 167) — written down here, once, and shown
 * before the first one leaves the machine, because pushing draft text is a different act from pushing
 * published text and the difference is not visible in a `git push` line.
 *
 * Read the way a person about to press it would: what becomes readable, by whom, what does not change.
 */
export const DRAFTS_PUSH_EXPOSES = [
  `Pushing \`${DRAFTS_BRANCH}\` sends every unapproved word on this site to the remote. On a public repository that is readable by anyone; on a private one, by everyone with read access — the same people who can read the published branch, but a draft is text nobody has approved yet.`,
  `A host that builds branches will build it, and since S19d a build of \`${DRAFTS_BRANCH}\` includes the drafts: the preview is a site with the unapproved text in it, at the host's preview URL, readable by anyone who has that URL. Every page is \`noindex\` and its robots.txt disallows, which keeps it out of search and out of nothing else.`,
  `Nothing is approved by a preview and nothing is published by it. Production is the base branch, and only a publish moves it. If the drafts must not be readable before approval, keep the repository private and the preview behind the host's own access control (Vercel protects previews by default; Cloudflare's can sit behind Access) — or do not push it.`,
];

export interface PushCommit { sha: string; subject: string }
/** Something that must be true before a push means anything. Both halves are shown to a person. */
export interface PushBlocker { reason: string; hint: string }

export interface PushState {
  /** The branch that would go: the one publishes land on — or `snypd/drafts`, when the state is for a preview push (S19d). */
  branch: string;
  /** This state is for the drafts branch, not the site: what goes is unapproved text, for a preview (S19d). */
  preview?: boolean;
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
  /** `deploy.push`: who may perform it. `agent` (the default) means this tool pushes. */
  policy: "agent" | "human";
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
export function pushState(root: string, cfg: LoadedConfig, opts: { drafts?: number; preview?: boolean } = {}): PushState {
  const blockers: PushBlocker[] = [];
  const repo = Repo.open(root);
  // A preview push sends the drafts branch (S19d); everything else sends the base. Same blockers, one
  // swapped: a site with no base yet has nothing published, which stops a push and not a preview.
  const branch = opts.preview ? DRAFTS_BRANCH : repo?.publishBase() ?? "main";
  const state = (extra: Partial<PushState> = {}): PushState => {
    const s: PushState = { branch, ...(opts.preview ? { preview: true } : {}), known: false, ahead: 0, commits: [], drafts: opts.drafts ?? 0, dirty: 0, deploy: deployTarget(root), policy: (cfg.config as { deploy?: { push?: "agent" | "human" } }).deploy?.push ?? "agent", blockers, ok: false, ...extra };
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

  // The feed, the sitemap and the JSON-LD are absolute, so a site pushed under the placeholder is a site
  // whose every canonical URL is `localhost`. In git mode the host builds exactly what was pushed, which
  // makes this the last place to catch it — and since L2 the only one: `publishCheck` stopped asking
  // (a publish is a commit, nothing is served by it) and `site` › deploy answers the question from the
  // host instead of asking it (docs/31 §4).
  if (isPlaceholderUrl(cfg.config.site.url))
    blockers.push({
      reason: `site.url is still ${cfg.config.site.url} — a placeholder`,
      hint: "`site` › set_config `site.url` to the origin this will be served from. The feed, sitemap and JSON-LD are absolute, so a push under the placeholder publishes localhost links.",
    });

  // A base that does not exist means nothing has ever landed: the repo has only the drafts branch. Pushing
  // it is the one thing this must not do — the drafts branch is every unapproved word on the site.
  if (!repo.exists(branch))
    blockers.push(opts.preview
      ? { reason: `there is no \`${DRAFTS_BRANCH}\` branch yet — nothing has been drafted`, hint: "The drafts branch is cut on the first content write. Write something, and a preview push has something to send." }
      : {
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
  /**
   * Repo-relative paths the sent commits changed (P3): what the `push` event's handlers are told about,
   * mapped to pages by `changedContent`. Every file on the branch when it had never been pushed before —
   * a first push puts the whole site live. Empty when nothing went.
   */
  paths?: string[];
}

/**
 * Send the base branch — or, with `preview`, the drafts branch (S19d).
 *
 * Until S19d the drafts branch was not sent and there was no option to send it: a host building a
 * non-production branch ran `snypd build`, which emitted published items only, so a pushed
 * `snypd/drafts` produced a preview of the site *without* the drafts in it — a worse answer than no
 * preview, and a public URL for the privilege. The build is branch-aware now (`builtBranch`), so a
 * pushed `snypd/drafts` is a site with the drafts in it, `noindex`, at the host's preview URL. What
 * that exposes is `DRAFTS_PUSH_EXPOSES`, and every caller shows it before the push, not after.
 *
 * `deploy.push` governs both: `human` is a person deciding what leaves this machine, and unapproved
 * text leaving it is the stronger case, not the weaker one. The Desk has no preview button — a person
 * on a `human` site pushes drafts from a shell, and the refusal says the command.
 */
export function pushSite(root: string, cfg: LoadedConfig, opts: { who?: string; timeoutMs?: number; as?: "agent" | "human"; preview?: boolean } = {}): PushResult {
  const st = pushState(root, cfg, { preview: opts.preview });
  if (!st.ok) return { ok: false, branch: st.branch, remote: st.remote?.name, sent: 0, reason: st.blockers[0]!.reason, hint: st.blockers[0]!.hint };
  // The one refusal the policy adds, and it never applies to the Desk: a person at a browser is the
  // thing `human` was asking for, so a button press is not something to send back to a button.
  if (st.policy === "human" && (opts.as ?? "agent") !== "human")
    return { ok: false, branch: st.branch, remote: st.remote?.name, sent: 0, reason: "`deploy.push` is `human` on this site", hint: opts.preview
      ? `A person pushes the drafts branch, from a shell: \`git push -u ${st.remote?.name ?? "origin"} ${DRAFTS_BRANCH}\`. The Desk's button sends the site, never the drafts. \`site\` › set_config \`deploy.push\` \`agent\` changes that, and is the default for a new site.`
      : "A person pushes it, from the button on the Desk under `snypd dev`. `site` › set_config `deploy.push` `agent` changes that, and is the default for a new site." };
  const repo = Repo.open(root)!;
  const remote = st.remote!;
  if (st.branch === DRAFTS_BRANCH && !opts.preview)
    return { ok: false, branch: st.branch, remote: remote.name, sent: 0, reason: `refusing to push \`${DRAFTS_BRANCH}\``, hint: "The drafts branch is every unapproved word on this site. Publish an item and the base branch is what goes — or ask for a preview, which sends the drafts on purpose and says what that exposes." };

  // What is about to go, read before the push moves the tracking ref (P3, for the `push` event): the
  // files between what the remote has and what it is getting, or the whole branch the first time.
  const changed = st.ahead === 0 ? [] : (st.known ? repo.run("diff", "--name-only", `${remote.name}/${st.branch}`, st.branch) : repo.run("ls-tree", "-r", "--name-only", st.branch)).stdout.split("\n").map((x) => x.trim()).filter(Boolean);
  const r: GitResult = repo.push(remote.name, st.branch, { setUpstream: !st.known, timeoutMs: opts.timeoutMs });
  const who = opts.who ?? principal();
  const at = new Date().toISOString();
  if (!r.ok) return { ok: false, branch: st.branch, remote: remote.name, sent: 0, reason: r.stderr || `git push exited ${r.code}`, hint: pushHint(r.stderr, st.branch), by: who, at };
  return { ok: true, branch: st.branch, remote: remote.name, sent: st.ahead, by: who, at, paths: changed };
}

/** The two failures a first push actually has, in the words of somebody who can fix them. */
export function pushHint(stderr: string, branch = "main"): string | undefined {
  if (/could not read Username|Authentication failed|terminal prompts disabled|Permission denied \(publickey\)|access rights/i.test(stderr))
    return `git could not authenticate to the remote, and snypd will not prompt for a credential inside a web request — a dev server has no terminal to ask on. Push once from a shell (\`git push -u origin ${branch}\`) so the credential helper or the ssh key is set up; after that this button works.`;
  if (/rejected|non-fast-forward|fetch first|behind/i.test(stderr))
    return "The remote has commits this clone does not. `git pull --rebase` and look at what came back before pushing again — snypd never force-pushes.";
  return undefined;
}
