/**
 * Compile the CLI the way a release does, and hand back the path (S18a, decision 47).
 *
 * Kept apart from the test so a person can build one and poke at it:
 *   bun packages/bench/smoke/build.ts /tmp/snypd
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const REPO = join(import.meta.dir, "..", "..", "..");
export const ENTRY = join(REPO, "packages", "cli", "src", "index.ts");

/** `bun build --compile` → an executable at `out`. Throws with the compiler's own output on failure. */
export async function compile(out: string, opts: { bytecode?: boolean; target?: string } = {}): Promise<string> {
  mkdirSync(dirname(out), { recursive: true });
  const args = ["build", "--compile", ENTRY, "--outfile", out];
  if (opts.bytecode) args.push("--bytecode");
  if (opts.target) args.push(`--target=${opts.target}`);
  const p = Bun.spawnSync(["bun", ...args], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`bun build --compile failed:\n${p.stderr.toString()}${p.stdout.toString()}`);
  return out;
}

if (import.meta.main) {
  const out = process.argv[2] ?? join(REPO, "dist", "snypd");
  console.log(await compile(out, { bytecode: process.argv.includes("--bytecode") }));
}
