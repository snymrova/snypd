/**
 * `site` › deploy — the host's own CLI, run the way `git push` is run (docs/31 §4; decisions 228, 230).
 *
 * Snypd holds nothing a host issued and calls no deploy API; that line from `deploy.ts` still stands.
 * What changed in L2 is *who types the upload*. Until now the contract was "connect the repo in a
 * dashboard, and the host builds on push" — which is two browser sessions on somebody else's site and
 * the reason a stranger's walk to a URL was ten actions long. Now the binary runs `wrangler deploy`
 * from the site root through `npx`, exactly as it runs `git`: a child process, the host's own tool, the
 * credential in *that* tool's store and never read by ours. The URL comes back on stdout and is the
 * first true value `site.url` ever has.
 *
 * **Every line parsed here was read in wrangler 4.135.0's source**, the version that put snypd.rocks up
 * on 18 Sep and the one `WRANGLER_VERSION` pins — not guessed from a run, because a run shows one
 * account's happy path and the source shows every branch:
 *
 *  - `whoami --json` prints `{ "loggedIn": true, "authType", "email", "accounts": [...] }`, and when
 *    nobody is logged in it *throws* `{ "loggedIn": false }` as JSON and exits non-zero. The prose
 *    `whoami` exits 0 either way, so the JSON form is the only one a program can read.
 *  - `login` prints `Opening a link in your default browser: <url>` and, when the person has clicked,
 *    `Successfully logged in.` It listens on `localhost:8976` for the callback and has no timeout of
 *    its own; ours is `LOGIN_TIMEOUT_MS`, and the refusal on the way out carries the URL, so a person
 *    on a box with no browser still has the link.
 *  - `deploy` on an assets Worker prints `✨ Success! Uploaded N files (M already uploaded) (t sec)`
 *    — or `No updated asset files to upload` — then `Deployed <name> triggers (t sec)`, then one
 *    indented line per target: `https://<name>.<subdomain>.workers.dev` for the free hostname
 *    (the protocol is added *only* for workers.dev), `<pattern> (custom domain)` for a domain, then
 *    `Current Version ID: <uuid>`.
 *  - **The first deploy on a brand-new account** (docs/31 §4 ⚠ a, answered from source): the account has
 *    no `workers.dev` subdomain yet, and wrangler asks *"Would you like to register a workers.dev
 *    subdomain now?"* — a `confirm` whose non-interactive fallback is *no*, after which it exits with
 *    *"register a workers.dev subdomain here: https://dash.cloudflare.com/<account>/workers/onboarding"*.
 *    Two things make that a hint rather than a dead end. Wrangler detects an agent harness in the
 *    environment (`am-i-vibing`: Claude Code, Cursor, OpenCode and the rest) and, when it finds one,
 *    registers the subdomain itself from the project directory's name — so the walk in docs/31 §3, run
 *    from inside the harness, never sees the question. Outside one, `deployHint` turns the refusal into
 *    the one link that fixes it. Both are still owed a run on a fresh account; this is the source's
 *    answer, not the network's.
 *  - `routes = [{ pattern = "example.com", custom_domain = true }]` is a shape wrangler's config
 *    validator accepts and `deploy` publishes under *Custom domains* (⚠ b, likewise from source).
 *    That is docs/31 §7's domain step, after launch; nothing here writes it yet.
 *
 * `stdin` is closed on every call. Wrangler's prompts fall back to their defaults when there is no
 * terminal, which makes every run here deterministic and every question it would have asked a line
 * in stderr that `deployHint` can name. The one thing that is deliberately *not* set is any wrangler
 * environment variable: telemetry, colour and the rest are the person's settings on the person's
 * tool. Colour is stripped from the output we parse rather than turned off at the source.
 *
 * **`SNYPD_WRANGLER`** names an executable to run in place of `npx -y wrangler@<pin>`: the test suite
 * and CI's `onboard.live` bench (L4) point it at a script that prints the lines above, so the whole
 * walk is measured with no account and no network. It is an environment variable and not a config
 * key because a site's config must not be able to redirect a deploy to an arbitrary program.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPlaceholderUrl, type LoadedConfig } from "./config";
import { Repo, principal } from "./git";
import { ensureDisposableDir, INDEX_DIR } from "./paths";
import { deployTarget, type PushBlocker } from "./push";
import { setConfig } from "./site";
import type { DeployTarget } from "./deploy";

/** The wrangler this binary runs. Pinned for the reason `deploy.ts` pins the build command: a tool whose output is parsed is a tool whose version is part of the contract. */
export const WRANGLER_VERSION = "4.135.0";
/** How long a person gets to click *allow* in the tab `wrangler login` opened. */
export const LOGIN_TIMEOUT_MS = 5 * 60_000;
/** A first deploy installs wrangler (~40 MB) before it uploads anything; the pin makes the second one fast. */
export const DEPLOY_TIMEOUT_MS = 5 * 60_000;
const PREFLIGHT_TIMEOUT_MS = 3 * 60_000;

/** How wrangler is reached on this machine: a package runner, or the stub named by `SNYPD_WRANGLER`. */
export interface Runner { kind: "npx" | "bunx" | "stub"; argv: string[] }

export interface HostRun { ok: boolean; code: number; stdout: string; stderr: string; timedOut: boolean; spawnError?: string }

/**
 * `npx` first, `bunx` second — the order docs/31 §3 types them in, and the order a machine that has
 * `node` is likeliest to satisfy. Each is proved by a `--version` before it is trusted with a deploy.
 */
export function findRunner(env: NodeJS.ProcessEnv = process.env): Runner | undefined {
  if (env.SNYPD_WRANGLER) return { kind: "stub", argv: [env.SNYPD_WRANGLER] };
  const runs = (cmd: string) => { try { return spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] }).status === 0; } catch { return false; } };
  if (runs("npx")) return { kind: "npx", argv: ["npx", "-y", `wrangler@${WRANGLER_VERSION}`] };
  if (runs("bunx")) return { kind: "bunx", argv: ["bunx", `wrangler@${WRANGLER_VERSION}`] };
  return undefined;
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

/**
 * One foreign CLI invocation in the site root, stdin closed, output captured whole.
 *
 * In its own process group, and the timeout kills the group: `npx` starts `node`, which starts the
 * login's callback server on `localhost:8976`, and a `spawnSync` timeout would kill `npx` alone and
 * leave that server listening for a click that will now never be answered — found by the stub, whose
 * `sleep` outlived the test the same way.
 *
 * Exported because `remote.ts` runs `gh` under exactly these rules (L5) and that lesson is worth
 * inheriting rather than re-learning: `gh auth login` starts a callback server of its own.
 */
export function runTool(root: string, argv: string[], args: string[], opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<HostRun> {
  const [cmd, ...pre] = argv;
  return new Promise((resolve) => {
    let stdout = "", stderr = "", timedOut = false, done = false;
    const finish = (r: HostRun) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    const child = spawn(cmd!, [...pre, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...opts.env }, detached: process.platform !== "win32" });
    const timer = opts.timeoutMs ? setTimeout(() => {
      timedOut = true;
      try { if (child.pid) process.platform === "win32" ? child.kill() : process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }, opts.timeoutMs) : undefined;
    child.stdout!.setEncoding("utf8").on("data", (d: string) => { stdout += d; });
    child.stderr!.setEncoding("utf8").on("data", (d: string) => { stderr += d; });
    child.on("error", (err: NodeJS.ErrnoException) => finish({ ok: false, code: -1, stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), timedOut, spawnError: `${err.code ?? ""} ${err.message}`.trim() }));
    child.on("close", (code) => finish({ ok: code === 0, code: code ?? -1, stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), timedOut }));
  });
}

/** One wrangler invocation — `runTool` with the runner's prefix in front (`npx -y wrangler@<pin>`). */
export function wrangler(root: string, runner: Runner, args: string[], opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<HostRun> {
  return runTool(root, runner.argv, args, opts);
}

export interface HostAccount { email?: string; authType?: string; accounts: { name: string; id: string }[] }

/** `wrangler whoami --json`, read as the two facts a deploy needs: does wrangler run here, and is anybody logged in. */
export async function whoami(root: string, runner: Runner, opts: { timeoutMs?: number } = {}): Promise<{ runs: boolean; loggedIn: boolean; account?: HostAccount; run: HostRun }> {
  const run = await wrangler(root, runner, ["whoami", "--json"], { timeoutMs: opts.timeoutMs ?? PREFLIGHT_TIMEOUT_MS });
  if (run.spawnError) return { runs: false, loggedIn: false, run };
  // The JSON is the last thing on stdout, after the banner; a not-logged-in answer is JSON on the way out too.
  const json = /\{[\s\S]*\}\s*$/.exec(run.stdout)?.[0] ?? /\{[\s\S]*\}\s*$/.exec(run.stderr)?.[0];
  if (json) {
    try {
      const j = JSON.parse(json) as { loggedIn?: boolean; email?: string; authType?: string; accounts?: { name: string; id: string }[] };
      if (typeof j.loggedIn === "boolean") return { runs: true, loggedIn: j.loggedIn, account: j.loggedIn ? { email: j.email, authType: j.authType, accounts: j.accounts ?? [] } : undefined, run };
    } catch { /* fall through to the prose */ }
  }
  const all = `${run.stdout}\n${run.stderr}`;
  if (/not authenticated|not logged in/i.test(all)) return { runs: true, loggedIn: false, run };
  if (/logged in with/i.test(all)) return { runs: true, loggedIn: true, account: { accounts: [] }, run };
  return { runs: false, loggedIn: false, run };
}

export interface LoginResult { ok: boolean; /** The link wrangler opened, or would have — for the person whose browser did not. */ url?: string; reason?: string; hint?: string }

/**
 * `wrangler login` (decision 230): the binary runs it, the person clicks *allow*, once per machine.
 * A box with no browser gets the URL back in the refusal and the command to run by hand — the
 * headless fallback the decision asks for, and not a dead end.
 */
export async function hostLogin(root: string, runner: Runner, opts: { timeoutMs?: number } = {}): Promise<LoginResult> {
  const run = await wrangler(root, runner, ["login"], { timeoutMs: opts.timeoutMs ?? LOGIN_TIMEOUT_MS });
  const url = /Opening a link in your default browser:\s*(\S+)/.exec(run.stdout)?.[1];
  if (run.ok && /Successfully logged in/i.test(run.stdout)) return { ok: true, url };
  const by = `npx -y wrangler@${WRANGLER_VERSION} login`;
  if (run.timedOut)
    return { ok: false, url, reason: `nobody finished the Cloudflare login in ${Math.round((opts.timeoutMs ?? LOGIN_TIMEOUT_MS) / 60_000)} minutes`, hint: `${url ? `Open ${url} and click allow — then call deploy again. ` : ""}On a box with no browser a person runs \`${by}\` in a shell once; after that every deploy from this machine is silent.` };
  return { ok: false, url, reason: run.spawnError ?? (run.stderr.trim().split("\n").pop() || `wrangler login exited ${run.code}`), hint: `A person runs \`${by}\` in a shell once, on this machine, and calls deploy again.` };
}

export interface HostDeploy {
  ok: boolean;
  /** Every target wrangler reported, `https://` on all of them. The workers.dev one is free; the rest are domains a person attached. */
  urls: string[];
  /** The one to serve the site from: a custom domain when there is one, else the workers.dev hostname. */
  url?: string;
  /** Files sent this time, and files the host already had — `wrangler`'s own count. */
  uploaded?: number;
  skipped?: number;
  versionId?: string;
  reason?: string;
  hint?: string;
  run: HostRun;
}

/** `wrangler deploy` in the site root, and its stdout read back as the three facts a person is owed. */
export async function hostDeploy(root: string, runner: Runner, opts: { timeoutMs?: number } = {}): Promise<HostDeploy> {
  const run = await wrangler(root, runner, ["deploy"], { timeoutMs: opts.timeoutMs ?? DEPLOY_TIMEOUT_MS });
  const parsed = parseDeploy(run.stdout);
  if (run.ok && parsed.urls.length) return { ok: true, ...parsed, run };
  const all = `${run.stdout}\n${run.stderr}`;
  if (run.timedOut) return { ok: false, ...parsed, reason: `wrangler deploy gave up after ${Math.round((opts.timeoutMs ?? DEPLOY_TIMEOUT_MS) / 60_000)} minutes`, hint: "The first deploy also installs wrangler; on a slow line that alone can take a while. Call deploy again — an upload that was cut off is resumed, not repeated.", run };
  if (run.spawnError) return { ok: false, ...parsed, reason: run.spawnError, hint: "wrangler could not be started. `npx --version` in a shell says whether Node's package runner is on this machine; docs/31 §3 assumes it is.", run };
  const h = deployHint(all);
  const last = run.stderr.split("\n").map((l) => l.trim()).filter((l) => l && !/^\s*$/.test(l)).filter((l) => /ERROR|error|✘/.test(l)).pop() ?? run.stderr.trim().split("\n").pop() ?? "";
  return { ok: false, ...parsed, reason: run.ok ? "wrangler deploy finished without naming a URL" : (h?.reason ?? last ?? `wrangler deploy exited ${run.code}`), hint: h?.hint ?? (run.ok ? "Its output is in `run.stdout`; the target lines after `Deployed … triggers` are what this reads. A Worker with routes and no workers.dev hostname prints the routes instead — set `site.url` by hand in that case." : "wrangler's own words are above, verbatim; a host's refusal is not ours to paraphrase."), run };
}

/** The three facts, from stdout alone — exported so a stub's output can be checked against the real format's rules. */
export function parseDeploy(stdout: string): { urls: string[]; url?: string; uploaded?: number; skipped?: number; versionId?: string } {
  const lines = stdout.split("\n");
  const urls: string[] = [];
  let inTargets = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (/^Deployed .* triggers/.test(line)) { inTargets = true; continue; }
    if (inTargets) {
      const m = /^\s+(\S.*?)\s*$/.exec(line);
      if (!m) { inTargets = false; continue; }
      const target = m[1]!.replace(/\s*\(custom domain.*\)$/, "").replace(/\s*\(zone .*\)$/, "");
      if (/^https?:\/\//.test(target)) urls.push(target);
      else if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(target)) urls.push(`https://${target}`);
    }
  }
  const up = /Success! Uploaded (\d+) files?(?: \((\d+) already uploaded\))?/.exec(stdout);
  const uploaded = up ? Number(up[1]) : /No updated asset files to upload/.test(stdout) ? 0 : undefined;
  const skipped = up?.[2] ? Number(up[2]) : undefined;
  const versionId = /Current Version ID:\s*(\S+)/.exec(stdout)?.[1];
  const custom = urls.find((u) => !/\.workers\.dev(\/|$)/.test(u));
  const url = (custom ?? urls[0])?.replace(/\/+$/, "");
  return { urls, url, uploaded, skipped, versionId };
}

/** The failures a first deploy actually has, each with the one line that fixes it (F3). */
export function deployHint(output: string): { reason: string; hint: string } | undefined {
  const onboarding = /register a (?:different )?(?:workers\.dev )?subdomain (?:here:|at)\s*(https:\/\/dash\.cloudflare\.com\/\S+?)\.?(?:\s|$)/i.exec(output)?.[1];
  if (/workers\.dev subdomain/i.test(output) && (onboarding || /register a workers\.dev subdomain/i.test(output)))
    return { reason: "this Cloudflare account has no workers.dev subdomain yet, and wrangler could not ask for one without a terminal", hint: `Register one — it is a free hostname for every Worker on the account — ${onboarding ? `at ${onboarding}` : "in the Workers section of the Cloudflare dashboard"}, then call deploy again. Run from inside an agent harness, wrangler registers it itself from the site's directory name.` };
  if (/not authenticated|not logged in|Unable to authenticate|Authentication error|\b10000\b/i.test(output))
    return { reason: "Cloudflare does not know this machine", hint: `Call deploy again: it runs \`wrangler login\` first and a person clicks allow once. Or run \`npx -y wrangler@${WRANGLER_VERSION} login\` in a shell.` };
  if (/already taken|name is already in use|\b10008\b/i.test(output))
    return { reason: "a Worker with this name already exists on the account", hint: "`name` in wrangler.toml is the Worker's name and the first label of its free hostname. Change it to something this account does not already have, then deploy again." };
  if (/Missing entry-point|assets directory|does not exist|ENOENT.*dist/i.test(output))
    return { reason: "there is no dist/ to upload", hint: "`site` › build writes it. deploy builds before it uploads, so this means the build failed — its output is above." };
  return undefined;
}

/**
 * Who uploads (decision 228). `deploy.mode` when the config says; otherwise a site with a remote is one
 * that was connected the S18d′ way and keeps deploying on push, and a site with none — every site
 * `init` has made since L1 — deploys directly. snypd.rocks has a remote and no key, and stays `git`.
 */
export function deployMode(root: string, cfg: LoadedConfig): "direct" | "git" {
  const declared = (cfg.config as { deploy?: { mode?: "direct" | "git" } }).deploy?.mode;
  if (declared) return declared;
  return Repo.open(root)?.defaultRemote() ? "git" : "direct";
}

export interface DeployState {
  target?: DeployTarget;
  mode: "direct" | "git";
  /** `deploy.push` (decision 229): `human` means this tool reports and a person deploys. */
  policy: "agent" | "human";
  runner?: Runner["kind"];
  wrangler: string;
  /** `undefined` until preflight has asked; `false` means deploy will run `wrangler login` first. */
  loggedIn?: boolean;
  account?: HostAccount;
  /** `site.url` is still the placeholder: the first deploy sets it from the host and deploys again. */
  placeholderUrl: boolean;
  url: string;
  blockers: PushBlocker[];
  ok: boolean;
}

/**
 * Everything `site` › deploy checks before it uploads, as a report — the shape `pushState` has, for the
 * same reason: a refusal is a sentence somebody can act on, and the Desk and `doctor` (L3) render the
 * same rows. `preflight: false` reads only the tree; the default also asks wrangler who is logged in,
 * which costs a package-runner start and one request to Cloudflare.
 */
export async function deployState(root: string, cfg: LoadedConfig, opts: { preflight?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<DeployState> {
  const blockers: PushBlocker[] = [];
  const target = deployTarget(root);
  const mode = deployMode(root, cfg);
  const policy = (cfg.config as { deploy?: { push?: "agent" | "human" } }).deploy?.push ?? "agent";
  const url = cfg.config.site.url;
  const st: DeployState = { target, mode, policy, wrangler: WRANGLER_VERSION, placeholderUrl: isPlaceholderUrl(url), url, blockers, ok: false };
  if (!target) blockers.push({ reason: "no host config in this site", hint: "`site` › set_deploy `cloudflare` writes wrangler.toml — the one file the host's CLI reads — and the PR workflow. Then deploy." });
  else if (target !== "cloudflare") blockers.push({ reason: `${target} is configured here, and direct deploy runs Cloudflare's CLI only (docs/31 §7: the second host comes after launch)`, hint: "Connect the repo in Vercel's dashboard once and `site` › push; the host builds on push. Or `site` › set_deploy `cloudflare` beside it." });
  if (mode === "git") blockers.push({ reason: "this site deploys on push — `deploy.mode` is `git`" + ((cfg.config as { deploy?: { mode?: string } }).deploy?.mode ? "" : " (it has a remote, and no `deploy.mode` key)"), hint: "`site` › push sends the branch and the host builds it. To upload from here instead, `site` › set_config `deploy.mode` `direct`." });
  if (blockers.length || opts.preflight === false) { st.ok = blockers.length === 0; return st; }

  const runner = findRunner(opts.env);
  if (!runner) { blockers.push({ reason: "neither `npx` nor `bunx` is on this machine, so wrangler cannot be run", hint: "Install Node (https://nodejs.org — `npx` comes with it) or Bun (https://bun.sh), then deploy again. Snypd does not bundle the host's CLI." }); return st; }
  st.runner = runner.kind;
  const who = await whoami(root, runner);
  if (!who.runs) { blockers.push({ reason: `wrangler did not run through ${runner.kind}${who.run.spawnError ? `: ${who.run.spawnError}` : ""}`, hint: `\`${runner.argv.join(" ")} whoami\` in a shell shows why. ${who.run.stderr.trim().split("\n").pop() ?? ""}`.trim() }); return st; }
  st.loggedIn = who.loggedIn;
  st.account = who.account;
  st.ok = true;
  return st;
}

export interface DeployResult {
  ok: boolean;
  target?: DeployTarget;
  url?: string;
  urls?: string[];
  /** wrangler's counts for the *last* upload; `bytes` is dist/ on disk, which is what the host now holds. */
  uploaded?: number;
  skipped?: number;
  bytes?: number;
  files?: number;
  versionId?: string;
  /** `wrangler login` ran, and a person clicked. */
  loggedIn?: boolean;
  /** The first deploy set `site.url` from the host and deployed again with it: two uploads, one answer. */
  urlSet?: string;
  /** Repo-relative paths this changed (`snypd.yaml` when the URL was set) — the caller commits them. */
  paths: string[];
  deploys: number;
  reason?: string;
  hint?: string;
  by: string;
  at: string;
  state: DeployState;
}

/** What `deploySite` needs from the renderer, which `core` cannot import: build the site into `dist/`. */
export type BuildFn = (root: string) => Promise<unknown>;

/**
 * `.snypd/deploy.json` — the last deploy that left *this machine* (L3, docs/31 §4 "what the agent sees").
 *
 * Doctor's four host rows want facts the tree does not hold: has this site ever gone up, from where, and
 * is `site.url` the address the host actually answered with. The alternative is asking wrangler — a
 * package-runner start and one request to Cloudflare on every doctor call, for a fact that only changes
 * when *we* change it. So the deploy that knows writes it down, in the disposable directory beside
 * `dev.json` and `activity.json`, and a clone starts with "no deploy on record here", which is
 * true. The account is kept so "logged in" can be answered the same way: as of the last deploy, and
 * said as such.
 */
export interface DeployRecord {
  at: string;
  by: string;
  target: DeployTarget;
  url: string;
  urls: string[];
  files: number;
  bytes: number;
  uploaded?: number;
  versionId?: string;
  /** Who wrangler said was logged in when this went up — `whoami`'s answer, not a fresh one. */
  account?: HostAccount;
  /** How many uploads that call made: two on a first deploy, one after. */
  deploys: number;
}

export const deployPath = (root: string) => join(root, INDEX_DIR, "deploy.json");

/** Best effort, like `recordEvents`: a record that threw would fail the deploy it exists to describe. */
export function recordDeploy(root: string, rec: DeployRecord): void {
  const file = deployPath(root), tmp = `${file}.${process.pid}.tmp`;
  try {
    ensureDisposableDir(join(root, INDEX_DIR));
    writeFileSync(tmp, `${JSON.stringify(rec, null, 2)}\n`);
    renameSync(tmp, file);
  } catch { try { rmSync(tmp, { force: true }); } catch { /* nothing here is worth an exception */ } }
}

/** The record as written, or nothing. Shape-checked the way `readDev` is: a truncated write is no record. */
export function readDeploy(root: string): DeployRecord | undefined {
  const f = deployPath(root);
  if (!existsSync(f)) return undefined;
  try {
    const j = JSON.parse(readFileSync(f, "utf8")) as Partial<DeployRecord>;
    if (typeof j.url !== "string" || typeof j.at !== "string" || typeof j.target !== "string") return undefined;
    return { at: j.at, by: j.by ?? "", target: j.target, url: j.url, urls: Array.isArray(j.urls) ? j.urls.filter((u): u is string => typeof u === "string") : [j.url], files: j.files ?? 0, bytes: j.bytes ?? 0, uploaded: j.uploaded, versionId: j.versionId, account: j.account, deploys: j.deploys ?? 1 };
  } catch { return undefined; }
}

/**
 * The walk's step 9 (docs/31 §3): preflight, login if the host has never seen this machine, build,
 * upload, read the URL back — and when `site.url` was the placeholder, set it, build again and upload
 * again, because the feed, the sitemap and every JSON-LD block were written against `localhost` the
 * first time. Two uploads on a first deploy; one every time after.
 */
export async function deploySite(root: string, cfg: LoadedConfig, opts: { build: BuildFn; as?: "agent" | "human"; who?: string; env?: NodeJS.ProcessEnv; loginTimeoutMs?: number; deployTimeoutMs?: number }): Promise<DeployResult> {
  const who = opts.who ?? principal();
  const at = () => new Date().toISOString();
  const state = await deployState(root, cfg, { env: opts.env });
  const refuse = (reason: string, hint?: string, extra: Partial<DeployResult> = {}): DeployResult => ({ ok: false, target: state.target, paths: [], deploys: 0, reason, hint, by: who, at: at(), state, ...extra });
  if (!state.ok) return refuse(state.blockers[0]!.reason, state.blockers[0]!.hint);
  if (state.policy === "human" && (opts.as ?? "agent") !== "human")
    return refuse("`deploy.push` is `human` on this site", `A person deploys it: \`npx -y wrangler@${WRANGLER_VERSION} deploy\` from the site root after \`snypd build\`, or \`site\` › set_config \`deploy.push\` \`agent\` — the default for a new site — and this tool does.`);

  const runner = findRunner(opts.env)!;
  let loggedIn: boolean | undefined;
  if (state.loggedIn === false) {
    const login = await hostLogin(root, runner, { timeoutMs: opts.loginTimeoutMs });
    if (!login.ok) return refuse(login.reason!, login.hint, { loggedIn: false });
    loggedIn = true;
  }

  const paths: string[] = [];
  let deploys = 0;
  const once = async (): Promise<HostDeploy | DeployResult> => {
    try { await opts.build(root); } catch (e) { return refuse(`the build failed: ${(e as Error).message}`, "Nothing was uploaded. `site` › build says more; `content.lint` usually says why."); }
    deploys++;
    return await hostDeploy(root, runner, { timeoutMs: opts.deployTimeoutMs });
  };

  let d = await once();
  if ("state" in d) return d;
  if (!d.ok) return refuse(d.reason!, d.hint, { loggedIn, deploys });
  let urlSet: string | undefined;
  if (state.placeholderUrl && d.url) {
    const w = setConfig(root, "site.url", d.url);
    paths.push(...w.paths);
    urlSet = d.url;
    const again = await once();
    if ("state" in again) return { ...again, paths, urlSet, loggedIn };
    if (!again.ok) return refuse(again.reason!, again.hint, { loggedIn, deploys, paths, urlSet, url: d.url, urls: d.urls });
    d = again;
  }
  const size = distSize(join(root, "dist"));
  const done = at();
  recordDeploy(root, { at: done, by: who, target: state.target!, url: d.url!, urls: d.urls, files: size.files, bytes: size.bytes, uploaded: d.uploaded, versionId: d.versionId, account: state.account, deploys });
  return { ok: true, target: state.target, url: d.url, urls: d.urls, uploaded: d.uploaded, skipped: d.skipped, bytes: size.bytes, files: size.files, versionId: d.versionId, loggedIn, urlSet, paths, deploys, by: who, at: done, state };
}

/** What the host now holds, counted on disk — wrangler says how many files went, not how big the site is. */
export function distSize(dir: string): { files: number; bytes: number } {
  let files = 0, bytes = 0;
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { files++; bytes += statSync(p).size; }
    }
  };
  walk(dir);
  return { files, bytes };
}
