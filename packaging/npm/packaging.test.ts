/**
 * The release, driven the way a user gets it (S18d′).
 *
 * Decision 48 in one sentence: a gate measures the artefact, or it does not measure anything. `bun test`
 * can prove every function in `build.ts` returns the right object and still ship a launcher that cannot
 * find its binary, because the thing that breaks in distribution is the *seam* — a package name that
 * drifted, an `os`/`cpu` that excludes the host, a shim that assumes ESM under a runtime that is Node.
 * So the host package is built here for real, linked into a `node_modules` the way an installer would,
 * and run through `node` — never through `bun` — because `npx` is the runtime we are least in control of.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import { buildLauncher, buildTarget, formula, TARGETS, version } from "./build";
import { REPO } from "../../packages/bench/src/compile";

const LAUNCHER_SRC = join(REPO, "packaging", "npm", "cli");
const host = TARGETS.find((t) => t.os === process.platform && t.cpu === process.arch);

describe("the release manifest", () => {
  test("the launcher's platform map and TARGETS name the same packages", () => {
    // Two lists in two languages — the shim is CommonJS with no build step and cannot import the
    // TypeScript one. This is the test that makes a sixth platform one row plus a red line.
    const shim = readFileSync(join(LAUNCHER_SRC, "bin", "snypd.js"), "utf8");
    const map = shim.slice(shim.indexOf("const PACKAGES = {"), shim.indexOf("};", shim.indexOf("const PACKAGES = {")));
    const pairs = [...map.matchAll(/"([a-z0-9]+) ([a-z0-9]+)":\s*"(@snypd\/[a-z0-9-]+)"/g)].map((m) => ({ os: m[1]!, cpu: m[2]!, pkg: m[3]! }));
    expect(pairs.length).toBe(TARGETS.length);
    for (const t of TARGETS) expect(pairs).toContainEqual({ os: t.os, cpu: t.cpu, pkg: t.pkg });
  });

  test("one version, in every file that carries one", () => {
    const read = (...p: string[]) => JSON.parse(readFileSync(join(REPO, ...p), "utf8")) as { version: string; optionalDependencies?: Record<string, string> };
    const v = version();
    expect(read("packages", "cli", "package.json").version).toBe(v);   // what `snypd --version` prints
    // What `--deploy` pins a host's build command to. A version that was never published is a site that
    // cannot deploy, and the failure lands on somebody else's build log.
    expect(read("packages", "core", "package.json").version).toBe(v);
    const launcher = read("packaging", "npm", "cli", "package.json");
    expect(launcher.version).toBe(v);
    // Exact pins, one per target: a range here would let a resolver pair this launcher with an older binary.
    expect(launcher.optionalDependencies).toEqual(Object.fromEntries(TARGETS.map((t) => [t.pkg, v])));
  });

  test("the formula names a real asset for every platform brew serves", () => {
    const f = formula(Object.fromEntries(TARGETS.map((t) => [t.pkg, "a".repeat(64)])), "9.9.9");
    for (const t of TARGETS.filter((x) => x.os !== "win32"))
      expect(f).toContain(`releases/download/v9.9.9/snypd-${t.os}-${t.cpu}.tar.gz`);
    expect(f).not.toContain("SHA256_PENDING");
    expect(f).toContain('assert_match "usage: snypd"');
  });
});

describe("the workflows", () => {
  // Found the hard way in S18d′: `bench.yml` carried `with: { bun-version: ${{ matrix.bun }} }` from S1,
  // which is a YAML parse error — `{` and `}` are structural inside a flow mapping — and GitHub fails such
  // a run in 0 s with "workflow file issue" and no log to read. It went unseen for eighteen sessions
  // because the repo had no remote until this one. A workflow is code that only ever runs somewhere else,
  // so the one check that can be run here is the one that catches this.
  test("every workflow file parses", () => {
    const dir = join(REPO, ".github", "workflows");
    const files = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    expect(files.length).toBeGreaterThan(1);
    // `Bun.YAML` rather than the `yaml` package: this file is outside the workspace, so it has no
    // `node_modules` of its own, and a release script that needed one would be a release script that
    // cannot run from a clean checkout.
    for (const f of files) expect(() => Bun.YAML.parse(readFileSync(join(dir, f), "utf8"))).not.toThrow();
  });

  test("the release publishes platform packages before the launcher", () => {
    // The launcher's `optionalDependencies` are exact pins. Publishing it first leaves a window in which
    // `npm i @snypd/cli` resolves a launcher whose binary does not exist yet. Since S18h the launcher is
    // staged at `npm/launcher` — a role-named directory, so the `@snypd/*` glob names the five binaries
    // and nothing else. Staging it as `npm/@snypd/cli` would put it inside the glob and silently lose
    // the ordering this test exists to hold.
    const y = readFileSync(join(REPO, ".github", "workflows", "release.yml"), "utf8");
    // One loop, and the glob expands before the launcher's own path — so the order is in the shell
    // word list rather than in two statements that could be reordered without anything noticing.
    const loop = y.slice(y.indexOf("for d in dist/release/npm/"));
    expect(loop.indexOf("@snypd/*")).toBeLessThan(loop.indexOf("dist/release/npm/launcher"));
    // A retry after a partial publish must not die on EPUBLISHCONFLICT (v0.1.0's first attempt).
    expect(y).toContain("already on the registry — skipping");
    expect(y).toContain("--provenance");
    expect(y).toContain("id-token: write");   // provenance is signed with the run's OIDC identity or not at all
  });

  // The same drift, one file over. `release.yml` was updated when S18h moved the launcher to
  // `npm/launcher`; the hand-publish fallback in `packaging/README.md` still said `cd snypd`, naming a
  // directory `build.ts` had stopped producing — so the documented fallback would have died on `cd` at
  // the exact moment it is reached, which is when CI is the thing that is broken. A runbook is only
  // load-bearing under pressure, so the paths it names are checked against the build like any other seam.
  test("the hand-publish runbook names directories the build actually produces", () => {
    const md = readFileSync(join(REPO, "packaging", "README.md"), "utf8");
    const block = md.slice(md.indexOf("bun packaging/npm/build.ts --out="));
    const run = block.slice(0, block.indexOf("```"));
    expect(run).toContain("cd launcher");
    // Ordering, for the reason the workflow test states: the glob first, the launcher last.
    expect(run.indexOf("@snypd/*")).toBeLessThan(run.indexOf("cd launcher"));
  });
});

describe("the launcher, under node, with no snypd anywhere", () => {
  const run = (dir: string, args: string[] = []) =>
    spawnSync(process.execPath.includes("bun") ? "node" : process.execPath, [join(dir, "bin", "snypd.js"), ...args], { encoding: "utf8" });

  test("says what is missing and how it usually happens", () => {
    const out = mkdtempSync(join(tmpdir(), "snypd-npm-"));
    const dir = buildLauncher(out);
    const r = run(dir);
    expect(r.status).toBe(1);
    // The failure a user actually hits is `--omit=optional`, and a wrapper that says "cannot find module"
    // sends them to the wrong half of the problem.
    expect(r.stderr).toContain("omit=optional");
    expect(r.stderr).toContain(host ? host.pkg : "@snypd/");
  });
});

describe.if(!!host)("the host package, installed the way npm installs it", () => {
  test("node → shim → binary answers --version with the version that was built", async () => {
    const out = mkdtempSync(join(tmpdir(), "snypd-npm-"));
    const t = host!;
    const built = await buildTarget(t, out);
    const launcher = buildLauncher(out, version(), [t]);

    // What an install leaves behind: the launcher, and its optional dependency resolved beside it.
    const dep = join(launcher, "node_modules", ...t.pkg.split("/"));
    mkdirSync(dirname(dep), { recursive: true });
    symlinkSync(built.dir, dep, "dir");

    const bin = join(dep, "bin", t.exe);
    expect(existsSync(bin)).toBe(true);
    expect(built.bytes).toBeGreaterThan(20e6);   // a Bun runtime is in there; a 2 KB "binary" is a broken build

    const node = process.execPath.includes("bun") ? "node" : process.execPath;
    const v = spawnSync(node, [join(launcher, "bin", "snypd.js"), "--version"], { encoding: "utf8" });
    expect(v.status).toBe(0);
    expect(v.stdout.trim()).toBe(version());

    // Exit codes survive the wrapper: `snypd init && …` and every CI step depend on it.
    const usage = spawnSync(node, [join(launcher, "bin", "snypd.js")], { encoding: "utf8" });
    expect(usage.status).toBe(0);
    expect(usage.stdout).toContain("usage: snypd");
    const bad = spawnSync(node, [join(launcher, "bin", "snypd.js"), "nonsense-verb"], { encoding: "utf8" });
    expect(bad.status).toBe(1);
  }, 120_000);

  // S18j. `mcpCommand` is unit-tested over all four branches and every one of those tests passed while
  // the majority path was broken, because a unit test chooses its own PATH and the bug *is* the PATH:
  // `bunx` links `node_modules/.bin/snypd` at the launcher and puts that directory on the child's env,
  // so branch 1 ("a `snypd` is demonstrably here") was satisfied by the cache that branch 2 exists to
  // avoid naming. Nothing short of running the artefact in that layout sees it — decision 48, again, and
  // this time it is the registration rather than the shim that only breaks in distribution.
  test("run from a bunx cache, the registration names the launcher — not the shim on PATH", async () => {
    const out = mkdtempSync(join(tmpdir(), "bunx-1000-@snypd-"));
    const t = host!;
    const built = await buildTarget(t, out);

    // The shape `bunx` actually leaves on disk, verified against a real run in S18j.
    const dotbin = join(out, "node_modules", ".bin");
    mkdirSync(dotbin, { recursive: true });
    symlinkSync(join(built.dir, "bin", t.exe), join(dotbin, "snypd"));

    const site = mkdtempSync(join(tmpdir(), "snypd-site-"));
    const r = spawnSync(join(built.dir, "bin", t.exe), ["init"], {
      cwd: site, encoding: "utf8", env: { ...process.env, PATH: `${dotbin}:${process.env.PATH ?? ""}` },
    });
    expect(r.status).toBe(0);

    const reg = JSON.parse(readFileSync(join(site, ".mcp.json"), "utf8")) as
      { mcpServers: { snypd: { command: string; args: string[] } } };
    // Not `snypd`: that command exists only while the cache does.
    expect(reg.mcpServers.snypd).toEqual({ command: "bunx", args: ["@snypd/cli", "serve"] });
  }, 120_000);
});
