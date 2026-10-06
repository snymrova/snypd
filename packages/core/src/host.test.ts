/**
 * `site` › deploy (docs/31 §4; decisions 228–230). Nothing here reaches Cloudflare: `SNYPD_WRANGLER`
 * points at `wrangler.stub.sh`, which prints wrangler 4.135.0's own lines and keeps its state in a
 * directory. What is pinned is the product's rules on top of the host's tool, not the tool:
 *
 *  1. **The parser reads wrangler's real format**, tested on output read from its source — the target
 *     lines after `Deployed … triggers`, the `Uploaded` count, the version — and prefers a custom domain
 *     over the free hostname when both are there.
 *  2. **A first deploy is two uploads and one answer.** `site.url` was the placeholder; the host names
 *     the URL; the site is rebuilt against it and uploaded again, and the config change comes back as a
 *     path for the caller to commit.
 *  3. **Nobody logged in ⇒ a temporary account** (D1): `wrangler deploy --temporary`, no login and no
 *     click, a claim link and a deadline in the answer; the hour gone ⇒ a refusal naming both calls.
 *     **Login is the tool's to run** (230) when asked (`login: true`) and the person's to finish; a click
 *     that never comes is a refusal that carries the URL.
 *  4. **Every refusal names its next action** (F3): no host config, the other host, a git-connected
 *     site, a fresh account with no subdomain, `deploy.push: human`.
 *  5. **The placeholder moved.** `publishCheck` no longer refuses over it; `pushState` still does.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "./config";
import { git, initRepo } from "./git";
import { writeDeploy } from "./deploy";
import { createContent, publishCheck, approvals } from "./write";
import { deployHint, deployMode, deploySite, deployState, parseDeploy, parseTemporary, findRunner, readDeploy, deployPath, WRANGLER_VERSION } from "./host";
import { pushState } from "./push";

const ROOT = "corpora/_test/host";
const STATE = resolve("corpora/_test/host-stub-state");
const STUB = resolve("packages/core/src/wrangler.stub.sh");

/** A site as `init` leaves it since L1: a repo, a commit, wrangler.toml, the placeholder URL, no remote. */
function setup(opts: { url?: string; host?: "cloudflare" | "vercel" | "none"; remote?: boolean; push?: "agent" | "human"; mode?: "direct" | "git" } = {}) {
  rmSync(ROOT, { recursive: true, force: true });
  rmSync(STATE, { recursive: true, force: true });
  mkdirSync(`${ROOT}/content/posts`, { recursive: true });
  const deploy = [opts.push ? `push: ${opts.push}` : "", opts.mode ? `mode: ${opts.mode}` : ""].filter(Boolean);
  writeFileSync(`${ROOT}/snypd.yaml`, `snypd: 1\nsite: { name: Host test, url: "${opts.url ?? "http://localhost:4321"}" }\n${deploy.length ? `deploy: { ${deploy.join(", ")} }\n` : ""}`);
  const host = opts.host ?? "cloudflare";
  if (host !== "none") writeDeploy(ROOT, host, { name: "Host test" });
  initRepo(ROOT, { name: "T", email: "t@example.com" });
  git(ROOT, "add", "-A"); git(ROOT, "commit", "-q", "-m", "init");
  if (opts.remote) git(ROOT, "remote", "add", "origin", "git@github.com:t/host.git");
  return loadConfig(ROOT);
}

/** A build that is honest about the one thing the second upload exists for: dist/ carries `site.url`. */
const build = async (root: string) => {
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist", "index.html"), `<link rel="canonical" href="${loadConfig(root).config.site.url}/">`);
  writeFileSync(join(root, "dist", "404.html"), "<h1>404</h1>");
};

const calls = () => existsSync(`${STATE}/calls`) ? readFileSync(`${STATE}/calls`, "utf8").trim().split("\n") : [];

beforeEach(() => { process.env.SNYPD_WRANGLER = STUB; process.env.STUB_STATE = STATE; delete process.env.STUB_DEPLOY; delete process.env.STUB_LOGIN; delete process.env.STUB_TEMP; });
afterAll(() => { delete process.env.SNYPD_WRANGLER; delete process.env.STUB_STATE; rmSync(ROOT, { recursive: true, force: true }); rmSync(STATE, { recursive: true, force: true }); });

describe("wrangler's output, read back", () => {
  test("the target lines after `Deployed … triggers`, the upload count and the version — from 4.135.0's own format", () => {
    const out = [
      " ⛅️ wrangler 4.135.0",
      "───────────────────",
      "🌀 Building list of assets...",
      "✨ Read 40 files from the assets directory /tmp/my-site/dist",
      "🌀 Starting asset upload...",
      "🌀 Found 12 new or modified static assets to upload. Proceeding with upload...",
      "+ /index.html",
      "Uploaded 12 of 12 assets",
      "✨ Success! Uploaded 12 files (28 already uploaded) (1.23 sec)",
      "",
      "Total Upload: 0.23 KiB / gzip: 0.17 KiB",
      "Uploaded my-site (2.34 sec)",
      "Deployed my-site triggers (0.56 sec)",
      "  https://my-site.sunny.workers.dev",
      "  catbook.example (custom domain)",
      "Current Version ID: 8d2a1c1e-1a2b-4c3d-9e8f-0123456789ab",
    ].join("\n");
    const p = parseDeploy(out);
    expect(p.urls).toEqual(["https://my-site.sunny.workers.dev", "https://catbook.example"]);
    expect(p.url).toBe("https://catbook.example");                  // a domain a person attached beats the free hostname
    expect(p.uploaded).toBe(12);
    expect(p.skipped).toBe(28);
    expect(p.versionId).toBe("8d2a1c1e-1a2b-4c3d-9e8f-0123456789ab");
    // Only the free hostname, and nothing new to send: the second deploy of an unchanged site.
    const same = parseDeploy("No updated asset files to upload. Proceeding with deployment...\nDeployed my-site triggers (0.2 sec)\n  https://my-site.sunny.workers.dev\nCurrent Version ID: x\n");
    expect(same.url).toBe("https://my-site.sunny.workers.dev");
    expect(same.uploaded).toBe(0);
    // Routes and no workers.dev hostname: nothing this can call the site's URL, and it says so rather than guessing.
    expect(parseDeploy("Deployed w triggers (0.1 sec)\n  example.com/blog/* (zone name: example.com)\n").urls).toEqual(["https://example.com/blog/*"]);
  });

  test("the failures a first deploy has, each with the line that fixes it", () => {
    const fresh = deployHint("▲ [WARNING] You need to register a workers.dev subdomain before publishing to workers.dev\n✘ [ERROR] You can either deploy your worker to one or more routes by specifying them in your wrangler.toml file, or register a workers.dev subdomain here:\nhttps://dash.cloudflare.com/a1b2c3/workers/onboarding\n");
    expect(fresh?.reason).toContain("no workers.dev subdomain");
    expect(fresh?.hint).toContain("https://dash.cloudflare.com/a1b2c3/workers/onboarding");
    expect(deployHint("✘ [ERROR] You are not authenticated. Please run `wrangler login`.")?.hint).toContain("wrangler login");
    expect(deployHint("✘ [ERROR] Missing entry-point to Worker script or to assets directory")?.hint).toContain("build");
    expect(deployHint("something else entirely")).toBeUndefined();
  });

  test("the runner is the stub when SNYPD_WRANGLER names one — a config key could never do this", () => {
    expect(findRunner()).toEqual({ kind: "stub", argv: [STUB] });
    const real = findRunner({});
    // Whatever this machine has, the pin is in the argv: a tool whose output is parsed is a tool whose version is part of the contract.
    if (real) expect(real.argv.join(" ")).toContain(`wrangler@${WRANGLER_VERSION}`);
  });
});

describe("deploy state (docs/31 §4)", () => {
  test("who uploads: `deploy.mode` when declared, else a remote means git and none means direct (228)", () => {
    expect(deployMode(ROOT, setup())).toBe("direct");
    expect(deployMode(ROOT, setup({ remote: true }))).toBe("git");           // snypd.rocks: connected before L2, keeps deploying on push
    expect(deployMode(ROOT, setup({ remote: true, mode: "direct" }))).toBe("direct");
    expect(deployMode(ROOT, setup({ mode: "git" }))).toBe("git");
  });

  test("every state that stops a deploy is a sentence with its next action in it", async () => {
    const none = await deployState(ROOT, setup({ host: "none" }), { preflight: false });
    expect(none.ok).toBe(false);
    expect(none.blockers[0]!.reason).toContain("no host config");
    expect(none.blockers[0]!.hint).toContain("set_deploy");

    const vercel = await deployState(ROOT, setup({ host: "vercel" }), { preflight: false });
    expect(vercel.blockers[0]!.reason).toContain("vercel");
    expect(vercel.blockers[0]!.hint).toContain("push");

    const connected = await deployState(ROOT, setup({ remote: true }), { preflight: false });
    expect(connected.mode).toBe("git");
    expect(connected.blockers[0]!.reason).toContain("deploys on push");
    expect(connected.blockers[0]!.hint).toContain("`deploy.mode` `direct`");

    // A site as L1 leaves it: nothing in the way, and the URL is still the placeholder the host will replace.
    const fresh = await deployState(ROOT, setup(), { preflight: false });
    expect(fresh).toMatchObject({ ok: true, target: "cloudflare", mode: "direct", policy: "agent", placeholderUrl: true, wrangler: WRANGLER_VERSION });
    expect(fresh.loggedIn).toBeUndefined();                                  // not asked without preflight

    // With preflight: the stub says nobody is logged in, and that is a state, not a blocker — deploy logs in.
    const asked = await deployState(ROOT, setup());
    expect(asked).toMatchObject({ ok: true, runner: "stub", loggedIn: false });
    expect(calls()).toEqual(["whoami --json"]);
  });
});

describe("site › deploy — the walk's step 9 (docs/31 §3)", () => {
  test("a first deploy with `login: true`: login, build, upload, the URL read back, site.url set, build and upload again", async () => {
    const cfg = setup();
    const r = await deploySite(ROOT, cfg, { build, login: true });
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://host-test.stub.workers.dev");
    expect(r.loggedIn).toBe(true);                                           // the host had never seen this machine
    expect(r.urlSet).toBe("https://host-test.stub.workers.dev");
    expect(r.deploys).toBe(2);
    expect(r.paths).toEqual(["snypd.yaml"]);                                 // the caller commits it
    expect(r.files).toBe(2);
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.versionId).toBe("00000000-0000-4000-8000-000000000001");
    // The order is the walk's: who am I → login → deploy → deploy. The build is ours and leaves no line.
    expect(calls()).toEqual(["whoami --json", "login", "deploy", "deploy"]);
    // The file the host now holds was built against the URL the host gave — not localhost.
    expect(readFileSync(`${ROOT}/dist/index.html`, "utf8")).toContain('href="https://host-test.stub.workers.dev/"');
    expect(readFileSync(`${ROOT}/snypd.yaml`, "utf8")).toContain("https://host-test.stub.workers.dev");
    expect(readFileSync(`${ROOT}/snypd.yaml`, "utf8")).not.toContain("placeholder");   // the comment went with the value

    // L3: the deploy that knows writes it down, so doctor can answer "when did this last go up, and is
    // site.url the host's" without starting wrangler. It is in the disposable directory: a clone starts
    // with no record, which is true of the clone.
    const rec = readDeploy(ROOT)!;
    expect(rec).toMatchObject({ url: "https://host-test.stub.workers.dev", urls: ["https://host-test.stub.workers.dev"], files: 2, deploys: 2, target: "cloudflare", versionId: "00000000-0000-4000-8000-000000000001" });
    expect(rec.at).toBe(r.at);
    expect(rec.account).toBeUndefined();                                     // login ran; whoami's answer predates it
    expect(deployPath(ROOT)).toBe(join(ROOT, ".snypd", "deploy.json"));

    // Every deploy after the first: one upload, no login, nothing to commit.
    const again = await deploySite(ROOT, loadConfig(ROOT), { build });
    expect(again).toMatchObject({ ok: true, deploys: 1, paths: [], url: "https://host-test.stub.workers.dev" });
    expect(again.loggedIn).toBeUndefined();
    expect(again.urlSet).toBeUndefined();
    expect(calls().slice(4)).toEqual(["whoami --json", "deploy"]);
    // …and the record follows the last deploy, now with who the host said was logged in.
    expect(readDeploy(ROOT)).toMatchObject({ deploys: 1, at: again.at, account: { email: "stub@example.com" } });
  });

  test("no record until a deploy succeeds, and a truncated one reads as none", async () => {
    setup();
    expect(readDeploy(ROOT)).toBeUndefined();
    process.env.STUB_DEPLOY = "notauth";
    mkdirSync(STATE, { recursive: true }); writeFileSync(`${STATE}/loggedin`, "");   // logged in, and the host refuses the upload anyway
    const r = await deploySite(ROOT, loadConfig(ROOT), { build });
    expect(r.ok).toBe(false);
    expect(readDeploy(ROOT)).toBeUndefined();
    mkdirSync(join(ROOT, ".snypd"), { recursive: true });
    writeFileSync(deployPath(ROOT), '{"url": "https://x.example", "at"');
    expect(readDeploy(ROOT)).toBeUndefined();
  });

  test("a URL a person already set is not replaced by the host's free hostname", async () => {
    const cfg = setup({ url: "https://catbook.example" });
    const r = await deploySite(ROOT, cfg, { build });
    expect(r.ok).toBe(true);
    expect(r.deploys).toBe(1);
    expect(r.urlSet).toBeUndefined();
    expect(r.url).toBe("https://host-test.quiet-otter-1.workers.dev");                     // what answers today; the domain step is §7
    expect(loadConfig(ROOT).config.site.url).toBe("https://catbook.example");
  });

  test("`deploy.push: human` refuses the tool exactly as it refuses push (229), and names what a person runs", async () => {
    const r = await deploySite(ROOT, setup({ push: "human" }), { build });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("`deploy.push` is `human`");
    expect(r.hint).toContain(`wrangler@${WRANGLER_VERSION} deploy`);
    expect(calls()).toEqual(["whoami --json"]);                               // nothing built, nothing sent
    expect(existsSync(`${ROOT}/dist`)).toBe(false);
  });

  test("a click that never comes: the refusal carries the link wrangler opened and the command for a shell (230)", async () => {
    process.env.STUB_LOGIN = "hang";
    const r = await deploySite(ROOT, setup(), { build, login: true, loginTimeoutMs: 1500 });
    expect(r.ok).toBe(false);
    expect(r.loggedIn).toBe(false);
    expect(r.reason).toContain("login");
    expect(r.hint).toContain("https://dash.cloudflare.com/oauth2/auth?stub=1");
    expect(r.hint).toContain("wrangler@");
    expect(calls()).toEqual(["whoami --json", "login"]);
    // The group died with the timeout: no `sleep` — no callback server, in the real case — outlives the
    // refusal. Polled briefly, because a killed orphan is init's to reap and that is not instant.
    const orphan = () => spawnSync("pgrep", ["-f", "^sleep 30$"], { encoding: "utf8" }).stdout.trim();
    for (let i = 0; i < 20 && orphan(); i++) await Bun.sleep(50);
    expect(orphan()).toBe("");
  });

  test("a fresh account with no workers.dev subdomain, outside a harness: the onboarding link, and no second upload", async () => {
    process.env.STUB_DEPLOY = "nosub";
    const r = await deploySite(ROOT, setup(), { build, login: true });   // a temporary account comes with its subdomain
    expect(r.ok).toBe(false);
    expect(r.deploys).toBe(1);
    expect(r.reason).toContain("no workers.dev subdomain");
    expect(r.hint).toContain("https://dash.cloudflare.com/a1b2c3/workers/onboarding");
    expect(loadConfig(ROOT).config.site.url).toBe("http://localhost:4321");  // nothing was learned, nothing was set
  });

  test("a build that fails uploads nothing and says so", async () => {
    const r = await deploySite(ROOT, setup(), { build: async () => { throw new Error("rule 3: a broken link"); } });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("rule 3");
    expect(calls()).toEqual(["whoami --json"]);                              // nothing reached the host
  });
});

/**
 * D1: a machine with no Cloudflare credential deploys to a temporary account by default. The stub's
 * `temp` file is wrangler's per-machine cache of it: present ⇒ reused (same URL), gone ⇒ a new account
 * at a new URL, which is what the hour running out looks like from here.
 */
describe("site › deploy on a temporary account (D1)", () => {
  const clock = (iso: string) => () => new Date(iso);

  test("nobody logged in: no login, the URL, a claim link and a deadline, site.url set from it", async () => {
    const r = await deploySite(ROOT, setup(), { build, now: clock("2026-10-06T14:00:00Z") });
    expect(r.ok).toBe(true);
    expect(r.loggedIn).toBeUndefined();                                      // no tab, no click
    expect(r.url).toBe("https://host-test.quiet-otter-1.workers.dev");
    expect(r.temporary).toEqual({ name: "Quiet Otter", created: true, claimUrl: "https://dash.cloudflare.com/claim-preview?claimToken=quiet-otter-1", expiresAt: "2026-10-06T15:00:00.000Z" });
    expect(r.urlSet).toBe("https://host-test.quiet-otter-1.workers.dev");
    expect(r.deploys).toBe(2);
    expect(calls()).toEqual(["whoami --json", "deploy --temporary", "deploy --temporary"]);
    // The second upload reused the account the first one made, so the deadline is the first one's.
    expect(readDeploy(ROOT)!.temporary).toMatchObject({ created: true, expiresAt: "2026-10-06T15:00:00.000Z" });

    // Inside the hour: the same account, the same URL, one upload, nothing to commit.
    const again = await deploySite(ROOT, loadConfig(ROOT), { build, now: clock("2026-10-06T14:20:00Z") });
    expect(again).toMatchObject({ ok: true, deploys: 1, paths: [], url: "https://host-test.quiet-otter-1.workers.dev" });
    expect(again.temporary!.created).toBe(false);
    expect(again.urlSet).toBeUndefined();
  });

  test("the hour gone: it refuses and names both calls; `temporary: true` moves the site and site.url with it", async () => {
    await deploySite(ROOT, setup(), { build, now: clock("2026-10-06T14:00:00Z") });
    rmSync(`${STATE}/temp`);                                                 // wrangler's cache expired with the account
    const later = clock("2026-10-06T16:00:00Z");
    const r = await deploySite(ROOT, loadConfig(ROOT), { build, now: later });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("temporary Cloudflare account");
    expect(r.hint).toContain("login: true");
    expect(r.hint).toContain("temporary: true");
    expect(r.hint).toContain("claimToken=quiet-otter-1");
    expect(calls().slice(3)).toEqual(["whoami --json"]);                     // nothing built, nothing sent

    const moved = await deploySite(ROOT, loadConfig(ROOT), { build, temporary: true, now: later });
    expect(moved).toMatchObject({ ok: true, url: "https://host-test.quiet-otter-2.workers.dev", urlSet: "https://host-test.quiet-otter-2.workers.dev", deploys: 2 });
    expect(loadConfig(ROOT).config.site.url).toBe("https://host-test.quiet-otter-2.workers.dev");
  });

  test("claimed, then `login: true`: the site follows to the person's account and site.url with it", async () => {
    await deploySite(ROOT, setup(), { build, now: clock("2026-10-06T14:00:00Z") });
    const r = await deploySite(ROOT, loadConfig(ROOT), { build, login: true, now: clock("2026-10-06T16:00:00Z") });
    expect(r).toMatchObject({ ok: true, loggedIn: true, url: "https://host-test.stub.workers.dev", urlSet: "https://host-test.stub.workers.dev" });
    expect(r.temporary).toBeUndefined();
    expect(readDeploy(ROOT)!.temporary).toBeUndefined();
    expect(existsSync(`${STATE}/temp`)).toBe(false);                         // login cleared wrangler's cache, as the real one does
  });

  test("logged in: deploys to that account, and `temporary: true` is refused rather than ignored", async () => {
    setup();
    mkdirSync(STATE, { recursive: true }); writeFileSync(`${STATE}/loggedin`, "");
    const r = await deploySite(ROOT, loadConfig(ROOT), { build });
    expect(r).toMatchObject({ ok: true, url: "https://host-test.stub.workers.dev" });
    expect(r.temporary).toBeUndefined();
    expect(calls()).not.toContain("deploy --temporary");
    const t = await deploySite(ROOT, loadConfig(ROOT), { build, temporary: true });
    expect(t.ok).toBe(false);
    expect(t.reason).toContain("logged in");
    expect(t.hint).toContain("stub@example.com");
  });

  test("Cloudflare will not make one: the refusal offers a minute's wait or `login: true`", async () => {
    process.env.STUB_TEMP = "fail";
    const r = await deploySite(ROOT, setup(), { build });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("temporary account");
    expect(r.hint).toContain("login: true");
    expect(loadConfig(ROOT).config.site.url).toBe("http://localhost:4321");
  });

  test("the block is read from wrangler's own lines", () => {
    const out = "Temporary account ready:\n\tAccount: Omniscient Slash (reused)\n\tClaim within: 1 hour\n\tClaim URL: https://dash.cloudflare.com/claim-preview?claimToken=abc\n";
    expect(parseTemporary(out, new Date("2026-10-06T11:10:00Z"))).toEqual({ name: "Omniscient Slash", created: false, claimUrl: "https://dash.cloudflare.com/claim-preview?claimToken=abc", expiresAt: "2026-10-06T12:10:00.000Z" });
    expect(parseTemporary("Deployed x triggers")).toBeUndefined();
  });
});

describe("the placeholder moved (docs/31 §4 · the URL)", () => {
  test("publishCheck no longer asks; pushState still refuses", () => {
    const cfg = setup();
    writeFileSync(`${ROOT}/snypd.yaml`, `snypd: 1\nsite: { name: t, url: http://localhost:4321 }\ntypes: { post: { mcp: { write: publish } } }\n`);
    const cfg2 = loadConfig(ROOT);
    createContent(ROOT, { type: "post", slug: "p", frontmatter: { title: "P" }, body: "Words.", cfg: cfg2 });
    expect(publishCheck(ROOT, cfg2, approvals(ROOT), "post", "p").ok).toBe(true);
    git(ROOT, "remote", "add", "origin", "git@github.com:t/host.git");
    expect(pushState(ROOT, cfg).blockers.map((b) => b.reason).join(" ")).toContain("placeholder");
  });
});
