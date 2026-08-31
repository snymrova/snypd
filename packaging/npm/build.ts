/**
 * The release, generated from one list (S18d′).
 *
 * `07` S18d′ picked the shape — npm platform packages with provenance, the esbuild/bun pattern — over
 * `curl | sh`, on two counts: a pipe to a shell is the weakest trust story available, and an agent cannot
 * run one without a human approving a pipe to a shell, which is the step docs/08 §2 spends its whole
 * budget avoiding. `bunx snypd init` is step 4 of that flow and nothing on npm answered it.
 *
 * Everything a release contains is derived here from `TARGETS` and the root `package.json` version, so a
 * sixth platform is one row and a version bump is one field. Three artefacts come out of `--out`:
 *
 *   npm/@snypd/<os>-<arch>/   one per target: the compiled binary, `os`/`cpu` gated so the installer
 *                             downloads exactly one of them
 *   npm/snypd/                the launcher from `packaging/npm/snypd`, its `optionalDependencies`
 *                             rewritten to this version
 *   release/snypd-<os>-<arch>.tar.gz + .sha256   what the GitHub release carries and Homebrew reads
 *
 * The binary is `packages/bench/src/compile.ts`'s recipe — the same `--compile --splitting` the D2 gate
 * measures and the smoke test drives (decision 47: one recipe, three readers). Cross-compilation is
 * Bun's: `--target=bun-darwin-arm64` on a Linux runner downloads that platform's runtime and embeds it,
 * which is what lets one CI job publish five packages.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compile, REPO } from "../../packages/bench/src/compile";

export interface Target {
  /** npm package name — `@snypd/linux-x64`, esbuild's shape (`@esbuild/linux-x64`), not bun's `@oven/bun-linux-x64`: the scope is already ours and the platform is the whole of the name. */
  pkg: string;
  /** `bun build --compile --target=` */
  target: string;
  /** `process.platform` — what npm's `os` field and the launcher both match on */
  os: string;
  /** `process.arch` — npm's `cpu` field */
  cpu: string;
  /** filename inside `bin/`; Windows needs the extension to be executable at all */
  exe: string;
}

/** Kept in step with `PACKAGES` in `snypd/bin/snypd.js`; `packaging.test.ts` fails if they drift. */
export const TARGETS: Target[] = [
  { pkg: "@snypd/darwin-arm64", target: "bun-darwin-arm64", os: "darwin", cpu: "arm64", exe: "snypd" },
  { pkg: "@snypd/darwin-x64",   target: "bun-darwin-x64",   os: "darwin", cpu: "x64",   exe: "snypd" },
  { pkg: "@snypd/linux-arm64",  target: "bun-linux-arm64",  os: "linux",  cpu: "arm64", exe: "snypd" },
  { pkg: "@snypd/linux-x64",    target: "bun-linux-x64",    os: "linux",  cpu: "x64",   exe: "snypd" },
  { pkg: "@snypd/windows-x64",  target: "bun-windows-x64",  os: "win32",  cpu: "x64",   exe: "snypd.exe" },
];

/**
 * Not built, and named here so the gap is a decision rather than an oversight:
 *
 * **musl** (Alpine, and the distroless images a lot of CI runs on). Bun compiles `-musl` variants and npm
 * can gate on `libc`, but the launcher would have to detect musl at runtime from Node — `process.report`'s
 * `glibcVersionRuntime` — and that detection is worth writing when somebody reports it, not before.
 * **baseline** (pre-AVX2 x64). Bun's `-baseline` targets exist; nothing in npm's metadata expresses the
 * CPU feature, so the choice would have to be made in the launcher by reading `/proc/cpuinfo`.
 * **linux-arm64 on a Mac** is not a variant, it is a target, and it is built.
 */
export const UNBUILT = ["linux-*-musl", "*-x64-baseline"] as const;

export const version = (): string => JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version as string;

const LAUNCHER = join(REPO, "packaging", "npm", "snypd");

/** One platform package, compiled and complete, at `<out>/npm/<pkg>`. */
export async function buildTarget(t: Target, out: string, v = version()): Promise<{ dir: string; bin: string; bytes: number }> {
  const dir = join(out, "npm", ...t.pkg.split("/"));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "bin"), { recursive: true });
  const bin = await compile(join(dir, "bin", t.exe), { target: t.target });
  chmodSync(bin, 0o755);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: t.pkg,
    version: v,
    description: `The snypd binary for ${t.os}-${t.cpu}`,
    license: "MIT",
    homepage: "https://snypd.rocks",
    repository: { type: "git", url: "git+https://github.com/snymrova/snypd.git" },
    // The gate. npm and bun install a package whose `os`/`cpu` do not match the host as a no-op, which is
    // what makes five optional dependencies cost one download rather than five.
    os: [t.os],
    cpu: [t.cpu],
    // No `bin`: the launcher spawns this file by path. A `bin` here would put a second `snypd` on PATH
    // and make which one you got depend on install order.
    files: [`bin/${t.exe}`],
    preferUnplugged: true,   // Yarn PnP: a 90 MB executable cannot be run out of a zip
  }, null, 2) + "\n");
  writeFileSync(join(dir, "README.md"), [
    `# ${t.pkg}`, "",
    `The \`snypd\` binary for ${t.os}-${t.cpu}. Not installed directly — it arrives as an optional dependency of`,
    "[`snypd`](https://www.npmjs.com/package/snypd), which picks the one package that matches your platform.", "",
    "```", "bunx snypd init      # or: npm install -g snypd", "```", "",
    "https://snypd.rocks · https://github.com/snymrova/snypd",
  ].join("\n") + "\n");
  return { dir, bin, bytes: statSync(bin).size };
}

/** The launcher, copied from source with its version and `optionalDependencies` pinned to this release. */
export function buildLauncher(out: string, v = version(), targets: Target[] = TARGETS): string {
  const dir = join(out, "npm", "snypd");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(LAUNCHER, dir, { recursive: true });
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  pkg.version = v;
  // Exact versions, not ranges: the launcher and the binary it spawns are one artefact cut in two by
  // npm's packaging, and a range would let a resolver pair a new launcher with an old binary.
  pkg.optionalDependencies = Object.fromEntries(targets.map((t) => [t.pkg, v]));
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  cpSync(join(REPO, "packaging", "npm", "README.md"), join(dir, "README.md"));
  chmodSync(join(dir, "bin", "snypd.js"), 0o755);
  return dir;
}

/** A tarball per target for the GitHub release, which is what Homebrew and any `curl` downloads. */
export function tarball(t: Target, out: string, v = version()): { file: string; sha256: string } {
  const dir = join(out, "release");
  mkdirSync(dir, { recursive: true });
  const name = `snypd-${t.os}-${t.cpu}.tar.gz`;
  const file = join(dir, name);
  const from = join(out, "npm", ...t.pkg.split("/"), "bin");
  const p = Bun.spawnSync(["tar", "-czf", file, "-C", from, t.exe], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`tar failed for ${t.pkg}:\n${p.stderr.toString()}`);
  const sha256 = new Bun.CryptoHasher("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(`${file}.sha256`, `${sha256}  ${name}\n`);
  return { file, sha256 };
}

/**
 * The Homebrew formula, for the arrival npm does not serve: somebody at a terminal who has brew and may
 * not have node. It installs the same tarball the release carries, so brew and npm are two doors onto one
 * artefact rather than two builds.
 */
export function formula(hashes: Record<string, string>, v = version()): string {
  const url = (t: Target) => `https://github.com/snymrova/snypd/releases/download/v${v}/snypd-${t.os}-${t.cpu}.tar.gz`;
  const t = (os: string, cpu: string) => TARGETS.find((x) => x.os === os && x.cpu === cpu)!;
  const block = (x: Target, indent: string) => [`${indent}url "${url(x)}"`, `${indent}sha256 "${hashes[x.pkg] ?? "SHA256_PENDING"}"`].join("\n");
  return `# Generated by \`bun packaging/npm/build.ts --formula\` — do not edit by hand.
class Snypd < Formula
  desc "MCP-native CMS: write, edit, theme and publish a site from your harness"
  homepage "https://snypd.rocks"
  version "${v}"
  license "MIT"

  on_macos do
    on_arm do
${block(t("darwin", "arm64"), "      ")}
    end
    on_intel do
${block(t("darwin", "x64"), "      ")}
    end
  end

  on_linux do
    on_arm do
${block(t("linux", "arm64"), "      ")}
    end
    on_intel do
${block(t("linux", "x64"), "      ")}
    end
  end

  def install
    bin.install "snypd"
  end

  test do
    assert_match "usage: snypd", shell_output("#{bin}/snypd")
    assert_match version.to_s, shell_output("#{bin}/snypd --version")
  end
end
`;
}

/** `bun packaging/npm/build.ts [--out=dist] [--target=bun-linux-x64|host] [--launcher-only] [--formula]` */
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (n: string, d?: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
  const out = join(REPO, flag("out", "dist/release")!);
  const want = flag("target");
  const host = TARGETS.find((t) => t.os === process.platform && t.cpu === process.arch);
  const targets = want === "host" ? [host!] : want ? TARGETS.filter((t) => t.target === want || t.pkg === want) : TARGETS;
  if (!targets.length || targets.includes(undefined as never)) throw new Error(`no target matches ${want}; have ${TARGETS.map((t) => t.target).join(", ")}`);

  const v = version();
  mkdirSync(out, { recursive: true });
  const hashes: Record<string, string> = {};
  if (!argv.includes("--launcher-only")) {
    for (const t of targets) {
      const r = await buildTarget(t, out, v);
      const tar = tarball(t, out, v);
      hashes[t.pkg] = tar.sha256;
      console.log(`${t.pkg.padEnd(22)} ${(r.bytes / 1e6).toFixed(1)} MB  ${tar.sha256.slice(0, 12)}…`);
    }
  }
  // Only the targets actually built are declared, so a one-platform run produces a launcher that is
  // honest about what it can find rather than one advertising four packages this release never made.
  const dir = buildLauncher(out, v, targets);
  console.log(`snypd@${v} → ${dir}`);
  if (argv.includes("--formula")) {
    // A formula is a release-wide artefact: it names four tarballs and their hashes. Writing one from a
    // single-target run would commit `SHA256_PENDING` into a file brew reads literally, and the failure
    // would land on somebody installing rather than on us.
    if (targets.length !== TARGETS.length) throw new Error(`--formula needs every target built; this run made ${targets.length} of ${TARGETS.length}`);
    const f = join(REPO, "packaging", "homebrew", "snypd.rb");
    writeFileSync(f, formula(hashes, v));
    console.log(`formula → ${f}`);
  }
  if (!existsSync(join(out, "npm"))) throw new Error("nothing was written");
}
