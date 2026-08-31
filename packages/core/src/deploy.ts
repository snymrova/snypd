/**
 * `--deploy cloudflare | vercel` — the host's half of the contract, written once (S18d′, `07` §3b).
 *
 * Snypd never talks to a host. It writes files and git; the host's whole job is: on push, run
 * `snypd build`, serve `dist/`. That contract fits in a config file, and this writes it — which is worth
 * a module rather than an inline string for one reason: **the build command is where distribution shows
 * up**. `07` §3b specified `curl -fsSL https://snypd.rocks/install | sh && snypd build`, and S18d′
 * refused pipe-to-shell on two counts, so the line a host actually runs is now `npx -y snypd@<version>
 * build` — installed from the registry, provenance attested, no shell script in the middle.
 *
 * Pinned, deliberately. A deploy config is a reproducible-build artefact: an unpinned `snypd` would mean
 * a release of ours rebuilding somebody's live site without them asking. The pin is one number in a file
 * they own, and `site` › doctor is where a stale one gets noticed.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { WriteError } from "./write";
import pkg from "../package.json";

/**
 * The version a generated build command pins to, and the only place in `core` that knows one. Every
 * `package.json` in the release carries the same string — `packaging/npm/packaging.test.ts` fails if any
 * of them drifts, because a build command pinned to a version that was never published is a site that
 * cannot deploy.
 */
export const VERSION: string = pkg.version;

export const DEPLOY_TARGETS = ["cloudflare", "vercel"] as const;
export type DeployTarget = (typeof DEPLOY_TARGETS)[number];

/** The one line a host runs. Overridable in the signature below so the test does not chase releases. */
export const buildCommand = (version: string): string => `npx -y snypd@${version} build`;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "site";

/**
 * The PR workflow, which is the same on both hosts because it is not about the host: lint and build every
 * PR, and report the speed suite beside it. It runs the published binary, not a checkout, so a content
 * repo needs nothing installed and no `node_modules` of its own.
 */
function workflow(version: string): string {
  return `name: snypd
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      # Rules 0–11: a broken link, a moved URL with no redirect, a chart that will not render.
      - run: npx -y snypd@${version} lint
      # The build the host will run, run here first — a red PR instead of a red deploy.
      - run: npx -y snypd@${version} build
      # Report-only: budgets are snypd's to enforce, not a content repo's to fail on.
      - run: npx -y snypd@${version} bench --quick
        continue-on-error: true
`;
}

/**
 * Writes the host config and the PR workflow. Never overwrites: a `wrangler.toml` in a repo is somebody's,
 * and a site that was already deployed somewhere is exactly the site whose config must not be clobbered.
 */
export function writeDeploy(root: string, target: DeployTarget, opts: { name: string; version?: string }): string[] {
  const version = opts.version ?? VERSION;
  if (!DEPLOY_TARGETS.includes(target))
    throw new WriteError(`unknown deploy target "${target}"`, `Known: ${DEPLOY_TARGETS.join(", ")}. Anything that can run a binary and serve a folder works without one — the contract is \`${buildCommand(version)}\`, then serve \`dist/\`.`);
  const created: string[] = [];
  const put = (rel: string, body: string) => {
    const file = join(root, rel);
    if (existsSync(file)) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
    created.push(rel);
  };

  if (target === "cloudflare") {
    // Pages reads `pages_build_output_dir` and runs the build command configured in the dashboard or in
    // `[build]`; both are named here so the repo says what it expects rather than the dashboard alone.
    put("wrangler.toml", `# Cloudflare Pages. \`snypd build\` writes dist/; Pages serves it. Nothing here talks to an API —
# snypd writes files and git, and the host builds on push (docs/07 §3b).
name = "${slug(opts.name)}"
compatibility_date = "2026-08-31"
pages_build_output_dir = "dist"

[build]
command = "${buildCommand(version)}"
`);
  } else {
    put("vercel.json", JSON.stringify({
      $schema: "https://openapi.vercel.sh/vercel.json",
      framework: null,
      buildCommand: buildCommand(version),
      outputDirectory: "dist",
      // The site emits `/about/index.html`; without this Vercel serves `/about/` and `/about` differently,
      // and the canonical URL in the JSON-LD is the one without the slash.
      cleanUrls: true,
      trailingSlash: false,
    }, null, 2) + "\n");
  }
  put(join(".github", "workflows", "snypd.yml"), workflow(version));
  return created;
}
