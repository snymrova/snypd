/**
 * The six derived facts of a first run, computed once (S18f; `07` decision 52, docs/08 decision 64).
 *
 * **One implementation, two renderings.** `site` › doctor turns these into sentences for an agent; the
 * Desk turns them into a checklist for a person. The rule decision 64 states, and this module is how it
 * is kept: *no fact appears on the Desk that doctor cannot answer.* A page that knows something the
 * agent cannot ask for is a second source of truth wearing a stylesheet.
 *
 * **Nothing here is stored.** Every field is read from disk on every call — a progress file would be
 * wrong the first time somebody clones the repo, deletes the only post, or starts over, in a project
 * whose third principle is that files are truth. That is also why there is no dismiss button and no
 * "onboarded" flag anywhere in this codebase: when the six are true the checklist stops rendering, and
 * what remains is the ordinary Desk.
 *
 * **What it may cost.** The Desk is inside `preview.ttfb ≤ 50 ms` (decision 45) and this runs on every
 * request to it: four `existsSync`, one small `JSON.parse`, one `process.kill(pid, 0)`. The config and
 * the item count are passed in by callers that already hold them, never re-read here.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlaceholderUrl, type LoadedConfig } from "./config";
import { LAUNCHER } from "./deploy";
import { isRepoRoot } from "./git";
import { harnessState, type HarnessState, type HeartbeatRecord } from "./heartbeat";
import { MCP_FILE, onPath } from "./site";

/**
 * The sentence a person pastes into the harness they already have open (docs/08 decision 58).
 *
 * Named here rather than retyped because it is used in four places — the README, snypd.rocks, the
 * first-run Desk and the `onboard.*` lane — and a funnel whose first step is spelled differently in
 * each of them is measuring four different funnels. It names its first command on purpose: an agent
 * that has never heard of snypd cannot infer `bunx @snypd/cli init`, and a sentence whose first step is
 * a web search has a nondeterministic first step. The package is scoped and the binary is not — see
 * `deploy.ts` › `LAUNCHER`, and note that it is the *package* that has to appear here, because this
 * sentence is read before anything is installed.
 */
export const ONE_SENTENCE = `Set up snypd here and write me a first post. Ask me what the site is called, then run \`bunx ${LAUNCHER} init\`.`;

/** What `.mcp.json` says, and whether what it says exists on this machine. */
export interface Registration {
  present: boolean;
  /** It exists *and* has an `mcpServers.snypd` entry. A file registering something else is not ours. */
  names: boolean;
  command?: string;
  /** Where `command` was found — an absolute path that exists, or a hit on this process's PATH. */
  resolved?: string;
  absolute: boolean;
  missingCommand: boolean;
}

/**
 * Is this repo registered with a harness, and does the registration name something that exists?
 *
 * The last of those three is docs/08 §12.8: `.mcp.json` is committed carrying whatever command `init`
 * chose, so a clone's harness may spawn something that is not on that machine and fail in its own logs
 * — which the Desk renders identically to *you did not restart*. This cannot fix that (S18d′'s portable
 * command does), but it can name it, which is the difference between a five-minute puzzle and a
 * five-hour one. Moved here from `catalog.ts` in S18f so the page and the tool read one implementation.
 */
export function registration(root: string): Registration {
  const file = join(root, MCP_FILE);
  const none = { present: false, names: false, absolute: false, missingCommand: false };
  if (!existsSync(file)) return none;
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as { mcpServers?: Record<string, { command?: string }> };
    const entry = j.mcpServers?.snypd;
    if (!entry) return { ...none, present: true };
    const command = entry.command;
    const absolute = !!command && (command.startsWith("/") || /^[A-Za-z]:[\\/]/.test(command));
    // An absolute path is checked as a file; a bare command is looked for on *this* process's PATH. The
    // harness's PATH is not ours to know, so a miss is reported as a likely cause and not a verdict.
    const resolved = command ? (absolute ? (existsSync(command) ? command : undefined) : onPath(command) ?? undefined) : undefined;
    return { present: true, names: true, command, resolved, absolute, missingCommand: !!command && !resolved };
  } catch { return { ...none, present: true } }
}

export interface OnboardingFacts {
  /** `snypd.yaml` parses and validates. Everything below it is unanswerable when this is false. */
  config: boolean;
  /** Writes are versioned and `content.publish` has a base to land on, or they are not. */
  git: boolean;
  registration: Registration;
  harness: HarnessState;
  heartbeat?: HeartbeatRecord;
  /** Items in the index, trashed excluded — the count the Desk's empty state turns on. */
  items: number;
  /** `site.url` is still the localhost placeholder, so feed, sitemap and JSON-LD have nowhere to point. */
  placeholderUrl: boolean;
  /** A `snypd dev` server proved live at this root, if the caller already checked. Never probed here. */
  dev?: { url: string };
}

/** True when the six are true and the checklist has nothing left to say. */
export const onboarded = (f: OnboardingFacts): boolean =>
  f.config && f.git && f.registration.present && f.registration.names && !f.registration.missingCommand
  && f.harness === "connected" && f.items > 0 && !f.placeholderUrl;

export function onboardingFacts(root: string, input: { cfg: LoadedConfig; items: number; dev?: { url: string } }): OnboardingFacts {
  const { state, rec } = harnessState(root);
  return {
    config: input.cfg.ok,
    git: isRepoRoot(root),
    registration: registration(root),
    harness: state,
    heartbeat: rec,
    items: input.items,
    placeholderUrl: isPlaceholderUrl(input.cfg.config.site.url),
    dev: input.dev,
  };
}
