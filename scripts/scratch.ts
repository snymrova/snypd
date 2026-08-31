/**
 * `bun run scratch [name]` — a real site, made the way a user makes one, in one command (decision 53).
 *
 * Zero to first visual: create `sites/<name>`, run `init` in it, start `dev`, open the Desk. Since that
 * is the same path docs/08 §2 walks, using it *is* testing it — which is the whole argument for having
 * it at all. The three rules it follows are the decision's:
 *
 *  - **`sites/` is git-ignored wholesale**, and every directory in it is its own repo. S19a pushes
 *    snypd.rocks to its own GitHub remote wired to Cloudflare Pages, and a site the host builds from git
 *    cannot also be a subdirectory of this one. One rule, no exceptions — including for snypd.rocks,
 *    which is *cloned* into `sites/` rather than tracked here.
 *  - **In-repo rather than `/tmp`**, for one specific reason: `init` writes a `.mcp.json` naming the most
 *    portable command that is demonstrably present (decision 67), and from this checkout that is
 *    `bun <entry> serve`. A scratch site is therefore wired to the working tree — change the code,
 *    restart the harness, the change is live. A site in `/tmp` would be too, but nothing would remember
 *    where it was.
 *  - **Not `corpora/`.** Those are bench inputs and have to stay deterministic; a hand-played site among
 *    them is how a number stops meaning what its history says (decision 48).
 *
 * This does not replace `packages/bench/smoke/`. A site under `sites/` resolves `@snypd/*` through the
 * workspace `node_modules` and a real user's does not, so this dogfoods the *experience* while the smoke
 * lane dogfoods the *distribution*. Collapsing that distinction is how S18a's bug reached the binary.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { initRepo } from "@snypd/core";

const REPO = join(import.meta.dir, "..");
const CLI = join(REPO, "packages", "cli", "src", "index.ts");
const SITES = join(REPO, "sites");

const arg = process.argv[2];
const name = arg && !arg.startsWith("-") ? arg : `scratch-${new Date().toISOString().slice(0, 10)}`;
const root = join(SITES, name);
const fresh = !existsSync(root);

// `bun <file>`, never `bun run <file>`: `run` resolves through package.json scripts and prints its own
// banner on stdout, which is the protocol on the `serve` path and noise on every other.
const snypd = (args: string[], opts: { cwd?: string } = {}) =>
  Bun.spawnSync([process.execPath, CLI, ...args], { cwd: opts.cwd ?? REPO, stdout: "inherit", stderr: "inherit" });

if (fresh) {
  mkdirSync(root, { recursive: true });
  // **The repo is this script's job, not `init`'s**, and the difference is the whole reason decision 53
  // puts `sites/` in the repo rather than in `/tmp`.
  //
  // `init` creates a repo only in a directory that is empty *and* not already inside a work tree, and it
  // is right to: `git init` in a subdirectory of an existing repo silently makes a nested one, and a
  // nested repo is invisible until it has swallowed somebody's work. `sites/` is inside this checkout,
  // so `init` correctly declines every time — and without a repo the scaffold stays uncommitted and the
  // first `content.create` refuses on a dirty tree, which is the failure docs/08 §12.11 describes.
  //
  // Decision 53's answer is that `sites/` is git-ignored wholesale and every directory in it is its own
  // repo. That makes the nesting deliberate and invisible to the parent by design, which is exactly the
  // case `init` cannot assume and this script can. Same call `init` would have made, so there is one
  // definition of "a repo on `main`" rather than two that drift.
  initRepo(root);
  // No `--url`: decision 63 keeps the origin question away from somebody who has not seen a pixel, and a
  // scratch site should hit that exactly where a real one does — at publish, not here.
  const r = snypd(["init", root, `--name=${name}`, "--description=A scratch site for dogfooding snypd."]);
  if (r.exitCode !== 0) { console.error(`\ninit failed in ${root}`); process.exit(r.exitCode ?? 1) }
  console.log(`\n${root} — new site, wired to this working tree.`);
} else {
  console.log(`${root} — already here, starting dev on it.`);
}

console.log(`Register it with a harness by opening ${root} as the project root; \`.mcp.json\` is already in it.\n`);
// `dev` is the verb aimed at a person: it binds, opens a browser when stdout is a TTY, watches, prints.
// Handing the process over rather than wrapping it means Ctrl-C, the port fallback and the banner are
// all exactly what a user gets — a wrapper here would be a second code path to keep true.
const dev = Bun.spawn([process.execPath, CLI, "dev", root], { cwd: REPO, stdout: "inherit", stderr: "inherit", stdin: "inherit" });
process.on("SIGINT", () => dev.kill("SIGTERM"));
process.exit(await dev.exited);
