/**
 * `--host cloudflare | vercel | none` — the host's half of the contract, written once (S18d′, `07` §3b;
 * written by default since L1, docs/31 decision 229).
 *
 * Snypd holds nothing a host issued. It writes files and git, and the contract is: run `snypd build`,
 * serve `dist/`. Who runs those two is `deploy.mode` (docs/31 decision 228): in **git** mode the host
 * watches the repo and runs the build command below on push; in **direct** mode the binary runs the
 * host's own CLI (`wrangler deploy`) from the site root, the way it already runs `git push` — never
 * reading the credential that CLI keeps in its own store. Either way that contract fits in a config
 * file, and this writes it — which is worth a module rather than an inline string for one reason:
 * **the build command is where distribution shows up**. `07` §3b specified `curl -fsSL https://snypd.rocks/install | sh && snypd build`, and S18d′
 * refused pipe-to-shell on two counts, so the line a host actually runs is now
 * `npx -y @snypd/cli@<version> build` — installed from the registry, provenance attested, no shell
 * script in the middle.
 *
 * Pinned, deliberately. A deploy config is a reproducible-build artefact: an unpinned launcher would mean
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

/**
 * **The launcher's package name is not the binary's name, and S18h is why.** npm refused the bare
 * `snypd` with *"Package name too similar to existing package snyk"* — a registry-side rule no token
 * and no retry gets past, and one whose documented remedy is a scope. So the thing you `bunx` is
 * `@snypd/cli` and the thing that lands on `PATH` is still `snypd`: the launcher's `bin` maps the one
 * to the other, and every surface below this line except an install command is unaffected.
 *
 * Named once, here beside `VERSION`, because it appears in a generated build command, in a committed
 * `.mcp.json` and in the sentence a person pastes — three files that must agree or the majority path
 * breaks in a way only a stranger discovers.
 */
export const LAUNCHER = "@snypd/cli";

export const DEPLOY_TARGETS = ["cloudflare", "vercel"] as const;
export type DeployTarget = (typeof DEPLOY_TARGETS)[number];

/**
 * What `init` may be told about a host: a target, or `none` for a site that will be served by something
 * that needs no config of ours. Absent means `DEFAULT_HOST` (decision 229): the stranger's walk in
 * docs/31 §3 has no flag in it, so the default has to be the host the walk is built on.
 */
export const HOST_CHOICES = [...DEPLOY_TARGETS, "none"] as const;
export type HostChoice = (typeof HOST_CHOICES)[number];
export const DEFAULT_HOST: DeployTarget = "cloudflare";

/** The one line a host runs. Overridable in the signature below so the test does not chase releases. */
export const buildCommand = (version: string): string => `npx -y ${LAUNCHER}@${version} build`;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "site";

/**
 * The PR workflow, which is the same on both hosts because it is not about the host: lint and build every
 * PR, and report the speed suite beside it. It runs the published binary, not a checkout, so a content
 * repo needs nothing installed and no `node_modules` of its own.
 *
 * **Installed once, run three times** (I0). This was three `npx -y` lines, which is three installs of
 * the same pinned package as far as the runner is concerned: `npx` re-verifies its tree on every
 * invocation whether or not the version is pinned — 2.2 s and 3.1 s, measured on pinned and unpinned
 * calls to an already-cached package, so the pin buys correctness here and nothing else. One
 * `npm install -g` and three bare `snypd` calls pay the launcher's own boot instead, which is 0.12 s.
 *
 * The cache is the larger half. A content repo has no lockfile, so nothing about it tells `setup-node`
 * what to cache; keying `~/.npm` on the pinned version does, and it is the difference between every PR
 * pulling 37 MB and only the first one after a version bump doing so.
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
      # The binary is ~37 MB on the wire and the version is pinned, so it is worth keeping between runs.
      - uses: actions/cache@v4
        with:
          path: ~/.npm
          key: snypd-${version}-npm
      # One install, three runs: \`npx -y\` re-verifies its tree on every call, pinned or not.
      - run: npm install -g ${LAUNCHER}@${version}
      # Rules 0–11: a broken link, a moved URL with no redirect, a chart that will not render.
      - run: snypd lint
      # The build the host will run, run here first — a red PR instead of a red deploy. On a PR from
      # \`snypd/drafts\` this is the preview build, drafts included and noindex, exactly as the host builds it.
      - run: snypd build
      # Report-only: budgets are snypd's to enforce, not a content repo's to fail on.
      - run: snypd bench --quick
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
    // **Workers with static assets, not Pages** — corrected in S19a′ by a real deploy, which is the only
    // thing that could have caught it.
    //
    // This wrote `pages_build_output_dir` from S18d′ until snypd.rocks went up, and the first build on
    // Cloudflare ran `snypd build` perfectly and then failed on the step after it:
    //
    //     Executing user deploy command: npx wrangler deploy
    //     ▲ [WARNING] It seems that you have run `wrangler deploy` on a Pages project…
    //     ✘ [ERROR] Missing entry-point to Worker script or to assets directory
    //
    // Connecting a repo in Cloudflare's dashboard now creates a **Workers** project, and Workers Builds
    // deploys with `wrangler deploy` — which needs `[assets]` and treats `pages_build_output_dir` as the
    // marker of a Pages project it is being run against by mistake. Pages still exists and still works;
    // it is no longer what a person gets by following the obvious path, and a config that only works on
    // the path nobody is sent down is a config that is wrong.
    //
    // `_redirects` and `_headers` — which `emit.ts` writes and `site` › set_redirect depends on — are
    // honoured by Workers static assets exactly as they were by Pages, so nothing downstream moves.
    //
    // No `[build]` section, deliberately: Workers Builds runs the build command from the dashboard, and
    // a `[build]` here would make `wrangler deploy` run it a second time on every deploy. The command is
    // in a comment instead, so the repo still says what it expects without paying for it twice.
    put("wrangler.toml", `# Cloudflare Workers, serving static assets. \`snypd build\` writes dist/; \`wrangler deploy\` uploads it.
# snypd holds no credential and calls no API: \`site\` › deploy runs those two lines from here, through
# Cloudflare's own CLI, and reads the URL back (docs/31). Nothing else has to be typed anywhere.
#
# If the repo is connected in Cloudflare's dashboard instead, the host builds on push — its "Build
# command" field is:
#     ${buildCommand(version)}
# The same command on the \`snypd/drafts\` branch builds a preview *with the drafts in it*, marked noindex —
# \`site\` › push \`preview\` sends that branch, and says what a preview exposes before it goes.
name = "${slug(opts.name)}"
compatibility_date = "2026-08-31"

[assets]
directory = "./dist"
# A miss serves dist/404.html with a 404 status — the site's own not-found page, which every build writes.
not_found_handling = "404-page"
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
