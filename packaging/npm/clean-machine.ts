/**
 * S28's clean machine, walked on the artefact a stranger gets (L4, docs/31 §5).
 *
 * Every other first-run number in this repository is measured against `bun build --compile` run a moment
 * earlier from the checkout it is being measured in. That is the right binary for a *budget* — it is the
 * product, and it is reproducible — and it is the wrong one for the claim S28 makes, which is that the
 * walk in docs/08 §2 works for somebody who has none of this: no checkout, no Bun, no `snypd` on PATH,
 * and a `node` they did not choose. Between the two there is a seam — the launcher, its
 * `optionalDependencies`, and npm's `.bin` link — and decision 48 has been proved right about seams
 * three times now (S18h's registration, S18j's `bunx` cache, the shim's exit code).
 *
 * So this builds the release for *this* platform, lays it out the way an install leaves it, and points
 * the onboarding walk at the link npm would have made:
 *
 *     node_modules/@snypd/cli/bin/snypd.js        the launcher, CommonJS, `#!/usr/bin/env node`
 *     node_modules/@snypd/<os>-<arch>/bin/snypd   the binary its `require.resolve` finds
 *     node_modules/.bin/snypd → ../@snypd/cli/bin/snypd.js
 *
 * `.bin/snypd` is the path, because that is what a shell runs after `npm i -g @snypd/cli` and what
 * `bunx` puts on a child's PATH. Nothing here spawns `bun`, and nothing reaches into the checkout except
 * the stub `wrangler` the walk already uses instead of a real account.
 *
 * **Run it in the box**, which is where "clean" is true rather than hoped for:
 *
 *     docker/box clean
 *
 * On this laptop it still works and still proves the seam; it just cannot prove the machine, and it says
 * which of the two it did. The run is written down by hand — `docker/box clean > bench/clean-machine.md`,
 * from the `# snypd — the clean machine` line on — rather than by this script: it is a transcript of a
 * machine, and the file should say which machine, not be silently overwritten by whichever ran last.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildLauncher, buildTarget, TARGETS, version } from "./build";
import { formatWalk, onboardMetrics, runOnboard } from "../../packages/bench/smoke/onboard";
import { toMarkdown } from "../../packages/bench/src/index";

/** The launcher and its one platform package, in the shape an install leaves behind. */
export async function installRelease(out: string): Promise<{ bin: string; launcher: string; binary: string; bytes: number }> {
  const host = TARGETS.find((t) => t.os === process.platform && t.cpu === process.arch);
  if (!host) throw new Error(`no release is built for ${process.platform} ${process.arch} — the launcher's own message covers this case (packaging.test.ts), and there is nothing for this check to walk`);

  const built = await buildTarget(host, out);
  const launcher = buildLauncher(out, version(), [host]);

  // What npm does: the optional dependency resolved beside the launcher, and a link in `.bin` named for
  // the command rather than the package (S18h — the package is `@snypd/cli`, the command is `snypd`).
  const dep = join(launcher, "node_modules", ...host.pkg.split("/"));
  mkdirSync(dirname(dep), { recursive: true });
  if (!existsSync(dep)) symlinkSync(built.dir, dep, "dir");

  const dotbin = join(out, "node_modules", ".bin");
  mkdirSync(dotbin, { recursive: true });
  const bin = join(dotbin, "snypd");
  const target = join(launcher, "bin", "snypd.js");
  chmodSync(target, 0o755);                       // npm sets this from the `bin` map; the checkout does not
  if (!existsSync(bin)) symlinkSync(target, bin);
  return { bin, launcher, binary: built.bin, bytes: built.bytes };
}

/**
 * What the walk left running, which is the first thing this check found (22 Sep 2026, L4).
 *
 * The launcher `spawnSync`s the binary and inherits its own fds (its header explains why: `snypd serve`
 * speaks MCP on stdin/stdout, so the wrapper may not buffer a byte of it). The cost, invisible until the
 * walk ran *through* the launcher: a signal sent to the launcher does not reach the binary. Node is
 * blocked inside `spawnSync`, so it cannot forward anything; it dies, and the binary it started is
 * reparented and carries on — still holding the stdout pipe, which is why the process that spawned it
 * never sees EOF and does not exit either.
 *
 * `snypd serve` escapes this by accident: its stdin is the pipe the launcher inherited, so when the
 * launcher dies the MCP server reads EOF and stops. `snypd dev` has no stdin to lose and survives. So
 * the check reports what is still alive, kills it, and says so — and docs/08 §12 carries the defect.
 */
function survivors(out: string): string[] {
  const ps = spawnSync("ps", ["ax", "-o", "pid=,args="], { encoding: "utf8" });
  if (ps.status !== 0) return [];
  return ps.stdout.split("\n").map((l) => l.trim()).filter((l) => l.includes(out) && !l.includes("ps ax"));
}

/** What "clean" means on the machine this is running on, stated rather than assumed. */
function machine(): string[] {
  const which = (c: string) => spawnSync("sh", ["-c", `command -v ${c} || true`], { encoding: "utf8" }).stdout.trim();
  const git = (k: string) => spawnSync("git", ["config", "--global", k], { encoding: "utf8" }).stdout.trim();
  const inBox = existsSync("/.dockerenv");
  const snypd = which("snypd");
  return [
    `- **box** ${inBox ? "yes — `docker/box`, nothing of this machine's on PATH but what the image installs" : "**no** — this is the host, so the seam is proved and the machine is not"}`,
    `- **node** ${which("node") || "**missing** — the launcher's shebang is `#!/usr/bin/env node`"} · ${spawnSync("node", ["--version"], { encoding: "utf8" }).stdout.trim() || "—"}`,
    `- **a \`snypd\` already on PATH** ${snypd ? `**yes, ${snypd}** — a clean machine has none, and the launcher is being asked to find a binary in a world that already has one` : "no"}`,
    `- **git identity** ${git("user.name") && git("user.email") ? "set — the scaffold commits, and `onboard.handoff.fresh` is the machine that has none" : "**none** — expect the walk to pay one more action"}`,
  ];
}

if (import.meta.main) {
  const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? mkdtempSync(join(tmpdir(), "snypd-release-"));
  console.error(`building the release for ${process.platform} ${process.arch} into ${out} …`);
  const r = await installRelease(out);
  console.error(`launcher ${r.launcher}\nbinary   ${r.binary} (${(r.bytes / 1e6).toFixed(1)} MB)\nrunning  ${r.bin}\n`);

  // The front door and nothing else: this check is about the artefact, and the relay door's extra two
  // actions are a harness's, not a release's.
  const walk = await runOnboard({ bin: r.bin, door: "front" });
  const report = { version: version(), suite: "onboard (released launcher)", bun: Bun.version, date: new Date().toISOString(), tokenizer: "o200k_base", metrics: onboardMetrics(walk) };
  console.log(`# snypd — the clean machine\n`);
  console.log(`The walk in docs/08 §2, against \`node_modules/.bin/snypd\` — the launcher, its platform package, and npm's link — rather than against a binary compiled from this checkout (S28, docs/31 §5 · L4).\n`);
  console.log(machine().join("\n"));
  console.log(`\n${toMarkdown(report)}`);
  console.log(`\n${formatWalk(walk)}`);

  const left = survivors(out);
  console.log(`\n## What the walk left running\n`);
  console.log(left.length
    ? `**${left.length}** — a signal to the launcher does not reach the binary it \`spawnSync\`ed, so \`dev\` outlived the walk that started it (docs/08 §12.13). Killed here; the defect is the product's.\n\n${left.map((l) => `    ${l}`).join("\n")}`
    : `Nothing. Either the launcher forwarded the signal or the binary noticed its stdin close.`);
  for (const l of left) { const pid = Number(l.split(/\s/)[0]); if (pid) try { process.kill(pid, "SIGKILL") } catch {} }

  // …and this process leaves too. Those children held the write end of a pipe this process is reading,
  // so the loop would stay alive for a `dev` that is already unreachable. Reported above, then gone.
  process.exit(0);
}
