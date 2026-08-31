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
import { buildLauncher, buildTarget, formula, TARGETS, version } from "./build";
import { REPO } from "../../packages/bench/src/compile";

const LAUNCHER_SRC = join(REPO, "packaging", "npm", "snypd");
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
    const launcher = read("packaging", "npm", "snypd", "package.json");
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
});
