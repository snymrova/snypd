/**
 * The release recipe, in one place (S18a decision 47, S18c decision 49).
 *
 * `--splitting` is not an optimisation here, it is the difference between a binary that meets D2 and one
 * that misses it by 4×. Without it `bun build --compile` emits **one** 5.5 MB module, and JSC parses all
 * of it before `main()` runs: the pre-S18c binary spent 224 ms answering `initialize` and 277 ms printing
 * its own usage line — a command that does no work at all. Bundling is what costs that, not `--compile`:
 * the same bundle run by plain `bun` was just as slow, while a hello-world binary starts in 17 ms. So the
 * lazy `import()` chain §3.4 buys the 50 ms with is not defeated by the compiler, it is defeated by being
 * flattened into one file, and `--splitting` gives it back — each `import()` becomes its own chunk in
 * `$bunfs`, parsed when it is reached. Measured interleaved on one loaded box: 224 → 60 ms.
 *
 * `--bytecode` is the obvious companion and cannot be used: it forces `format: "cjs"`, and Bun refuses
 * `--splitting` outside ESM. It is the smaller lever anyway — it would save parsing an entry chunk that
 * `--splitting` has already reduced to 7.6 KB.
 *
 * Verified on both CI lanes (Bun 1.4.0 and the 1.3.14 known-good lane, docs/04).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const REPO = join(import.meta.dir, "..", "..", "..");
export const ENTRY = join(REPO, "packages", "cli", "src", "index.ts");

/** `bun build --compile --splitting` → a single executable at `out`. Throws with the compiler's own output. */
export async function compile(out: string, opts: { target?: string } = {}): Promise<string> {
  mkdirSync(dirname(out), { recursive: true });
  const args = ["build", "--compile", "--splitting", ENTRY, "--outfile", out];
  if (opts.target) args.push(`--target=${opts.target}`);
  const p = Bun.spawnSync([process.execPath, ...args], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`bun build --compile failed:\n${p.stderr.toString()}${p.stdout.toString()}`);
  return out;
}
