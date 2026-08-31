#!/usr/bin/env node
"use strict";
/**
 * The launcher: 40 lines of CommonJS that find the real binary and get out of the way (S18d′).
 *
 * `@snypd/cli` carries no code. The product is a ~90 MB `bun build --compile` artefact per platform,
 * and npm's answer to that — the one esbuild and bun both ship — is `optionalDependencies` gated by
 * `os`/`cpu`: the installer resolves all five, downloads the one that matches, and skips the rest. So
 * this package is a few kilobytes and the download is one binary, whichever way somebody arrives
 * (`bunx @snypd/cli init`, `npm i -g @snypd/cli`, `npx @snypd/cli`).
 *
 * **The package is scoped and the command is not** (S18h). npm refused the bare `snypd` with *"Package
 * name too similar to existing package snyk"* — a registry rule, not a permission — so the name you
 * install is `@snypd/cli` and the name this file is installed *as* is `snypd`, via the one-line `bin`
 * map in `package.json`. Everything downstream of the install still says `snypd`.
 *
 * CommonJS, `node` in the shebang, no dependencies: `npx` runs this under Node, `bunx` under Bun, and a
 * global install under whichever the user has. It must start under the *worst* of those and cannot
 * assume ESM, a `type` field, or a runtime that exists.
 *
 * `spawnSync` with inherited stdio rather than a `fork` or an exec-replacement: Node has no `execve`, and
 * `snypd serve` speaks MCP on stdin/stdout, so the one thing this wrapper may not do is buffer, decode or
 * interleave a single byte of it. Inherited fds are the child's own fds — the protocol never enters this
 * process. Ctrl-C reaches the child through the process group, and the child's exit code is re-exited
 * here so `&&` chains and CI keep working.
 *
 * The cost is one Node boot (~25–40 ms) in front of every run, which is why `snypd init` does not
 * register *this* path with the harness when it can name something better (`core/src/site.ts`).
 */
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { dirname, join } = require("node:path");

/** platform+arch → the package that carries that binary. Kept in step with `packaging/npm/build.ts`. */
const PACKAGES = {
  "darwin arm64": "@snypd/darwin-arm64",
  "darwin x64": "@snypd/darwin-x64",
  "linux arm64": "@snypd/linux-arm64",
  "linux x64": "@snypd/linux-x64",
  "win32 x64": "@snypd/windows-x64",
};

function die(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}

const key = `${process.platform} ${process.arch}`;
const pkg = PACKAGES[key];
if (!pkg) {
  die([
    `snypd has no build for ${key}.`,
    `Built for: ${Object.keys(PACKAGES).join(", ")}.`,
    `Everything is TypeScript on Bun — https://github.com/snymrova/snypd runs from a checkout on any platform Bun supports.`,
  ]);
}

let bin;
try {
  // Resolve the package's own manifest and join from there: the platform packages declare no `exports`,
  // and asking for the manifest is the one subpath every resolver agrees about.
  bin = join(dirname(require.resolve(`${pkg}/package.json`)), "bin", process.platform === "win32" ? "snypd.exe" : "snypd");
} catch {
  die([
    `snypd could not find ${pkg}, the binary for this platform.`,
    ``,
    `Optional dependencies are how it ships. This usually means the install ran with them off:`,
    `  npm install --no-optional | --omit=optional, or an \`omit=optional\` in .npmrc`,
    `  a lockfile built on another platform, copied here whole`,
    `Reinstall with optional dependencies on: \`npm install snypd\`.`,
  ]);
}
if (!existsSync(bin)) die([`snypd found ${pkg} but not its binary at ${bin} — the package is installed but incomplete; reinstall it.`]);

const r = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });
if (r.error) die([`snypd could not run ${bin}: ${r.error.message}`]);
// A child killed by a signal has a null status. Report it the way a shell does, so a harness that spawned
// `snypd serve` and killed it sees the difference between a crash and a shutdown.
process.exit(r.status === null ? (r.signal ? 128 : 1) : r.status);
