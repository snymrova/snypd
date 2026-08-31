/**
 * S16 — site-level writes. The MCP tests drive these through a real server; these are the rules themselves,
 * where they can be stated without JSON-RPC in the way: a bad patch is rolled back, a redirect cannot loop,
 * and a token left behind by a theme switch is still visible.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { loadConfig, setConfig, setRedirect, redirects, normalizeRoute, themeTokens, initSite, onPath, bundledDir, bundledNames, themeFile, themeFiles, themeHas, git, isRepoRoot, mcpCommand, commitHint, Repo, DEFAULT_BASE, PLACEHOLDER_URL, isPlaceholderUrl, initRepo, readHeartbeat, writeHeartbeat, harnessState, onboardingFacts, onboarded } from "./index";

const root = "corpora/_test/site-writes";
const config = (extra = "") => writeFileSync(`${root}/snypd.yaml`, `# a comment a human wrote\nsnypd: 1\nsite:\n  name: T   # and one here\n  url: https://t.example\n${extra}`);

describe("site config writes", () => {
  beforeEach(() => { rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true }); config(); });

  test("a patch keeps the human's comments and only moves the key it names", () => {
    setConfig(root, "site.name", "Renamed");
    const after = readFileSync(`${root}/snypd.yaml`, "utf8");
    expect(after).toContain("# a comment a human wrote");
    expect(after).toContain("# and one here");
    expect(after).toContain("name: Renamed");
    expect(after).toContain("url: https://t.example");
  });

  test("a patch that does not validate is rolled back on disk, and says why", () => {
    const before = readFileSync(`${root}/snypd.yaml`, "utf8");
    expect(() => setConfig(root, "site.url", "not a url")).toThrow(/does not validate/);
    expect(readFileSync(`${root}/snypd.yaml`, "utf8")).toBe(before);
    expect(loadConfig(root).ok).toBe(true);
  });

  test("setting a key to its current value writes nothing, so nothing is committed", () => {
    expect(setConfig(root, "site.name", "T").paths).toEqual([]);
    expect(setConfig(root, "site.name", "Other").paths).toEqual(["snypd.yaml"]);
  });

  test("a route is normalized once, so /a, a/ and /a/ are the same redirect", () => {
    expect([normalizeRoute("/a"), normalizeRoute("a/"), normalizeRoute("/a/")]).toEqual(["/a", "/a", "/a"]);
    expect(normalizeRoute("/")).toBe("/");
    setRedirect(root, "posts/old/", "/posts/new");
    expect(redirects(loadConfig(root))).toEqual({ "/posts/old": "/posts/new" });
  });

  test("a redirect cannot point at itself or close a loop, and can be removed", () => {
    expect(() => setRedirect(root, "/a", "/a")).toThrow(/itself/);
    setRedirect(root, "/a", "/b");
    expect(() => setRedirect(root, "/b", "/a")).toThrow(/loop/);
    setRedirect(root, "/a", null);
    expect(redirects(loadConfig(root))).toEqual({});
  });

  test("a token the active theme never declared is still reported, because a theme switch strands them", () => {
    config("theme:\n  use: editorial\n  tokens:\n    color.accent: \"#0a5\"\n    color.leftover: \"#000\"\n");
    const stranded = themeTokens(loadConfig(root)).filter((t) => t.overridden && !t.customisable);
    expect(stranded.map((t) => t.name)).toEqual(["color.leftover"]);
  });
});

describe("initSite", () => {
  const fresh = "corpora/_test/site-init";
  beforeEach(() => { rmSync(fresh, { recursive: true, force: true }); mkdirSync(fresh, { recursive: true }); });

  test("writes the smallest config that loads, plus the directories content lives in", () => {
    const r = initSite(fresh, { name: "New", url: "https://new.example/", description: "One line." });
    // The dirs the config names, not a guess: `post` lives in `content/posts`, so scaffolding
    // `content/post/` left every new site with a decoy folder beside the real one (S17b).
    expect(r.created).toEqual(["snypd.yaml", "content/posts/", "content/pages/", "content/authors/", "content/media/", ".gitignore", ".mcp.json"]);
    for (const t of Object.values(loadConfig(fresh).config.types)) expect(existsSync(`${fresh}/${t.dir}`)).toBe(true);
    const cfg = loadConfig(fresh);
    expect(cfg.ok).toBe(true);
    expect(cfg.config.site.name).toBe("New");
    expect(cfg.config.site.url).toBe("https://new.example");   // the trailing slash is dropped once, here
    expect(() => initSite(fresh, { name: "Again", url: "https://new.example" })).toThrow(/already exists/);
  });

  // S18a: registration is the only step between an installed binary and a usable product, and the
  // server's own `get-started` prompt cannot cover it — a harness that has not loaded the server cannot
  // run the server's prompts. So `init` writes it, and these are the two ways it goes wrong.
  test("registers the MCP server with the binary that is running, not the name `snypd`", () => {
    initSite(fresh, { name: "New", url: "https://new.example" });
    const j = JSON.parse(readFileSync(`${fresh}/.mcp.json`, "utf8")) as { mcpServers: Record<string, { command: string; args: string[] }> };
    const e = j.mcpServers.snypd!;
    expect(e.args.at(-1)).toBe("serve");
    // `snypd` may not be on PATH — an installer that dropped it in ~/.local/bin is one shell restart
    // away — and a registration naming a command the harness cannot spawn fails where nobody looks.
    expect(e.command).toBe(process.execPath);
    expect(existsSync(e.command)).toBe(true);
  });

  // S18d′, docs/08 §12.8: the file is committed, so the *clone* is its second reader, and an absolute
  // path is a guaranteed failure there — one that arrives as a harness that spawned something and
  // crashed, which the Desk cannot tell apart from a harness nobody restarted. Every branch below is
  // unreachable under `bun test`, which always takes the first: hence a function of its inputs.
  describe("the command a committed registration names", () => {
    const bin = "/opt/snypd/bin/snypd";
    const noPath = { PATH: "/nonexistent-a:/nonexistent-b" };

    test("a checkout is `bun <entry> serve`", () => {
      expect(mcpCommand("/home/x/.bun/bin/bun", "/repo/packages/cli/src/index.ts", noPath))
        .toEqual({ command: "/home/x/.bun/bin/bun", args: ["/repo/packages/cli/src/index.ts", "serve"] });
    });

    test("an installed `snypd` on PATH wins — portable, and verified rather than assumed", () => {
      const dir = mkdtempSync(join(tmpdir(), "snypd-path-"));
      writeFileSync(join(dir, "snypd"), "#!/bin/sh\n", { mode: 0o755 });
      expect(mcpCommand(bin, undefined, { PATH: `${dir}:/nonexistent` })).toEqual({ command: "snypd", args: ["serve"] });
    });

    test("a binary living in a bunx or npx cache names the launcher package, not the cache", () => {
      // `bunx @snypd/cli init` is docs/08 §2 step 4 — the majority path — and its binary sits in a
      // directory the package manager is entitled to delete. What gets written is the *package* name,
      // which since S18h is scoped: npm refused the bare `snypd` against `snyk`, and the binary keeps
      // that name only because the launcher's `bin` maps it (`deploy.ts` › `LAUNCHER`).
      expect(mcpCommand("/tmp/bunx-1000-@snypd/cli@0.1.0/node_modules/@snypd/linux-x64/bin/snypd", undefined, noPath))
        .toEqual({ command: "bunx", args: ["@snypd/cli", "serve"] });
      expect(mcpCommand("/home/x/.npm/_npx/9f2/node_modules/@snypd/linux-x64/bin/snypd", undefined, noPath))
        .toEqual({ command: "npx", args: ["-y", "@snypd/cli", "serve"] });
    });

    // S18j, and the reason this suite grew a case that builds its own PATH: every test above hands
    // `mcpCommand` a PATH that does not contain `snypd`, so branch 1 was only ever exercised against a
    // shim a test wrote on purpose. The real `bunx @snypd/cli init` arrives with the runner's own
    // `node_modules/.bin` on PATH — branch 1 found *that*, returned `snypd`, and the majority path
    // committed a command which is gone as soon as the cache is collected. The paths below are the ones
    // `bunx @snypd/cli init` actually produced on this machine, not constructed ones.
    test("a `snypd` on PATH that is the runner's own shim does not count as installed", () => {
      const cache = mkdtempSync(join(tmpdir(), "bunx-1000-@snypd-"));
      const dotbin = join(cache, "cli@latest", "node_modules", ".bin");
      mkdirSync(dotbin, { recursive: true });
      writeFileSync(join(dotbin, "snypd"), "#!/bin/sh\n", { mode: 0o755 });
      const exec = join(cache, "cli@latest", "node_modules", "@snypd", "linux-x64", "bin", "snypd");
      // PATH holds a real, statable `snypd` — and it is still the wrong thing to commit.
      expect(onPath("snypd", { PATH: `${dotbin}:/nonexistent` })).not.toBeNull();
      expect(mcpCommand(exec, undefined, { PATH: `${dotbin}:/nonexistent` }))
        .toEqual({ command: "bunx", args: ["@snypd/cli", "serve"] });
    });

    test("a durable install still wins, even while a cache is on PATH beside it", () => {
      // The exclusion is narrow: it drops cache hits, not the branch. Someone with a real global
      // install who runs `bunx @snypd/cli init` should still get the portable `snypd`.
      const real = mkdtempSync(join(tmpdir(), "snypd-real-"));
      writeFileSync(join(real, "snypd"), "#!/bin/sh\n", { mode: 0o755 });
      const cache = mkdtempSync(join(tmpdir(), "bunx-1000-@snypd-"));
      const dotbin = join(cache, "cli@latest", "node_modules", ".bin");
      mkdirSync(dotbin, { recursive: true });
      writeFileSync(join(dotbin, "snypd"), "#!/bin/sh\n", { mode: 0o755 });
      const exec = join(cache, "cli@latest", "node_modules", "@snypd", "linux-x64", "bin", "snypd");
      expect(mcpCommand(exec, undefined, { PATH: `${dotbin}:${real}` })).toEqual({ command: "snypd", args: ["serve"] });
    });

    test("otherwise the running binary, which is S18a's answer and still the right fallback", () => {
      // An installer that dropped it in ~/.local/bin is one shell restart from being on PATH, and until
      // that restart the only command demonstrably here is this one.
      expect(mcpCommand(bin, undefined, noPath)).toEqual({ command: bin, args: ["serve"] });
    });
  });

  test("never overwrites an .mcp.json that already names servers", () => {
    writeFileSync(`${fresh}/.mcp.json`, JSON.stringify({ mcpServers: { other: { command: "x", args: [] } } }));
    const r = initSite(fresh, { name: "New", url: "https://new.example" });
    expect(r.created).not.toContain(".mcp.json");   // it was not init's to create
    const j = JSON.parse(readFileSync(`${fresh}/.mcp.json`, "utf8")) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(j.mcpServers).sort()).toEqual(["other", "snypd"]);   // added beside, not over
  });

  test("leaves a snypd entry someone pointed somewhere on purpose alone", () => {
    writeFileSync(`${fresh}/.mcp.json`, JSON.stringify({ mcpServers: { snypd: { command: "/opt/snypd", args: ["serve", "/other/site"] } } }));
    initSite(fresh, { name: "New", url: "https://new.example" });
    const j = JSON.parse(readFileSync(`${fresh}/.mcp.json`, "utf8")) as { mcpServers: { snypd: { command: string } } };
    expect(j.mcpServers.snypd.command).toBe("/opt/snypd");
  });

  test("refuses a url that is not one, before anything is written", () => {
    expect(() => initSite(fresh, { name: "New", url: "example.com" })).toThrow(/is not a URL/);
    expect(loadConfig(fresh).ok).toBe(false);
  });

  // S18d, docs/08 decision 63. `snypd init` exited 2 without `--name` and `--url`, and `site` › init
  // called `need(args, "url")` — so a first-timer was asked for a production origin before seeing one
  // pixel, and the agent trying to help could not route around it either. The URL is genuinely required,
  // because the feed, sitemap and JSON-LD are absolute; it is required *at publish*, which is where
  // `publishCheck` now asks for it. Note what stays: a url that is *passed* and is wrong still throws —
  // an omission and a typo are different things and only one of them has a sensible default.
  test("with no arguments at all: named after the directory, on a placeholder origin", () => {
    const outside = mkdtempSync(join(tmpdir(), "snypd-unnamed-"));
    try {
      const r = initSite(outside, {});
      expect(r.name).toBe(basename(outside));
      expect(r.url).toBe(PLACEHOLDER_URL);
      expect(r.placeholderUrl).toBe(true);
      const cfg = loadConfig(outside);
      expect(cfg.ok).toBe(true);                                  // the whole point: a scaffold that loads
      expect(cfg.config.site.name).toBe(basename(outside));
      expect(isPlaceholderUrl(cfg.config.site.url)).toBe(true);
      // The placeholder says it is one, in the file a person opens — a config that looks finished and is
      // not is worse than one that is visibly unfinished.
      expect(readFileSync(`${outside}/snypd.yaml`, "utf8")).toContain("# placeholder");
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  test("a url that was given and is real is not a placeholder", () => {
    const r = initSite(fresh, { name: "New", url: "https://new.example/" });
    expect(r.url).toBe("https://new.example");   // trailing slash still stripped
    expect(r.placeholderUrl).toBe(false);
  });

  // S18d, docs/08 §7 · 1 → 2. The empty-directory first run failed one step *after* this one: no repo
  // meant the scaffold could not be committed, which meant the agent's first `content.create` refused on
  // a tree carrying it. These two tests are the whole rule — create the repo where it is unambiguously
  // ours to create, and nowhere else.
  test("an empty directory outside any repo gets one, on the branch a publish lands on", () => {
    const outside = mkdtempSync(join(tmpdir(), "snypd-init-"));
    try {
      const r = initSite(outside, { name: "New", url: "https://new.example" });
      expect(r.gitInit).toBe(true);
      expect(r.git).toBe(true);
      expect(isRepoRoot(outside)).toBe(true);
      expect(git(outside, "symbolic-ref", "--short", "HEAD").stdout).toBe(DEFAULT_BASE);   // unborn, so `rev-parse` would say "HEAD"
      // The point of the repo is that the scaffold can be committed into it — the step the first
      // `content.create` used to discover was missing.
      expect(Repo.open(outside)!.commit(r.paths, "site: init New").committed).toBe(true);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  // The first CI run this repo ever had failed here (S18d′): a GitHub runner has no git author identity,
  // and neither does a fresh laptop, a container or a devcontainer. `init` wrote the scaffold, created
  // the repo, and the commit silently did not happen — so the *next* call, `content.create`, refused on
  // a tree it was never told about, one step downstream of the cause.
  test("a machine with no git identity is told so, in the words that fix it", () => {
    const outside = mkdtempSync(join(tmpdir(), "snypd-noident-"));
    try {
      const r = initSite(outside, { name: "New", url: "https://new.example" });
      // `/dev/null` for both config scopes is how git itself is told to forget who you are.
      const noIdentity = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_AUTHOR_NAME: "", GIT_AUTHOR_EMAIL: "", GIT_COMMITTER_NAME: "", GIT_COMMITTER_EMAIL: "" };
      const saved = process.env;
      let out;
      try { process.env = noIdentity as never; out = Repo.open(outside)!.commit(r.paths, "site: init New"); }
      finally { process.env = saved; }
      expect(out.committed).toBe(false);
      expect(out.hint).toContain("git config --global user.email");
      expect(commitHint("*** Please tell me who you are.")).toContain("user.name");
      expect(commitHint("fatal: pathspec did not match")).toBeUndefined();   // only this failure gets it
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  test("never creates a repo inside somebody else's, and never around files it did not write", () => {
    // `corpora/_test` is inside this repo: empty, but a `git init` here would nest a repo in a checkout,
    // which is invisible until it has swallowed a directory of somebody's work.
    expect(initSite(fresh, { name: "New", url: "https://new.example" }).gitInit).toBe(false);
    expect(isRepoRoot(fresh)).toBe(false);

    const outside = mkdtempSync(join(tmpdir(), "snypd-init-"));
    try {
      writeFileSync(join(outside, "somebody-elses.md"), "# not ours\n");
      const r = initSite(outside, { name: "New", url: "https://new.example" });
      expect(r.gitInit).toBe(false);   // files here already — creating a repo around them is not ours to assume
      expect(r.git).toBe(false);
      expect(isRepoRoot(outside)).toBe(false);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});

// ── The bundled themes (S18a, decision 46) ────────────────────────────────────
// `bundled.ts` is what a compiled binary loads themes from. A theme file added without regenerating is
// a file the product does not ship — and every other test here passes anyway, because they run from a
// checkout where `themes/` is right there. This is the test that fails instead.
describe("bundled themes", () => {
  test("bundled.ts is in sync with themes/", async () => {
    const { generate } = await import("./bundled.gen");
    expect(generate()).toBe(readFileSync(`${import.meta.dir}/bundled.ts`, "utf8"));   // stale → `bun packages/core/src/bundled.gen.ts`
  });

  test("every file of every bundled theme is in it, as text or as a module", async () => {
    const { BUNDLED_NAMES } = await import("./bundled.gen");
    const { BUNDLED } = await import("./bundled");
    for (const name of BUNDLED_NAMES) {
      const dir = `${import.meta.dir}/../../../themes/${name}`;
      const walk = (d: string, base = dir): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) =>
        f.name === "node_modules" || f.name.startsWith(".") || f.name === "package.json" ? []
          : f.isDirectory() ? walk(`${d}/${f.name}`, base) : [`${d}/${f.name}`.slice(base.length + 1)]);
      const b = BUNDLED[name]!;
      expect(walk(dir).sort()).toEqual([...Object.keys(b.files), ...Object.keys(b.modules)].sort());
      for (const [f, text] of Object.entries(b.files)) expect(text, f).toBe(readFileSync(`${dir}/${f}`, "utf8"));
    }
  });

  test("a bundled theme loads through the seam with no directory to read", () => {
    // What the binary does: no disk, so `themeFile`/`themeHas` answer from the barrel. If these ever
    // fall back to `fs`, they return "missing" for a theme that is present — the S18a bug exactly.
    const dir = bundledDir("base");
    expect(existsSync(dir)).toBe(false);                      // there is genuinely no such directory
    expect(themeHas(dir, "theme.yaml")).toBe(true);
    expect(themeFile(dir, "theme.yaml")).toContain("theme: base");
    expect(themeHas(dir, "./primitives/stat.tsx")).toBe(true);   // theme.yaml writes the `./` form
    expect(themeFiles(dir)).toContain("layouts/post.tsx");
    expect(bundledNames()).toEqual(["base", "editorial"]);
    expect(themeFile(bundledDir("nope"), "theme.yaml")).toBeUndefined();
  });
});

/**
 * S18f — the heartbeat, and the six facts doctor and the Desk both render.
 *
 * The record exists because the Desk was wrong for every real user: "is a harness connected" lived in a
 * module-scoped object inside the MCP process, and since S18e the page that asks the question is
 * normally served by a different one (docs/08 §12.9).
 */
describe("the heartbeat and the first-run facts (S18f)", () => {
  const site = "corpora/_test/heartbeat";
  beforeEach(() => {
    rmSync(site, { recursive: true, force: true });
    mkdirSync(`${site}/content/posts`, { recursive: true });
    writeFileSync(`${site}/snypd.yaml`, "snypd: 1\nsite: { name: h, url: https://h.example }\n");
  });

  test("a record round-trips, and a foreign root is the same as no record", () => {
    expect(readHeartbeat(site)).toBeUndefined();
    writeHeartbeat(site, { startedAt: 1, calls: 3, lastMethod: "tools/call", client: "a-harness" });
    const rec = readHeartbeat(site)!;
    expect(rec).toMatchObject({ calls: 3, client: "a-harness", pid: process.pid });
    // A directory copied to another machine carries a record that is not about it.
    writeHeartbeat(site, { startedAt: 1, calls: 3, root: "/somewhere/else" });
    expect(readHeartbeat(site)).toBeUndefined();
  });

  /**
   * The defect four tests found the first time the heartbeat shipped. `initSite` writes the root
   * `.gitignore` only when there is not one already, so a repo that predates snypd never gets the
   * `.snypd/` line — and then `Repo.useDrafts` refuses every write, naming a file the user never wrote.
   */
  test("writing the record cannot make the tree dirty", () => {
    initRepo(site, { name: "T", email: "t@example.com" });
    git(site, "add", "-A"); git(site, "commit", "-q", "-m", "init");
    writeHeartbeat(site, { startedAt: Date.now(), calls: 1 });
    expect(readFileSync(`${site}/.snypd/.gitignore`, "utf8")).toBe("*\n");
    expect(Repo.open(site)!.dirty()).toEqual([]);
  });

  test("the four harness states are four different answers", () => {
    expect(harnessState(site).state).toBe("never");
    writeHeartbeat(site, { startedAt: Date.now(), calls: 0 });
    expect(harnessState(site).state).toBe("silent");           // spawned, and nothing has spoken to it
    writeHeartbeat(site, { startedAt: Date.now(), calls: 4 });
    expect(harnessState(site).state).toBe("connected");
    // A pid nothing is using: the harness had this server and let it go. Pid 2^22 is above the usual
    // `pid_max` on Linux and unused on macOS, so this is a dead pid rather than somebody else's.
    writeHeartbeat(site, { startedAt: Date.now(), calls: 4, pid: 4_194_304 });
    expect(harnessState(site).state).toBe("stale");
  });

  test("the six facts are derived from disk and nothing is stored", () => {
    const cfg = loadConfig(site);
    const bare = onboardingFacts(site, { cfg, items: 0 });
    expect(bare.config).toBe(true);
    expect(bare.git).toBe(false);
    expect(bare.registration.present).toBe(false);
    expect(bare.harness).toBe("never");
    expect(onboarded(bare)).toBe(false);

    initRepo(site, { name: "T", email: "t@example.com" });
    writeFileSync(`${site}/.mcp.json`, JSON.stringify({ mcpServers: { snypd: { command: "definitely-not-on-path", args: ["serve"] } } }));
    writeHeartbeat(site, { startedAt: Date.now(), calls: 2 });
    const f = onboardingFacts(site, { cfg, items: 1 });
    expect(f.git).toBe(true);
    expect(f.registration).toMatchObject({ present: true, names: true, missingCommand: true });
    expect(f.harness).toBe("connected");
    expect(onboarded(f)).toBe(false);                          // the command it names is not here

    // Nothing above wrote a progress file: delete the derived directory and the answers are unchanged
    // except the one that is a claim about a live process.
    rmSync(`${site}/.snypd`, { recursive: true, force: true });
    expect(onboardingFacts(site, { cfg, items: 1 }).harness).toBe("never");
    expect(onboardingFacts(site, { cfg, items: 1 }).git).toBe(true);
  });
});
